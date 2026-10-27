import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Where a mirror lives (Phase 119 Theme A): `<root>/<host>/<owner>/<repo>.git` is the bare
 * `--mirror`, `<repo>.meta/` beside it holds the forge metadata. Every segment comes from a remote
 * URL or a provider, so each one is checked before it becomes a path component — a `..` or a
 * separator in an owner name must never walk out of the root.
 */
export type MirrorRepo = { host: string; owner: string; repo: string };

export type MirrorPaths = {
  /** `<root>/<host>/<owner>` — the parent a `git clone --mirror` runs in. */
  parent: string;
  /** The bare repo's directory name, `<repo>.git`. */
  name: string;
  bare: string;
  meta: string;
};

// A leading `.` or `_` is allowed (`.github`, `_config`), a leading `-` is not; `.` and `..` fail the `..`/length checks.
const SEGMENT = /^(?:[A-Za-z0-9_]|\.[A-Za-z0-9_])[A-Za-z0-9._-]*$/;
// Host may carry a port (`127.0.0.1:3000`); `:` is not a path separator on macOS, but keep it out of file names.
const HOST = /^[A-Za-z0-9][A-Za-z0-9.-]*(:\d{1,5})?$/;

export const DEFAULT_MIRROR_ROOT_SEGMENTS = ['Midnite', 'Git', 'mirrors'] as const;

export function defaultMirrorRoot(home: string = homedir()): string {
  return join(home, ...DEFAULT_MIRROR_ROOT_SEGMENTS);
}

export function isSafeSegment(segment: string): boolean {
  return SEGMENT.test(segment) && !segment.includes('..') && !segment.endsWith('.git') && !segment.endsWith('.meta');
}

export function mirrorKey({ host, owner, repo }: MirrorRepo): string {
  return `${host}/${owner}/${repo}`;
}

/** Throws on an unsafe segment; the one place a `MirrorRepo` becomes paths. */
export function mirrorPaths(root: string, target: MirrorRepo): MirrorPaths {
  if (!HOST.test(target.host) || target.host.includes('..')) throw new Error(`unsafe mirror host: ${target.host}`);
  for (const [label, value] of [['owner', target.owner], ['repo', target.repo]] as const) {
    if (!isSafeSegment(value)) throw new Error(`unsafe mirror ${label}: ${value}`);
  }
  const hostDir = target.host.replace(':', '_');
  const parent = join(root, hostDir, target.owner);
  const name = `${target.repo}.git`;
  return { parent, name, bare: join(parent, name), meta: join(parent, `${target.repo}.meta`) };
}

/** A remote a mirror may be cloned from or pushed to: no option-looking strings, no `ext::`-style helpers. */
export function isSafeRemoteUrl(url: string): boolean {
  if (url.length === 0 || url.length > 2048) return false;
  if (url.startsWith('-')) return false;
  // Whitespace or any control character (code < 32, DEL) could smuggle a second argument or a newline.
  if (/\s/.test(url) || [...url].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*::/.test(url)) return false; // transport helpers: ext::, fd::
  // `user:token@host` would put a credential in plaintext config and the repo's remote.origin.url; those live in the vault.
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/@]*:[^/@]*@/.test(url)) return false;
  if (/^(https?|ssh|git|file):\/\//i.test(url)) return true;
  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^:]/.test(url)) return true; // scp-like
  return url.startsWith('/'); // an absolute path: a USB disk, a fixture
}
