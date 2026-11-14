import { describe, expect, it, vi } from 'vitest';

import { createPermissionProbe, PANE_URLS, type PermissionProbePort } from './probe';

function port(over: Partial<PermissionProbePort> = {}): PermissionProbePort & { accessed: string[]; trustArgs: unknown[] } {
  const accessed: string[] = [];
  const trustArgs: unknown[] = [];
  return {
    platform: 'darwin',
    home: '/Users/u',
    getMediaAccessStatus: () => 'granted',
    isTrustedAccessibilityClient: (p) => (trustArgs.push(p), true),
    access: async (p) => {
      accessed.push(p);
    },
    now: () => 42,
    accessed,
    trustArgs,
    ...over,
  };
}

const stateMap = async (p: PermissionProbePort) =>
  Object.fromEntries((await createPermissionProbe(p).read()).map((r) => [r.id, r.state]));

describe('permission probe', () => {
  it('maps each media answer to a state', async () => {
    for (const [raw, want] of [
      ['granted', 'granted'],
      ['denied', 'denied'],
      ['not-determined', 'not-determined'],
      ['restricted', 'restricted'],
      ['weird', 'unknown'],
    ] as const) {
      const s = await stateMap(port({ getMediaAccessStatus: () => raw }));
      expect([s.screen, s.microphone, s.camera]).toEqual([want, want, want]);
    }
  });

  it('reads accessibility without prompting, always passing false', async () => {
    const p = port({ isTrustedAccessibilityClient: vi.fn(() => false) });
    expect((await stateMap(p)).accessibility).toBe('denied');
    expect(p.isTrustedAccessibilityClient).toHaveBeenCalledWith(false);
    const q = port();
    await createPermissionProbe(q).read();
    expect(q.trustArgs).toEqual([false]);
  });

  it('maps Full Disk Access from access(): ok is granted, EPERM is denied', async () => {
    expect((await stateMap(port())).fullDisk).toBe('granted');
    const denied = port({ access: async () => Promise.reject(Object.assign(new Error('x'), { code: 'EPERM' })) });
    expect((await stateMap(denied)).fullDisk).toBe('denied');
  });

  it('never probes Documents, Desktop or Downloads, and leaves automation, files, notifications unchecked', async () => {
    const p = port();
    const s = await stateMap(p);
    expect(p.accessed.length).toBeGreaterThan(0);
    for (const path of p.accessed) expect(path).not.toMatch(/\/(Documents|Desktop|Downloads)(\/|$)/);
    expect([s.automation, s.files, s.notifications]).toEqual(['unchecked', 'unchecked', 'unchecked']);
  });

  it('answers unknown for every row off macOS, calling nothing', async () => {
    const p = port({ platform: 'linux', getMediaAccessStatus: vi.fn(() => 'granted') });
    const rows = await createPermissionProbe(p).read();
    expect(rows.every((r) => r.state === 'unknown' && !r.resettable)).toBe(true);
    expect(p.getMediaAccessStatus).not.toHaveBeenCalled();
  });

  it('answers unknown when a read throws, and carries the pane url and timestamp', async () => {
    const rows = await createPermissionProbe(
      port({ getMediaAccessStatus: () => { throw new Error('boom'); } }),
    ).read();
    const screen = rows.find((r) => r.id === 'screen')!;
    expect(screen).toMatchObject({ state: 'unknown', checkedAt: 42, paneUrl: PANE_URLS.screen, resettable: true });
    expect(rows.find((r) => r.id === 'notifications')!.resettable).toBe(false);
  });
});
