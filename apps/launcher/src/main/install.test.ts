import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MIN_FRAMEWORK_BYTES } from './constants';
import { CORRUPT_DOWNLOAD_MESSAGE, UNPACK_FAILED_MESSAGE } from './integrity';
import { installStudio, verifyBundle } from './install';

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

beforeEach(async () => {
  disk.corrupt = false;
  root = await mkdtemp(join(tmpdir(), 'launcher-install-test-'));
});

afterEach(async () => {
  await chmod(root, 0o755).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
});

async function fakeBundle(dir: string, frameworkBytes: number): Promise<string> {
  const bundle = join(dir, 'Midnite Studio.app');
  await mkdir(join(bundle, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(join(bundle, 'Contents', 'Info.plist'), '<plist/>');
  await writeFile(join(bundle, 'Contents', 'MacOS', 'Midnite Studio'), '#!/bin/sh\n', { mode: 0o755 });
  const fwDir = join(bundle, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A');
  await mkdir(fwDir, { recursive: true });
  const fw = join(fwDir, 'Electron Framework');
  await writeFile(fw, '');
  await truncate(fw, frameworkBytes); // sparse — no real 100 MB written
  return bundle;
}

describe('verifyBundle', () => {
  it('accepts a complete bundle and names what a truncated one is missing', async () => {
    expect(await verifyBundle(await fakeBundle(root, MIN_FRAMEWORK_BYTES + 1))).toBeNull();
    const small = await fakeBundle(join(root, 'small'), 1024);
    expect(await verifyBundle(small)).toMatch(/incomplete copy/);
    expect(await verifyBundle(join(root, 'nothing.app'))).toMatch(/Info\.plist/);
  });
});

describe('installStudio', () => {
  it('refuses while Studio is running, before touching the network', async () => {
    const fetchImpl = vi.fn();
    const onProgress = vi.fn();
    const result = await installStudio({
      onProgress,
      isRunning: async () => true,
      installDir: root,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/quit it first/) });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'error' }));
  });

  it('refuses an install directory this account cannot write, pointing at Terminal', async () => {
    await chmod(root, 0o555);
    const result = await installStudio({ onProgress: () => undefined, isRunning: async () => false, installDir: root });
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/isn't writable.*Terminal/) });
  });

  it('stops at the feed when there is no release, leaving the directory untouched', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const result = await installStudio({ onProgress: () => undefined, isRunning: async () => false, installDir: root, fetchImpl });
    expect(result).toEqual({ ok: false, message: 'No published release yet.' });
  });

  // Phase 91 Theme H: the zip is checked before `ditto` ever reads it.
  const routed = (feed: object, zip: { body: string; headers?: Record<string, string> }): typeof fetch =>
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('catalog.json')) return new Response('', { status: 404 });
      if (url.endsWith('version.json')) return new Response(JSON.stringify(feed), { status: 200 });
      return new Response(zip.body, { status: 200, headers: zip.headers });
    }) as unknown as typeof fetch;

  it('refuses a download whose digest does not match the feed, before extracting it', async () => {
    const sha256 = createHash('sha256').update('the real zip').digest('hex');
    const result = await installStudio({
      onProgress: () => undefined,
      isRunning: async () => false,
      installDir: root,
      fetchImpl: routed({ version: '1.2.3', sha256 }, { body: 'a corrupt zip' }),
    });
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/corrupt/) });
  });

  it('refuses a short read when the server declared a length', async () => {
    const result = await installStudio({
      onProgress: () => undefined,
      isRunning: async () => false,
      installDir: root,
      fetchImpl: routed({ version: '1.2.3' }, { body: 'abc', headers: { 'content-length': '999' } }),
    });
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/cut short/) });
  });

  it('rejects a file that differs on disk from a stream that matched, and deletes it', async () => {
    const body = 'the real zip';
    const sha256 = createHash('sha256').update(body).digest('hex');
    const extract = vi.fn(async () => undefined);
    disk.corrupt = true;
    const result = await installStudio({
      onProgress: () => undefined,
      isRunning: async () => false,
      installDir: root,
      fetchImpl: routed({ version: '1.2.3', sha256 }, { body }),
      extract,
    });
    expect(result).toEqual({ ok: false, message: CORRUPT_DOWNLOAD_MESSAGE });
    expect(extract).not.toHaveBeenCalled();
  });

  it('accepts a file whose on-disk digest matches', async () => {
    const body = 'the real zip';
    const sha256 = createHash('sha256').update(body).digest('hex');
    const extract = vi.fn(async () => Promise.reject(new Error('stop here')));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await installStudio({
      onProgress: () => undefined,
      isRunning: async () => false,
      installDir: root,
      fetchImpl: routed({ version: '1.2.3', sha256 }, { body }),
      extract,
    });
    // Got past the checksum and into extraction.
    expect(extract).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: false, message: UNPACK_FAILED_MESSAGE });
  });

  it('shows a friendly message, not the ditto command line, when extraction fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await installStudio({
      onProgress: () => undefined,
      isRunning: async () => false,
      installDir: root,
      fetchImpl: routed({ version: '1.2.3' }, { body: 'not a zip' }),
      extract: async () => {
        throw new Error('Command failed: ditto -xk /tmp/a.zip /tmp/extracted\nditto: Couldn\'t read pkzip signature');
      },
    });
    expect(result).toEqual({ ok: false, message: UNPACK_FAILED_MESSAGE });
    expect(log).toHaveBeenCalled();
  });
});
