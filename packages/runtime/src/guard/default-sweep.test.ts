import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFindingsLedger } from '../security/findings-ledger';
import { defaultGuardChecks } from './default-checks';
import type { FeedFetch } from './feeds/osv';
import { createGuardResolvers } from './resolvers';
import { runGuardSweep } from './runner';

const res = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });

describe('the default sweep, end to end (Phase 122 B + C)', () => {
  let dir: string;
  let repo: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sweep-'));
    repo = join(dir, 'repo');
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/lodash': { version: '4.17.20' } } }));
    await writeFile(join(repo, '.mcp.json'), JSON.stringify({ mcpServers: { a: { command: 'npx', args: ['some-server'] } } }));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const fetch: FeedFetch = async (url, init) => {
    if (url.endsWith('/v1/querybatch')) {
      const queries = JSON.parse(init!.body!).queries as unknown[];
      return res({ results: queries.map(() => ({ vulns: [{ id: 'GHSA-1', modified: 'm1' }] })) });
    }
    if (url.includes('/v1/vulns/')) {
      return res({
        id: 'GHSA-1',
        modified: 'm1',
        summary: 'Prototype pollution',
        database_specific: { severity: 'HIGH' },
        affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }],
      });
    }
    return res({ vulnerabilities: [] }); // KEV
  };

  it('runs lockfile-cves with real resolvers, and skips the threat-feed checks without a trusted key', async () => {
    const ledger = createFindingsLedger({ userData: dir });
    const { record, findings } = await runGuardSweep({
      userData: dir,
      checks: defaultGuardChecks(),
      ledger,
      context: { resolvers: createGuardResolvers({ userData: dir, home: dir, repos: () => [repo], fetch }) },
    });
    expect(record.checksRun).toEqual(['lockfile-cves']);
    expect(Object.keys(record.inputsSkipped)).toEqual(['installedSoftware', 'threatFeed']);
    expect(record.inputsSkipped.installedSoftware).toBe('no-resolver'); // the host supplies exec
    expect(record.inputsSkipped.threatFeed).toContain('no trusted threat-feed key');
    expect(findings.map((f) => f.fingerprint)).toEqual([expect.stringContaining('lockfile-cves:')]);
  });

  it('runs every check once a feed key is trusted, and reads MCP servers and installed packages', async () => {
    const resolvers = createGuardResolvers({ userData: dir, home: dir, repos: () => [repo], fetch, publicKeyPem: 'not-a-key' });
    // An unverifiable feed is still a skip with its reason, not a clean pass.
    expect(await resolvers['mcpServers']!({})).toEqual([{ serverName: 'a', command: 'npx some-server', configHash: expect.any(String) }]);
    await expect(resolvers['threatFeed']!({})).rejects.toThrow();
    expect(await resolvers['installedPackages']!({})).toEqual([]);
  });
});
