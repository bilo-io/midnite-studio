// vitest/jsdom: token storage over the expo-secure-store mock (Phase 146 E5).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { optionsByKey, store } from '../../test/mocks/expo-secure-store';
import { clearSession, loadSession, saveSession, tokenKey } from './token-store';

beforeEach(() => store.clear());

describe('token store', () => {
  it('keys like desktop: provider:host:login', () => {
    expect(tokenKey('octo')).toBe('github:github.com:octo');
  });

  it('saves with the device-only keychain class and round-trips', async () => {
    await saveSession('octo', 'ghp_FAKE');
    expect(optionsByKey.get('github:github.com:octo')).toEqual({ keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
    expect(store.get('github:github.com:octo')).toBe('ghp_FAKE');
    expect(await loadSession()).toEqual({ login: 'octo', token: 'ghp_FAKE' });
  });

  it('clearSession removes the token and the active login', async () => {
    await saveSession('octo', 'ghp_FAKE');
    await clearSession();
    expect(store.size).toBe(0);
    expect(await loadSession()).toBeNull();
  });

  it('never logs: the module has no console calls', () => {
    const source = readFileSync(join(process.cwd(), 'src/auth/token-store.ts'), 'utf8');
    const code = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/console\./);
  });
});
