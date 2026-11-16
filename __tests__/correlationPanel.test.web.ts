import React, { act } from 'react';
import { CorrelationPanel } from '../src/components/CorrelationPanel';

type Root = { render: (node: React.ReactNode) => void; unmount: () => void };
// react-dom ships without bundled types here; RNTL's renderer cannot host react-native-web Pressables.
const { createRoot } = require('react-dom/client') as {
  createRoot: (container: Element) => Root;
};

jest.mock('../src/components/InfoLink', () => ({ InfoLink: () => null }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('CorrelationPanel (web)', () => {
  it('exposes the full pair name as a hover tooltip', async () => {
    await act(async () => {
      root.render(
        React.createElement(CorrelationPanel, {
          rows: [
            {
              label: 'A very long category x Another long category',
              leftCategoryId: 'a',
              rightCategoryId: 'b',
              cells: [{ offset: 0, value: 0.5 }],
            },
          ],
          loading: false,
          offsets: [0],
          offset: 0,
          onOffsetChange: jest.fn(),
        }),
      );
    });
    const pair = host.querySelector(
      '[aria-label="A very long category x Another long category"]',
    );
    expect(pair).not.toBeNull();
    expect(pair?.closest('[title]')?.getAttribute('title')).toBe(
      'A very long category x Another long category',
    );
  });
});
