// @vitest-environment node
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { attachContractFile, confinedAttachmentPath, MAX_CONTRACT_BYTES } from './contract-files';

const SHA = 'a'.repeat(64);

async function setup(name: string, body: string | Buffer) {
  const dir = await mkdtemp(join(tmpdir(), 'startup-files-'));
  const source = join(dir, name);
  await writeFile(source, body);
  return { dir: join(dir, 'contracts'), source };
}

describe('attachContractFile', () => {
  it('copies an allowed file under its content hash and reports its name', async () => {
    const { dir, source } = await setup('Lease.PDF', 'hello');
    const out = await attachContractFile({ pickContractFile: async () => source, openPath: async () => '' }, dir);
    expect(out).toMatchObject({ ok: true, file: { name: 'Lease.PDF', ext: 'pdf' } });
    if (out.ok !== true) throw new Error('expected an attachment');
    expect(out.file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(join(dir, `${out.file.sha256}.pdf`), 'utf8')).toBe('hello');
  });

  it('treats a cancelled picker as nothing happening', async () => {
    const { dir } = await setup('x.pdf', '');
    expect(await attachContractFile({ pickContractFile: async () => null, openPath: async () => '' }, dir)).toEqual({ ok: 'cancelled' });
  });

  it('refuses another file type and an oversized file', async () => {
    const exe = await setup('run.exe', 'x');
    expect(await attachContractFile({ pickContractFile: async () => exe.source, openPath: async () => '' }, exe.dir)).toMatchObject({ ok: false });
    const big = await setup('big.pdf', Buffer.alloc(MAX_CONTRACT_BYTES + 1));
    expect(await attachContractFile({ pickContractFile: async () => big.source, openPath: async () => '' }, big.dir)).toMatchObject({ ok: false, message: expect.stringContaining('25 MB') });
  });
});

describe('confinedAttachmentPath', () => {
  it('stays inside the contracts folder', () => {
    expect(confinedAttachmentPath('/data/contracts', { name: 'a', sha256: SHA, ext: 'pdf' })).toBe(`/data/contracts/${SHA}.pdf`);
  });
});
