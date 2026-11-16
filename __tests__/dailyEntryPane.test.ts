import React from 'react';
import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ts from 'typescript';
import { DailyEntryPane } from '../src/components/DailyEntryPane';

const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};

it.each([390, 1280])(
  'keeps Edit categories first in the daily pane at width %i',
  async (width) => {
    const onEditCategories = jest.fn();
    const screen = await render(
      React.createElement(
        View,
        { style: { width } },
        React.createElement(
          DailyEntryPane,
          { onEditCategories },
          React.createElement(View, { testID: 'daily-content' }),
        ),
      ),
    );
    const pane = screen.getByTestId('daily-entry-pane');
    const button = pane.children[0];
    const content = pane.children[1];
    expect(
      typeof button === 'string' ? null : button.props.accessibilityLabel,
    ).toBe('Open category editor');
    expect(typeof content === 'string' ? null : content.props.testID).toBe(
      'daily-content',
    );
    await fireEvent.press(screen.getByLabelText('Open category editor'));
    expect(onEditCategories).toHaveBeenCalledTimes(1);
  },
);

it('wires the daily pane in App without a separate header editor button', () => {
  const source = ts.createSourceFile(
    'App.tsx',
    readFileSync('App.tsx', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let dailyPaneFound = false;
  let strayEditorLabels = 0;
  const inspect = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === 'dailyPanel'
    )
      dailyPaneFound =
        node.initializer?.getText(source).includes('<DailyEntryPane ') ?? false;
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(source) === 'accessibilityLabel' &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      node.initializer.text === 'Open category editor'
    )
      strayEditorLabels += 1;
    ts.forEachChild(node, inspect);
  };
  inspect(source);
  expect(dailyPaneFound).toBe(true);
  expect(strayEditorLabels).toBe(0);
});
