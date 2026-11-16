import { getLocalDateKey, getLocalTimeStamp, makeRecordKey } from './dates';
import { scoreSentiment } from './sentiment';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';

export interface NotificationResponseInput {
  actionIdentifier?: string;
  userText?: string;
}

export type NotificationEntryResult =
  | {
      kind: 'created' | 'appended' | 'overwrite';
      entry: CategorySelectionRecord;
      existing?: CategorySelectionRecord;
    }
  | { kind: 'invalid'; reason: string };

const invalid = (reason: string): NotificationEntryResult => ({
  kind: 'invalid',
  reason,
});

const parseNumber = (
  category: Extract<CategoryDefinition, { kind: 'number' }>,
  text?: string,
) => {
  if (!text?.trim()) return undefined;
  const value = Number(text.trim());
  if (!Number.isFinite(value)) return undefined;
  if (value < category.range.min || value > category.range.max)
    return undefined;
  const steps = (value - category.range.min) / category.range.step;
  if (Math.abs(steps - Math.round(steps)) > 1e-9) return undefined;
  return value;
};

const getValue = (
  category: Exclude<CategoryDefinition, { kind: 'duration' }>,
  response: NotificationResponseInput,
  existing?: CategorySelectionRecord,
): Partial<CategorySelectionRecord> | undefined => {
  if (category.kind === 'multiple-choice') {
    if (category.multiSelect) return undefined;
    const optionToken = response.actionIdentifier?.replace(/^choice:/, '');
    const option =
      category.options.find((candidate) => candidate.id === optionToken) ??
      (optionToken !== undefined && /^\d+$/.test(optionToken)
        ? category.options[Number(optionToken)]
        : undefined);
    return option
      ? { value: option.value, selectedValues: [option.value] }
      : undefined;
  }
  if (category.kind === 'number') {
    const value = parseNumber(category, response.userText);
    return value === undefined ? undefined : { value };
  }
  if (category.kind === 'counter') {
    const stepIndex = response.actionIdentifier?.replace(/^step:/, '');
    if (stepIndex === undefined || !/^\d+$/.test(stepIndex)) return undefined;
    const step = category.counter.steps[Number(stepIndex)];
    if (!Number.isFinite(step)) return undefined;
    return {
      value: category.allowMultiplePerDay
        ? step
        : (existing?.value ?? 0) + step,
    };
  }
  const noteText = response.userText?.trim();
  if (!noteText) return undefined;
  const sentimentScore = category.sentimentEnabled
    ? scoreSentiment(noteText)
    : undefined;
  return {
    noteText,
    ...(sentimentScore === undefined
      ? { value: 0 }
      : { sentimentScore, value: sentimentScore }),
  };
};

export const applyNotificationResponse = (
  category: CategoryDefinition,
  existingEntries: CategorySelectionRecord[],
  response: NotificationResponseInput,
  date = new Date(),
): NotificationEntryResult => {
  if (category.kind === 'duration') {
    return invalid('Duration entries must be entered in the app.');
  }
  const existing = existingEntries
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal);
  const current = existing[0];
  const patch = getValue(category, response, current);
  if (!patch)
    return invalid('This response could not be used for the category.');
  const dateKey = getLocalDateKey(date);
  const ordinal = category.allowMultiplePerDay
    ? existing.reduce(
        (highest, entry) => Math.max(highest, entry.ordinal),
        -1,
      ) + 1
    : 0;
  const baseEntry: CategorySelectionRecord =
    current && !category.allowMultiplePerDay
      ? current
      : {
          key: makeRecordKey(dateKey, ordinal, category.id),
          categoryId: category.id,
          dateKey,
          ordinal,
          localTime: getLocalTimeStamp(date),
          value: 0,
          instanceId: `${category.id}:${ordinal}`,
        };
  const entry: CategorySelectionRecord = {
    ...baseEntry,
    ...patch,
    key: makeRecordKey(dateKey, ordinal, category.id),
    categoryId: category.id,
    dateKey,
    ordinal,
    instanceId: baseEntry.instanceId ?? `${category.id}:${ordinal}`,
  };
  return {
    kind:
      current && !category.allowMultiplePerDay
        ? 'overwrite'
        : existing.length
          ? 'appended'
          : 'created',
    entry,
    ...(current && !category.allowMultiplePerDay ? { existing: current } : {}),
  };
};
