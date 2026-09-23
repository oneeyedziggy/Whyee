// No native picker module on web; manual text entry remains the only input, so this renders nothing.
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
