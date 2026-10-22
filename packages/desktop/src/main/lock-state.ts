/**
 * The lock screen's authority (Phase 91 Theme D).
 *
 * `screensaverLocked` used to live only in the renderer's store, outside `partialize`, so
 * `Mod+R` rehydrated it to `false` and the lock was gone. The authority is now here: a
 * module-level flag the window-reload IPC consults, plus the passcode as a salted scrypt hash
 * — the renderer sets a code and asks "does this match?", and the expected value never crosses
 * the boundary (it used to be a plain prop in the React tree while the lock was showing).
 *
 * Honest limits: a 4-digit code is brute-forceable by anyone who can read the hash file, and a
 * process that can send IPC from the renderer can ask `verify` repeatedly (so it is rate-limited
 * below). This is a screen lock against a person at the keyboard, not a vault.
 */
import {
  createPasscodeService,
  type PasscodeService,
  type PasscodeStore,
  type StoredPasscode,
} from '@midnite/studio-runtime';

let locked = false;

export const isScreenLocked = (): boolean => locked;
export const setScreenLocked = (next: boolean): void => {
  locked = next;
};

export {
  createPasscodeService,
  type PasscodeService,
  type PasscodeStore,
  type StoredPasscode,
};
