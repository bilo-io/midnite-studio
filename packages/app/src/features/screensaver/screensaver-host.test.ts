import { describe, expect, it } from 'vitest';

import { useUiStore } from '../../store/ui-store';

describe('Screensaver state in ui-store', () => {
  it('defaults screensaverOpen and screensaverLocked to false', () => {
    const state = useUiStore.getState();
    expect(state.screensaverOpen).toBe(false);
    expect(state.screensaverLocked).toBe(false);
  });

  it('updates screensaverOpen and screensaverLocked via setScreensaverOpen', () => {
    useUiStore.getState().setScreensaverOpen(true, false);
    expect(useUiStore.getState().screensaverOpen).toBe(true);
    expect(useUiStore.getState().screensaverLocked).toBe(false);

    useUiStore.getState().setScreensaverOpen(false);
    expect(useUiStore.getState().screensaverOpen).toBe(false);
    expect(useUiStore.getState().screensaverLocked).toBe(false);
  });

  it('activates lockScreen with screensaverLocked set to true', () => {
    useUiStore.getState().lockScreen();
    expect(useUiStore.getState().screensaverOpen).toBe(true);
    expect(useUiStore.getState().screensaverLocked).toBe(true);

    // reset
    useUiStore.getState().setScreensaverOpen(false);
  });
});
