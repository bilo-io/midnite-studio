import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { execGit, writeQueue } from '@midnite/studio-git-engine';

import { isSafeRemoteUrl } from './mirror-layout';

/** The git half of a mirror: clone, refresh, check, list and restore. Everything is argv, never a shell. */

const lastLine = (text: string, fallback: string): string =>
  text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop() ?? fallback;

export type GitStep = { ok: true } | { ok: false; message: string };

export async function isMirrorPresent(bare: string): Promise<boolean> {
  const result = await execGit(bare, ['rev-parse', '--is-bare-repository']);
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}

/** Kill the child when the signal fires, so a quit does not leave git writing into a mirror. */
const killOnAbort = (signal?: AbortSignal) => {
  if (!signal) return {};
  return {
    processCallback: (proc: { kill: (s?: NodeJS.Signals) => boolean }) => {
      if (signal.aborted) proc.kill('SIGTERM');
      else signal.addEventListener('abort', () => proc.kill('SIGTERM'), { once: true });
    },
  };
};

/**
 * `git clone --mirror` into `<parent>/<name>`. It clones into `<name>.partial` and renames on success,
 * so a clone cut by a quit or a crash never leaves something `isMirrorPresent` would take for a mirror.
 */
export async function mirrorClone(parent: string, url: string, name: string, signal?: AbortSignal): Promise<GitStep> {
  const partial = `${name}.partial`;
  await rm(join(parent, partial), { recursive: true, force: true });
  const result = await execGit(parent, ['clone', '--mirror', '--', url, partial], { write: true, ...killOnAbort(signal) });
  if (result.exitCode !== 0 || signal?.aborted) {
    await rm(join(parent, partial), { recursive: true, force: true });
    return { ok: false, message: signal?.aborted ? 'aborted' : lastLine(result.stderr, 'git clone failed.') };
  }
  await rename(join(parent, partial), join(parent, name));
  return { ok: true };
}

/** `git remote update --prune`, through the per-repo write queue. */
export async function mirrorUpdate(bare: string, signal?: AbortSignal): Promise<GitStep> {
  const result = await writeQueue.run(bare, () => execGit(bare, ['remote', 'update', '--prune'], { write: true, ...killOnAbort(signal) }));
  return result.exitCode === 0 ? { ok: true } : { ok: false, message: signal?.aborted ? 'aborted' : lastLine(result.stderr, 'git remote update failed.') };
}

/**
 * The remote's default branch and its tip (`git ls-remote --symref <url> HEAD`), for the head-vs-forge
 * divergence check. `null` when it cannot be read: the check is then skipped, never failed.
 */
export async function remoteDefaultBranch(url: string, signal?: AbortSignal): Promise<{ ref: string; sha: string } | null> {
  if (!isSafeRemoteUrl(url)) return null;
  const result = await execGit(process.cwd(), ['ls-remote', '--symref', '--', url, 'HEAD'], killOnAbort(signal));
  if (result.exitCode !== 0) return null;
  let ref: string | null = null;
  let sha: string | null = null;
  for (const line of result.stdout.split('\n')) {
    const symref = /^ref:\s+(\S+)\s+HEAD$/.exec(line.trim());
    if (symref) ref = symref[1] ?? null;
    const tip = /^([0-9a-f]{40,64})\s+HEAD$/.exec(line.trim());
    if (tip) sha = tip[1] ?? null;
  }
  return ref && sha ? { ref, sha } : null;
}

/** `git fsck --no-dangling`: a corrupt object fails with its id in the first stderr lines. */
export async function mirrorFsck(bare: string): Promise<GitStep> {
  const result = await execGit(bare, ['fsck', '--no-dangling']);
  if (result.exitCode === 0) return { ok: true };
  const detail = `${result.stderr}\n${result.stdout}`
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(error|fatal|missing|broken|invalid)/i.test(l))
    .slice(0, 3)
    .join('; ');
  return { ok: false, message: detail || lastLine(result.stderr, 'git fsck failed.') };
}

/** Every ref and its object id. `for-each-ref` has no `-z`, so each record ends in `%00`; a ref name never contains a space, so the first one splits. */
export async function listRefs(bare: string): Promise<Record<string, string>> {
  const result = await execGit(bare, ['for-each-ref', '--format=%(objectname) %(refname)%00']);
  const refs: Record<string, string> = {};
  if (result.exitCode !== 0) return refs;
  for (const raw of result.stdout.split('\0')) {
    const record = raw.replace(/^\n/, '');
    const at = record.indexOf(' ');
    if (at > 0) refs[record.slice(at + 1)] = record.slice(0, at);
  }
  return refs;
}

/**
 * Restore: `git push --mirror <target>` from the bare repo. Reserved for an *empty* remote — it
 * force-updates every ref and deletes any the mirror lacks (the Phase 119 Theme G runbook uses
 * per-ref leases for a live repo instead).
 */
export async function restoreMirror(bare: string, targetUrl: string): Promise<GitStep> {
  if (!isSafeRemoteUrl(targetUrl)) return { ok: false, message: 'unsafe restore target' };
  const result = await writeQueue.run(bare, () => execGit(bare, ['push', '--mirror', '--', targetUrl], { write: true }));
  return result.exitCode === 0 ? { ok: true } : { ok: false, message: lastLine(result.stderr, 'git push --mirror failed.') };
}

