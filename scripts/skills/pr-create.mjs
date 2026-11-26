#!/usr/bin/env node
// `--no-llm` is accepted as a documented no-op: this script never calls an LLM, so a skill step can add it everywhere.
// Guarded draft-PR creation (Phase 151 Theme D). Runs the midnite-pr-create preflight (branch,
// duplicate PR, attribution trailers, tracked SCRATCHPAD.md, base freshness) and then, only with
// `--create`, runs `gh pr create --draft`. It never requests a reviewer and never creates a
// non-draft PR: `buildCreateArgs` refuses both, so a caller cannot opt in by accident.
//
//   node scripts/skills/pr-create.mjs [--base main] [--title T --body-file F] [--create] [--json]
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isTracked, logRange } from './lib/git.mjs';
import { prList } from './lib/gh.mjs';
import { REPO, arg, repoToken, hasTrailer } from './lib/pr-common.mjs';

/** Pure preflight. Returns `{ok, blockers[], warnings[]}`. */
export function evaluate({ branch, base = 'main', existing = [], commits = [], scratchpadTracked = false, behind = 0, pushed = true }) {
  const blockers = [];
  const warnings = [];
  if (!branch) blockers.push('detached HEAD: no branch to open a PR from');
  else if (branch === base || branch === 'main') blockers.push(`on ${branch}: switch to a feature branch first`);
  const dup = existing.find((p) => p.headRefName === branch);
  if (dup) blockers.push(`PR already exists: #${dup.number} ${dup.url}`);
  if (commits.length === 0) blockers.push(`no commits ahead of ${base}`);
  for (const c of commits) {
    if (hasTrailer(`${c.subject}\n${c.body}`)) blockers.push(`attribution trailer in ${String(c.sha).slice(0, 9)}`);
  }
  if (scratchpadTracked) blockers.push('SCRATCHPAD.md is tracked: git rm --cached SCRATCHPAD.md');
  if (behind > 0) warnings.push(`${base} is ${behind} commit(s) ahead of this branch; merge it if the work needs it (never rebase or force-push)`);
  if (!pushed) warnings.push('branch not pushed yet; push before creating');
  return { ok: blockers.length === 0, blockers, warnings };
}

/** Build the `gh pr create` argv. Always a draft; refuses reviewer flags. */
export function buildCreateArgs({ base = 'main', head, title, bodyFile, extra = [] }) {
  if (!title || !bodyFile) throw new Error('pr-create: --title and --body-file are required to create');
  if (extra.some((a) => /^--(reviewer|assignee)|^-[ra]$/.test(a))) throw new Error('pr-create: never request a reviewer on a draft');
  if (extra.some((a) => a === '--no-draft')) throw new Error('pr-create: only draft PRs');
  return ['pr', 'create', '--draft', '--repo', REPO, '--base', base, ...(head ? ['--head', head] : []), '--title', title, '--body-file', bodyFile, ...extra];
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

export async function main(argv = process.argv.slice(2), { ghRun, create = (args, env) => execFileSync('gh', args, { encoding: 'utf8', env: { ...process.env, ...env } }) } = {}) {
  const base = arg(argv, '--base') ?? 'main';
  const token = repoToken();
  const env = token ? { GH_TOKEN: token } : {};
  let branch = '';
  try {
    branch = git('branch', '--show-current');
  } catch {
    branch = '';
  }
  const list = await prList({ state: 'open', fields: 'number,headRefName,url', repo: REPO, run: ghRun, env });
  const commits = await logRange(`origin/${base}..HEAD`);
  const behind = Number(git('rev-list', '--count', `HEAD..origin/${base}`) || 0);
  const result = evaluate({ branch, base, existing: list.ok ? list.data : [], commits, scratchpadTracked: await isTracked('SCRATCHPAD.md'), behind });
  if (!list.ok) result.warnings.push(`could not check for an existing PR (${list.kind}): ${list.message.split('\n')[0]}`);
  let url = null;
  if (argv.includes('--create') && result.ok) {
    url = create(buildCreateArgs({ base, head: branch, title: arg(argv, '--title'), bodyFile: arg(argv, '--body-file') }), env).trim();
  }
  const out = { branch, base, ...result, created: Boolean(url), url };
  process.stdout.write(argv.includes('--json') ? `${JSON.stringify(out, null, 2)}\n` : `${result.ok ? '🟢 ready to create' : '⛔ blocked'}${url ? ` -> ${url}` : ''}\n${[...result.blockers.map((b) => `⛔ ${b}`), ...result.warnings.map((w) => `⚠️ ${w}`)].join('\n')}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => process.exit(c));
