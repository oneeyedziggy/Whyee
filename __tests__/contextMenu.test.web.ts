import React, { act } from 'react';
import { Text } from 'react-native';
import { ContextMenu } from '../src/components/ContextMenu';

type Root = { render: (node: React.ReactNode) => void; unmount: () => void };
// react-dom ships without bundled types here; RNTL's renderer cannot host react-native-web Pressables.
const { createRoot } = require('react-dom/client') as {
  createRoot: (container: Element) => Root;
};

let host: HTMLDivElement;
let root: Root;

const flushTimers = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const query = (label: string) =>
  document.body.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;

describe('ContextMenu (web)', () => {
  it('highlights an item while the pointer hovers over it', async () => {
    const onPress = jest.fn();
    await act(async () => {
      root.render(
        React.createElement(ContextMenu, {
          accessibilityLabel: 'Options',
          items: [{ key: 'rename', label: 'Rename', onPress }],
          renderTrigger: () => React.createElement(Text, null, 'Open'),
        }),
      );
    });
    await act(async () => query('Options')?.click());
    await flushTimers();

    const item = query('Rename') as HTMLElement;
    expect(item).not.toBeNull();
    const idleBackground = getComputedStyle(item).backgroundColor;

    await act(async () => {
      item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      item.dispatchEvent(new MouseEvent('mouseenter'));
    });
    const hoveredBackground = getComputedStyle(item).backgroundColor;
    expect(hoveredBackground).not.toBe(idleBackground);

    await act(async () => {
      item.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      item.dispatchEvent(new MouseEvent('mouseleave'));
    });
    expect(getComputedStyle(item).backgroundColor).toBe(idleBackground);

    await act(async () => item.click());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
