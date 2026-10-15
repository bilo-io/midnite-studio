import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installAppBundle, uninstallAppBundle, verifyAppBundle, type BundleOpsDeps } from './install-bundle';
import { stubIdentity, type BundleRoots } from './layout';
import { readPlistString } from './plist-stamp';
import { readInstalledState, STATE_FILE } from './state';
import { catalogEntry, fakeIo, fakePayload, fakeRuntime, serve, type FakeIo } from './testing';

let root: string;
let roots: BundleRoots;
let payloads: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'launcher-bundle-test-'));
  roots = { installRoot: join(root, 'support', 'bundles'), stubRoot: join(root, 'Applications') };
  payloads = join(root, 'payloads');
  await mkdir(roots.stubRoot, { recursive: true });
  // Something the user owns in the stub root, which no operation may touch.
  await mkdir(join(roots.stubRoot, 'Unrelated.app'));
  await fakePayload(join(payloads, '0.2.0'), '0.2.0');
  await fakePayload(join(payloads, '0.3.0'), '0.3.0');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const cleaner = stubIdentity('cleaner', 'Cleaner');
const monitor = stubIdentity('monitor', 'Monitor');
const zip = (version: string) => Buffer.from(`zip-of-${version}`);

/** The runtime defaults to 0.2.0: lockstep means a bundle installs only onto a runtime of its own version. */
async function deps(over: Partial<BundleOpsDeps> & { io?: FakeIo } = {}, runtimeVersion = '0.2.0'): Promise<BundleOpsDeps & { io: FakeIo }> {
  return {
    roots,
    runtime: await fakeRuntime(join(root, 'runtime'), runtimeVersion),
    isRunning: async () => false,
    io: fakeIo(),
    // The "zip" is fixed bytes (so the checksum is real); extracting it lays down that version's payload.
    extract: async (zipPath, dest) => {
      const version = (await readFile(zipPath, 'utf8')).replace('zip-of-', '');
      await cp(join(payloads, version), dest, { recursive: true });
    },
    now: () => new Date('2026-10-14T12:00:00.000Z'),
    ...over,
  } as BundleOpsDeps & { io: FakeIo };
}

async function install(version: string, d?: BundleOpsDeps, identity = cleaner) {
  const entry = catalogEntry(identity.id, version, zip(version));
  const dd = d ?? (await deps({}, version));
  return installAppBundle(entry, identity, { ...dd, fetchImpl: dd.fetchImpl ?? serve(zip(version)) });
}

const stubPath = (identity = cleaner) => join(roots.stubRoot, `${identity.displayName}.app`);

describe('installAppBundle', () => {
  it('installs the bundle, writes its Dock stub and records it', async () => {
    const d = await deps();
    expect(await install('0.2.0', d)).toEqual({ ok: true });

    expect(JSON.parse(await readFile(join(roots.installRoot, 'cleaner', 'package.json'), 'utf8')).version).toBe('0.2.0');
    const info = await readFile(join(stubPath(), 'Contents', 'Info.plist'), 'utf8');
    expect(readPlistString(info, 'CFBundleIdentifier')).toBe('io.bilo.midnite-cleaner');
    expect(await readFile(join(stubPath(), 'Contents', 'Resources', 'app', 'main.js'), 'utf8')).toContain('cleaner 0.2.0');

    expect((await readInstalledState(roots.installRoot)).apps).toEqual([
      {
        id: 'cleaner',
        version: '0.2.0',
        sha256: catalogEntry('cleaner', '0.2.0', zip('0.2.0')).sha256,
        bundlePath: join(roots.installRoot, 'cleaner'),
        stubPath: stubPath(),
        runtimeVersion: '0.2.0',
        installedAt: '2026-10-14T12:00:00.000Z',
      },
    ]);
    // The stub was signed while staged, then swapped in; no staging or backup is left behind.
    const signed = d.io.calls.find((c) => c[0] === 'codesign' && c.includes('--sign'));
    expect(signed?.at(-1)).toMatch(/\/\.Midnite Cleaner\.new\.\d+\.app$/);
    expect((await readdir(roots.stubRoot)).sort()).toEqual(['Midnite Cleaner.app', 'Unrelated.app']);
    expect((await readdir(roots.installRoot)).sort()).toEqual(['cleaner', STATE_FILE]);
  });

  it('refuses a download whose checksum does not match the catalog, touching neither root', async () => {
    const entry = catalogEntry('cleaner', '0.2.0', zip('0.2.0'));
    const result = await installAppBundle(entry, cleaner, { ...(await deps()), fetchImpl: serve(Buffer.from('tampered')) });
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/checksum/) });
    expect(await readdir(roots.stubRoot)).toEqual(['Unrelated.app']);
    expect(await readdir(roots.installRoot)).toEqual([]);
  });

  it('refuses a bundle whose own version is not the catalog’s', async () => {
    const d = await deps({ extract: async (_zip, dest) => cp(join(payloads, '0.3.0'), dest, { recursive: true }) });
    expect(await install('0.2.0', d)).toEqual({ ok: false, message: expect.stringMatching(/version 0\.3\.0, the catalog says 0\.2\.0/) });
    expect(await readdir(roots.stubRoot)).toEqual(['Unrelated.app']);
  });

  it('refuses while the app is running, before downloading', async () => {
    let fetched = false;
    const d = await deps({ isRunning: async () => true, fetchImpl: (async () => { fetched = true; return new Response(''); }) as unknown as typeof fetch });
    expect(await install('0.2.0', d)).toEqual({ ok: false, message: 'Midnite Cleaner is running — quit it first.' });
    expect(fetched).toBe(false);
  });

  it('updates in place: a newer version replaces bundle, stub and record', async () => {
    expect(await install('0.2.0')).toEqual({ ok: true });
    expect(await install('0.3.0')).toEqual({ ok: true });
    expect(await readFile(join(stubPath(), 'Contents', 'Resources', 'app', 'main.js'), 'utf8')).toContain('cleaner 0.3.0');
    expect(readPlistString(await readFile(join(stubPath(), 'Contents', 'Info.plist'), 'utf8'), 'CFBundleShortVersionString')).toBe('0.3.0');
    expect((await readInstalledState(roots.installRoot)).apps.map((a) => a.version)).toEqual(['0.3.0']);
  });

  it('keeps the previous install when the new stub fails to sign', async () => {
    expect(await install('0.2.0')).toEqual({ ok: true });
    const d = await deps({ io: fakeIo((cmd) => cmd === 'codesign') }, '0.3.0');
    expect(await install('0.3.0', d)).toEqual({ ok: false, message: expect.stringMatching(/codesign failed/) });
    expect(JSON.parse(await readFile(join(roots.installRoot, 'cleaner', 'package.json'), 'utf8')).version).toBe('0.2.0');
    expect(await readFile(join(stubPath(), 'Contents', 'Resources', 'app', 'main.js'), 'utf8')).toContain('cleaner 0.2.0');
    expect((await readInstalledState(roots.installRoot)).apps.map((a) => a.version)).toEqual(['0.2.0']);
    expect((await readdir(roots.stubRoot)).sort()).toEqual(['Midnite Cleaner.app', 'Unrelated.app']);
  });

  it('turns a failed APFS clone into an explanation', async () => {
    const base = fakeIo();
    const io: FakeIo = {
      calls: base.calls,
      exec: async (cmd, args) => {
        if (cmd === 'cp') throw new Error('cp: clonefile failed: Cross-device link');
        return base.exec(cmd, args);
      },
    };
    const d = await deps({ io });
    expect(await install('0.2.0', d)).toEqual({ ok: false, message: expect.stringMatching(/same APFS volume/) });
    expect(await readdir(roots.stubRoot)).toEqual(['Unrelated.app']);
  });

  it('refuses a bundle whose version is not the runtime’s, before downloading anything', async () => {
    let fetched = false;
    const fetchImpl = (async () => { fetched = true; return new Response(''); }) as unknown as typeof fetch;
    // Runtime 0.2.0, bundle 0.3.0: the launcher must update first.
    const ahead = await install('0.3.0', await deps({ fetchImpl }, '0.2.0'));
    expect(ahead).toEqual({ ok: false, reason: 'bundle-ahead', message: expect.stringMatching(/update Midnite Apps first/) });
    // Runtime 0.3.0, bundle 0.2.0: a stale bundle is never installed fresh onto a newer runtime.
    const behind = await install('0.2.0', await deps({ fetchImpl }, '0.3.0'));
    expect(behind).toEqual({ ok: false, reason: 'bundle-behind', message: expect.stringMatching(/needs updating/) });
    expect(fetched).toBe(false);
    expect(await readdir(roots.stubRoot)).toEqual(['Unrelated.app']);
    expect(await readdir(roots.installRoot).catch(() => [])).toEqual([]);
  });

  it('never installs Studio as a bundle', async () => {
    const entry = catalogEntry('studio', '0.2.0', zip('0.2.0'));
    expect(await installAppBundle(entry, stubIdentity('studio', 'Studio'), await deps())).toEqual({
      ok: false,
      message: 'Studio installs as a full app, not a bundle.',
    });
  });
});

describe('uninstallAppBundle', () => {
  it("removes exactly one app's bundle, stub and record", async () => {
    expect(await install('0.2.0')).toEqual({ ok: true });
    expect(await install('0.2.0', undefined, monitor)).toEqual({ ok: true });
    await writeFile(join(roots.installRoot, 'notes.txt'), 'not ours to delete');

    expect(await uninstallAppBundle(cleaner, await deps())).toEqual({ ok: true });

    expect((await readdir(roots.stubRoot)).sort()).toEqual(['Midnite Monitor.app', 'Unrelated.app']);
    expect((await readdir(roots.installRoot)).sort()).toEqual([STATE_FILE, 'monitor', 'notes.txt']);
    expect((await readInstalledState(roots.installRoot)).apps.map((a) => a.id)).toEqual(['monitor']);
  });

  it('refuses an app that is not installed, or is running', async () => {
    expect(await uninstallAppBundle(cleaner, await deps())).toEqual({ ok: false, message: 'Midnite Cleaner is not installed.' });
    expect(await install('0.2.0')).toEqual({ ok: true });
    expect(await uninstallAppBundle(cleaner, await deps({ isRunning: async () => true }))).toEqual({
      ok: false,
      message: 'Midnite Cleaner is running — quit it first.',
    });
    expect(await readdir(roots.stubRoot)).toContain('Midnite Cleaner.app');
  });
});

describe('verifyAppBundle', () => {
  it('names what is missing', async () => {
    expect(await verifyAppBundle(join(payloads, '0.2.0'), '0.2.0')).toBeNull();
    expect(await verifyAppBundle(join(root, 'nothing'))).toMatch(/package\.json/);
    await rm(join(payloads, '0.2.0', 'icon.icns'));
    expect(await verifyAppBundle(join(payloads, '0.2.0'))).toBe('missing icon.icns');
  });
});

describe('readInstalledState', () => {
  it('reads a malformed record as nothing installed', async () => {
    await mkdir(roots.installRoot, { recursive: true });
    await writeFile(join(roots.installRoot, STATE_FILE), '{"schemaVersion":2}');
    expect(await readInstalledState(roots.installRoot)).toEqual({ schemaVersion: 1, apps: [] });
  });
});
