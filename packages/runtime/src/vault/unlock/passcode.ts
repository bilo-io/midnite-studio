import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

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

export function createPasscodeService(
  store: PasscodeStore,
  now: () => number = Date.now,
): PasscodeService {
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
