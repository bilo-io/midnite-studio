// vitest, not Playwright: Studio's host wiring over temp dirs, a fake cipher and a real Unix socket.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  connectRuntimeVault,
  createFakeCipher,
  createPairingStore,
  runtimeHostDirectory,
  testPairingIdentity,
  createVaultGrants,
  createVaultService,
  readRuntimeHostRecord,
  runtimeDataDirectory,
  vaultHostSocketPath,
  type VaultHost,
} from '@midnite/studio-runtime';
import { afterEach, describe, expect, it } from 'vitest';

import { startStudioRuntimeHost, studioRuntimeDirectory } from './runtime-host';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

describe('studioRuntimeDirectory', () => {
  it('hosts in the runtime directory for the real profile, inside a throwaway one otherwise', () => {
    expect(studioRuntimeDirectory('/AS', '/AS/Midnite Studio')).toBe(runtimeDataDirectory('/AS'));
    expect(studioRuntimeDirectory('/AS', '/tmp/e2e-profile')).toBe('/tmp/e2e-profile/runtime');
  });
});

describe('startStudioRuntimeHost', () => {
  /** Studio's userData and the runtime directory, side by side in one temp dir — never the real ones. */
  function studio() {
    const root = mkdtempSync(join(tmpdir(), 'msrh-'));
    const userData = join(root, 'studio');
    const service = createVaultService({ directory: userData, cipher: createFakeCipher() });
    const runtimeDirectory = join(root, 'rt');
    const pairings = createPairingStore({ hostDirectory: runtimeHostDirectory(runtimeDirectory) });
    return { root, runtimeDirectory, service, grants: createVaultGrants({ directory: userData }), pairings };
  }

  const start = async (s: ReturnType<typeof studio>, pid: number): Promise<VaultHost | null> => {
    const host = await startStudioRuntimeHost({
      runtimeDirectory: s.runtimeDirectory,
      service: s.service,
      grants: s.grants,
      pairings: s.pairings,
      broker: { socketPath: join(s.root, 'studio', 'broker', '1.0.0-abc-dev.sock'), directory: join(s.root, 'studio', 'broker') },
      sessionsFile: join(s.root, 'studio', 'terminals.json'),
      pid,
      log: () => undefined,
      now: () => 7,
    });
    if (host) cleanups.push(() => host.close());
    return host;
  };

  it('serves Studio’s own vault, where it already is, and records its broker', async () => {
    const s = studio();
    await s.service.forApp('studio').set('secrets', 'agent.anthropic.apiKey', 'sk-1');
    expect(await start(s, 111)).not.toBeNull();

    expect(readRuntimeHostRecord(s.runtimeDirectory)).toEqual({
      version: 1,
      host: 'studio',
      pid: 111,
      writtenAt: 7,
      broker: { socketPath: join(s.root, 'studio', 'broker', '1.0.0-abc-dev.sock'), directory: join(s.root, 'studio', 'broker') },
      sessionsFile: join(s.root, 'studio', 'terminals.json'),
    });
    s.grants.set('agents', 'secrets', ['agent.anthropic.apiKey']);
    const agentsKey = testPairingIdentity();
    const agents = connectRuntimeVault({ socketPath: vaultHostSocketPath(s.runtimeDirectory), appId: 'agents', identity: () => agentsKey });
    cleanups.push(() => agents.close());
    expect(await agents.get('secrets', 'agent.anthropic.apiKey')).toBe('sk-1');
    // Paired on that first hello, in Studio's own store — what Studio's Vault view lists.
    expect(s.pairings.list().apps.map((a) => a.appId)).toEqual(['agents']);
  });

  it('a second Studio does not take over: no host, and the first one’s record is left alone', async () => {
    const s = studio();
    expect(await start(s, 111)).not.toBeNull();
    expect(await start(s, 222)).toBeNull();
    expect(readRuntimeHostRecord(s.runtimeDirectory)?.pid).toBe(111);
  });
});
