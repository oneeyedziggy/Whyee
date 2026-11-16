import React, { act } from 'react';
import { SystemTimeField, type SystemTimeFieldProps } from '../src/components/SystemTimeField.web';

type Root = { render: (node: React.ReactNode) => void; unmount: () => void };
// react-dom ships without bundled types here; RNTL's renderer cannot host react-native-web Pressables.
const { createRoot } = require('react-dom/client') as { createRoot: (container: Element) => Root };

const mockIconProps: Array<{ name: string; color: string; size: number }> = [];
jest.mock('lucide-react-native', () => {
  const icon = (name: string) => (props: { color: string; size: number }) => {
    mockIconProps.push({ name, ...props });
    return null;
  };
  return { Calendar: icon('Calendar'), Clock: icon('Clock') };
});

const { colors } = jest.requireActual('../src/theme/tokens') as {
  colors: { muted: string; primary: string };
};

let host: HTMLDivElement;
let root: Root;

const renderField = async (props: Partial<SystemTimeFieldProps> = {}) => {
  const onChange = jest.fn();
  await act(async () => {
    root.render(
      React.createElement(SystemTimeField, {
        mode: 'time',
        value: new Date(2024, 0, 15, 7, 5, 9),
        onChange,
        accessibilityLabel: 'Pick time',
        ...props,
      }),
    );
  });
  const input = host.querySelector('input') as HTMLInputElement;
  const button = host.querySelector('[aria-label="Pick time"]') as HTMLButtonElement;
  return { onChange, input, button };
};

const typeInto = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  mockIconProps.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('SystemTimeField (web)', () => {
  it('renders a hidden time input with seconds and a clock icon', async () => {
    const { input, button } = await renderField();
    expect(input.type).toBe('time');
    expect(input.step).toBe('1');
    expect(input.value).toBe('07:05:09');
    expect(input.disabled).toBe(false);
    expect(button.parentElement?.getAttribute('title')).toBe('Pick time');
    expect(mockIconProps.at(-1)).toEqual({ name: 'Clock', color: colors.primary, size: 18 });
  });

  it('renders a date input with a compact calendar icon', async () => {
    const { input } = await renderField({ mode: 'date', compact: true });
    expect(input.type).toBe('date');
    expect(input.hasAttribute('step')).toBe(false);
    expect(input.value).toBe('2024-01-15');
    expect(mockIconProps.at(-1)).toEqual({ name: 'Calendar', color: colors.primary, size: 14 });
  });

  it('uses a time input for datetime mode', async () => {
    const { input } = await renderField({ mode: 'datetime' });
    expect(input.type).toBe('time');
  });

  it('opens the native picker when pressed', async () => {
    const { input, button } = await renderField();
    const showPicker = jest.fn();
    Object.assign(input, { showPicker });
    await act(async () => button.click());
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('falls back to focus and click when showPicker is unsupported', async () => {
    const { input, button } = await renderField();
    Object.assign(input, {
      showPicker: () => {
        throw new Error('NotAllowedError');
      },
    });
    const focus = jest.spyOn(input, 'focus');
    const click = jest.spyOn(input, 'click');
    await act(async () => button.click());
    expect(focus).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('does not open or allow edits while disabled', async () => {
    const { input, button } = await renderField({ disabled: true });
    const showPicker = jest.fn();
    Object.assign(input, { showPicker });
    await act(async () => button.click());
    expect(showPicker).not.toHaveBeenCalled();
    expect(input.disabled).toBe(true);
    expect(mockIconProps.at(-1)?.color).toBe(colors.muted);
  });

  it('applies a changed time while preserving the date', async () => {
    const { input, onChange } = await renderField();
    await typeInto(input, '19:30:45');
    expect(onChange).toHaveBeenCalledWith(new Date(2024, 0, 15, 19, 30, 45));
  });

  it('defaults missing seconds to zero', async () => {
    const { input, onChange } = await renderField();
    await typeInto(input, '08:15');
    expect(onChange).toHaveBeenCalledWith(new Date(2024, 0, 15, 8, 15, 0));
  });

  it('applies a changed date while preserving the time', async () => {
    const { input, onChange } = await renderField({ mode: 'date' });
    await typeInto(input, '2023-12-31');
    expect(onChange).toHaveBeenCalledWith(new Date(2023, 11, 31, 7, 5, 9));
  });

  it('ignores a cleared value', async () => {
    const { input, onChange } = await renderField();
    await typeInto(input, '');
    expect(onChange).not.toHaveBeenCalled();
  });
});
