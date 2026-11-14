import { describe, expect, it, vi } from 'vitest';

import { createFullDiskAccessProbe } from './full-disk-access';

const deny = (code: string) => Object.assign(new Error(code), { code });

describe('full disk access probe', () => {
  it('is true when a probe path is readable', async () => {
    const access = vi.fn(async (p: string) => {
      if (!p.endsWith('Bookmarks.plist')) throw deny('ENOENT');
    });
    expect(await createFullDiskAccessProbe('/Users/u', access)()).toBe(true);
    expect(access).toHaveBeenCalledWith('/Users/u/Library/Safari/Bookmarks.plist');
  });

  it('is false when every path is refused or missing, and never throws', async () => {
    const access = vi.fn(async (p: string) => {
      throw deny(p.includes('Safari') ? 'EPERM' : 'ENOENT');
    });
    expect(await createFullDiskAccessProbe('/Users/u', access)()).toBe(false);
  });

  it('caches for the session and re-probes on refresh', async () => {
    let granted = false;
    const access = vi.fn(async () => {
      if (!granted) throw deny('EPERM');
    });
    const probe = createFullDiskAccessProbe('/Users/u', access);
    expect(await probe()).toBe(false);
    granted = true;
    expect(await probe()).toBe(false);
    const calls = access.mock.calls.length;
    await probe();
    expect(access.mock.calls.length).toBe(calls);
    expect(await probe.refresh()).toBe(true);
    expect(await probe()).toBe(true);
  });
});
