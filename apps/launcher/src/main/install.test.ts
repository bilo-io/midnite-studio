import { chmod, mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MIN_FRAMEWORK_BYTES } from './constants';
import { installStudio, verifyBundle } from './install';

let root: string;

beforeEach(async () => {
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
});
