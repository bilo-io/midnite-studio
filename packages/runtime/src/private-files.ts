import { appendFileSync, chmodSync, lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

/**
 * History that is yours alone — Phase 115 Theme B. Scrollback, archived transcripts, chats and
 * logs sit under `userData`; the umask used to decide who could read them (usually 0644/0755).
 * These helpers pin directories to 0700 and files to 0600, and `writePrivateFile` writes via a
 * temp name + rename so a crash never leaves a half-written file.
 *
 * Theme F's runtime guard lives here too: a write that targets Claude's or Codex's own config
 * (`~/.claude*`, `~/.codex`) throws, except under a `skills/` directory (repo scaffolding of
 * skills, never settings). Studio reads that config; it never writes it.
 */

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/**
 * `realpath` of `target`, or of its deepest existing ancestor with the missing tail re-appended — a
 * write usually targets a file that does not exist yet, but the directory it lands in may be a symlink.
 */
function resolveThroughSymlinks(target: string): string {
  const missing: string[] = [];
  let probe = resolve(target);
  for (;;) {
    try {
      return join(realpathSync(probe), ...missing.reverse());
    } catch {
      const parent = dirname(probe);
      if (parent === probe) return resolve(target);
      missing.push(basename(probe));
      probe = parent;
    }
  }
}

/**
 * Throws when `target` sits inside `~/.claude*` or `~/.codex`, other than under `skills/`. Symlinks are
 * resolved first, so a link into `~/.claude` cannot carry a write past the guard.
 */
export function assertNotAgentConfig(target: string, home: string = homedir()): void {
  const abs = resolve(target);
  const real = resolveThroughSymlinks(abs);
  for (const candidate of new Set([abs, real])) {
    for (const h of new Set([home, resolveThroughSymlinks(home)])) {
      const rel = candidate.startsWith(h + sep) ? candidate.slice(h.length + 1).split(sep) : null;
      if (!rel || rel.length === 0) continue;
      const top = (rel[0] ?? '').toLowerCase(); // APFS is case-insensitive
      const isAgentDir = top === '.codex' || top === '.claude' || top.startsWith('.claude.');
      if (!isAgentDir) continue;
      if ((rel[1] ?? '').toLowerCase() === 'skills') continue;
      throw new Error(`refusing to write agent config: ${abs}`);
    }
  }
}

/** `mkdir -p` at 0700, and tighten the leaf if it already existed with a looser mode. */
export async function ensurePrivateDir(path: string): Promise<void> {
  assertNotAgentConfig(path);
  await mkdir(path, { recursive: true, mode: DIR_MODE });
  await chmod(path, DIR_MODE);
}

export function ensurePrivateDirSync(path: string): void {
  assertNotAgentConfig(path);
  mkdirSync(path, { recursive: true, mode: DIR_MODE });
  chmodSync(path, DIR_MODE);
}

/** Atomic 0600 write: temp file (created 0600) then rename over the target. */
export async function writePrivateFile(
  path: string,
  data: string | Uint8Array,
  encoding: BufferEncoding = 'utf8',
): Promise<void> {
  assertNotAgentConfig(path);
  await ensurePrivateDir(dirname(path));
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    await writeFile(tmp, data, { mode: FILE_MODE, encoding });
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

/** Append at 0600. The mode applies on creation; older files are tightened by `tightenHistoryModes`. */
export function appendPrivateFileSync(path: string, text: string): void {
  assertNotAgentConfig(path);
  appendFileSync(path, text, { mode: FILE_MODE });
}

export type TightenResult = { dirs: number; files: number };

/**
 * One-time migration: walk `roots` and chmod directories to 0700 and files to 0600. Idempotent
 * (a tight tree changes nothing, so a re-run is cheap), never throws, skips symlinks.
 */
export function tightenTree(roots: readonly string[]): TightenResult {
  const out: TightenResult = { dirs: 0, files: 0 };
  const walk = (p: string): void => {
    let st;
    try {
      st = lstatSync(p);
    } catch {
      return;
    }
    if (st.isSymbolicLink()) return;
    const want = st.isDirectory() ? DIR_MODE : FILE_MODE;
    if ((st.mode & 0o777) !== want) {
      try {
        chmodSync(p, want);
        if (st.isDirectory()) out.dirs++;
        else out.files++;
      } catch {
        // Not ours to change — never fatal.
      }
    }
    if (!st.isDirectory()) return;
    let names: string[];
    try {
      names = readdirSync(p);
    } catch {
      return;
    }
    for (const n of names) walk(join(p, n));
  };
  for (const r of roots) walk(r);
  return out;
}

/** Every history store under `userData`: the dirs and the two JSON indexes beside them. */
export const HISTORY_PATHS = [
  'scrollback',
  'session-history',
  'chats',
  'logs',
  'terminals.json',
  'session-history.json',
] as const;

/**
 * Phase 115 B's one-time migration, run at boot: tighten what earlier builds left at the umask's
 * mode. Idempotent and never fatal; returns what it changed so the caller can log once.
 */
export function tightenHistoryModes(userDataDir: string): TightenResult {
  return tightenTree(HISTORY_PATHS.map((p) => join(userDataDir, p)));
}
