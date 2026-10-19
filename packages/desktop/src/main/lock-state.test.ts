import { describe, expect, it } from 'vitest';

import {
  createPasscodeService,
  isScreenLocked,
  setScreenLocked,
  type PasscodeStore,
  type StoredPasscode,
} from './lock-state';

function memoryStore(): PasscodeStore & { value: StoredPasscode | null } {
  const store = {
    value: null as StoredPasscode | null,
    read: () => store.value,
    write: (v: StoredPasscode | null) => {
      store.value = v;
    },
  };
  return store;
}

describe('lock flag', () => {
  it('starts unlocked and follows setScreenLocked', () => {
    expect(isScreenLocked()).toBe(false);
    setScreenLocked(true);
    expect(isScreenLocked()).toBe(true);
    setScreenLocked(false);
    expect(isScreenLocked()).toBe(false);
  });
});

describe('passcode service', () => {
  it('stores a salted hash — never the code — and verifies it', () => {
    const store = memoryStore();
    const svc = createPasscodeService(store);
    svc.setPasscode('4821');
    expect(svc.hasPasscode()).toBe(true);
    expect(JSON.stringify(store.value)).not.toContain('4821');
    expect(svc.verify('4821')).toBe(true);
    expect(svc.verify('0000')).toBe(false);
  });

  it('salts: the same code hashes differently each time', () => {
    const a = memoryStore();
    const b = memoryStore();
    createPasscodeService(a).setPasscode('1234');
    createPasscodeService(b).setPasscode('1234');
    expect(a.value?.hash).not.toBe(b.value?.hash);
  });

  it('clears with null, and verify is false with nothing set', () => {
    const svc = createPasscodeService(memoryStore());
    svc.setPasscode('1234');
    svc.setPasscode(null);
    expect(svc.hasPasscode()).toBe(false);
    expect(svc.verify('1234')).toBe(false);
  });

  it('refuses everything for a while after five wrong guesses', () => {
    let t = 0;
    const svc = createPasscodeService(memoryStore(), () => t);
    svc.setPasscode('1234');
    for (let i = 0; i < 5; i += 1) expect(svc.verify('9999')).toBe(false);
    expect(svc.verify('1234')).toBe(false);
    t = 31_000;
    expect(svc.verify('1234')).toBe(true);
  });
});
