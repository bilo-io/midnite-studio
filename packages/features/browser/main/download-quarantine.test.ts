import { describe, expect, it } from 'vitest';

import { finalizeDownload, quarantineValue, spctlArgs, uniqueLeaf, type QuarantineDeps } from './download-quarantine';

function fakeDeps(over: Partial<QuarantineDeps> & { clam?: boolean } = {}) {
  const calls: Array<[string, string[]]> = [];
  const ledger: string[] = [];
  const deps: QuarantineDeps = {
    platform: 'darwin',
    exec: async (file, args) => {
      calls.push([file, args]);
      if (file === 'clamscan') return over.clam ? { code: 0, stdout: '', stderr: '' } : { code: 127, stdout: '', stderr: '' };
      return { code: 0, stdout: 'x: accepted', stderr: '' };
    },
    sha256File: async () => 'a'.repeat(64),
    appendLedger: async (l) => {
      ledger.push(l);
    },
    now: () => 1_700_000_000_000,
    ...over,
  };
  return { deps, calls, ledger };
}

const input = { path: '/q/a.dmg', filename: 'a.dmg', size: 5, origin: 'https://x.test', url: 'https://x.test/a.dmg', referrer: 'https://x.test/', fileClass: 'disk-image' as const };

describe('finalizeDownload', () => {
  it('sets the quarantine attribute before hashing, assesses a dmg and writes one ledger line', async () => {
    const { deps, calls, ledger } = fakeDeps();
    const rec = await finalizeDownload(input, deps);
    expect(calls[0]![0]).toBe('/usr/bin/xattr');
    expect(calls[0]![1].slice(0, 2)).toEqual(['-w', 'com.apple.quarantine']);
    expect(calls[1]![0]).toBe('/usr/sbin/spctl');
    expect(rec).toMatchObject({ quarantined: true, sha256: 'a'.repeat(64), gatekeeper: expect.stringContaining('accepted') });
    expect(rec.scan).toBeUndefined();
    expect(ledger).toHaveLength(1);
    expect(JSON.parse(ledger[0]!)).toMatchObject({ sha256: 'a'.repeat(64), origin: 'https://x.test', referrer: 'https://x.test/' });
    expect(ledger[0]!.endsWith('\n')).toBe(true);
  });
  it('does not assess a document and records a clamscan result only when it exists', async () => {
    const { deps, calls } = fakeDeps({ clam: true });
    const rec = await finalizeDownload({ ...input, fileClass: 'document', filename: 'a.pdf' }, deps);
    expect(calls.some(([f]) => f === '/usr/sbin/spctl')).toBe(false);
    expect(rec.scan).toBe('clean');
  });
  it('is honest off macOS: no attribute, quarantined false', async () => {
    const { deps, calls } = fakeDeps({ platform: 'linux' });
    const rec = await finalizeDownload(input, deps);
    expect(rec.quarantined).toBe(false);
    expect(calls.some(([f]) => f === '/usr/bin/xattr')).toBe(false);
  });
});

describe('helpers', () => {
  it('builds the Gatekeeper value', () => {
    expect(quarantineValue(1_700_000_000_000, 'U')).toBe('0083;6553f100;Midnite Browser;U');
  });
  it('picks spctl args per class', () => {
    expect(spctlArgs('installer', '/p')).toContain('install');
    expect(spctlArgs('executable', '/p')).toContain('execute');
  });
  it('finds a free leaf', () => {
    expect(uniqueLeaf('a.zip', () => false)).toBe('a.zip');
    expect(uniqueLeaf('a.zip', (l) => l === 'a.zip' || l === 'a (2).zip')).toBe('a (3).zip');
  });
});
