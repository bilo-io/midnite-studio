import { cloneRepo, execGit, writeQueue } from '@midnite/studio-git-engine';

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

/** `git clone --mirror` into `<parent>/<name>`. */
export async function mirrorClone(parent: string, url: string, name: string): Promise<GitStep> {
  const result = await cloneRepo(parent, url, name, { mirror: true });
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

/** `git remote update --prune`, through the per-repo write queue. */
export async function mirrorUpdate(bare: string): Promise<GitStep> {
  const result = await writeQueue.run(bare, () => execGit(bare, ['remote', 'update', '--prune'], { write: true }));
  return result.exitCode === 0 ? { ok: true } : { ok: false, message: lastLine(result.stderr, 'git remote update failed.') };
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
  const result = await writeQueue.run(bare, () => execGit(bare, ['push', '--mirror', '--', targetUrl], { write: true }));
  return result.exitCode === 0 ? { ok: true } : { ok: false, message: lastLine(result.stderr, 'git push --mirror failed.') };
}

