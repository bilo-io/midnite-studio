import { beforeEach, describe, expect, it, vi } from 'vitest';

const { lock } = vi.hoisted(() => ({
  lock: {
    set: vi.fn(),
    get: vi.fn(),
    setPasscode: vi.fn(),
    verify: vi.fn(),
  },
}));
vi.mock('../services/bridge', () => ({ bridge: () => ({ lock }) }));

import { syncLockFromMain } from './lock-sync';
import { useUiStore } from './ui-store';

describe('syncLockFromMain (Phase 91 Theme D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({
      passcode: null,
      hasPasscode: false,
      screensaverOpen: false,
      screensaverLocked: false,
    });
  });

  it('puts the overlay back up when main says the screen is locked (the reload case)', async () => {
    lock.get.mockResolvedValue({ locked: true, hasPasscode: true });
    await syncLockFromMain();
    expect(useUiStore.getState()).toMatchObject({
      screensaverOpen: true,
      screensaverLocked: true,
      hasPasscode: true,
    });
  });

  it('forwards a legacy plaintext passcode to main and blanks it once main holds one', async () => {
    useUiStore.setState({ passcode: '4821' });
    lock.get.mockResolvedValue({ locked: false, hasPasscode: true });
    await syncLockFromMain();
    expect(lock.setPasscode).toHaveBeenCalledWith('4821');
    expect(useUiStore.getState().passcode).toBeNull();
  });

  it('keeps the legacy code if main did not confirm, so the next start retries', async () => {
    useUiStore.setState({ passcode: '4821' });
    lock.get.mockResolvedValue({ locked: false, hasPasscode: false });
    await syncLockFromMain();
    expect(useUiStore.getState().passcode).toBe('4821');
  });

  it('persists no plaintext after setPasscode', () => {
    useUiStore.getState().setPasscode('4821');
    expect(lock.setPasscode).toHaveBeenCalledWith('4821');
    const partialize = useUiStore.persist.getOptions().partialize;
    expect(JSON.stringify(partialize?.(useUiStore.getState()))).not.toContain('4821');
    expect(useUiStore.getState().hasPasscode).toBe(true);
  });

  it('mirrors lock/unlock to main', () => {
    useUiStore.getState().lockScreen();
    expect(lock.set).toHaveBeenLastCalledWith(true);
    useUiStore.getState().setScreensaverOpen(false);
    expect(lock.set).toHaveBeenLastCalledWith(false);
  });
});
