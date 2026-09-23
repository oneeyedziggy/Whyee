// Base/type-checking fallback; Metro resolves `.native.tsx`/`.web.tsx` at bundle time.
export type SystemTimeFieldMode = 'time' | 'date' | 'datetime';

export interface SystemTimeFieldProps {
  mode: SystemTimeFieldMode;
  value: Date;
  onChange: (value: Date) => void;
  disabled?: boolean;
  is24Hour?: boolean;
  accessibilityLabel: string;
  compact?: boolean;
}

export const SystemTimeField = (_props: SystemTimeFieldProps) => null;
