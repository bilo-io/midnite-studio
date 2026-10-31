import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sha256File, UNPACK_FAILED_MESSAGE, unpack } from './integrity';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'launcher-integrity-test-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe('sha256File', () => {
  it('hashes the bytes on disk', async () => {
    const file = join(root, 'a.bin');
    await writeFile(file, 'hello');
    expect(await sha256File(file)).toBe(createHash('sha256').update('hello').digest('hex'));
  });

  it('rejects for a file that is not there', async () => {
    await expect(sha256File(join(root, 'missing'))).rejects.toThrow(/ENOENT/);
  });
});

describe('unpack', () => {
  it('maps an extraction failure to the friendly message and logs the raw error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const raw = new Error('Command failed: ditto -xk /tmp/x.zip /tmp/extracted');
    await expect(unpack(async () => Promise.reject(raw))).rejects.toThrow(UNPACK_FAILED_MESSAGE);
    expect(log).toHaveBeenCalledWith(expect.any(String), raw);
  });
});
