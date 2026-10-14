import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeCipher, runtimeDataDirectory, type VaultCipher } from '@midnite/studio-runtime';

import {
  STUDIO_MIGRATION_MARKER,
  migrateAnyLegacyRepoStore,
  migrateLegacyRepoStore,
  migrateStudioToRuntime,
} from './userdata-migration';

/**
 * The migration against real directories. It carries no `electron` import — the
 * two userData paths are arguments — so it runs under bare vitest.
 */
describe('migrateLegacyRepoStore', () => {
  let root: string;
  let legacy: string;
  let current: string;

  const REPOS = '{"version":1,"paths":["/tmp/one"]}\n';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'midnite-studio-test-'));
    legacy = join(root, 'midnite-git');
    current = join(root, 'Midnite Studio');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('copies the repo list out of the pre-rename directory', async () => {
    await writeFileIn(legacy, REPOS);

    expect(await migrateLegacyRepoStore(legacy, current)).toBe(true);
    expect(await readFile(join(current, 'repos.json'), 'utf8')).toBe(REPOS);
  });

  it('leaves the legacy copy in place, so an older build still boots', async () => {
    await writeFileIn(legacy, REPOS);

    await migrateLegacyRepoStore(legacy, current);

    expect(await readFile(join(legacy, 'repos.json'), 'utf8')).toBe(REPOS);
  });

  it('never overwrites a list the renamed app has already written', async () => {
    await writeFileIn(legacy, REPOS);
    const newer = '{"version":1,"paths":["/tmp/two"]}\n';
    await writeFileIn(current, newer);

    expect(await migrateLegacyRepoStore(legacy, current)).toBe(false);
    expect(await readFile(join(current, 'repos.json'), 'utf8')).toBe(newer);
  });

  it('is a no-op on a clean install, with no legacy directory at all', async () => {
    expect(await migrateLegacyRepoStore(legacy, current)).toBe(false);
  });

  // Guards the truncate-on-self-copy footgun: on a platform where userData does
  // not embed the app name, both arguments are the same path.
  it('does not touch the file when both paths are the same directory', async () => {
    await writeFileIn(legacy, REPOS);

    expect(await migrateLegacyRepoStore(legacy, legacy)).toBe(false);
    expect(await readFile(join(legacy, 'repos.json'), 'utf8')).toBe(REPOS);
  });
});

async function writeFileIn(directory: string, contents: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'repos.json'), contents, 'utf8');
}

describe('migrateAnyLegacyRepoStore (the rename chain)', () => {
  it('takes the newest legacy name that actually has data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'midnite-studio-test-'));
    const current = join(root, 'Midnite Studio');
    // Both prior names present: the pre-"Midnite Git" one holds a stale list.
    for (const [name, body] of [
      ['Midnite Git', '[{"id":"newer"}]'],
      ['midnite-git', '[{"id":"older"}]'],
    ] as const) {
      await mkdir(join(root, name), { recursive: true });
      await writeFile(join(root, name, 'repos.json'), body);
    }

    const used = await migrateAnyLegacyRepoStore((name) => join(root, name), current);

    expect(used).toBe('Midnite Git');
    expect(await readFile(join(current, 'repos.json'), 'utf8')).toBe('[{"id":"newer"}]');
  });

  it('falls through to the oldest name when the newer one has nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'midnite-studio-test-'));
    const current = join(root, 'Midnite Studio');
    await mkdir(join(root, 'midnite-git'), { recursive: true });
    await writeFile(join(root, 'midnite-git', 'repos.json'), '[{"id":"oldest"}]');

    expect(await migrateAnyLegacyRepoStore((name) => join(root, name), current)).toBe('midnite-git');
  });

  it('reports null on a clean install, where no legacy directory exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'midnite-studio-test-'));
    expect(
      await migrateAnyLegacyRepoStore((name) => join(root, name), join(root, 'Midnite Studio')),
    ).toBeNull();
  });
});

/**
 * Studio -> runtime migration (Phase 113 Theme G), against temp dirs and fake
 * ciphers only; no real userData or keychain is ever touched.
 */
describe('migrateStudioToRuntime', () => {
  let root: string;
  let studio: string;
  let runtime: string;
  const NOW = new Date('2026-10-15T10:00:00.000Z');

  /** A cipher with its own "keychain identity": cannot open the other's ciphertext. */
  const identityCipher = (id: string): VaultCipher => ({
    isEncryptionAvailable: () => true,
    encryptString: (p) => Buffer.from(`${id}:${p}`),
    decryptString: (b) => {
      const t = b.toString('utf8');
      if (!t.startsWith(`${id}:`)) throw new Error('wrong keychain identity');
      return t.slice(id.length + 1);
    },
  });
  const studioCipher = identityCipher('studio');
  const runtimeCipher = identityCipher('runtime');
  const blob = (c: VaultCipher, s: string): string => c.encryptString(s).toString('base64');

  const run = (overrides: Partial<Parameters<typeof migrateStudioToRuntime>[0]> = {}) =>
    migrateStudioToRuntime({
      enabled: true,
      sourceDirectory: studio,
      targetDirectory: runtime,
      sourceCipher: studioCipher,
      targetCipher: runtimeCipher,
      now: () => NOW,
      ...overrides,
    });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'midnite-runtime-migration-'));
    studio = join(root, 'Midnite Studio');
    runtime = join(root, 'Midnite Runtime');
    await mkdir(join(studio, 'Local Storage', 'leveldb'), { recursive: true });
    await writeFile(join(studio, 'Local Storage', 'leveldb', '000003.log'), 'settings-blob');
    await writeFile(join(studio, 'repos.json'), '{"version":1,"paths":["/tmp/one"]}\n');
    await writeFile(join(studio, 'windows.json'), '{"w":1}');
    await writeFile(join(studio, 'session-history.json'), '{"s":1}');
    await writeFile(
      join(studio, 'secrets.vault.json'),
      JSON.stringify({ version: 1, entries: { twelveData: { encrypted: blob(studioCipher, 'k1') } } }),
    );
    await writeFile(
      join(studio, 'db-connections.vault.json'),
      JSON.stringify({
        version: 1,
        entries: { c1: { fingerprint: 'fp', encrypted: blob(studioCipher, 'pw') } },
      }),
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('is a no-op while the flag is off, touching nothing', async () => {
    expect(await run({ enabled: false })).toEqual({ status: 'disabled' });
    await expect(readFile(join(runtime, STUDIO_MIGRATION_MARKER))).rejects.toThrow();
  });

  it('copies state, settings, sessions and windows, leaving the source intact', async () => {
    const result = await run();
    expect(result.status).toBe('migrated');
    expect(await readFile(join(runtime, 'windows.json'), 'utf8')).toBe('{"w":1}');
    expect(await readFile(join(runtime, 'session-history.json'), 'utf8')).toBe('{"s":1}');
    expect(await readFile(join(runtime, 'Local Storage', 'leveldb', '000003.log'), 'utf8')).toBe('settings-blob');
    expect(await readFile(join(studio, 'windows.json'), 'utf8')).toBe('{"w":1}');
  });

  it('re-encrypts vault entries under the runtime identity, keeping fingerprints', async () => {
    const result = await run();
    if (result.status !== 'migrated') throw new Error('expected migrated');
    expect(result.vaultEntries).toBe(2);
    const secrets = JSON.parse(await readFile(join(runtime, 'secrets.vault.json'), 'utf8'));
    const enc = secrets.entries.twelveData.encrypted as string;
    expect(runtimeCipher.decryptString(Buffer.from(enc, 'base64'))).toBe('k1');
    expect(() => studioCipher.decryptString(Buffer.from(enc, 'base64'))).toThrow();
    const db = JSON.parse(await readFile(join(runtime, 'db-connections.vault.json'), 'utf8'));
    expect(db.entries.c1.fingerprint).toBe('fp');
    expect(runtimeCipher.decryptString(Buffer.from(db.entries.c1.encrypted, 'base64'))).toBe('pw');
  });

  it('reports a vault entry it cannot open instead of dropping it, and keeps the source', async () => {
    await writeFile(
      join(studio, 'forge-accounts.vault.json'),
      JSON.stringify({ version: 1, entries: { 'github:github.com:me': { encrypted: blob(identityCipher('other'), 't') } } }),
    );
    const result = await run();
    if (result.status !== 'migrated') throw new Error('expected migrated');
    expect(result.unportedVaultEntries).toEqual([
      { file: 'forge-accounts.vault.json', key: 'github:github.com:me', reason: 'source-undecryptable' },
    ]);
    const marker = JSON.parse(await readFile(join(runtime, STUDIO_MIGRATION_MARKER), 'utf8'));
    expect(marker.unportedVaultEntries).toHaveLength(1);
    expect(await readFile(join(studio, 'forge-accounts.vault.json'), 'utf8')).toContain('encrypted');
    expect(await readFile(join(result.backupDirectory, 'forge-accounts.vault.json'), 'utf8')).toContain('encrypted');
  });

  it('writes a timestamped backup of the source before anything else', async () => {
    const result = await run();
    if (result.status !== 'migrated') throw new Error('expected migrated');
    expect(result.backupDirectory).toBe(join(runtime, 'backups', 'studio-2026-10-15T10-00-00-000Z'));
    expect(await readFile(join(result.backupDirectory, 'repos.json'), 'utf8')).toContain('/tmp/one');
    expect(await readFile(join(result.backupDirectory, 'secrets.vault.json'), 'utf8')).toContain(blob(studioCipher, 'k1'));
  });

  it('is idempotent: a second launch is a no-op once the marker exists', async () => {
    await run();
    await writeFile(join(runtime, 'windows.json'), '{"w":"runtime-edited"}');
    expect(await run()).toEqual({ status: 'already-migrated' });
    expect(await readFile(join(runtime, 'windows.json'), 'utf8')).toBe('{"w":"runtime-edited"}');
  });

  it('never overwrites a file the runtime already holds', async () => {
    await mkdir(runtime, { recursive: true });
    await writeFile(join(runtime, 'repos.json'), '{"newer":true}');
    const result = await run();
    if (result.status !== 'migrated') throw new Error('expected migrated');
    expect(result.skippedExisting).toContain('repos.json');
    expect(await readFile(join(runtime, 'repos.json'), 'utf8')).toBe('{"newer":true}');
  });

  it('writes no marker when it fails, so the next launch retries', async () => {
    await writeFile(join(root, 'blocker'), 'x');
    const failed = await run({ targetDirectory: join(root, 'blocker', 'rt') });
    expect(failed.status).toBe('failed');
    await expect(readFile(join(root, 'blocker', 'rt', STUDIO_MIGRATION_MARKER))).rejects.toThrow();
  });

  it('does nothing on a clean install with no Studio data', async () => {
    await rm(studio, { recursive: true, force: true });
    expect(await run()).toEqual({ status: 'nothing-to-migrate' });
  });

  it('leaves everything unported when the source keychain is unavailable', async () => {
    const dead = createFakeCipher();
    dead.setAvailable(false);
    const result = await run({ sourceCipher: dead });
    if (result.status !== 'migrated') throw new Error('expected migrated');
    expect(result.vaultEntries).toBe(0);
    expect(result.unportedVaultEntries).toHaveLength(2);
  });
});
