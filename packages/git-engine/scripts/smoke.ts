/**
 * Manual smoke check: point the engine at a real repository and print what the
 * parsers made of it.
 *
 *   pnpm --filter @midnite-git/git-engine smoke ~/Dev/midnite
 *
 * Unit tests prove the parsers handle the shapes we thought of; this is how you
 * find the ones we didn't, on a repo with years of real history, worktrees,
 * annotated tags and remotes.
 */
import { resolveMainWorktree, resolveRepoRoot } from '../src/exec/git-exec';
import { listRefs } from '../src/commands/refs';
import { getStatus } from '../src/commands/status';
import { listWorktrees } from '../src/commands/worktrees';
import { readLog } from '../src/commands/log';

const target = process.argv[2];

if (!target) {
  console.error('usage: smoke.ts <repo-path>');
  process.exit(2);
}

const heading = (title: string): void => {
  console.log(`\n\x1b[1m── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}\x1b[0m`);
};

const main = async (): Promise<void> => {
  const root = await resolveRepoRoot(target);
  if (!root) {
    console.error(`not a git repository: ${target}`);
    process.exit(1);
  }

  const mainWorktree = await resolveMainWorktree(target);
  heading('repository');
  console.log(`given      ${target}`);
  console.log(`top level  ${root}`);
  console.log(`main wt    ${mainWorktree}`);

  heading('worktrees');
  const worktrees = await listWorktrees(root, 'smoke');
  for (const wt of worktrees) {
    const flags = [wt.isMain && 'main', wt.locked && 'locked', wt.prunable && 'prunable']
      .filter(Boolean)
      .join(',');
    console.log(
      `${(wt.branch ?? '(detached)').padEnd(28)} ${(wt.headSha ?? '').slice(0, 8).padEnd(9)} ${wt.path}${flags ? `  [${flags}]` : ''}`,
    );
  }

  heading('refs');
  const refs = await listRefs(root);
  const counts = refs.reduce<Record<string, number>>((acc, r) => {
    acc[r.kind] = (acc[r.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `${refs.length} refs — ${Object.entries(counts)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ')}`,
  );
  for (const ref of refs.filter((r) => r.kind === 'localBranch').slice(0, 15)) {
    const track = ref.upstream
      ? `→ ${ref.upstream.name} +${ref.upstream.ahead}/-${ref.upstream.behind}${ref.upstream.gone ? ' GONE' : ''}`
      : '';
    const where = ref.worktreePath ? `  (checked out: ${ref.worktreePath})` : '';
    console.log(
      `${ref.isHead ? '*' : ' '} ${ref.name.padEnd(34)} ${ref.sha.slice(0, 8)} ${track}${where}`,
    );
  }

  heading('status');
  const status = await getStatus(root);
  console.log(
    `head=${status.branch.head ?? '(detached)'} upstream=${status.branch.upstream ?? '—'} ` +
      `+${status.branch.ahead}/-${status.branch.behind} inProgress=${status.inProgress ?? 'none'}`,
  );
  console.log(`${status.entries.length} changed paths`);
  for (const entry of status.entries.slice(0, 20)) {
    const marks = `${entry.staged[0]}${entry.unstaged[0]}${entry.conflicted ? '!' : ' '}`;
    const rename = entry.origPath ? ` ← ${entry.origPath}` : '';
    console.log(`  ${marks}  ${entry.path}${rename}`);
  }

  heading('log');
  const started = Date.now();
  const commits = await readLog(root, { all: true, limit: 2000 });
  console.log(`${commits.length} commits parsed in ${Date.now() - started}ms`);
  for (const commit of commits.slice(0, 12)) {
    const decorations = commit.refs.length ? `  (${commit.refs.join(', ')})` : '';
    console.log(
      `  ${commit.sha.slice(0, 8)} ${String(commit.parents.length)}p ${commit.authorName.padEnd(18).slice(0, 18)} ${commit.subject.slice(0, 60)}${decorations}`,
    );
  }

  // The invariant the lane layout depends on: every parent referenced by a
  // commit in the window is either also in the window or below its edge.
  const shas = new Set(commits.map((c) => c.sha));
  const dangling = commits.flatMap((c) => c.parents.filter((p) => !shas.has(p)));
  console.log(`\nparents outside the window: ${dangling.length} (expected at the boundary)`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
