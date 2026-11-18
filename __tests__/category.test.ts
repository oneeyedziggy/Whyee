import {
  createDefaultCategory,
  getNextCategoryNameSequence,
  primarySeriesId,
  recomputeVirtualSeries,
  switchCategoryKind,
} from '../src/lib/category';
import type {
  CategoryDefinition,
  CategoryKind,
  ChoiceCategory,
  EventTimeCategory,
  NumericCategory,
} from '../src/types/category';

const make = (kind: CategoryKind, id: string = kind): CategoryDefinition => ({
  ...createDefaultCategory(kind, 0, 'Thing', 1),
  id,
});
const makeChoice = (id = 'choice') =>
  make('multiple-choice', id) as ChoiceCategory;
const makeNumber = (id = 'number') => make('number', id) as NumericCategory;
const makeEvent = (id = 'event') => make('event-time', id) as EventTimeCategory;

describe('primarySeriesId', () => {
  it('uses the first option for item-mode choices and nothing when there are none', () => {
    const choice = {
      ...makeChoice('c'),
      optionSeriesMode: 'items' as const,
    };
    expect(primarySeriesId(choice)).toBe(`c:option:${choice.options[0].id}`);
    expect(primarySeriesId({ ...choice, options: [] })).toBeUndefined();
  });
});

describe('getNextCategoryNameSequence', () => {
  it('treats legacy categories without a stored sequence as 0', () => {
    const legacy = { ...make('number') } as Partial<CategoryDefinition>;
    delete legacy.nameSequence;
    expect(
      getNextCategoryNameSequence([legacy as CategoryDefinition], 'number'),
    ).toBe(1);
    expect(getNextCategoryNameSequence([], 'number')).toBe(1);
  });
});

describe('switchCategoryKind', () => {
  it('converts a number category to a choice with default options', () => {
    const number = { ...makeNumber('n'), weeklyEffectEnabled: true };
    const switched = switchCategoryKind(number, 'multiple-choice');
    if (switched.kind !== 'multiple-choice') throw new Error('expected choice');
    expect(switched).toMatchObject({
      id: 'n',
      name: 'Thing',
      multiSelect: false,
      weeklyEffectEnabled: true,
      optionSeriesMode: 'intensity',
      optionOccurrenceMode: 'capped',
    });
    expect(switched.options).toHaveLength(3);
    expect(switched.savedTypeSettings?.number).toBeDefined();
  });

  it('drops weekly effects when converting a kind without them to a choice', () => {
    const switched = switchCategoryKind(make('counter'), 'multiple-choice');
    expect(switched).toMatchObject({ weeklyEffectEnabled: false });
  });

  it('keeps choice-specific settings when re-applying the choice kind', () => {
    const choice = {
      ...makeChoice(),
      multiSelect: true,
      optionSeriesMode: 'items' as const,
      optionOccurrenceMode: 'sum' as const,
      options: [
        { id: 'b', label: '  B  ', value: 2 },
        { id: 'a', label: 'A', value: 1 },
      ],
    } as CategoryDefinition;
    const switched = switchCategoryKind(choice, 'multiple-choice');
    expect(switched).toMatchObject({
      multiSelect: true,
      optionSeriesMode: 'items',
      optionOccurrenceMode: 'sum',
    });
    if (switched.kind !== 'multiple-choice') throw new Error('expected choice');
    expect(switched.options.map((option) => option.id).sort()).toEqual([
      'a',
      'b',
    ]);
  });

  it('converts to notes with sentiment forced on and no stale series', () => {
    const counter = { ...make('counter', 'k'), sentimentEnabled: false };
    const notes = switchCategoryKind(counter, 'notes');
    expect(notes).toMatchObject({
      id: 'k',
      kind: 'notes',
      notesEnabled: true,
      sentimentEnabled: true,
      notes: { sentimentEnabled: true },
    });
    expect(
      notes.virtualSeries.some((series) => series.field === 'value'),
    ).toBe(false);
    expect(
      notes.virtualSeries.some((series) => series.id === 'k:sentiment'),
    ).toBe(true);
  });

  it('converts to counter from a non-counter kind with default steps', () => {
    const counter = switchCategoryKind(make('notes', 'x'), 'counter');
    expect(counter).toMatchObject({
      kind: 'counter',
      counter: { steps: [-1, 1], editable: true },
    });
  });

  it('converts to number with a default range unless the source was numeric', () => {
    const fromCounter = switchCategoryKind(make('counter'), 'number');
    expect(fromCounter).toMatchObject({
      kind: 'number',
      weeklyEffectEnabled: false,
      range: { min: 0, max: 10, step: 1 },
    });

    const choice = { ...makeChoice(), weeklyEffectEnabled: true };
    expect(switchCategoryKind(choice, 'number')).toMatchObject({
      weeklyEffectEnabled: true,
      range: { min: 0, max: 10, step: 1 },
    });

    const number = {
      ...makeNumber(),
      range: { min: -5, max: 5, step: 0.5 },
    };
    expect(switchCategoryKind(number, 'number')).toMatchObject({
      range: { min: -5, max: 5, step: 0.5 },
    });
  });

  it('restores saved settings while keeping the current identity', () => {
    const number = {
      ...makeNumber('n'),
      range: { min: 1, max: 3, step: 1 },
    };
    const notes = switchCategoryKind(number, 'notes');
    const renamed = { ...notes, name: 'Renamed' };
    const back = switchCategoryKind(renamed, 'number');
    expect(back).toMatchObject({
      id: 'n',
      name: 'Renamed',
      kind: 'number',
      range: { min: 1, max: 3, step: 1 },
    });
    expect(back.savedTypeSettings?.notes).toBeDefined();
  });

  it('removes the legacy main aggregation field', () => {
    const legacy = {
      ...makeNumber(),
      mainAggregation: 'sum',
    } as CategoryDefinition;
    expect('mainAggregation' in switchCategoryKind(legacy, 'counter')).toBe(
      false,
    );
  });

  it('converts to an event time with fresh settings and restores them later', () => {
    const number = { ...makeNumber('n'), notesEnabled: true };
    const event = switchCategoryKind(number, 'event-time');
    expect(event).toMatchObject({
      id: 'n',
      kind: 'event-time',
      notesEnabled: true,
      eventTime: { use24HourClock: true, timeSinceCategoryIds: [] },
    });

    const configured = {
      ...event,
      eventTime: { use24HourClock: false, timeSinceCategoryIds: ['meals'] },
    } as CategoryDefinition;
    const back = switchCategoryKind(configured, 'number');
    expect(back.kind).toBe('number');
    const restored = switchCategoryKind(back, 'event-time');
    if (restored.kind !== 'event-time') throw new Error('expected event');
    expect(restored.eventTime).toEqual({
      use24HourClock: false,
      timeSinceCategoryIds: ['meals'],
    });
  });
});

describe('event-time virtual series', () => {
  it('creates a default named Event with time, daypart, and hourly series', () => {
    const created = createDefaultCategory('event-time', 0);
    expect(created.name).toBe('Event 1');
    if (created.kind !== 'event-time') throw new Error('expected event');
    expect(created.notesEnabled).toBe(false);
    expect(created.eventTime).toEqual({
      use24HourClock: true,
      timeSinceCategoryIds: [],
    });

    const event = makeEvent('e');
    expect(primarySeriesId(event)).toBe('e:time');
    const series = recomputeVirtualSeries(event);
    const byId = new Map(series.map((definition) => [definition.id, definition]));
    expect(byId.get('e:time')).toMatchObject({
      field: 'eventMinuteOfDay',
      aggregation: 'mean',
      enabled: true,
    });
    expect(byId.get('e:daypart:1')).toMatchObject({
      field: 'eventDaypart',
      optionValue: 1,
      aggregation: 'max',
      enabled: true,
    });
    expect(byId.get('e:daypart:1')!.name).toBe('Thing in the morning');
    expect(byId.get('e:hours')).toMatchObject({
      field: 'eventHourOfDay',
      aggregation: 'max',
      enabled: false,
    });
    expect(byId.get('e:hours')!.optionValue).toBeUndefined();
    expect(byId.get('e:hours')!.name).toBe('Thing hourly breakdown');
    expect(
      series.filter((definition) => definition.field === 'eventHourOfDay'),
    ).toHaveLength(1);
    expect(byId.has('e:count')).toBe(false);
  });

  it('adds count, instance, and time statistics for multiple entries per day', () => {
    const event = { ...makeEvent('m'), allowMultiplePerDay: true };
    expect(primarySeriesId(event)).toBe('m:time:mean');
    expect(
      primarySeriesId({ ...event, mainAggregation: 'min' } as CategoryDefinition),
    ).toBe('m:time:min');
    const series = recomputeVirtualSeries(event);
    const byId = new Map(series.map((definition) => [definition.id, definition]));
    expect(byId.get('m:count')).toMatchObject({
      aggregation: 'count',
      enabled: true,
    });
    expect(byId.get('m:instance')).toMatchObject({ perInstance: true });
    expect(byId.get('m:time:mean')).toMatchObject({ enabled: true });
    expect(byId.get('m:time:min')!.name).toBe('Thing earliest time');
    expect(byId.get('m:time:min')!.enabled).toBe(false);
  });

  it('builds time-since series with resolved, preserved, or generic source names', () => {
    const meals = { ...makeNumber('meals'), name: 'Meals' };
    const event = {
      ...makeEvent('e'),
      eventTime: { use24HourClock: true, timeSinceCategoryIds: ['meals'] },
    };
    const resolved = recomputeVirtualSeries(event, [meals]);
    const since = resolved.find((definition) => definition.id === 'e:since:meals');
    expect(since).toMatchObject({
      field: 'timeSinceCategory',
      timeSinceCategoryId: 'meals',
      enabled: true,
      name: 'Thing minutes since Meals',
    });

    // Recomputing without the category list keeps the stored name.
    const preserved = recomputeVirtualSeries({
      ...event,
      virtualSeries: resolved,
    });
    expect(
      preserved.find((definition) => definition.id === 'e:since:meals')!.name,
    ).toBe('Thing minutes since Meals');

    // Without a prior series or lookup the name falls back to a generic label.
    expect(
      recomputeVirtualSeries(event).find(
        (definition) => definition.id === 'e:since:meals',
      )!.name,
    ).toBe('Thing minutes since source');

    // Multiple entries per day expand into stats with only the mean enabled.
    const multiple = recomputeVirtualSeries(
      { ...event, allowMultiplePerDay: true },
      [meals],
    );
    expect(
      multiple.find((definition) => definition.id === 'e:since:meals:mean'),
    ).toMatchObject({ enabled: true, timeSinceCategoryId: 'meals' });
    expect(
      multiple.find((definition) => definition.id === 'e:since:meals:max'),
    ).toMatchObject({ enabled: false });
  });

  it('builds time-since series for duration categories', () => {
    const meals = { ...makeNumber('meals'), name: 'Meals' };
    const base = make('duration', 'd');
    if (base.kind !== 'duration') throw new Error('expected duration');
    const single = {
      ...base,
      duration: { ...base.duration, timeSinceCategoryIds: ['meals'] },
    };
    expect(
      recomputeVirtualSeries(single, [meals]).find(
        (definition) => definition.id === 'd:since:meals',
      ),
    ).toMatchObject({
      field: 'timeSinceCategory',
      timeSinceCategoryId: 'meals',
      enabled: true,
      name: 'Thing minutes since Meals',
    });

    const multiple = recomputeVirtualSeries(
      { ...single, allowMultiplePerDay: true },
      [meals],
    );
    expect(
      multiple.find((definition) => definition.id === 'd:since:meals:mean'),
    ).toMatchObject({ enabled: true, timeSinceCategoryId: 'meals' });
    expect(
      multiple.find((definition) => definition.id === 'd:since:meals:min'),
    ).toMatchObject({ enabled: false });
  });

  it('defaults and round-trips duration time-since sources across kind switches', () => {
    const created = createDefaultCategory('duration', 0);
    if (created.kind !== 'duration') throw new Error('expected duration');
    expect(created.duration.timeSinceCategoryIds).toEqual([]);

    const configured = {
      ...created,
      duration: { ...created.duration, timeSinceCategoryIds: ['meals'] },
    } as CategoryDefinition;
    const away = switchCategoryKind(configured, 'number');
    const back = switchCategoryKind(away, 'duration');
    if (back.kind !== 'duration') throw new Error('expected duration');
    expect(back.duration.timeSinceCategoryIds).toEqual(['meals']);

    // A kind switch without saved settings starts with no sources.
    const fresh = switchCategoryKind(makeNumber('n'), 'duration');
    if (fresh.kind !== 'duration') throw new Error('expected duration');
    expect(fresh.duration.timeSinceCategoryIds).toEqual([]);
  });
});
