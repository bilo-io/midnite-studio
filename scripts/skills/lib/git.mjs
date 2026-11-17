// NUL-delimited git helpers for the skill scripts (Phase 151 Theme A). Every multi-record read uses
// `-z` / `%x00`; nothing splits on whitespace or newlines of free text. `run` is injectable so tests
// never spawn git: `run(args, {cwd}) => Promise<string>` (stdout), rejecting on a non-zero exit.
import { execFile } from 'node:child_process';

export const defaultRun = (args, { cwd } = {}) =>
  new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve(stdout);
    });
  });

/** `git diff --shortstat` text -> `{files, added, deleted}` (empty text -> zeros). */
export function parseShortstat(text) {
  const n = (re) => Number(re.exec(text)?.[1] ?? 0);
  return { files: n(/(\d+) files? changed/), added: n(/(\d+) insertions?\(\+\)/), deleted: n(/(\d+) deletions?\(-\)/) };
}

export async function shortstat(range, { run = defaultRun, cwd } = {}) {
  const args = ['diff', '--shortstat', ...(range ? [range] : [])];
  return parseShortstat(await run(args, { cwd }));
}

const LOG_FIELDS = ['sha', 'author', 'email', 'date', 'subject', 'body'];
export const LOG_FORMAT = '%H%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%x01';

/** Parse `git log -z`-style output built from LOG_FORMAT (records end in NUL+\x01 sentinel). */
export function parseLog(text) {
  return text
    .split('\x00\x01')
    .map((r) => r.replace(/^\n+/, ''))
    .filter((r) => r.length > 0)
    .map((r) => {
      const parts = r.split('\x00');
      return Object.fromEntries(LOG_FIELDS.map((f, i) => [f, (parts[i] ?? '').trimEnd()]));
    });
}

export async function logRange(range, { run = defaultRun, cwd, max } = {}) {
  const args = ['log', `--format=${LOG_FORMAT}`, ...(max ? [`--max-count=${max}`] : []), range];
  return parseLog(await run(args, { cwd }));
}

/** Parse `git worktree list --porcelain -z` (fields NUL-separated, records end with an empty field). */
export function parseWorktreeList(text) {
  const out = [];
  let cur = null;
  for (const field of text.split('\x00')) {
    if (field === '') {
      if (cur) out.push(cur);
      cur = null;
      continue;
    }
    const sp = field.indexOf(' ');
    const key = sp === -1 ? field : field.slice(0, sp);
    const val = sp === -1 ? true : field.slice(sp + 1);
    cur ??= {};
    if (key === 'worktree') cur.path = val;
    else if (key === 'HEAD') cur.head = val;
    else if (key === 'branch') cur.branch = String(val).replace(/^refs\/heads\//, '');
    else if (key === 'detached') cur.detached = true;
    else if (key === 'bare') cur.bare = true;
    else if (key === 'locked') cur.locked = true;
    else if (key === 'prunable') cur.prunable = true;
  }
  if (cur) out.push(cur);
  return out;
}

export async function worktreeList({ run = defaultRun, cwd } = {}) {
  return parseWorktreeList(await run(['worktree', 'list', '--porcelain', '-z'], { cwd }));
}

/** True when `path` is tracked in the index (so SCRATCHPAD.md checks are exact, not grep). */
export async function isTracked(path, { run = defaultRun, cwd } = {}) {
  const out = await run(['ls-files', '-z', '--', path], { cwd });
  return out.split('\x00').filter(Boolean).length > 0;
}
