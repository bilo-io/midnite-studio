import { realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * The Seatbelt profile for one confined session — Phase 121 Theme E.
 *
 * `sandbox-exec -f <profile> <shell>` runs the shell (and everything it starts) under a profile the
 * kernel enforces, so what a prompt-injected agent can do is bounded by the profile rather than by
 * the agent's good manners. This module is **pure string generation**: it never spawns, never
 * writes, and imports no `electron`. The only I/O is the injectable `realpath` that turns `/var/…`
 * into `/private/var/…` (Seatbelt matches the resolved path, so a symlinked rule silently never
 * fires). Probing for the binary, writing the 0600 file and wrapping the spawn live in
 * `confine.ts`.
 *
 * ## Shape
 *
 * ```
 * (version 1)
 * (allow default)                       ; confinement is about files and, optionally, the network
 * (deny file-write*)                    ; ...so writes start closed...
 * (allow file-write* (subpath …))       ; ...and reopen for the repo, its worktrees, userData, temp, caches, engine state
 * (deny file-read* (subpath ~/.ssh) …)  ; reads stay open except secrets and every OTHER registered repo
 * (allow file-read* (subpath repo))     ; ...a session whose repo sits inside another registry entry still reads its own
 * ```
 *
 * Seatbelt resolves overlapping rules **last match wins**, which is why the order above matters and
 * why the denies for the suite's own state files come after the userData allow.
 *
 * ## What it does not do
 *
 * Seatbelt filters the network by address and port, never by hostname, so `network: 'engine-hosts'`
 * cannot name `api.anthropic.com`; it allows outbound TCP on 443 and 80, loopback and DNS, and
 * denies everything else. That is recorded in `outstanding.md`, not papered over here.
 */

/** Default filtering of the network: everything allowed, or only what an agent CLI needs to reach its API. */
export type ConfineNetwork = 'allow' | 'engine-hosts';

export interface SeatbeltProfileInput {
  /**
   * The checkout the session works in (the git toplevel, or the working directory when it is not a
   * repo) and any further roots a git operation in it writes to — its linked worktrees and the
   * common `.git` directory a linked worktree commits into. All are writable and readable.
   */
  repoRoots: readonly string[];
  /** Every repo in the registry; those not under `repoRoots` are denied for reads. */
  registryRepos?: readonly string[];
  /** The app's user data directory — writable, minus the files in `protectedFiles`. */
  userData: string;
  /** The suite's vault files and anything else under `userData` an agent must neither read nor write. */
  protectedFiles?: readonly string[];
  /** Directories under `userData` an agent must neither read nor write (the audit trail, the profiles). */
  protectedDirs?: readonly string[];
  /** Home directory; the ambient one when omitted. */
  home?: string;
  /** Writable scratch directories; `$TMPDIR` plus `/private/tmp` and `/private/var/tmp` when omitted. */
  tempDirs?: readonly string[];
  /** `network: 'engine-hosts'` is the opt-in to `(deny network*)` with the engine's ports allowed. */
  network?: ConfineNetwork;
  /** Path resolution, for tests; `fs.realpathSync` falling back to the path itself by default. */
  realpath?: (path: string) => string;
}

/** Home-relative directories an agent may write: build caches and each engine's own state. */
export const WRITABLE_HOME_DIRS = [
  '.cache',
  '.npm',
  '.pnpm-store',
  '.cargo',
  '.claude',
  '.codex',
  '.gemini',
  'Library/Caches',
  'Library/pnpm',
  '.local/share/pnpm',
] as const;

/** Home-relative single files an engine rewrites in place (`~/.claude.json` and its lock/backup siblings). */
export const WRITABLE_HOME_FILE_PREFIXES = ['.claude.json'] as const;

/** Home-relative directories nothing in a confined session may read. */
export const DENIED_READ_HOME_DIRS = ['.ssh', '.aws', '.gnupg', 'Library/Keychains'] as const;

/** Device nodes a shell on a pty writes to. */
const WRITABLE_DEVICES = ['/dev/null', '/dev/zero', '/dev/dtracehelper', '/dev/tty'] as const;

/** Quote one path as a Seatbelt string literal. Throws on anything the grammar cannot carry safely. */
export function sbString(value: string): string {
  // A NUL or newline in a path would end or split the rule; refuse rather than guess.
  if ([...value].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)) {
    throw new Error('A control character cannot be written into a sandbox profile.');
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function resolveOne(path: string, realpath: (p: string) => string): string {
  if (!isAbsolute(path)) throw new Error(`A sandbox profile path must be absolute: ${path}`);
  const absolute = resolve(path);
  try {
    return realpath(absolute);
  } catch {
    return absolute;
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** `true` when `child` is `parent` or lives under it. */
export function isUnder(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`);
}

/** The temp directories a session may write by default. */
export function defaultTempDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  return unique([env['TMPDIR'] ?? tmpdir(), '/private/tmp', '/private/var/tmp']);
}

function subpaths(paths: readonly string[]): string {
  return paths.map((p) => `(subpath ${sbString(p)})`).join('\n  ');
}

/** Generate the profile text. Pure apart from the injectable `realpath`. */
export function generateSeatbeltProfile(input: SeatbeltProfileInput): string {
  const realpath = input.realpath ?? ((p: string) => realpathSync(p));
  const r = (p: string): string => resolveOne(p, realpath);
  const home = r(input.home ?? homedir());
  const homeJoin = (rel: string): string => join(home, rel);

  const repoRoots = unique(input.repoRoots.map(r));
  const userData = r(input.userData);
  const tempDirs = unique((input.tempDirs ?? defaultTempDirs()).map(r));
  const writableDirs = unique([
    ...repoRoots,
    userData,
    ...tempDirs,
    ...WRITABLE_HOME_DIRS.map((rel) => r(homeJoin(rel))),
  ]);

  const protectedFiles = unique((input.protectedFiles ?? []).map(r));
  const protectedDirs = unique((input.protectedDirs ?? []).map(r));
  const deniedReadDirs = unique([
    ...DENIED_READ_HOME_DIRS.map((rel) => r(homeJoin(rel))),
    ...protectedDirs,
    // Every other repo in the registry. A repo the session itself works in is re-allowed below.
    ...(input.registryRepos ?? []).map(r).filter((repo) => !repoRoots.some((root) => root === repo)),
  ]);

  const lines: string[] = [
    ';; Midnite Studio - confined agent session (Phase 121 Theme E). Generated; do not edit.',
    '(version 1)',
    '(allow default)',
    '',
    ';; Writes: closed, then reopened for the session\'s own tree, scratch space and engine state.',
    '(deny file-write*)',
    '(allow file-write*',
    `  ${subpaths(writableDirs)}`,
    ...WRITABLE_DEVICES.map((d) => `  (literal ${sbString(d)})`),
    '  (regex #"^/dev/tty[a-z0-9]*$")',
    '  (regex #"^/dev/pts/[0-9]+$")',
    ...WRITABLE_HOME_FILE_PREFIXES.map((f) => `  (regex (string-append "^" (regex-quote ${sbString(homeJoin(f))}) ".*$"))`),
    ')',
    '',
    ';; The suite\'s own state under userData is neither readable nor writable, even though userData is.',
  ];

  const protectedRules: string[] = [];
  if (protectedFiles.length > 0) {
    protectedRules.push(...protectedFiles.map((f) => `  (literal ${sbString(f)})`));
  }
  if (protectedDirs.length > 0) {
    protectedRules.push(`  ${subpaths(protectedDirs)}`);
  }
  if (protectedRules.length > 0) {
    lines.push('(deny file-write*', ...protectedRules, ')');
  }

  lines.push('', ';; Reads: open, except secrets and every other registered repo.');
  const readDenies: string[] = [];
  if (deniedReadDirs.length > 0) readDenies.push(`  ${subpaths(deniedReadDirs)}`);
  readDenies.push(...protectedFiles.map((f) => `  (literal ${sbString(f)})`));
  lines.push('(deny file-read*', ...readDenies, ')');
  // A worktree that sits inside another registry entry still reads its own tree.
  if (repoRoots.length > 0) lines.push('(allow file-read*', `  ${subpaths(repoRoots)}`, ')');

  if (input.network === 'engine-hosts') {
    lines.push(
      '',
      ';; Network: only what an agent CLI needs. Seatbelt cannot filter by hostname, so this is by port.',
      '(deny network*)',
      '(allow network* (local ip) (remote ip "localhost:*"))',
      '(allow network-outbound (remote tcp "*:443") (remote tcp "*:80") (remote udp "*:53") (remote tcp "*:53"))',
      '(allow network* (local unix-socket) (remote unix-socket))',
    );
  }

  return `${lines.join('\n')}\n`;
}
