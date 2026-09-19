const pad = (value: number): string => value.toString().padStart(2, '0');

export const getLocalDateKey = (date = new Date()): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const getLocalTimeStamp = (date = new Date()): string =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

export const makeRecordKey = (
  dateKey: string,
  ordinal: number,
  categoryId: string,
): string => `${dateKey}:${ordinal}:${categoryId}`;
