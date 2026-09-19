export const daysAgo = (dateKey: string, now: Date): number => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(year, month - 1, day)) /
      86400000,
  );
};

export const mean = (values: number[]): number | null =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

export const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

export const mode = (values: number[]): number | null => {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  )[0][0];
};

export const slope = (values: number[]): number | null => {
  if (values.length < 2) return null;
  const meanX = (values.length - 1) / 2;
  const meanY = mean(values) ?? 0;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });
  return denominator ? numerator / denominator : null;
};

export const autocorrelation = (
  values: number[],
  lag: number,
): number | null => {
  if (lag <= 0 || values.length <= lag) return null;
  const left = values.slice(0, values.length - lag);
  const right = values.slice(lag);
  const leftMean = mean(left) ?? 0;
  const rightMean = mean(right) ?? 0;
  let numerator = 0;
  let leftDenominator = 0;
  let rightDenominator = 0;
  left.forEach((value, index) => {
    const leftDelta = value - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftDenominator += leftDelta ** 2;
    rightDenominator += rightDelta ** 2;
  });
  const denominator = Math.sqrt(leftDenominator * rightDenominator);
  return denominator ? numerator / denominator : null;
};
