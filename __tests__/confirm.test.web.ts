import { Alert } from 'react-native';
import { confirmAction } from '../src/lib/confirm';

const globals = globalThis as { confirm?: (text: string) => boolean };

describe('confirmAction (web)', () => {
  const originalConfirm = globals.confirm;
  let alert: jest.SpyInstance;

  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    globals.confirm = originalConfirm;
    alert.mockRestore();
  });

  it('uses the DOM confirm prompt and runs the action when accepted', () => {
    const ask = jest.fn(() => true);
    globals.confirm = ask;
    const onConfirm = jest.fn();

    confirmAction('Delete?', 'Gone forever.', 'Delete', onConfirm);

    expect(ask).toHaveBeenCalledWith('Delete?\n\nGone forever.');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it('does nothing when the prompt is dismissed', () => {
    globals.confirm = jest.fn(() => false);
    const onConfirm = jest.fn();

    confirmAction('Delete?', 'Gone forever.', 'Delete', onConfirm);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('proceeds without prompting when no DOM confirm is available', () => {
    globals.confirm = undefined;
    const onConfirm = jest.fn();

    confirmAction('Delete?', 'Gone forever.', 'Delete', onConfirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });
});
