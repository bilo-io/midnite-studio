import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Writable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CORRUPT_DOWNLOAD_MESSAGE, UNPACK_FAILED_MESSAGE } from '../integrity';

import { installAppBundle, uninstallAppBundle, verifyAppBundle, type BundleOpsDeps } from './install-bundle';
import { stubIdentity, type BundleRoots } from './layout';
import { readPlistString } from './plist-stamp';
import { readInstalledState, STATE_FILE } from './state';
import { catalogEntry, fakeIo, fakePayload, fakeRuntime, serve, type FakeIo } from './testing';

// Lets a test make the bytes that land on disk differ from the bytes that were streamed to the
// write stream, which is exactly the failure the on-disk hash exists to catch.
const disk = vi.hoisted(() => ({ corrupt: false }));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    createWriteStream: ((path: string, ...rest: unknown[]) => {
      const inner = (real.createWriteStream as (...a: unknown[]) => import('node:fs').WriteStream)(path, ...rest);
      if (!disk.corrupt) return inner;
      return new Writable({
        write(chunk: Buffer, _enc, done) {
          const bad = Buffer.from(chunk);
          bad[0] = bad[0]! ^ 0xff;
          inner.write(bad, done);
        },
        final(done) {
          inner.end(done);
        },
      });
    }) as typeof real.createWriteStream,
  };
});

let root: string;
let roots: BundleRoots;
let payloads: string;

beforeEach(async () => {
  disk.corrupt = false;
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
    expect(result).toEqual({ ok: false, message: CORRUPT_DOWNLOAD_MESSAGE });
    expect(await readdir(roots.stubRoot)).toEqual(['Unrelated.app']);
    expect(await readdir(roots.installRoot)).toEqual([]);
  });

  it('refuses a file that differs on disk from a stream that matched the catalog, before extracting', async () => {
    const extract = vi.fn(async () => undefined);
    disk.corrupt = true;
    expect(await install('0.2.0', await deps({ extract }))).toEqual({ ok: false, message: CORRUPT_DOWNLOAD_MESSAGE });
    expect(extract).not.toHaveBeenCalled();
    expect(await readdir(roots.installRoot)).toEqual([]);
  });

  it('shows a friendly message, not the ditto command line, when extraction fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const extract = async () => {
      throw new Error('Command failed: ditto -xk /tmp/a.zip /tmp/extracted');
    };
    expect(await install('0.2.0', await deps({ extract }))).toEqual({ ok: false, message: UNPACK_FAILED_MESSAGE });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
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

  it('hands each path to the injected remover (the launcher passes the Trash) instead of deleting', async () => {
    expect(await install('0.2.0')).toEqual({ ok: true });
    const removed: string[] = [];
    const result = await uninstallAppBundle(cleaner, { ...(await deps()), remove: async (path) => void removed.push(path) });
    expect(result).toEqual({ ok: true });
    expect(removed.map((p) => p.replace(root, ''))).toEqual(['/Applications/Midnite Cleaner.app', '/support/bundles/cleaner']);
    expect((await readInstalledState(roots.installRoot)).apps).toEqual([]);
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

  it('requires a declared main to exist, and to stay inside the bundle', async () => {
    const dir = join(payloads, '0.3.0');
    const declare = (main: unknown) => writeFile(join(dir, 'package.json'), JSON.stringify({ version: '0.3.0', main }));
    await declare('main.cjs');
    expect(await verifyAppBundle(dir, '0.3.0')).toBe('missing main.cjs (named as main)');
    await writeFile(join(dir, 'main.cjs'), '');
    expect(await verifyAppBundle(dir, '0.3.0')).toBeNull();
    await declare('../escape.cjs');
    expect(await verifyAppBundle(dir, '0.3.0')).toBe('package.json has an invalid main');
    await declare('/abs.cjs');
    expect(await verifyAppBundle(dir, '0.3.0')).toBe('package.json has an invalid main');
  });
});

describe('readInstalledState', () => {
  it('reads a malformed record as nothing installed', async () => {
    await mkdir(roots.installRoot, { recursive: true });
    await writeFile(join(roots.installRoot, STATE_FILE), '{"schemaVersion":2}');
    expect(await readInstalledState(roots.installRoot)).toEqual({ schemaVersion: 1, apps: [] });
  });
});
