import { Platform, type TextStyle } from 'react-native';

export const colors = {
  canvas: '#f4f7fb',
  surface: '#ffffff',
  onPrimary: '#ffffff',
  text: '#172033',
  muted: '#5d6a7f',
  // Deliberately lower contrast than `muted` so placeholder text can't be mistaken for a real value.
  placeholder: '#a7b0c0',
  border: '#d9e1eb',
  primary: '#1667c8',
  primarySoft: '#dcecff',
  teal: '#087f8c',
  danger: '#bd3039',
  shadow: '#14233b',
} as const;

export const typeScale = {
  screenTitle: 23,
} as const;

export const shadows = {
  soft: '1px 1px 3px 0px rgba(0, 0, 0, 0.25)',
} as const;

// Thickens thin glyphs like the lap-remove "x". react-native-web deprecates the
// textShadow* longhands in favor of the CSS shorthand.
export const dangerGlyphShadow: TextStyle = Platform.select<TextStyle>({
  web: { textShadow: `0px 0px 0.8px ${colors.danger}` } as TextStyle,
  default: { textShadowColor: colors.danger, textShadowRadius: 0.8 },
});

export const seriesColors = [
  '#1667c8',
  '#087f8c',
  '#d97706',
  '#be3b7b',
  '#5b48bf',
  '#3b7f38',
];
