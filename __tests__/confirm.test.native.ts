import { Alert } from 'react-native';
import { confirmAction, registerConfirmHost } from '../src/lib/confirm';

describe('confirmAction (native)', () => {
  it('shows a cancellable destructive alert that confirms only on press', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onConfirm = jest.fn();

    confirmAction('Delete?', 'This cannot be undone.', 'Delete', onConfirm);

    expect(alert).toHaveBeenCalledWith('Delete?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
    expect(onConfirm).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('routes to a registered host instead of the platform alert until it unregisters', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const host = jest.fn();
    const onConfirm = jest.fn();
    const unregister = registerConfirmHost(host);

    confirmAction('Reset?', 'Clears values.', 'Reset', onConfirm);
    expect(host).toHaveBeenCalledWith({
      title: 'Reset?',
      message: 'Clears values.',
      confirmLabel: 'Reset',
      onConfirm,
    });
    expect(alert).not.toHaveBeenCalled();

    unregister();
    confirmAction('Reset?', 'Clears values.', 'Reset', onConfirm);
    expect(host).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('does not clear a newer host when a stale host unregisters', () => {
    const stale = jest.fn();
    const current = jest.fn();
    const unregisterStale = registerConfirmHost(stale);
    const unregisterCurrent = registerConfirmHost(current);

    unregisterStale();
    confirmAction('t', 'm', 'ok', jest.fn());

    expect(current).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
    unregisterCurrent();
  });
});
