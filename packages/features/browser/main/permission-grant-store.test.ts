import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BROWSER_PERMISSIONS_FILE,
  createPermissionGrantStore,
} from './permission-grant-store';

describe('PermissionGrantStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mstudio-perm-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defaults to ask for any origin and permission', () => {
    const store = createPermissionGrantStore();
    expect(store.get('https://example.com', 'camera')).toBe('ask');
    expect(store.get('https://example.com', 'microphone')).toBe('ask');
  });

  it('normalises origin on get, set and revoke', () => {
    const store = createPermissionGrantStore();
    store.set('https://example.com/some/path?query=1', 'camera', 'allow');
    expect(store.get('https://example.com', 'camera')).toBe('allow');
    expect(store.get('https://example.com:443/', 'camera')).toBe('allow');

    store.revoke('https://example.com:443/other', 'camera');
    expect(store.get('https://example.com', 'camera')).toBe('ask');
  });

  it('rejects clipboard-read: allow entry with an error', () => {
    const store = createPermissionGrantStore();
    expect(() => store.set('https://example.com', 'clipboard-read', 'allow')).toThrow(
      'clipboard-read cannot be granted allow',
    );
    // deny is permitted
    expect(() => store.set('https://example.com', 'clipboard-read', 'deny')).not.toThrow();
    expect(store.get('https://example.com', 'clipboard-read')).toBe('deny');
  });

  it('persists grants to disk at mode 0600', () => {
    const store = createPermissionGrantStore({ directory: tmpDir });
    store.set('https://example.com', 'microphone', 'allow');

    const filePath = join(tmpDir, BROWSER_PERMISSIONS_FILE);
    const mode = statSync(filePath).mode & 0o777;
    expect(mode).toBe(0o600);

    const reloaded = createPermissionGrantStore({ directory: tmpDir });
    expect(reloaded.get('https://example.com', 'microphone')).toBe('allow');
    expect(reloaded.list()).toHaveLength(1);
    expect(reloaded.list()[0]).toMatchObject({
      origin: 'https://example.com',
      permission: 'microphone',
      value: 'allow',
    });
  });

  it('handles revoke and resetAll correctly', () => {
    const store = createPermissionGrantStore({ directory: tmpDir });
    store.set('https://example.com', 'camera', 'allow');
    store.set('https://example.com', 'microphone', 'deny');
    store.set('https://another.org', 'geolocation', 'allow');

    expect(store.list()).toHaveLength(3);

    store.revoke('https://example.com', 'camera');
    expect(store.get('https://example.com', 'camera')).toBe('ask');
    expect(store.get('https://example.com', 'microphone')).toBe('deny');
    expect(store.list()).toHaveLength(2);

    store.resetAll();
    expect(store.list()).toHaveLength(0);
    expect(store.get('https://another.org', 'geolocation')).toBe('ask');
  });

  it('recovers cleanly from a corrupted JSON file', () => {
    const filePath = join(tmpDir, BROWSER_PERMISSIONS_FILE);
    writeFileSync(filePath, '{ bad json content', { mode: 0o600 });

    const store = createPermissionGrantStore({ directory: tmpDir });
    expect(store.list()).toEqual([]);
    expect(store.get('https://example.com', 'camera')).toBe('ask');

    store.set('https://example.com', 'camera', 'allow');
    expect(store.get('https://example.com', 'camera')).toBe('allow');
  });
});
