import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { chmod, copyFile, link, lstat, mkdir, readdir, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';

import {
  QuarantineManifestSchema,
  type QuarantineEntry,
  type QuarantineManifest,
  type SecurityFinding,
} from '@midnite/studio-shared';

import type { SensorRunProcess } from '../sensor-host';
import { sha256NoFollow } from './target';

/**
 * The quarantine (Phase 120 Theme H): `<quarantineDir>/<findingId>/manifest.json` plus the file itself under
 * `data/<original name>` at mode 0000. The directory is the one Theme B's "Open quarantine folder" reveals
 * (`VanguardService.quarantineDir`), so there is one quarantine, not two.
 *
 * Nothing here follows a link: every entry is `lstat`ed, the data file must resolve inside the quarantine,
 * and a restore lands only where the original parent still resolves to the directory it was taken from.
 */

export const XATTR = '/usr/bin/xattr';
const CHMOD = '/bin/chmod';
const execFileAsync = promisify(execFile);
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A finding id is a directory name here, so it must be one: no separators, no dot-dirs. */
export function safeFindingDir(findingId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(findingId) && !findingId.includes('..');
}

/**
 * The file name a quarantine entry keeps: the original's basename. A dotfile (`.mcp.json`, `~/.claude.json`) is
 * fine; a separator, NUL, `.` or `..` is not, since it is joined under `data/`.
 */
export function safeFileName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && basename(name) === name && !name.includes('/') && !name.includes('\0');
}

/**
 * `chmod` that never follows a link. On macOS (the only supported platform) it is `/bin/chmod -h`, which is the
 * `lchmod` syscall: no open, so it works on a 0000 file, and a link swapped in changes only the link. Node's own
 * `lchmod` opens the file first and so fails on exactly the 0000 copies this store keeps. Elsewhere a link is
 * refused after an `lstat`.
 */
export async function chmodNoFollow(path: string, mode: number): Promise<void> {
  if (process.platform === 'darwin') {
    await execFileAsync(CHMOD, ['-h', '--', (mode & 0o7777).toString(8), path], { timeout: 5_000 });
    return;
  }
  if ((await lstat(path)).isSymbolicLink()) throw new Error(`${path} is a symbolic link`);
  await chmod(path, mode);
}

export interface QuarantineDeps {
  quarantineDir: string;
  runProcess: SensorRunProcess;
  now: () => number;
  /** Days a quarantined file is kept (Settings ▸ Vanguard). */
  retentionDays: () => number;
}

export interface QuarantineStore {
  dir: string;
  /** Read one manifest, refusing a linked or malformed entry. */
  manifest(findingId: string): Promise<{ ok: true; manifest: QuarantineManifest; dataPath: string } | { ok: false; error: string }>;
  list(): Promise<QuarantineEntry[]>;
  /** Move `path` in. The caller has already checked reach and identity. */
  put(input: {
    finding: SecurityFinding;
    path: string;
    sha256: string;
    size: number;
    mode: number;
    uid: number;
    allowRules: readonly string[];
  }): Promise<{ ok: true; manifest: QuarantineManifest } | { ok: false; error: string }>;
  /**
   * Make the quarantined copy readable for a re-scan, check it is byte-identical to what went in, and hand it
   * to `inspect`; the copy goes back to 0000 unless `inspect` says to restore and the restore succeeds.
   */
  restore(
    findingId: string,
    inspect: (dataPath: string, manifest: QuarantineManifest) => Promise<{ ok: true } | { ok: false; error: string }>,
  ): Promise<{ ok: true; manifest: QuarantineManifest } | { ok: false; error: string }>;
  /** Make the copy readable, check it is byte-identical, hand it to `fn`, then back to 0000. Never restores. */
  peek<T>(
    findingId: string,
    fn: (dataPath: string, manifest: QuarantineManifest) => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: string }>;
  /** Drop entries older than the retention. Returns how many went. */
  purge(): Promise<number>;
}

async function isPlainDir(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Every extended attribute, as `xattr -px` prints it. Best-effort: a file with none, or no `xattr`, is []. */
export async function readXattrs(runProcess: SensorRunProcess, path: string): Promise<QuarantineManifest['xattrs']> {
  // `-s`: a link is read as itself, never followed.
  const names = await runProcess(XATTR, ['-s', path], { timeoutMs: 5_000 });
  if (!names.ok || names.exitCode !== 0) return [];
  const out: QuarantineManifest['xattrs'] = [];
  for (const name of names.stdout.split('\n').map((n) => n.trim()).filter(Boolean)) {
    const value = await runProcess(XATTR, ['-p', '-s', '-x', name, path], { timeoutMs: 5_000 });
    if (value.ok && value.exitCode === 0) out.push({ name, hex: value.stdout.replace(/\s+/g, '') });
  }
  return out;
}

/** Re-apply any attribute the file lost (a cross-volume copy may drop them; a rename keeps them). */
async function reapplyXattrs(runProcess: SensorRunProcess, path: string, wanted: QuarantineManifest['xattrs']): Promise<void> {
  if (wanted.length === 0) return;
  const present = new Set((await readXattrs(runProcess, path)).map((x) => x.name));
  for (const { name, hex } of wanted) {
    if (!present.has(name)) await runProcess(XATTR, ['-w', '-s', '-x', name, hex, path], { timeoutMs: 5_000 });
  }
}

/**
 * Move `from` to `to`, never replacing anything at `to`. In: `rename` into a fresh directory only Vanguard
 * writes (it does not follow a link at `from`; the caller re-checks what arrived). Out: a hard link, which
 * fails rather than overwrite a file that appeared at the original path since the check. Either way a move
 * across volumes is copy (exclusive), verify, unlink.
 */
async function moveFile(from: string, to: string, sha256: string, direction: 'in' | 'out'): Promise<void> {
  try {
    if (direction === 'in') await rename(from, to);
    else {
      await link(from, to);
      await unlink(from);
    }
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
  }
  await copyFile(from, to, constants.COPYFILE_EXCL);
  if ((await sha256NoFollow(to)) !== sha256) {
    await unlink(to);
    throw new Error('the copy did not match the original');
  }
  await unlink(from);
}

export function createQuarantineStore(deps: QuarantineDeps): QuarantineStore {
  const dir = deps.quarantineDir;

  const ensureRoot = async (): Promise<string | null> => {
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
    if (!(await isPlainDir(dir))) return 'The quarantine folder is not a plain directory.';
    await chmodNoFollow(dir, DIR_MODE).catch(() => undefined);
    return null;
  };

  const manifest: QuarantineStore['manifest'] = async (findingId) => {
    if (!safeFindingDir(findingId)) return { ok: false, error: 'That is not a quarantine entry.' };
    const entry = join(dir, findingId);
    if (!(await isPlainDir(dir)) || !(await isPlainDir(entry))) return { ok: false, error: 'Nothing is quarantined for this finding.' };
    const file = join(entry, 'manifest.json');
    let parsed: QuarantineManifest;
    try {
      const stat = await lstat(file);
      if (!stat.isFile()) return { ok: false, error: 'The quarantine manifest is not a regular file.' };
      const result = QuarantineManifestSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
      if (!result.success || result.data.findingId !== findingId) return { ok: false, error: 'The quarantine manifest is unreadable.' };
      parsed = result.data;
    } catch {
      return { ok: false, error: 'Nothing is quarantined for this finding.' };
    }
    if (!safeFileName(parsed.fileName)) {
      return { ok: false, error: 'The quarantine manifest names an unsafe file.' };
    }
    const dataDir = join(entry, 'data');
    const dataPath = join(dataDir, parsed.fileName);
    try {
      if (!(await isPlainDir(dataDir))) return { ok: false, error: 'The quarantined copy is missing.' };
      const stat = await lstat(dataPath);
      if (stat.isSymbolicLink() || !stat.isFile()) return { ok: false, error: 'The quarantined copy is not a regular file.' };
      const [realData, realRoot] = await Promise.all([realpath(dataPath), realpath(dir)]);
      if (!realData.startsWith(`${realRoot}/`)) return { ok: false, error: 'The quarantined copy resolves outside the quarantine.' };
    } catch {
      return { ok: false, error: 'The quarantined copy is missing.' };
    }
    return { ok: true, manifest: parsed, dataPath };
  };

  const entries = async (): Promise<QuarantineManifest[]> => {
    if (!(await isPlainDir(dir))) return [];
    const out: QuarantineManifest[] = [];
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      const read = await manifest(name);
      if (read.ok) out.push(read.manifest);
    }
    return out;
  };

  const expiry = (m: QuarantineManifest): number => m.quarantinedAt + deps.retentionDays() * DAY_MS;

  return {
    dir,
    manifest,
    async list() {
      return (await entries())
        .map((m) => ({
          findingId: m.findingId,
          findingTitle: m.findingTitle,
          originalPath: m.originalPath,
          fileName: m.fileName,
          sha256: m.sha256,
          size: m.size,
          quarantinedAt: m.quarantinedAt,
          expiresAt: expiry(m),
        }))
        .sort((a, b) => b.quarantinedAt - a.quarantinedAt);
    },

    async put(input) {
      const { finding } = input;
      if (!safeFindingDir(finding.id)) return { ok: false, error: 'This finding cannot be quarantined (its id is not a safe folder name).' };
      const fileName = basename(input.path);
      if (!safeFileName(fileName)) return { ok: false, error: `${input.path} does not end in a file name Vanguard can keep.` };
      // Everything read from the original happens before the entry exists, so a failure leaves nothing behind.
      let realParent: string;
      try {
        realParent = await realpath(dirname(input.path));
      } catch {
        return { ok: false, error: `${dirname(input.path)} no longer exists.` };
      }
      const xattrs = await readXattrs(deps.runProcess, input.path).catch(() => []);
      const rootError = await ensureRoot().catch((error: unknown) => String(error));
      if (rootError) return { ok: false, error: rootError };
      const entry = join(dir, finding.id);
      const dataDir = join(entry, 'data');
      try {
        await mkdir(entry, { mode: DIR_MODE });
      } catch (error) {
        return {
          ok: false,
          error:
            (error as NodeJS.ErrnoException).code === 'EEXIST'
              ? 'This finding already has a file in quarantine; restore or purge it first.'
              : `Could not create the quarantine entry: ${String(error)}`,
        };
      }
      const dataPath = join(dataDir, fileName);
      const manifestValue: QuarantineManifest = {
        version: 1,
        findingId: finding.id,
        findingTitle: finding.title,
        originalPath: input.path,
        realParent,
        fileName,
        sha256: input.sha256,
        size: input.size,
        mode: input.mode & 0o7777,
        uid: input.uid,
        xattrs,
        quarantinedAt: deps.now(),
        allowRules: [...input.allowRules],
      };
      try {
        await mkdir(dataDir, { mode: DIR_MODE });
        await writeFile(join(entry, 'manifest.json'), `${JSON.stringify(manifestValue, null, 2)}\n`, { mode: FILE_MODE, flag: 'wx' });
        await moveFile(input.path, dataPath, input.sha256, 'in');
      } catch (error) {
        await rm(entry, { recursive: true, force: true });
        return { ok: false, error: `Could not move ${input.path} into quarantine: ${error instanceof Error ? error.message : String(error)}` };
      }
      // A link swapped in between the checks and the rename moves the link, never what it points at; put it
      // back and refuse rather than keep it.
      const moved = await lstat(dataPath);
      if (moved.isSymbolicLink() || !moved.isFile() || (await sha256NoFollow(dataPath)) !== input.sha256) {
        // Back where it came from, but never over something that has appeared there since: a regular file by a
        // hard link (which cannot overwrite), a link by a rename only once the path is checked to be empty.
        const back = moved.isFile()
          ? await link(dataPath, input.path).then(
              () => true,
              () => false,
            )
          : await lstat(input.path).then(
              () => false,
              () =>
                rename(dataPath, input.path).then(
                  () => true,
                  () => false,
                ),
            );
        if (back) await rm(entry, { recursive: true, force: true });
        return {
          ok: false,
          error: back
            ? `${input.path} changed while it was being quarantined; it was put back and nothing was kept.`
            : `${input.path} changed while it was being quarantined, and something now sits at that path; what was moved stays in ${dataDir}.`,
        };
      }
      try {
        await chmodNoFollow(dataPath, 0);
      } catch (error) {
        return { ok: false, error: `${input.path} was moved into quarantine but could not be locked to 0000: ${String(error)}` };
      }
      return { ok: true, manifest: manifestValue };
    },

    async restore(findingId, inspect) {
      const read = await manifest(findingId);
      if (!read.ok) return read;
      const { manifest: m, dataPath } = read;
      let restored = false;
      try {
        await chmodNoFollow(dataPath, 0o400);
        if ((await sha256NoFollow(dataPath)) !== m.sha256) {
          return { ok: false, error: 'The quarantined copy no longer matches what was quarantined; it stays where it is.' };
        }
        const verified = await lstat(dataPath);
        const verdict = await inspect(dataPath, m);
        if (!verdict.ok) return verdict;
        // The re-scan takes a while: the copy must still be the very file that was hashed.
        const after = await lstat(dataPath);
        if (!after.isFile() || after.ino !== verified.ino || after.dev !== verified.dev) {
          return { ok: false, error: 'The quarantined copy was replaced during the re-scan; it stays where it is.' };
        }
        try {
          await lstat(m.originalPath);
          return { ok: false, error: `Something is already at ${m.originalPath}; move it away before restoring.` };
        } catch {
          // Nothing there: the expected case.
        }
        let parentReal: string;
        try {
          parentReal = await realpath(dirname(m.originalPath));
        } catch {
          return { ok: false, error: `${dirname(m.originalPath)} no longer exists.` };
        }
        if (parentReal !== m.realParent) {
          return { ok: false, error: `${dirname(m.originalPath)} now resolves somewhere else; the file stays in quarantine.` };
        }
        await moveFile(dataPath, m.originalPath, m.sha256, 'out');
        restored = true;
        const landed = await lstat(m.originalPath);
        if (!landed.isFile() || (landed.dev === verified.dev && landed.ino !== verified.ino)) {
          await unlink(m.originalPath).catch(() => undefined);
          return { ok: false, error: `What arrived at ${m.originalPath} was not the quarantined file; it was removed.` };
        }
        await chmodNoFollow(m.originalPath, m.mode);
        await reapplyXattrs(deps.runProcess, m.originalPath, m.xattrs);
        await rm(join(dir, findingId), { recursive: true, force: true });
        return { ok: true, manifest: m };
      } catch (error) {
        return { ok: false, error: `Could not restore ${m.originalPath}: ${error instanceof Error ? error.message : String(error)}` };
      } finally {
        // Back to 0000 unless it left — and not when a half-finished move left it hard-linked at the original
        // path, where the mode would land on the user's file.
        if (!restored) {
          const [data, original] = await Promise.all([lstat(dataPath).catch(() => null), lstat(m.originalPath).catch(() => null)]);
          if (data && !(original && original.ino === data.ino)) await chmodNoFollow(dataPath, 0).catch(() => undefined);
        }
      }
    },

    async peek(findingId, fn) {
      const read = await manifest(findingId);
      if (!read.ok) return read;
      try {
        await chmodNoFollow(read.dataPath, 0o400);
        if ((await sha256NoFollow(read.dataPath)) !== read.manifest.sha256) {
          return { ok: false, error: 'The quarantined copy no longer matches what was quarantined.' };
        }
        return { ok: true, value: await fn(read.dataPath, read.manifest) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        await chmodNoFollow(read.dataPath, 0).catch(() => undefined);
      }
    },

    async purge() {
      const now = deps.now();
      let purged = 0;
      for (const m of await entries()) {
        if (expiry(m) > now) continue;
        await rm(join(dir, m.findingId), { recursive: true, force: true });
        purged += 1;
      }
      return purged;
    },
  };
}
