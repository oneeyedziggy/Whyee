import React, { act } from 'react';
import { TimeEditor } from '../src/components/TimeEditor';

type Root = { render: (node: React.ReactNode) => void; unmount: () => void };
// react-dom ships without bundled types here; RNTL's renderer cannot host react-native-web views.
const { createRoot } = require('react-dom/client') as {
  createRoot: (container: Element) => Root;
};

jest.mock('../src/components/SystemTimeField', () => ({ SystemTimeField: () => null }));

describe('TimeEditor (web)', () => {
  it('keeps pointer drags inside the field away from the page swipe gesture', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const pageSwipe = jest.fn();
    // React handles events at the root, so the page listener sits above it like the swipe handler.
    document.body.addEventListener('pointerdown', pageSwipe);
    await act(async () =>
      root.render(
        React.createElement(TimeEditor, {
          label: 'Start',
          timestamp: new Date(2026, 2, 1, 20).toISOString(),
          showMilliseconds: false,
          rejectMessage: 'Out of range',
          onChange: jest.fn(),
          onReject: jest.fn(),
        }),
      ),
    );
    const input = host.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('20:00:00');

    input.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(pageSwipe).not.toHaveBeenCalled();
    // The same gesture outside the field still reaches the page.
    input.parentElement!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(pageSwipe).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    host.remove();
  });
});
