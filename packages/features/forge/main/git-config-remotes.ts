import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { parseRemoteConfig } from '@midnite/studio-git-engine';
import type { Remote } from '@midnite/studio-shared';

/**
 * A repository's remotes read straight from its `.git/config`, read-only — how
 * an app that ships no git binary (Coder) finds a repository's forge
 * (Phase 113 Theme O; the decision is in docs/APPS.md, "Coder").
 *
 * Studio asks git itself (`git config -z --get-regexp`, git-engine's
 * `listRemotes`). This reads the same keys from the file and hands them to the
 * very same `parseRemoteConfig`, so both paths derive a forge identically. It
 * never writes, never runs anything, and reads only `remote.<name>.url`,
 * `remote.<name>.pushurl` and `url.<base>.insteadOf`. Not honoured:
 * `include`/`includeIf` files and the global/system config — a remote defined
 * only there is not found, and the repository reads as having no forge, which
 * is the honest answer rather than a guess.
 */

/** Larger than any real `.git/config`; a bigger file is not one we parse. */
const MAX_CONFIG_BYTES = 1024 * 1024;

/** `<repo>/.git/config`, following a worktree's `.git` file and its `commondir`. */
export async function gitConfigPath(repoPath: string): Promise<string | null> {
  const dotGit = join(repoPath, '.git');
  let info;
  try {
    info = await stat(dotGit);
  } catch {
    return null;
  }
  if (info.isDirectory()) return join(dotGit, 'config');
  // A linked worktree or submodule: `.git` is a file reading `gitdir: <path>`.
  const pointer = /^gitdir:\s*(.+?)\s*$/m.exec(await readFile(dotGit, 'utf8').catch(() => ''));
  if (!pointer?.[1]) return null;
  const gitDir = isAbsolute(pointer[1]) ? pointer[1] : resolve(repoPath, pointer[1]);
  const common = (await readFile(join(gitDir, 'commondir'), 'utf8').catch(() => '')).trim();
  const configDir = common ? (isAbsolute(common) ? common : resolve(gitDir, common)) : gitDir;
  return join(configDir, 'config');
}

/** The remotes `repoPath`'s config declares, or `[]` when there is no readable config. */
export async function readGitConfigRemotes(repoPath: string): Promise<Remote[]> {
  const path = await gitConfigPath(repoPath);
  if (!path) return [];
  try {
    if ((await stat(path)).size > MAX_CONFIG_BYTES) return [];
    return remotesFromGitConfig(await readFile(path, 'utf8'));
  } catch {
    return [];
  }
}

/** Parse a config file's text into remotes, with `insteadOf` rewrites applied. */
export function remotesFromGitConfig(text: string): Remote[] {
  const entries = parseGitConfigEntries(text);
  const rewrites: { from: string; to: string }[] = [];
  for (const { key, value } of entries) {
    const m = /^url\.(.+)\.insteadof$/i.exec(key);
    if (m?.[1] && value) rewrites.push({ from: value, to: m[1] });
  }
  const rewrite = (url: string): string => {
    let best: { from: string; to: string } | null = null;
    for (const r of rewrites) if (url.startsWith(r.from) && (!best || r.from.length > best.from.length)) best = r;
    return best ? best.to + url.slice(best.from.length) : url;
  };
  const records = entries
    .filter(({ key }) => /^remote\..+\.(url|pushurl)$/i.test(key))
    .map(({ key, value }) => `${normaliseRemoteKey(key)}\n${rewrite(value)}`);
  return parseRemoteConfig(records.length ? `${records.join('\0')}\0` : '');
}

/** `remote.<Name>.URL` → `remote.<Name>.url`: the variable is case-insensitive, the subsection is not. */
function normaliseRemoteKey(key: string): string {
  const lastDot = key.lastIndexOf('.');
  return `${key.slice(0, lastDot)}.${key.slice(lastDot + 1).toLowerCase()}`;
}

/** `[section "sub"] name = value` lines as `section.sub.name` keys, in file order. */
export function parseGitConfigEntries(text: string): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  let section: string | null = null;
  const lines = text.replace(/\\\r?\n/g, '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const header = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/.exec(line);
    if (header?.[1]) {
      const name = header[1].toLowerCase();
      section = header[2] === undefined ? name : `${name}.${header[2].replace(/\\(.)/g, '$1')}`;
      continue;
    }
    if (section === null) continue;
    const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=\s*(.*))?$/.exec(line);
    if (!kv?.[1]) continue;
    out.push({ key: `${section}.${kv[1].toLowerCase()}`, value: unquoteValue(kv[2] ?? 'true') });
  }
  return out;
}

/** Strip an unquoted trailing comment, then the quotes and the escapes git allows. */
function unquoteValue(raw: string): string {
  let value = '';
  let quoted = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[(i += 1)]!;
      value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && (ch === '#' || ch === ';')) {
      break;
    } else {
      value += ch;
    }
  }
  return value.trim();
}
