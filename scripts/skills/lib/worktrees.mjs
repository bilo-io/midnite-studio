// Worktree rows for the sitrep (Phase 151 Theme I): agents that have a worktree and a SCRATCHPAD.md but no PR yet.
// Pure parsers plus `gatherWorktrees`, whose git/gh runners, fs and state store are injectable so tests spawn nothing.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ghJson } from './gh.mjs';
import { defaultRun as gitRun, parseShortstat } from './git.mjs';

const section = (md, name) => {
  const m = new RegExp(`^##\\s+${name}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'im').exec(md);
  return m ? m[1] : '';
};

/** `## Todo` checklist -> `{ticked, total, firstOpen}`. Empty `- [ ]` placeholders do not count. */
export function parseTodo(md) {
  let ticked = 0;
  let total = 0;
  let firstOpen = null;
  for (const line of section(md, 'Todo').split('\n')) {
    const m = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/.exec(line);
    if (!m || !m[2].trim()) continue;
    total += 1;
    if (m[1] === ' ') firstOpen ??= m[2].trim();
    else ticked += 1;
  }
  return { ticked, total, firstOpen };
}

/** First non-blank line of `## Next`, or null. */
export function parseNext(md) {
  const l = section(md, 'Next').split('\n').map((x) => x.replace(/^\s*[-*]\s+/, '').trim()).find(Boolean);
  return l ?? null;
}

/** Progress for a row with no PR: 10 + 40 x ticked/total, rounded to 10 (a PR takes over from 60). */
export function worktreeProgress({ ticked, total }) {
  if (!total) return 10;
  return Math.round((10 + (40 * ticked) / total) / 10) * 10;
}

/** Sum two shortstat results (committed + uncommitted). */
export const addStats = (a, b) => ({ files: a.files + b.files, added: a.added + b.added, deleted: a.deleted + b.deleted });

/**
 * Stalled = the same Todo count and commit on this run as on the previous one. `prev` is the saved state for the
 * slug (`{sig, seen}`); returns the next state and the verdict.
 */
export function stallCheck(prev, sig) {
  const seen = prev?.sig === sig ? (prev.seen ?? 1) + 1 : 1;
  return { state: { sig, seen }, stalled: seen >= 2 };
}

export const stateFile = () => join(process.env.TMPDIR || tmpdir(), 'midnite-sitrep-worktrees.json');

function loadState(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * One raw sitrep row per `<dir>/*` worktree that has a SCRATCHPAD.md and no PR on its branch.
 * @param {{dir:string, run?:Function, gh?:Function, read?:Function, list?:Function, statePath?:string|null}} o
 */
export async function gatherWorktrees({ dir, run = gitRun, gh = undefined, read = (p) => readFileSync(p, 'utf8'), list = (d) => readdirSync(d), statePath = stateFile() } = {}) {
  let slugs = [];
  try {
    slugs = list(dir).sort();
  } catch {
    return [];
  }
  const prev = statePath ? loadState(statePath) : {};
  const next = {};
  const rows = [];
  for (const slug of slugs) {
    const cwd = join(dir, slug);
    let md;
    try {
      md = read(join(cwd, 'SCRATCHPAD.md'));
    } catch {
      continue;
    }
    const branch = (await run(['symbolic-ref', '-q', '--short', 'HEAD'], { cwd }).catch(() => '')).trim();
    if (branch) {
      const pr = await ghJson(['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number', '--limit', '1'], { run: gh, cwd });
      if (pr.ok && pr.data?.length) continue; // a PR row covers it
    }
    const stat = async (args) => parseShortstat(await run(['diff', '--shortstat', ...args], { cwd }).catch(() => ''));
    const diff = addStats(await stat(['origin/main...HEAD']), await stat(['HEAD']));
    const head = (await run(['rev-parse', 'HEAD'], { cwd }).catch(() => '')).trim();
    const todo = parseTodo(md);
    const doing = todo.firstOpen ?? parseNext(md);
    const { state, stalled } = stallCheck(prev[slug], `${todo.ticked}/${todo.total}@${head}`);
    next[slug] = state;
    rows.push({
      task: slug,
      label: slug,
      branch,
      progress: worktreeProgress(todo),
      additions: diff.added,
      deletions: diff.deleted,
      changedFiles: diff.files,
      status: stalled ? '⚠️ stalled' : '🚧 building',
      note: stalled ? `stalled: ${doing ?? 'no change'}` : doing,
      worktree: cwd,
    });
  }
  if (statePath) {
    try {
      writeFileSync(statePath, JSON.stringify(next));
    } catch {
      /* state is best effort */
    }
  }
  return rows;
}
