import { describe, expect, it } from 'vitest';

import { createPasscodeService, type PasscodeStore, type StoredPasscode } from './passcode';

describe('passcode service', () => {
  const memoryStore = (): PasscodeStore => {
    let current: StoredPasscode | null = null;
    return {
      read: () => current,
      write: (v) => {
        current = v;
      },
    };
  };

  it('stores a salted hash — never the code — and verifies it', () => {
    const store = memoryStore();
    const service = createPasscodeService(store);
    expect(service.hasPasscode()).toBe(false);

    service.setPasscode('1234');
    expect(service.hasPasscode()).toBe(true);
    expect(store.read()?.hash).not.toContain('1234');

    expect(service.verify('1234')).toBe(true);
    expect(service.verify('0000')).toBe(false);
  });

  it('salts: the same code hashes differently each time', () => {
    const storeA = memoryStore();
    const storeB = memoryStore();
    createPasscodeService(storeA).setPasscode('1234');
    createPasscodeService(storeB).setPasscode('1234');
    expect(storeA.read()?.salt).not.toBe(storeB.read()?.salt);
    expect(storeA.read()?.hash).not.toBe(storeB.read()?.hash);
  });

  it('clears with null, and verify is false with nothing set', () => {
    const store = memoryStore();
    const service = createPasscodeService(store);
    service.setPasscode('1234');
    service.setPasscode(null);
    expect(service.hasPasscode()).toBe(false);
    expect(service.verify('1234')).toBe(false);
  });

  it('refuses everything for a while after five wrong guesses', () => {
    let now = 100_000;
    const store = memoryStore();
    const service = createPasscodeService(store, () => now);
    service.setPasscode('1234');

    for (let i = 0; i < 4; i++) {
      expect(service.verify('wrong')).toBe(false);
    }
    // Still accepted on 5th attempt if correct
    expect(service.verify('1234')).toBe(true);

    // 5 failures trigger lockout
    for (let i = 0; i < 5; i++) {
      expect(service.verify('wrong')).toBe(false);
    }
    // Blocked even if correct
    expect(service.verify('1234')).toBe(false);

    // Advances past lockout (30s)
    now += 30_001;
    expect(service.verify('1234')).toBe(true);
  });
});
