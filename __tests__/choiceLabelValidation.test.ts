import {
  createDefaultCategory,
  hasPrintableChoiceLabel,
} from '../src/lib/category';

test('choice categories default to hiding option values', () => {
  const category = createDefaultCategory('multiple-choice', 0);
  expect(category.kind === 'multiple-choice' && category.showOptionValues).toBe(
    false,
  );
});

test.each([
  ['', false],
  ['  \t\n', false],
  ['\u0000\u0007', false],
  ['\u200b\u2060', false],
  ['0', true],
  ['é', true],
  ['🟢', true],
])('validates printable choice text %p', (label, expected) => {
  expect(hasPrintableChoiceLabel(label)).toBe(expected);
});
