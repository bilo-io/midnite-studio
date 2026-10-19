import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { CHANNELS, schemas } from '@midnite/studio-shared';

import {
  createPasscodeService,
  isScreenLocked,
  setScreenLocked,
  type PasscodeStore,
  type StoredPasscode,
} from '../lock-state';
import { handle, handleBare, handleSend } from './handle';

/** `<userData>/lock-passcode.json`, mode 0600 — a salt and a scrypt hash, never the code. */
export function filePasscodeStore(path: string): PasscodeStore {
  return {
    read() {
      try {
        if (!existsSync(path)) return null;
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<StoredPasscode>;
        return typeof parsed.salt === 'string' && typeof parsed.hash === 'string'
          ? { salt: parsed.salt, hash: parsed.hash }
          : null;
      } catch {
        return null;
      }
    },
    write(value) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
      chmodSync(path, 0o600);
    },
  };
}

/** Phase 91 Theme D — the lock screen's main-side channels. */
export function registerLockHandlers(userDataDir: string, warn: (message: string) => void): void {
  const passcode = createPasscodeService(filePasscodeStore(join(userDataDir, 'lock-passcode.json')));
  handleSend(CHANNELS.lockSet, schemas.LockSetRequest, (locked) => setScreenLocked(locked), warn);
  handleBare(CHANNELS.lockGet, () => ({ locked: isScreenLocked(), hasPasscode: passcode.hasPasscode() }));
  handle(
    CHANNELS.lockSetPasscode,
    schemas.LockSetPasscodeRequest,
    (code) => passcode.setPasscode(code),
    () => undefined,
  );
  handle(
    CHANNELS.lockVerify,
    schemas.LockVerifyRequest,
    (code) => passcode.verify(code),
    () => false,
  );
}
