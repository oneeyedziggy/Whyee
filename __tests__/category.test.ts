import {
  createDefaultCategory,
  getNextCategoryNameSequence,
  primarySeriesId,
  switchCategoryKind,
} from '../src/lib/category';
import type {
  CategoryDefinition,
  CategoryKind,
  ChoiceCategory,
  NumericCategory,
} from '../src/types/category';

const make = (kind: CategoryKind, id: string = kind): CategoryDefinition => ({
  ...createDefaultCategory(kind, 0, 'Thing', 1),
  id,
});
const makeChoice = (id = 'choice') =>
  make('multiple-choice', id) as ChoiceCategory;
const makeNumber = (id = 'number') => make('number', id) as NumericCategory;

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
});
