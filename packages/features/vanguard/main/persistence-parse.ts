import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

import type { SecurityFindingSeverity } from '@midnite/studio-shared';

import type { SignatureState } from './code-signing';

/** Pure parsing, baselining and classification for Theme D's persistence sensor. No I/O here. */

export type PersistenceKind =
  'launch-agent' | 'launch-daemon' | 'login-item' | 'cron' | 'shell-rc' | 'ssh' | 'periodic';

export interface PersistenceLocation {
  kind: PersistenceKind;
  /** A directory (every entry is an item) or a single file. */
  path: string;
  type: 'dir' | 'file';
  /** Directories: only entries with this suffix; omitted means every regular file. */
  suffix?: string;
}

/** The locations Vanguard watches, relative to the user's home where `home` is given. */
export function persistenceLocations(home: string): PersistenceLocation[] {
  const rc = ['.zshrc', '.zprofile', '.zshenv', '.bashrc', '.bash_profile', '.profile'];
  return [
    {
      kind: 'launch-agent',
      path: join(home, 'Library/LaunchAgents'),
      type: 'dir',
      suffix: '.plist',
    },
    { kind: 'launch-agent', path: '/Library/LaunchAgents', type: 'dir', suffix: '.plist' },
    { kind: 'launch-daemon', path: '/Library/LaunchDaemons', type: 'dir', suffix: '.plist' },
    ...rc.map((f): PersistenceLocation => ({
      kind: 'shell-rc',
      path: join(home, f),
      type: 'file',
    })),
    { kind: 'ssh', path: join(home, '.ssh/authorized_keys'), type: 'file' },
    { kind: 'ssh', path: join(home, '.ssh/config'), type: 'file' },
    { kind: 'periodic', path: '/etc/periodic', type: 'dir' },
  ];
}

export const sha256 = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

/** One watched item at one moment. `key` is stable across scans (`<kind>:<path>`). */
export interface PersistenceEntry {
  key: string;
  kind: PersistenceKind;
  path: string;
  hash: string;
}

export interface BaselineDiff {
  added: PersistenceEntry[];
  changed: PersistenceEntry[];
  removed: PersistenceEntry[];
}

/** Baseline is `key -> hash`. A removal is reported but never raised as a finding. */
export function diffPersistence(
  baseline: Readonly<Record<string, string>>,
  current: readonly PersistenceEntry[],
): BaselineDiff {
  const added: PersistenceEntry[] = [];
  const changed: PersistenceEntry[] = [];
  const seen = new Set<string>();
  for (const e of current) {
    seen.add(e.key);
    const prev = baseline[e.key];
    if (prev === undefined) added.push(e);
    else if (prev !== e.hash) changed.push(e);
  }
  const removed = Object.keys(baseline)
    .filter((k) => !seen.has(k))
    .map((key): PersistenceEntry => {
      const i = key.indexOf(':');
      return { key, kind: key.slice(0, i) as PersistenceKind, path: key.slice(i + 1), hash: '' };
    });
  return { added, changed, removed };
}

export const toBaseline = (entries: readonly PersistenceEntry[]): Record<string, string> =>
  Object.fromEntries(entries.map((e) => [e.key, e.hash]));

// --- launchd property lists (read through `plutil -convert json -o -`) -----------------------------------

export interface LaunchItem {
  label?: string;
  program?: string;
  programArguments: string[];
  runAtLoad: boolean;
  keepAlive: boolean;
}

/** Parses the JSON `plutil -convert json -o -` prints for a launchd plist. `null` when it is not an object. */
export function parseLaunchPlistJson(text: string): LaunchItem | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const args = Array.isArray(o.ProgramArguments)
    ? o.ProgramArguments.filter((a): a is string => typeof a === 'string')
    : [];
  return {
    ...(typeof o.Label === 'string' ? { label: o.Label } : {}),
    ...(typeof o.Program === 'string' ? { program: o.Program } : {}),
    programArguments: args,
    runAtLoad: o.RunAtLoad === true,
    keepAlive: o.KeepAlive === true || (typeof o.KeepAlive === 'object' && o.KeepAlive !== null),
  };
}

/** The executable the item launches, when the plist names one. */
export const launchTarget = (item: LaunchItem): string | undefined =>
  item.program ?? item.programArguments[0];

/**
 * A target inside a dot-directory under a place a user (or a dropper) writes to, or in a world-writable
 * temp path: `~/Library/Application Support/.x/x`, `/tmp/payload`. Real software does not hide.
 */
export function isHiddenOrTempTarget(target: string, home: string): boolean {
  if (/^\/(private\/)?(tmp|var\/tmp|var\/folders)\//.test(target)) return true;
  if (target.startsWith('/Users/Shared/')) return true;
  if (target.includes('/node_modules/')) return false;
  const inHome = target.startsWith(`${home}/`) ? target.slice(home.length + 1) : null;
  if (inHome === null) return false;
  const parts = inHome.split('/');
  // A dot-directory anywhere in the path other than the conventional dev tool homes.
  const benignDot = new Set([
    '.cargo',
    '.local',
    '.nvm',
    '.volta',
    '.bun',
    '.deno',
    '.pyenv',
    '.rbenv',
  ]);
  return parts.slice(0, -1).some((p) => p.startsWith('.') && !benignDot.has(p));
}

export interface PersistenceClassification {
  severity: SecurityFindingSeverity;
  reasons: string[];
}

/**
 * `high` by default, `critical` when what the item launches is unsigned (or ad-hoc outside a dev tool
 * path), quarantined, or sits in a hidden or temp location.
 */
export function classifyPersistence(input: {
  kind: PersistenceKind;
  target?: string;
  signature?: SignatureState;
  home: string;
}): PersistenceClassification {
  const reasons: string[] = [];
  const { target, signature, home } = input;
  if (signature?.quarantined) reasons.push('the target still carries the download quarantine flag');
  if (signature !== undefined && !signature.signed) reasons.push('the target is not code-signed');
  else if (signature?.adhoc && target !== undefined && !isDevToolPath(target, home))
    reasons.push('the target is ad-hoc signed (no identity behind it)');
  if (target !== undefined && isHiddenOrTempTarget(target, home))
    reasons.push('the target lives in a hidden or temporary location');
  return { severity: reasons.length > 0 ? 'critical' : 'high', reasons };
}

export function isDevToolPath(path: string, home: string): boolean {
  return (
    path.includes('/node_modules/.bin/') ||
    path.startsWith(`${home}/.cargo/bin/`) ||
    path.startsWith('/opt/homebrew/') ||
    path.startsWith('/usr/local/')
  );
}

/** A short, human description of what an item is, for the finding title. */
export function describePersistenceKind(kind: PersistenceKind): string {
  switch (kind) {
    case 'launch-agent':
      return 'LaunchAgent';
    case 'launch-daemon':
      return 'LaunchDaemon';
    case 'login-item':
      return 'Login item';
    case 'cron':
      return 'Crontab';
    case 'shell-rc':
      return 'Shell startup file';
    case 'ssh':
      return 'SSH file';
    case 'periodic':
      return 'Periodic script';
  }
}

/** `crontab -l` output as a baseline entry; an absent crontab and an empty one are the same. */
export function cronEntry(output: string): PersistenceEntry {
  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  return { key: 'cron:crontab', kind: 'cron', path: 'crontab', hash: sha256(lines.join('\n')) };
}

/** Label for an item's file, used by finding titles. */
export const itemName = (e: PersistenceEntry): string =>
  e.kind === 'cron' ? 'crontab' : basename(e.path);
