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
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

let locked = false;

export const isScreenLocked = (): boolean => locked;
export const setScreenLocked = (next: boolean): void => {
  locked = next;
};

export type StoredPasscode = { salt: string; hash: string };

/** Persistence seam — a file under userData in production, an in-memory fake in tests. */
export type PasscodeStore = {
  read(): StoredPasscode | null;
  write(value: StoredPasscode | null): void;
};

const KEY_LENGTH = 64;
/** Consecutive wrong guesses before `verify` starts refusing for a while. */
const MAX_FAILURES = 5;
const LOCKOUT_MS = 30_000;

export type PasscodeService = {
  hasPasscode(): boolean;
  setPasscode(code: string | null): void;
  verify(code: string): boolean;
};

export function createPasscodeService(store: PasscodeStore, now: () => number = Date.now): PasscodeService {
  let failures = 0;
  let blockedUntil = 0;
  return {
    hasPasscode: () => store.read() !== null,
    setPasscode(code) {
      failures = 0;
      if (code === null) {
        store.write(null);
        return;
      }
      const salt = randomBytes(16);
      store.write({
        salt: salt.toString('hex'),
        hash: scryptSync(code, salt, KEY_LENGTH).toString('hex'),
      });
    },
    verify(code) {
      const stored = store.read();
      if (!stored) return false;
      if (now() < blockedUntil) return false;
      const expected = Buffer.from(stored.hash, 'hex');
      const actual = scryptSync(code, Buffer.from(stored.salt, 'hex'), KEY_LENGTH);
      const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
      if (ok) {
        failures = 0;
        return true;
      }
      failures += 1;
      if (failures >= MAX_FAILURES) {
        failures = 0;
        blockedUntil = now() + LOCKOUT_MS;
      }
      return false;
    },
  };
}
