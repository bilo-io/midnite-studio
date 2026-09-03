import { bridge } from '../../services/bridge';
import { inspectRepoRoot } from '../repos/repo-lifecycle';

/**
 * Repo-capability predicates for the midnite menu's Setup/Update leaves
 * (Phase 49 Theme E) — read-only, best-effort, and never throwing, the same
 * posture `repo-lifecycle.ts`'s own `inspectRepoRoot` takes: a wrong guess
 * here costs a leaf staying enabled or disabled one render late, not a
 * mistaken write.
 */

/** `.midnite/` present at the checkout root. Setup's dialog reads "Set up"
 *  vs. "Update onboarding kit" off this — see `SetupDialog`. */
export async function hasMidniteDir(repoId: string, worktreePath?: string): Promise<boolean> {
  const api = bridge();
  if (!api) return false;
  const scope = { scope: 'repo' as const, repoId, ...(worktreePath ? { worktreePath } : {}) };
  const dir = await api.fs.listDir({ ...scope, relPath: '' });
  return dir.ok && dir.entries.some((entry) => entry.name === '.midnite');
}

/** Reuses `repo-lifecycle.ts`'s own detection rather than re-deriving it —
 *  the doc's own instruction, so the four lifecycle buttons and this leaf
 *  can never disagree about what counts as a moon workspace. */
export async function isMoonWorkspace(repoId: string, worktreePath?: string): Promise<boolean> {
  return (await inspectRepoRoot(repoId, worktreePath)).moon;
}

/**
 * Identified by a real marker — the workspace's own
 * `packages/desktop/scripts/install-local.mjs` — not by directory name, so a
 * clone or a worktree under any path still resolves correctly. `Update`
 * types `moon run desktop:install-local`, which only exists as a task in
 * THIS repository; everywhere else it is disabled with a reason.
 */
export async function isMidniteStudioCheckout(repoId: string, worktreePath?: string): Promise<boolean> {
  const api = bridge();
  if (!api) return false;
  const scope = { scope: 'repo' as const, repoId, ...(worktreePath ? { worktreePath } : {}) };
  const file = await api.fs.readFile({
    ...scope,
    relPath: 'packages/desktop/scripts/install-local.mjs',
  });
  return file.kind === 'text';
}

/** Whether `release/mac-arm64/Midnite Studio.app` exists — Update's
 *  pre-flight: if not, `desktop:install-local` depends on `~:dist` and will
 *  build first, several minutes and ~200 MB of uncached artifacts. */
export async function hasPackagedBuild(repoId: string, worktreePath?: string): Promise<boolean> {
  const api = bridge();
  if (!api) return false;
  const scope = { scope: 'repo' as const, repoId, ...(worktreePath ? { worktreePath } : {}) };
  const dir = await api.fs.listDir({ ...scope, relPath: 'release/mac-arm64' });
  return dir.ok && dir.entries.some((entry) => entry.name === 'Midnite Studio.app');
}
