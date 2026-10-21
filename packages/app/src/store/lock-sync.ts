import { bridge } from '../services/bridge';
import { useUiStore } from './ui-store';

/**
 * Reconcile the lock screen with main, once on mount (Phase 91 Theme D).
 *
 * Main is the authority for two things the renderer used to own: whether the screen is locked
 * (so a reload cannot clear it) and the passcode (a scrypt hash there, a plaintext string in
 * `localStorage` before). This does three jobs, in order:
 *
 * 1. Forward a legacy plaintext `passcode` to main and blank it — only once main confirms it
 *    holds one, like `migrate-agent-api-keys.ts`, so a failed write is retried on the next start.
 * 2. Learn `hasPasscode` from main.
 * 3. If main says the screen is locked, put the overlay back up. That is the whole point: the
 *    renderer was reloaded (or a popout opened) while locked.
 */
export async function syncLockFromMain(): Promise<void> {
  const api = bridge();
  if (!api) return;
  try {
    const legacy = useUiStore.getState().passcode;
    if (legacy && /^\d{4,12}$/.test(legacy)) {
      await api.lock.setPasscode(legacy);
      if ((await api.lock.get()).hasPasscode) useUiStore.setState({ passcode: null });
    } else if (legacy !== null) {
      // Not a code the pad could have produced — nothing worth keeping, and nothing to forward.
      useUiStore.setState({ passcode: null });
    }
    const state = await api.lock.get();
    useUiStore.setState({ hasPasscode: state.hasPasscode });
    if (state.locked) useUiStore.setState({ screensaverOpen: true, screensaverLocked: true });
  } catch {
    // Keep whatever is there; the next start retries. Never log the passcode.
  }
}
