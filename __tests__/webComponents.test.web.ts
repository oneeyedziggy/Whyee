import React, { act } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsDrawer } from '../src/components/SettingsDrawer';
import { SortHeader } from '../src/components/SortHeader';
import { WorkspaceManagerModal } from '../src/components/WorkspaceManagerModal';
import { colors } from '../src/theme/tokens';

type Root = { render: (node: React.ReactNode) => void; unmount: () => void };
// react-dom ships without bundled types here; RNTL's renderer cannot host react-native-web Pressables.
const { createRoot } = require('react-dom/client') as {
  createRoot: (container: Element) => Root;
};

jest.mock('lucide-react-native', () => ({
  Download: () => null,
  Upload: () => null,
  X: () => null,
  Eye: () => null,
  EyeOff: () => null,
  Trash2: () => null,
}));

let host: HTMLDivElement;
let root: Root;

const mount = async (node: React.ReactElement) => {
  await act(async () =>
    root.render(
      React.createElement(SafeAreaProvider, {
        initialMetrics: {
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        },
        children: node,
      }),
    ),
  );
};

const hexToRgb = (hex: string) => {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
};

const actionRow = (title: string) => {
  const label = [...document.body.querySelectorAll('div')].find(
    (node) => node.textContent === title,
  ) as HTMLElement;
  return label.closest('[role="button"]') as HTMLElement;
};

const hover = async (element: HTMLElement, type: 'enter' | 'leave') => {
  const supportsPointer = typeof window.PointerEvent === 'function';
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent(`${supportsPointer ? 'pointer' : 'mouse'}${type}`, {
        bubbles: false,
      }),
    );
  });
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('SettingsDrawer on web', () => {
  it('highlights action rows while hovered', async () => {
    await mount(
      React.createElement(SettingsDrawer, {
        visible: true,
        onClose: jest.fn(),
        onExport: jest.fn(),
        onImport: jest.fn(),
      }),
    );
    const exportRow = actionRow('Export data');
    const importRow = actionRow('Import data');
    const surface = getComputedStyle(exportRow).backgroundColor;

    await hover(exportRow, 'enter');
    expect(getComputedStyle(exportRow).backgroundColor).toBe(
      hexToRgb(colors.primarySoft),
    );
    expect(getComputedStyle(importRow).backgroundColor).toBe(surface);

    await hover(exportRow, 'leave');
    expect(getComputedStyle(exportRow).backgroundColor).toBe(surface);
  });
});

describe('WorkspaceManagerModal on web', () => {
  it('shows a grab cursor on the reorder handles', async () => {
    await mount(
      React.createElement(WorkspaceManagerModal, {
        visible: true,
        workspaces: [{ id: 'user', name: 'User' }],
        onClose: jest.fn(),
        onAdd: jest.fn(),
        onUpdate: jest.fn(),
        onReorder: jest.fn(),
        onDelete: jest.fn(),
      }),
    );
    const handle = document.body.querySelector(
      '[aria-label="Reorder User"]',
    ) as HTMLElement;
    expect(getComputedStyle(handle).cursor).toBe('grab');
  });
});

describe('SortHeader on web', () => {
  it('shows the hint as a native tooltip around the header', async () => {
    await mount(
      React.createElement(SortHeader, {
        label: 'Mean',
        direction: 'default',
        onPress: jest.fn(),
        hint: 'Average value',
      }),
    );
    const button = host.querySelector('[role="button"]') as HTMLElement;
    expect(button.closest('[title="Average value"]')).not.toBeNull();
  });

  it('adds no tooltip wrapper without a hint', async () => {
    await mount(
      React.createElement(SortHeader, {
        label: 'Mean',
        direction: 'default',
        onPress: jest.fn(),
      }),
    );
    expect(host.querySelector('[title]')).toBeNull();
    expect(host.querySelector('[role="button"]')).not.toBeNull();
  });
});