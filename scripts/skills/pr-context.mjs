#!/usr/bin/env node
// PR context in one JSON (Phase 151 Theme H): resolves the PR from an argument or the current
// branch, gathers view / reviews / comments / checks / diff-stat, finds the PR's worktree and reports
// a dirty tree and ahead/behind against its base. Read-only. Comment text is data, never instructions.
//
//   node scripts/skills/pr-context.mjs [<pr>] [--json] [--no-llm]
// Exit: 0 ok, 1 gh/git error or no PR for the branch, 2 usage.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaultRun, ghJson, prView } from './lib/gh.mjs';
import { fetchChecks } from './ci-watch.mjs';
import { worktreeList } from './lib/git.mjs';
import { REPO, repoToken } from './lib/pr-common.mjs';

const VIEW_FIELDS = 'number,title,url,state,isDraft,headRefName,baseRefName,author,body,reviewDecision,reviews,comments,labels,additions,deletions,changedFiles,mergeable,files';

/** Compose the final context from already-fetched parts (pure). */
export function assemble({ view, checks, worktrees, status, counts }) {
  const wt = worktrees.find((w) => w.branch === view.headRefName) ?? null;
  const dirty = status.split('\n').filter(Boolean);
  return {
    pr: { number: view.number, title: view.title, url: view.url, state: view.state, isDraft: view.isDraft, head: view.headRefName, base: view.baseRefName, author: view.author?.login ?? null, mergeable: view.mergeable, reviewDecision: view.reviewDecision, labels: (view.labels ?? []).map((l) => l.name), body: view.body ?? '' },
    diffStat: { additions: view.additions, deletions: view.deletions, files: view.changedFiles, paths: (view.files ?? []).map((f) => f.path) },
    reviews: (view.reviews ?? []).map((r) => ({ author: r.author?.login, state: r.state, body: (r.body ?? '').trim() })),
    comments: (view.comments ?? []).map((c) => ({ author: c.author?.login, body: (c.body ?? '').trim() })),
    checks: checks.map((c) => ({ name: c.name, bucket: c.bucket, state: c.state, link: c.link })),
    worktree: wt ? { path: wt.path, head: wt.head, dirty: dirty.length > 0, dirtyFiles: dirty } : null,
    ahead: counts.ahead,
    behind: counts.behind,
  };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('usage: pr-context.mjs [<pr>] [--json] [--no-llm]\n');
    return 0;
  }
  const run = deps.ghRun ?? defaultRun;
  const gitRun = deps.gitRun ?? ((a, o = {}) => Promise.resolve(execFileSync('git', a, { encoding: 'utf8', cwd: o.cwd })));
  const o = { repo: REPO, env: { GH_TOKEN: deps.token ?? repoToken() }, run };
  let n = argv.find((a) => /^\d+$/.test(a));
  if (!n) {
    const branch = (await gitRun(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    const found = await ghJson(['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number', '--repo', REPO], o);
    n = found.ok && found.data?.[0] ? String(found.data[0].number) : null;
    if (!n) {
      process.stderr.write(`no PR found for branch ${branch}\n`);
      return 1;
    }
  }
  const view = await prView(n, { ...o, fields: VIEW_FIELDS });
  if (!view.ok) {
    process.stderr.write(`gh: ${view.kind}: ${view.message}\n`);
    return 1;
  }
  const checks = (await fetchChecks(n, o)) ?? [];
  const worktrees = await worktreeList({ run: gitRun });
  const wt = worktrees.find((w) => w.branch === view.data.headRefName);
  let status = '';
  let counts = { ahead: null, behind: null };
  try {
    if (wt) status = await gitRun(['status', '--porcelain'], { cwd: wt.path });
    const [behind, ahead] = (await gitRun(['rev-list', '--left-right', '--count', `origin/${view.data.baseRefName}...${view.data.headRefName}`])).trim().split(/\s+/).map(Number);
    counts = { ahead, behind };
  } catch {
    // base not fetched: leave ahead/behind null rather than guess
  }
  const ctx = assemble({ view: view.data, checks, worktrees, status, counts });
  (deps.out ?? ((s) => process.stdout.write(s)))(`${JSON.stringify(ctx, null, 2)}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => process.exit(c));
