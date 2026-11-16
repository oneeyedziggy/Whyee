import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import {
  AddButton,
  getCategorySummary,
  HintLabel,
  NotesEditor,
  SeriesToggleRow,
  SwitchRow,
} from '../src/components/CategoryEditorControls';
import { createDefaultCategory } from '../src/lib/category';

describe('getCategorySummary', () => {
  it('summarizes every category kind', () => {
    const counter = createDefaultCategory('counter', 0);
    expect(getCategorySummary(createDefaultCategory('multiple-choice', 0))).toBe(
      '3 choices',
    );
    expect(getCategorySummary(createDefaultCategory('duration', 0))).toBe(
      'Start and stop timer',
    );
    expect(getCategorySummary(createDefaultCategory('notes', 0))).toBe('Notes only');
    expect(getCategorySummary(counter)).toBe(
      `${counter.kind === 'counter' ? counter.counter.steps.length : 0} counter steps`,
    );
    expect(
      getCategorySummary({
        ...createDefaultCategory('number', 0),
        range: { min: -2, max: 8, step: 1 },
      } as ReturnType<typeof createDefaultCategory>),
    ).toBe('-2 to 8');
  });
});

describe('CategoryEditorControls', () => {
  it('toggles hint text for labels and series rows', async () => {
    const onInverseChange = jest.fn();
    const onMainChange = jest.fn();
    const screen = await render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(HintLabel, { label: 'Range', description: 'Range help' }),
        React.createElement(SeriesToggleRow, {
          label: 'Mean',
          description: 'Mean help',
          inverse: true,
          main: false,
          onInverseChange,
          onMainChange,
        }),
      ),
    );
    expect(screen.queryByText('Range help')).toBeNull();
    await fireEvent.press(screen.getByLabelText('What does Range mean?'));
    expect(screen.getByText('Range help')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('What does Range mean?'));
    expect(screen.queryByText('Range help')).toBeNull();

    await fireEvent.press(screen.getByLabelText('What does Mean mean?'));
    expect(screen.getByText('Mean help')).toBeTruthy();
    const inverse = screen.getByLabelText('Enable inverse correlation of Mean');
    expect(inverse.props.accessibilityHint).toBe(
      'Turn off inverse correlation of Mean.',
    );
    await fireEvent.press(inverse);
    expect(onInverseChange).toHaveBeenCalledWith(false);
    await fireEvent.press(screen.getByLabelText('Enable correlation of Mean'));
    expect(onMainChange).toHaveBeenCalledWith(true);
  });

  it('shows a switch row description on demand and indents nested series rows', async () => {
    const screen = await render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(SwitchRow, {
          label: 'Explained',
          description: 'Switch help',
          value: true,
          onChange: jest.fn(),
        }),
        React.createElement(SeriesToggleRow, {
          label: 'Nested',
          description: 'Nested help',
          nested: true,
          inverse: false,
          main: true,
          onInverseChange: jest.fn(),
          onMainChange: jest.fn(),
        }),
        React.createElement(NotesEditor),
      ),
    );
    expect(screen.queryByText('Switch help')).toBeNull();
    await fireEvent.press(screen.getByLabelText('What does Explained mean?'));
    expect(screen.getByText('Switch help')).toBeTruthy();
    const row = screen.getByText('Nested').parent?.parent;
    expect(StyleSheet.flatten(row?.props.style)).toMatchObject({ paddingLeft: 12 });
    expect(screen.getByText(/stores notes/)).toBeTruthy();
  });

  it('omits the hint button for switch rows without a description', async () => {
    const onChange = jest.fn();
    const screen = await render(
      React.createElement(SwitchRow, { label: 'Plain', value: false, onChange }),
    );
    expect(screen.queryByLabelText('What does Plain mean?')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Plain'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders icon-only add buttons with the default hint and blocks disabled presses', async () => {
    const onPress = jest.fn();
    const onDisabledPress = jest.fn();
    const screen = await render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(AddButton, { accessibilityLabel: 'Add thing', onPress }),
        React.createElement(AddButton, {
          accessibilityLabel: 'Add locked',
          disabled: true,
          onPress: onDisabledPress,
        }),
      ),
    );
    const add = screen.getByLabelText('Add thing');
    expect(add.props.accessibilityHint).toBe('Adds an item.');
    await fireEvent.press(add);
    expect(onPress).toHaveBeenCalled();
    const locked = screen.getByLabelText('Add locked');
    expect(locked.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(locked);
    expect(onDisabledPress).not.toHaveBeenCalled();
  });
});
