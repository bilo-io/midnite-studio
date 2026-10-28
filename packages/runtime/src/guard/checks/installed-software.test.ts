import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseBrewOutdated, resolveInstalledSoftware } from '../software';
import { createInstalledSoftwareCheck, kevMatches, type InstalledSoftware } from './installed-software';

const NOW = Date.parse('2026-10-28T00:00:00Z');
const check = createInstalledSoftwareCheck(() => NOW);
const item = (o: Partial<InstalledSoftware>): InstalledSoftware => ({ source: 'brew', name: 'openssl', version: '3.0.1', latest: '3.0.9', outdated: true, ...o });

describe('installed-software check', () => {
  it('rates an outdated item with no KEV entry low, with the brew command as the fix', async () => {
    const [f] = await check.run({ installedSoftware: [item({})], kev: {} });
    expect(f?.severity).toBe('low');
    expect(f?.fingerprint).toBe('installed-software:brew:openssl');
    expect(f?.detail).toContain('brew upgrade openssl');
  });

  it('skips items that are current', async () => {
    expect(await check.run({ installedSoftware: [item({ outdated: false }), { source: 'app', name: 'Foo', version: '1' }], kev: {} })).toEqual([]);
  });

  it('raises a KEV-named item to high, and critical when overdue or ransomware-linked', async () => {
    const kev = {
      'CVE-1': { cveID: 'CVE-1', vendorProject: 'OpenSSL', product: 'OpenSSL', dueDate: '2027-01-01' },
      'CVE-2': { cveID: 'CVE-2', vendorProject: 'Google', product: 'Chrome', dueDate: '2026-01-01' },
    };
    const fs = await check.run({
      installedSoftware: [item({}), item({ source: 'brew', name: 'google-chrome' }), item({ source: 'app', name: 'Chrome', version: '1', outdated: true })],
      kev,
    });
    const by = Object.fromEntries(fs.map((f) => [f.fingerprint, f.severity]));
    expect(by['installed-software:brew:openssl']).toBe('high');
    expect(by['installed-software:app:Chrome']).toBe('critical');
    expect(by['installed-software:brew:google-chrome']).toBe('critical');
  });

  it('matches names whole, never by substring', () => {
    const kev = { a: { cveID: 'a', product: 'Node.js Foo' } };
    expect(kevMatches(item({ name: 'node' }), kev)).toEqual([]);
    expect(kevMatches(item({ name: 'ab' }), { a: { cveID: 'a', product: 'ab' } })).toEqual([]);
  });
});

describe('software inventory', () => {
  it('parses brew outdated json and ignores malformed output', () => {
    const out = parseBrewOutdated(JSON.stringify({ formulae: [{ name: 'git', installed_versions: ['2.40.0'], current_version: '2.45.0' }], casks: [{ name: 'iterm2', installed_versions: ['3.4'], current_version: '3.5' }, { name: 'bad' }] }));
    expect(out.map((o) => `${o.name}@${o.version}->${o.latest}`)).toEqual(['git@2.40.0->2.45.0', 'iterm2@3.4->3.5']);
    expect(parseBrewOutdated('nope')).toEqual([]);
  });

  it('collects brew, sw_vers and app bundles, and throws when nothing answers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'apps-'));
    await mkdir(join(dir, 'Foo.app'));
    const exec = async (file: string, args: readonly string[]): Promise<string> => {
      if (file === 'brew') return JSON.stringify({ formulae: [{ name: 'git', installed_versions: ['1'], current_version: '2' }] });
      if (file === 'sw_vers') return '15.1\n';
      if (args.join(' ').includes('Foo.app')) return '9.9\n';
      throw new Error('x');
    };
    const all = await resolveInstalledSoftware(exec, dir);
    expect(all.map((a) => `${a.source}:${a.name}@${a.version}`)).toEqual(['brew:git@1', 'macos:macOS@15.1', 'app:Foo@9.9']);
    await expect(resolveInstalledSoftware(async () => { throw new Error('x'); }, join(dir, 'missing'))).rejects.toThrow();
  });
});
