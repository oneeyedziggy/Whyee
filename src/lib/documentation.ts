export type DocumentationSectionId =
  | 'categories'
  | 'daily-input'
  | 'virtual-series'
  | 'duration'
  | 'counter'
  | 'event-time'
  | 'notes'
  | 'weekly-effects'
  | 'correlation'
  | 'statistics';

export interface DocumentationDetail {
  term: string;
  description: string;
}

export interface DocumentationSection {
  id: DocumentationSectionId;
  title: string;
  summary: string;
  body: string;
  keywords: string[];
  details?: DocumentationDetail[];
}

export const documentationSections: DocumentationSection[] = [
  {
    id: 'categories',
    title: 'Categories',
    summary: 'Categories describe the things you track.',
    body: 'A category can be a single choice, a multi-select choice, a number, a duration, a counter, notes-only, or an event time. Category settings define what can be entered and which derived series are available for statistics.',
    keywords: [
      'category',
      'choice',
      'multi-select',
      'number',
      'duration',
      'counter',
      'notes',
      'event',
    ],
  },
  {
    id: 'daily-input',
    title: 'Daily input',
    summary: 'Record one or more independent entries for each category.',
    body: 'Values are stored with their local date and instance identity. Categories that allow multiple entries show a plus action. Each added instance can be analyzed separately or summarized through virtual series.',
    keywords: ['daily', 'entry', 'instance', 'multiple', 'record'],
  },
  {
    id: 'virtual-series',
    title: 'Virtual series',
    summary: 'Generated numeric series derived from your raw entries.',
    body: 'Virtual series are not entered directly. They may represent a raw value, a duration start or stop time, a count, sum, mean, median, minimum, maximum, product, inverse, or sentiment score. Each series can be enabled or disabled before correlation.',
    keywords: [
      'virtual',
      'derived',
      'aggregation',
      'raw',
      'mean',
      'median',
      'sum',
      'minimum',
      'maximum',
      'inverse',
    ],
    details: [
      {
        term: 'Raw',
        description:
          "The value exactly as entered (a choice's numeric value, a number, a counter count, and so on).",
      },
      {
        term: 'Start / stop',
        description:
          'For duration categories, the clock time the timer began or ended, treated as its own numeric series.',
      },
      {
        term: 'Count',
        description:
          'How many instances were logged that day (useful for categories that allow multiple entries per day).',
      },
      {
        term: 'Sum',
        description: "The total of every instance's value logged that day.",
      },
      {
        term: 'Mean / Median',
        description:
          "The day's average, or middle value, across that day's instances (see Statistics for the difference between the two).",
      },
      {
        term: 'Minimum / Maximum',
        description: 'The smallest or largest instance value logged that day.',
      },
      {
        term: 'Product',
        description:
          'Every instance value logged that day multiplied together.',
      },
      {
        term: 'Inverse',
        description:
          '1 divided by the value (or its reciprocal-style transform), which flips the direction of a correlation without changing its strength — useful when "more" of a raw value actually means "less" of the thing you care about.',
      },
      {
        term: 'Sentiment',
        description:
          'A numeric positivity/negativity score derived from note text (see Notes and sentiment).',
      },
    ],
  },
  {
    id: 'duration',
    title: 'Duration tracking',
    summary: 'Measure elapsed time with start and stop controls.',
    body: 'Start begins a live timer and disables Start until the duration is stopped or reset. Stop stores editable start and stop times. Split ends the current instance and immediately starts another. Cumulative mode preserves a run history and reports its summed duration. A duration entry is treated as happening at its first start time, and durations can add time-since series that measure the minutes from each recorded period back to the most recent prior entry in selected source categories.',
    keywords: [
      'duration',
      'timer',
      'start',
      'stop',
      'split',
      'lap',
      'cumulative',
      'milliseconds',
    ],
  },
  {
    id: 'counter',
    title: 'Counters',
    summary: 'Track increments, decrements, and independent counter instances.',
    body: 'Counter step buttons can use any configured values, such as -10, -5, -1, +1, +5, and +10. Reset requires confirmation. Direct editing and split/lap behavior are optional settings.',
    keywords: ['counter', 'step', 'increment', 'decrement', 'reset'],
  },
  {
    id: 'event-time',
    title: 'Event times',
    summary: 'Log the clock time something happens.',
    body: "An event-time category's datum is the time of day of each entry. Log now stamps the current time, which stays editable afterwards. Derived series include the minute of day, four daypart indicators (night, morning, afternoon, evening), a single hourly-breakdown toggle that correlates one 0/1 series per hour of day, a per-day count, and time-since series that measure the minutes from the most recent prior entry in each selected source category, searching back without a day limit. Duration sources count each recorded period's start as an entry.",
    keywords: [
      'event',
      'time',
      'timestamp',
      'daypart',
      'hour',
      'minute',
      'time since',
    ],
  },
  {
    id: 'notes',
    title: 'Notes and sentiment',
    summary:
      'Attach private notes to any category or create a notes-only category.',
    body: 'Notes are stored locally with the category instance. Optional sentiment scoring is performed on-device using a bundled lexical library. Note text is not sent to a server or external API. Disabling sentiment keeps the original notes and removes only the derived sentiment series.',
    keywords: [
      'notes',
      'sentiment',
      'private',
      'local',
      'on-device',
      'privacy',
    ],
  },
  {
    id: 'weekly-effects',
    title: 'Weekly effects',
    summary: 'Correlate categories with individual days of the week.',
    body: 'Turn on "Correlate with weekdays" for a choice or number category to add seven series to the correlation matrix: Sunday is 1 on Sundays and 0 on every other day that has data, and so on through Saturday. "Correlate with inverse weekdays" adds Not Sunday through Not Saturday, which are the reverse (0 on that weekday, 1 on the rest). Weekday series are only correlated with categories that opted in, are never correlated with each other, and are only compared on the same day, so correlation offsets do not apply to them.',
    keywords: ['weekly', 'weekday', 'day of week', 'effect', 'inverse'],
    details: [
      {
        term: 'Weekday series',
        description:
          'A strong positive correlation between a category and, for example, Friday means its values tend to be higher on Fridays than on other days.',
      },
      {
        term: 'Inverse weekday series',
        description:
          'The same comparison read the other way: a strong positive correlation with Not Sunday means values tend to be lower on Sundays.',
      },
    ],
  },
  {
    id: 'correlation',
    title: 'Correlation',
    summary: 'Compare enabled series at forward date offsets.',
    body: 'An offset of zero compares values on the same date. A positive offset compares the first series earlier in time with the second series later in time. The configured range is forward-only and can include both directed pair orders.',
    keywords: [
      'correlation',
      'pearson',
      'spearman',
      'offset',
      'lag',
      'direction',
    ],
    details: [
      {
        term: 'Offset (lag)',
        description:
          'The number of days between the two series being compared. An offset of 3 asks "does a change in series A predict a change in series B three days later?"',
      },
      {
        term: 'Directed pair order',
        description:
          'A x B and B x A are tracked separately, since "A predicts B" and "B predicts A" are different claims and can have different strengths.',
      },
      {
        term: 'Correlation coefficient',
        description:
          'A number from -1 to 1 describing how closely two series move together: 1 means they rise and fall in lockstep, -1 means one rises exactly as the other falls, and 0 means no linear relationship.',
      },
    ],
  },
  {
    id: 'statistics',
    title: 'Statistics',
    summary: 'Review summaries, trends, and relationships.',
    body: 'Summary statistics include all-time and recent means, medians, modes, slopes, and autocorrelation. Choice values use their numeric option values; mode can display the matching option label. Constant or insufficient data produces no misleading coefficient.',
    keywords: [
      'statistics',
      'mean',
      'median',
      'mode',
      'slope',
      'autocorrelation',
      'summary',
      'recent',
      'window',
    ],
    details: [
      {
        term: 'All-time vs. recent ("7d") columns',
        description:
          'Every statistic has two versions: the plain column (Mean, Median, ...) uses every entry ever logged for that category, while the "...Nd" column (for example Mean 7d) recomputes the same statistic using only entries from the last N days, so you can see whether recent behavior differs from the long-run pattern.',
      },
      {
        term: 'Mean',
        description:
          'The arithmetic average: add up every value and divide by how many there are.',
      },
      {
        term: 'Median',
        description:
          'The middle value once every entry is sorted from low to high (or the average of the two middle values, for an even number of entries). Less sensitive to outliers than the mean.',
      },
      {
        term: 'Mode',
        description: 'The value (or option) that was logged most often.',
      },
      {
        term: 'Slope',
        description:
          'The steepness of the best-fit trend line through the values over time. Positive means the category is trending up, negative means trending down, and near zero means roughly flat.',
      },
      {
        term: 'Autocorrelation',
        description:
          "How strongly a category's own value on one day predicts its value again a fixed number of days later (the recent-days window). This measures self-repeating patterns, separate from the weekday series described under Weekly effects.",
      },
    ],
  },
];
