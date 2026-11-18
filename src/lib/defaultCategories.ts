import { createDefaultCategory, recomputeVirtualSeries } from './category';
import { createId } from './id';
import type {
  CategoryDefinition,
  CategoryGroup,
  ChoiceCategory,
  ChoiceOption,
  CounterCategory,
  DurationCategory,
  EventTimeCategory,
  NumericCategory,
  SummaryVerb,
} from '../types/category';

export interface DefaultWorkspaceData {
  categories: CategoryDefinition[];
  groups: CategoryGroup[];
}

export const defaultGroupNames = {
  headache: 'Headache',
  stomach: 'Stomach',
  lifestyle: 'Lifestyle',
} as const;

// Shared between both symptom groups so activity series align across them.
const activityLabels = [
  'Desk work (screen)',
  'Video meetings',
  'Commuting',
  'Childcare/play',
  'Chores/housework',
  'Cooking/eating',
  'Exercise',
  'Relaxing/screen leisure',
  'Just woke up',
];

const makeOptions = (labels: string[], firstValue: number): ChoiceOption[] =>
  labels.map((label, index) => ({
    id: createId('choice'),
    label,
    value: firstValue + index,
  }));

// Options whose values carry meaning of their own (for example caffeine mg per serving).
const makeValuedOptions = (entries: Array<[string, number]>): ChoiceOption[] =>
  entries.map(([label, value]) => ({ id: createId('choice'), label, value }));

const finalize = <T extends CategoryDefinition>(
  category: T,
  allCategories?: CategoryDefinition[],
): T => ({
  ...category,
  virtualSeries: recomputeVirtualSeries(category, allCategories),
});

// Multi-select "separate items" choice: one 0/1 series per option per day.
const choiceItems = (
  name: string,
  labels: string[],
  overrides: Partial<ChoiceCategory> = {},
  firstValue = 0,
): ChoiceCategory =>
  finalize({
    ...(createDefaultCategory('multiple-choice', 0, name, 1) as ChoiceCategory),
    sentimentEnabled: false,
    notesEnabled: true,
    allowMultiplePerDay: true,
    multiSelect: true,
    optionSeriesMode: 'items',
    optionOccurrenceMode: 'capped',
    options: makeOptions(labels, firstValue),
    ...overrides,
  });

const number = (
  name: string,
  range: NumericCategory['range'],
  overrides: Partial<NumericCategory> = {},
): NumericCategory =>
  finalize({
    ...(createDefaultCategory('number', 0, name, 1) as NumericCategory),
    sentimentEnabled: false,
    notesEnabled: true,
    range,
    ...overrides,
  });

const counter = (
  name: string,
  overrides: Partial<CounterCategory> = {},
): CounterCategory =>
  finalize({
    ...(createDefaultCategory('counter', 0, name, 1) as CounterCategory),
    sentimentEnabled: false,
    ...overrides,
  });

const duration = (
  name: string,
  overrides: Partial<DurationCategory>,
): DurationCategory =>
  finalize({
    ...(createDefaultCategory('duration', 0, name, 1) as DurationCategory),
    sentimentEnabled: false,
    ...overrides,
  });

const eventTime = (
  name: string,
  overrides: Partial<EventTimeCategory> = {},
): EventTimeCategory =>
  finalize({
    ...(createDefaultCategory('event-time', 0, name, 1) as EventTimeCategory),
    allowMultiplePerDay: true,
    ...overrides,
  });

const withPrimary = <T extends CategoryDefinition>(
  category: T,
  mainAggregation: SummaryVerb,
): T =>
  finalize({
    ...category,
    mainAggregation,
  });

// Turns on one generated series (addressed by its suffix under the category id).
const withSeriesEnabled = <T extends CategoryDefinition>(
  category: T,
  suffix: string,
): T => ({
  ...category,
  virtualSeries: category.virtualSeries.map((series) =>
    series.id === `${category.id}:${suffix}`
      ? { ...series, enabled: true }
      : series,
  ),
});

const group = (
  id: string,
  name: string,
  categories: CategoryDefinition[],
): CategoryGroup => ({
  id,
  name,
  categoryIds: categories.map((category) => category.id),
  expanded: true,
});

// Default "user" workspace: a headache / stomach-pain tracking setup for a hybrid-office
// worker, with lifestyle confounders. See docs/CATEGORY_CATALOG.md for the rationale.
export const createDefaultWorkspaceData = (): DefaultWorkspaceData => {
  // Lifestyle sources first so the symptom categories can reference them by id.
  const meals = choiceItems('Meals', [
    'Olive-oil salad/vegetables',
    'Whole grains',
    'Legumes',
    'Fish/seafood',
    'Poultry',
    'Eggs',
    'Yogurt/cheese',
    'Nuts/seeds',
    'Fruit',
    'Tomato-based dish',
    'Garlic/onion-heavy dish',
    'Off-plan/processed',
  ]);
  const caffeine = withPrimary(
    choiceItems('Caffeine', [], {
      notesEnabled: false,
      multiSelect: false,
      optionSeriesMode: 'intensity',
      showOptionValues: true,
      // Values are typical caffeine mg per serving; the primary series sums the day's mg.
      options: makeValuedOptions([
        ['Coffee', 95],
        ['Tea', 47],
        ['Espresso', 63],
        ['Double espresso', 126],
      ]),
    }),
    'sum',
  );

  // Headache episode and Stomach pain onset reference each other, so both are built first
  // and their time-since sources wired once every id exists.
  const headacheBase = duration('Headache episode', {
    allowMultiplePerDay: true,
    notesEnabled: true,
  });
  const stomachBase = eventTime('Stomach pain onset');
  const headacheEpisode = finalize(
    {
      ...headacheBase,
      duration: {
        ...headacheBase.duration,
        timeSinceCategoryIds: [meals.id, stomachBase.id],
      },
    },
    [meals, stomachBase],
  );
  const stomachOnset = finalize(
    {
      ...stomachBase,
      eventTime: {
        ...stomachBase.eventTime,
        timeSinceCategoryIds: [meals.id, caffeine.id, headacheBase.id],
      },
    },
    [meals, caffeine, headacheBase],
  );

  const headacheCategories: CategoryDefinition[] = [
    headacheEpisode,
    withPrimary(
      number('Headache severity', { min: 0, max: 10, step: 1 }, {
        allowMultiplePerDay: true,
      }),
      'max',
    ),
    choiceItems('Headache pain type', [
      'Throbbing/pulsating',
      'Pressure/band-like',
      'Stabbing/sharp',
      'Dull ache',
      'Behind the eyes',
      'One-sided',
      'Sinus/facial pressure',
      'Neck/shoulder-related',
    ]),
    choiceItems('Activity at headache onset', activityLabels),
    choiceItems('Worked from', ['Home', 'Office', 'Datacenter'], {
      multiSelect: false,
      allowMultiplePerDay: false,
      notesEnabled: false,
    }),
  ];

  const stomachCategories: CategoryDefinition[] = [
    stomachOnset,
    withPrimary(
      number('Stomach pain severity', { min: 0, max: 10, step: 1 }, {
        allowMultiplePerDay: true,
      }),
      'max',
    ),
    choiceItems('Stomach pain area', [
      'Upper middle (epigastric)',
      'Upper right (under ribs)',
      'Upper left',
      'Around navel',
      'Lower right',
      'Lower left',
      'Lower middle (pelvic)',
      'Whole abdomen/diffuse',
    ]),
    choiceItems('Stomach pain type', [
      'Cramping',
      'Burning',
      'Sharp/stabbing',
      'Dull ache',
      'Bloating/pressure',
      'Gnawing/hunger-like',
      'Nausea-accompanied',
    ]),
    choiceItems('Activity at stomach pain onset', activityLabels),
  ];

  const lifestyleCategories: CategoryDefinition[] = [
    meals,
    caffeine,
    number('Sleep duration (h)', { min: 0, max: 14, step: 0.25 }),
    counter('Night wakings'),
    counter('Water intake (glasses)'),
    duration('Screen time', { allowMultiplePerDay: true }),
    eventTime('Pain med doses', { notesEnabled: true }),
    choiceItems(
      'Household illness',
      ['None', 'Child sick', 'Partner sick', 'Self sick'],
      { allowMultiplePerDay: false },
    ),
    withPrimary(
      number('Stress', { min: 0, max: 10, step: 1 }, {
        allowMultiplePerDay: true,
        sentimentEnabled: true,
        weeklyEffectEnabled: true,
      }),
      'mean',
    ),
    // The entries-count series doubles as a bowel-movement count, so it starts enabled.
    withSeriesEnabled(
      withPrimary(
        choiceItems(
          'Stool form (Bristol)',
          [
            'Type 1 (hard lumps)',
            'Type 2 (lumpy sausage)',
            'Type 3 (cracked sausage)',
            'Type 4 (smooth sausage)',
            'Type 5 (soft blobs)',
            'Type 6 (mushy)',
            'Type 7 (liquid)',
          ],
          { multiSelect: false, optionSeriesMode: 'intensity' },
          1,
        ),
        'median',
      ),
      'count',
    ),
  ];

  return {
    categories: [
      ...headacheCategories,
      ...stomachCategories,
      ...lifestyleCategories,
    ],
    groups: [
      group('headache-group', defaultGroupNames.headache, headacheCategories),
      group('stomach-group', defaultGroupNames.stomach, stomachCategories),
      group('lifestyle-group', defaultGroupNames.lifestyle, lifestyleCategories),
    ],
  };
};
