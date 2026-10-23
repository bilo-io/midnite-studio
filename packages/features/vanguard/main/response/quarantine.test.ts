// vitest/node: the quarantine store against a temp dir. The xattr round trip runs the real /usr/bin/xattr and
// is darwin-only; everything else is plain fs.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SecurityFinding } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSensorRunProcess } from '../run-process';
import type { SensorRunProcess } from '../sensor-host';
import { chmodNoFollow, createQuarantineStore, safeFileName, safeFindingDir } from './quarantine';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const noXattr: SensorRunProcess = async () => ({ ok: true, stdout: '', stderr: '', exitCode: 0 });
const finding = (id: string): SecurityFinding => ({ id, title: `Finding ${id}` }) as SecurityFinding;
const DAY = 86_400_000;

let root: string;
let dir: string;
let now: number;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'vanguard-quarantine-')));
  dir = join(root, 'quarantine');
  now = 1_800_000_000_000;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const store = (runProcess: SensorRunProcess = noXattr, retentionDays = 30) =>
  createQuarantineStore({ quarantineDir: dir, runProcess, now: () => now, retentionDays: () => retentionDays });

async function put(q: ReturnType<typeof store>, id: string, name: string, content: string, mode = 0o640) {
  const path = join(root, name);
  await writeFile(path, content);
  await chmod(path, mode);
  const s = await stat(path);
  return { path, result: await q.put({ finding: finding(id), path, sha256: sha(content), size: s.size, mode: s.mode, uid: s.uid, allowRules: [] }) };
}

describe('safeFindingDir', () => {
  it('accepts ledger ids and refuses separators and dot-dirs', () => {
    expect(safeFindingDir('3f2b1c7e-0d1a-4c8e-9f00-1234567890ab')).toBe(true);
    expect(safeFindingDir('../x')).toBe(false);
    expect(safeFindingDir('a/b')).toBe(false);
    expect(safeFindingDir('.hidden')).toBe(false);
  });
});

describe('safeFileName', () => {
  it('keeps a dotfile and refuses dot-dirs and separators', () => {
    expect(safeFileName('.claude.json')).toBe(true);
    expect(safeFileName('.mcp.json')).toBe(true);
    for (const bad of ['', '.', '..', 'a/b', '../x', 'a\u0000b']) expect(safeFileName(bad)).toBe(false);
  });
});

describe('chmodNoFollow', () => {
  it('changes a 0000 file and never the target of a link', async () => {
    const file = join(root, 'f');
    await writeFile(file, 'x');
    await chmod(file, 0);
    await chmodNoFollow(file, 0o400);
    expect((await stat(file)).mode & 0o777).toBe(0o400);
    const target = join(root, 'secret');
    await writeFile(target, 'k');
    await chmod(target, 0o600);
    const linkPath = join(root, 'l');
    await symlink(target, linkPath);
    await chmodNoFollow(linkPath, 0).catch(() => undefined);
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });
});

describe('quarantine store', () => {
  it('round-trips a file byte-for-byte with its mode', async () => {
    const q = store();
    const { path, result } = await put(q, 'f1', 'tool', 'bytes\u0000ÿ', 0o751);
    expect(result.ok).toBe(true);
    const entry = join(dir, 'f1');
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(entry)).mode & 0o777).toBe(0o700);
    expect((await stat(join(entry, 'manifest.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(join(entry, 'data', 'tool'))).mode & 0o777).toBe(0);
    expect(await q.list()).toEqual([expect.objectContaining({ findingId: 'f1', originalPath: path, expiresAt: now + 30 * DAY })]);

    const restored = await q.restore('f1', async () => ({ ok: true }));
    expect(restored.ok).toBe(true);
    expect(await readFile(path, 'utf8')).toBe('bytes\u0000ÿ');
    expect((await stat(path)).mode & 0o7777).toBe(0o751);
    expect(await q.list()).toEqual([]);
  });

  it.runIf(process.platform === 'darwin')('keeps extended attributes across the round trip (real xattr)', async () => {
    const run = createSensorRunProcess({ defaultCwd: root });
    const q = store(run);
    const path = join(root, 'with-attrs');
    await writeFile(path, 'x');
    execFileSync('/usr/bin/xattr', ['-w', 'com.midnite.test', 'hello', path]);
    const s = await stat(path);
    const put = await q.put({ finding: finding('fx'), path, sha256: sha('x'), size: s.size, mode: s.mode, uid: s.uid, allowRules: [] });
    expect(put.ok && put.manifest.xattrs).toEqual([{ name: 'com.midnite.test', hex: Buffer.from('hello').toString('hex').toUpperCase() }]);
    expect((await q.restore('fx', async () => ({ ok: true }))).ok).toBe(true);
    expect(execFileSync('/usr/bin/xattr', ['-p', 'com.midnite.test', path]).toString().trim()).toBe('hello');
  });

  it('round-trips a dotfile (an agent config such as ~/.claude.json)', async () => {
    const q = store();
    const { path, result } = await put(q, 'f1', '.claude.json', '{}', 0o644);
    expect(result.ok).toBe(true);
    expect(await q.list()).toEqual([expect.objectContaining({ fileName: '.claude.json' })]);
    expect((await q.restore('f1', async () => ({ ok: true }))).ok).toBe(true);
    expect(await readFile(path, 'utf8')).toBe('{}');
  });

  it('refuses a copy replaced while the re-scan ran, and never chmods through a link', async () => {
    const q = store();
    const { path } = await put(q, 'f1', 'tool', 'x');
    const secret = join(root, 'secret');
    await writeFile(secret, 'key');
    await chmod(secret, 0o600);
    const data = join(dir, 'f1', 'data', 'tool');
    const result = await q.restore('f1', async () => {
      // Swap the copy for a link to a file outside while the scan "runs".
      await rm(data);
      await symlink(secret, data);
      return { ok: true };
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('replaced during the re-scan') });
    await expect(stat(path)).rejects.toThrow();
    expect((await stat(secret)).mode & 0o777).toBe(0o600);
  });

  it('keeps the copy at 0000 when inspect refuses', async () => {
    const q = store();
    const { path } = await put(q, 'f1', 'tool', 'x');
    const result = await q.restore('f1', async () => ({ ok: false, error: 'matched a rule' }));
    expect(result).toEqual({ ok: false, error: 'matched a rule' });
    await expect(stat(path)).rejects.toThrow();
    expect((await stat(join(dir, 'f1', 'data', 'tool'))).mode & 0o777).toBe(0);
  });

  it('never restores over something at the original path, and refuses when the parent moved', async () => {
    const q = store();
    const { path } = await put(q, 'f1', 'tool', 'x');
    await writeFile(path, 'other');
    expect(await q.restore('f1', async () => ({ ok: true }))).toMatchObject({ ok: false, error: expect.stringContaining('already at') });
    expect(await readFile(path, 'utf8')).toBe('other');

    await mkdir(join(root, 'p'));
    const inner = join(root, 'p', 'tool');
    await writeFile(inner, 'y');
    const s = await stat(inner);
    await q.put({ finding: finding('f2'), path: inner, sha256: sha('y'), size: s.size, mode: s.mode, uid: s.uid, allowRules: [] });
    await rename(join(root, 'p'), join(root, 'p-moved'));
    await mkdir(join(root, 'elsewhere'));
    await symlink(join(root, 'elsewhere'), join(root, 'p'));
    expect(await q.restore('f2', async () => ({ ok: true }))).toMatchObject({ ok: false, error: expect.stringContaining('resolves somewhere else') });
    await expect(stat(join(root, 'elsewhere', 'tool'))).rejects.toThrow();
  });

  it('refuses an entry whose data is a symlink out of the quarantine', async () => {
    const q = store();
    await put(q, 'f1', 'tool', 'x');
    const data = join(dir, 'f1', 'data', 'tool');
    await rm(data, { force: true });
    await writeFile(join(root, 'outside'), 'x');
    await symlink(join(root, 'outside'), data);
    expect(await q.manifest('f1')).toMatchObject({ ok: false, error: expect.stringContaining('not a regular file') });
    expect(await q.restore('f1', async () => ({ ok: true }))).toMatchObject({ ok: false });
    expect(await q.list()).toEqual([]);
  });

  it('refuses an entry directory that is a symlink', async () => {
    const q = store();
    await put(q, 'f1', 'tool', 'x');
    await rename(join(dir, 'f1'), join(root, 'moved-entry'));
    await symlink(join(root, 'moved-entry'), join(dir, 'f1'));
    expect(await q.manifest('f1')).toMatchObject({ ok: false });
  });

  it('refuses a manifest naming an unsafe file', async () => {
    const q = store();
    await put(q, 'f1', 'tool', 'x');
    const file = join(dir, 'f1', 'manifest.json');
    const m = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify({ ...m, fileName: '../../outside' }));
    expect(await q.manifest('f1')).toMatchObject({ ok: false, error: expect.stringContaining('unsafe') });
  });

  it('refuses a restore when the quarantined copy no longer matches its hash', async () => {
    const q = store();
    const { path } = await put(q, 'f1', 'tool', 'x');
    const data = join(dir, 'f1', 'data', 'tool');
    await chmod(data, 0o600);
    await writeFile(data, 'tampered');
    expect(await q.restore('f1', async () => ({ ok: true }))).toMatchObject({ ok: false, error: expect.stringContaining('no longer matches') });
    await expect(stat(path)).rejects.toThrow();
  });

  it('peek hands over a readable copy and puts it back to 0000', async () => {
    const q = store();
    await put(q, 'f1', 'tool', 'x');
    const seen = await q.peek('f1', async (dataPath) => readFile(dataPath, 'utf8'));
    expect(seen).toEqual({ ok: true, value: 'x' });
    expect((await stat(join(dir, 'f1', 'data', 'tool'))).mode & 0o777).toBe(0);
  });

  it('refuses a second file for the same finding', async () => {
    const q = store();
    await put(q, 'f1', 'a', 'x');
    const { result } = await put(q, 'f1', 'b', 'y');
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('already has a file') });
    expect(await readFile(join(root, 'b'), 'utf8')).toBe('y');
  });

  it('purges entries past their retention and keeps the rest', async () => {
    const q = store(noXattr, 7);
    await put(q, 'old', 'a', 'x');
    now += 8 * DAY;
    await put(q, 'new', 'b', 'y');
    expect(await q.purge()).toBe(1);
    expect((await q.list()).map((e) => e.findingId)).toEqual(['new']);
  });
});
