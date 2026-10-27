import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ThreatFeed } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { resolveInstalledNodeModules } from '../lockfiles/node-modules';
import type { LockedPackage } from '../lockfiles/types';
import { mcpServersCheck, poisonedPackagesCheck, slopsquatCheck, withinOneEdit } from './threat-feed-checks';

const ref = 'https://example.com/w';
const feed: ThreatFeed = {
  version: 1,
  publishedAt: 'x',
  poisonedPackages: [{ ecosystem: 'npm', name: 'bad-pkg', versions: ['1.2.3'], campaign: 'Shai-Hulud', ref }],
  mcpServers: [{ nameOrUrl: 'evil-mcp', campaign: 'c', ref }, { nameOrUrl: 'x', configHash: 'abc', campaign: 'c2', ref }],
  slopsquatNames: [{ ecosystem: 'npm', name: 'huggingface-cli', ref }],
  clickfixDomains: [],
  commandGrammars: [],
  yaraRules: [],
};
const pkg = (name: string, version: string, path = '/r/pnpm-lock.yaml'): LockedPackage => ({ ecosystem: 'npm', name, version, direct: true, path });

describe('threat-feed checks (Phase 122 Theme C)', () => {
  it('poisoned-packages: critical on the poisoned version only, once per path', () => {
    const out = poisonedPackagesCheck.run({ threatFeed: feed, lockfiles: [pkg('bad-pkg', '1.2.3'), pkg('bad-pkg', '1.2.4')], installedPackages: [pkg('bad-pkg', '1.2.3', '/r/node_modules/bad-pkg/package.json')] }) as ReturnType<typeof Array.prototype.concat>;
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ severity: 'critical', source: 'guard', remediation: [{ id: 'remove-package', name: 'bad-pkg', version: '1.2.3' }] });
    expect(out[0].detail).toContain('Shai-Hulud');
  });

  it('mcp-servers: matches by name or by config fingerprint', () => {
    const out = mcpServersCheck.run({ threatFeed: feed, mcpServers: [{ serverName: 'evil-mcp', command: 'npx evil' }, { serverName: 'renamed', command: 'c', configHash: 'abc' }, { serverName: 'fine', command: 'c', configHash: 'zzz' }] }) as ReturnType<typeof Array.prototype.concat>;
    expect(out.map((f: { fingerprint: string }) => f.fingerprint)).toEqual(['mcp-servers:evil-mcp', 'mcp-servers:renamed']);
    expect(out[0].remediation).toEqual([{ id: 'revoke-mcp-server', serverName: 'evil-mcp' }]);
  });

  it('slopsquat: listed names are high, one-edit typos of popular names are medium, popular names are clean', () => {
    const out = slopsquatCheck.run({ threatFeed: feed, lockfiles: [pkg('huggingface-cli', '1.0.0'), pkg('lodsh', '1.0.0'), pkg('lodash', '4.17.21'), pkg('left-pad', '1.0.0')] }) as ReturnType<typeof Array.prototype.concat>;
    expect(out.map((f: { severity: string }) => f.severity)).toEqual(['high', 'medium']);
    expect(withinOneEdit('reakt', 'react')).toBe(true);
    expect(withinOneEdit('react', 'react')).toBe(false);
    expect(withinOneEdit('reactt', 'react')).toBe(true);
    expect(withinOneEdit('re', 'react')).toBe(false);
    expect(withinOneEdit('lodahs', 'lodash')).toBe(true);
    expect((out[1] as { remediation: unknown[] }).remediation).toEqual([]);
  });

  it('a partial feed object does not throw', () => {
    expect(() => mcpServersCheck.run({ threatFeed: { poisonedPackages: [] }, mcpServers: [{ serverName: 'a', command: 'b' }] })).not.toThrow();
  });

  it('every check reports nothing without a feed', () => {
    for (const c of [poisonedPackagesCheck, mcpServersCheck, slopsquatCheck]) expect(c.run({ lockfiles: [pkg('bad-pkg', '1.2.3')], mcpServers: [] })).toEqual([]);
  });

  it('resolveInstalledNodeModules reads top-level and scoped package.json files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nm-'));
    try {
      await mkdir(join(root, 'node_modules/a'), { recursive: true });
      await mkdir(join(root, 'node_modules/@s/b'), { recursive: true });
      await mkdir(join(root, 'node_modules/.bin'), { recursive: true });
      await writeFile(join(root, 'node_modules/a/package.json'), JSON.stringify({ name: 'a', version: '1.0.0' }));
      await writeFile(join(root, 'node_modules/@s/b/package.json'), JSON.stringify({ name: '@s/b', version: '2.0.0' }));
      expect((await resolveInstalledNodeModules([root, '/nope'])).map((p) => `${p.name}@${p.version}`).sort()).toEqual(['@s/b@2.0.0', 'a@1.0.0']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
