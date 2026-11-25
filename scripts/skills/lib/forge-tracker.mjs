// The phase tracker on the forge (Phase 151 Theme G): the GitHub-issue model of docs/TRACKER.md as pure
// functions over an injectable `gh` runner. A phase is an issue titled `Phase N — Title` labelled `phase`
// + a category; each theme a sub-issue `Phase N · Theme X — name`; the narrative lives in the phase body's
// `## Headlines` section; `refined-N` labels stamp refinement; the project board's Status field is the index.
//
// Every async call resolves to an envelope and never throws: `{ok:true, ...}` or
// `{ok:false, kind, message}` (kinds from gh.mjs, plus 'usage' / 'ambiguous'). Writes go through one seam,
// `tracker.write(args)`: with `dryRun` it records the exact gh argv in `tracker.calls` and runs nothing.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { classifyError, defaultRun, ghJson } from './gh.mjs';

export const REPO = 'bilo-io/midnite-studio';
export const CATEGORIES = ['features', 'security', 'issues'];
export const WIP_LABEL = 'wip';
export const PROJECT_ENV = 'MIDNITE_TRACKER_PROJECT';

// ---------------------------------------------------------------- pure: titles, labels, bodies

/** `Phase 154 — Custom agents` / `Phase 154 · Theme A — Shared contract` -> `{phase, theme, name}` (nulls when not a tracker title). */
export function parseTitle(title) {
  const m = /^Phase\s+(\d+)(?:\s*·\s*Theme\s+([A-Z]))?\s*[—–-]\s*(.*)$/.exec(String(title ?? '').trim());
  return m ? { phase: Number(m[1]), theme: m[2] ?? null, name: m[3].trim() } : { phase: null, theme: null, name: String(title ?? '') };
}

export const phaseTitle = (n, name) => `Phase ${n} — ${name}`;
export const themeTitle = (n, letter, name) => `Phase ${n} · Theme ${letter} — ${name}`;

const labelNames = (labels) => (labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);

/** Highest `refined-N` on a label list (0 when unrefined). */
export const refinedCount = (labels) => Math.max(0, ...labelNames(labels).map((l) => Number(/^refined-(\d+)$/.exec(l)?.[1] ?? 0)));

export const categoryOf = (labels) => labelNames(labels).find((l) => CATEGORIES.includes(l)) ?? null;

/** One gh issue row -> the tracker's shape. */
export function toIssue(raw) {
  const t = parseTitle(raw.title);
  const labels = labelNames(raw.labels);
  return {
    number: raw.number,
    id: raw.id ?? null,
    title: raw.title,
    ...t,
    state: String(raw.state ?? '').toLowerCase(),
    labels,
    category: categoryOf(labels),
    refined: refinedCount(labels),
    assignees: (raw.assignees ?? []).map((a) => a?.login ?? a).filter(Boolean),
    wip: labels.includes(WIP_LABEL),
    url: raw.url ?? raw.html_url ?? null,
    body: raw.body ?? undefined,
  };
}

/** Next phase number: highest numbered `Phase N` title + 1 (1 when none). */
export const nextPhaseNumber = (issues) => Math.max(0, ...issues.map((i) => parseTitle(i.title).phase ?? 0)) + 1;

const TASK = /^(\s*[-*]\s+)\[([ xX])\]\s+(.*)$/;
const EXCLUDED = /⏳\s*\*{0,2}\s*deferred|❌\s*\*{0,2}\s*OUT OF SCOPE/i;

/** Count `- [x]` / `- [ ]` items in a body; deferred / out-of-scope items are excluded. */
export function countTasks(body) {
  let done = 0;
  let open = 0;
  let excluded = 0;
  for (const line of String(body ?? '').split('\n')) {
    const m = TASK.exec(line);
    if (!m) continue;
    if (EXCLUDED.test(m[3].slice(0, 60))) excluded++;
    else if (m[2] === ' ') open++;
    else done++;
  }
  return { done, open, excluded, total: done + open };
}

/**
 * Tick the one open task whose text contains `item` (case-insensitive). Refuses (ok:false) on no match or
 * several — a wrong tick is worse than none. An item already ticked is reported as `already`.
 */
export function tickTask(body, item) {
  const needle = String(item ?? '').trim().toLowerCase();
  if (!needle) return { ok: false, kind: 'usage', message: 'empty --item' };
  const lines = String(body ?? '').split('\n');
  const hits = lines.map((l, i) => [i, TASK.exec(l)]).filter(([, m]) => m && m[3].toLowerCase().includes(needle));
  const open = hits.filter(([, m]) => m[2] === ' ');
  if (open.length === 0) return hits.length ? { ok: true, body, ticked: 0, already: true } : { ok: false, kind: 'not-found', message: `no task matches "${item}"` };
  if (open.length > 1) return { ok: false, kind: 'ambiguous', message: `${open.length} open tasks match "${item}": ${open.map(([, m]) => m[3].slice(0, 60)).join(' | ')}` };
  const [i] = open[0];
  lines[i] = lines[i].replace('[ ]', '[x]');
  return { ok: true, body: lines.join('\n'), ticked: 1, line: i + 1 };
}

/**
 * Locate the `## Headlines` section: `{found, start, end, lead, paragraphs:[{theme, text, extra}]}` (line indices;
 * end exclusive). `text` is the `**Theme X …**` paragraph; `extra` holds any plain paragraphs that follow it.
 */
export function parseHeadlines(body) {
  const lines = String(body ?? '').split('\n');
  const start = lines.findIndex((l) => /^##\s+Headlines\s*$/.test(l));
  if (start === -1) return { found: false, start: -1, end: -1, lead: '', paragraphs: [] };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^#{1,2}\s/.test(lines[i])) { end = i; break; }
  const paras = lines.slice(start + 1, end).join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const paragraphs = [];
  const lead = [];
  for (const p of paras) {
    const t = /^\*\*Theme\s+([A-Z])\b/.exec(p);
    if (t) paragraphs.push({ theme: t[1], text: p, extra: [] });
    else if (paragraphs.length === 0) lead.push(p);
    else paragraphs[paragraphs.length - 1].extra.push(p);
  }
  return { found: true, start, end, lead: lead.join('\n\n'), paragraphs };
}

function renderSection({ lead, paragraphs }) {
  return ['## Headlines', '', ...[lead, ...paragraphs.flatMap((p) => [p.text, ...(p.extra ?? [])])].filter(Boolean).flatMap((p) => [p, ''])];
}

/** Replace the whole `## Headlines` section with `section` (which may omit the heading). Appends one when absent. */
export function replaceHeadlines(body, section) {
  const text = String(section).trim().replace(/^##\s+Headlines\s*\n+/, '');
  const h = parseHeadlines(body);
  const block = ['## Headlines', '', text, ''];
  const lines = String(body ?? '').split('\n');
  if (!h.found) return `${String(body ?? '').trimEnd()}\n\n${block.join('\n')}`;
  return [...lines.slice(0, h.start), ...block, ...lines.slice(h.end)].join('\n');
}

/**
 * Replace theme `letter`'s paragraph in the Headlines section (inserting it in letter order when absent).
 * `text` should start `**Theme X — …**`; a bare sentence gets no heading added — the wording is the agent's.
 */
export function replaceThemeParagraph(body, letter, text) {
  const h = parseHeadlines(body);
  if (!h.found) return { ok: false, kind: 'not-found', message: 'no `## Headlines` section in the body' };
  const old = h.paragraphs.find((p) => p.theme === letter);
  const paragraphs = h.paragraphs.filter((p) => p !== old);
  const at = paragraphs.findIndex((p) => p.theme > letter);
  // Plain paragraphs that followed the old one (a trailing note, say) stay where they were.
  const next = { theme: letter, text: String(text).trim(), extra: old?.extra ?? [] };
  if (at === -1) paragraphs.push(next);
  else paragraphs.splice(at, 0, next);
  const lines = String(body).split('\n');
  return { ok: true, replaced: h.paragraphs.some((p) => p.theme === letter), body: [...lines.slice(0, h.start), ...renderSection({ lead: h.lead, paragraphs }), ...lines.slice(h.end)].join('\n') };
}

/** `Blocked by #12` / `**Depends on:** #12, #13 and #14` -> [12, 13, 14]. */
export function blockerRefs(body) {
  const out = new Set();
  for (const m of String(body ?? '').matchAll(/\b(?:blocked by|depends on)[\s:*]*(#\d+(?:\s*(?:,|&|and)\s*#\d+)*)/gi)) for (const r of m[1].matchAll(/#(\d+)/g)) out.add(Number(r[1]));
  return [...out];
}

/** Issue numbers an open PR closes or names (`closingIssuesReferences`, or `Closes|Fixes|Resolves #n` in its body). */
export function claimedByPrs(prs) {
  const out = new Map();
  for (const pr of prs ?? []) {
    const refs = new Set((pr.closingIssuesReferences ?? []).map((r) => r.number));
    for (const m of String(pr.body ?? '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)) refs.add(Number(m[1]));
    for (const n of refs) out.set(n, pr.number);
  }
  return out;
}

/** Pure: open, unclaimed, unblocked themes of open phases. `openNumbers` = every open issue number (for blockers). */
export function pickCandidates({ phases, prs = [], openNumbers = new Set() }) {
  const inPr = claimedByPrs(prs);
  const rows = [];
  for (const p of phases) {
    if (p.state !== 'open') continue;
    const phaseBlockers = blockerRefs(p.body).filter((n) => openNumbers.has(n) && n !== p.number);
    for (const t of p.themes ?? []) {
      if (t.state !== 'open') continue;
      const blockedBy = [...phaseBlockers, ...blockerRefs(t.body).filter((n) => openNumbers.has(n) && n !== t.number)];
      const why = t.wip || t.assignees.length ? 'claimed' : inPr.has(t.number) ? `in PR #${inPr.get(t.number)}` : blockedBy.length ? `blocked by ${blockedBy.map((n) => `#${n}`).join(', ')}` : null;
      rows.push({ phase: p.phase, phaseIssue: p.number, category: p.category, theme: t.theme, number: t.number, name: t.name, available: !why, why: why ?? 'ready' });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- the tracker (gh-backed)

/** Write `text` to a fresh temp file and return its path (bodies go to gh as `--body-file`, so dry-run argv stays exact). */
export function defaultTmpFile(text, name = 'body.md') {
  const dir = mkdtempSync(join(tmpdir(), 'tracker-'));
  const file = join(dir, name);
  writeFileSync(file, text);
  return file;
}

/** `Promise.all` over `items` with at most `limit` in flight — one gh process per phase would trip the rate limiter. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const GH_CONCURRENCY = 6;

const envelopeError = (e) => {
  const message = String(e?.stderr || e?.message || e).trim();
  return { ok: false, kind: classifyError(message), message };
};

/**
 * `createTracker({run, repo, env, dryRun, tmpFile})`. `run(args, {env}) => Promise<string>` is gh.
 * Reads always run (dry-run included); writes go through `write` and are recorded in `calls`.
 */
export function createTracker({ run = defaultRun, repo = REPO, env, dryRun = false, tmpFile = defaultTmpFile } = {}) {
  const [owner] = repo.split('/');
  const calls = [];
  const json = (args) => ghJson(args, { run, env });
  const R = ['--repo', repo];

  async function write(args, { placeholder = '' } = {}) {
    calls.push(args);
    if (dryRun) return { ok: true, dryRun: true, out: placeholder };
    try {
      return { ok: true, out: String(await run(args, { env })).trim() };
    } catch (e) {
      return envelopeError(e);
    }
  }

  async function listPhases({ state = 'all', withBody = false } = {}) {
    const fields = `number,title,state,labels,assignees,url${withBody ? ',body' : ''}`;
    const r = await json(['issue', 'list', ...R, '--label', 'phase', '--state', state, '--limit', '1000', '--json', fields]);
    if (!r.ok) return r;
    return { ok: true, phases: (r.data ?? []).map(toIssue).filter((p) => p.phase != null).sort((a, b) => b.phase - a.phase) };
  }

  async function next() {
    const r = await listPhases();
    return r.ok ? { ok: true, next: nextPhaseNumber(r.phases) } : r;
  }

  async function subIssues(n) {
    const r = await json(['api', '--paginate', '--slurp', `repos/${repo}/issues/${n}/sub_issues?per_page=100`]);
    if (!r.ok) return r;
    return { ok: true, themes: (r.data ?? []).flat().map(toIssue).sort((a, b) => String(a.theme).localeCompare(String(b.theme))) };
  }

  async function issue(n) {
    const r = await json(['issue', 'view', String(n), ...R, '--json', 'number,title,body,state,labels,assignees,url']);
    return r.ok ? { ok: true, issue: toIssue(r.data) } : r;
  }

  /** Phase issue + its theme sub-issues + progress (closed themes, and task counts across theme bodies). */
  async function readPhase(n) {
    const [i, s] = await Promise.all([issue(n), subIssues(n)]);
    if (!i.ok) return i;
    if (!s.ok) return s;
    const tasks = s.themes.reduce((a, t) => { const c = countTasks(t.body); return { done: a.done + c.done, total: a.total + c.total }; }, { done: 0, total: 0 });
    const closed = s.themes.filter((t) => t.state === 'closed').length;
    return { ok: true, phase: { ...i.issue, themes: s.themes, progress: { themesDone: closed, themes: s.themes.length, tasksDone: tasks.done, tasks: tasks.total }, headlines: parseHeadlines(i.issue.body) } };
  }

  /** Phase issue by phase number (not issue number). */
  async function findPhase(phaseNo) {
    const r = await listPhases();
    if (!r.ok) return r;
    const hit = r.phases.find((p) => p.phase === Number(phaseNo));
    return hit ? { ok: true, number: hit.number, phase: hit } : { ok: false, kind: 'not-found', message: `no issue titled "Phase ${phaseNo} — …"` };
  }

  /** Every phase with progress; sub-issues are fetched only for open phases (closed ones are done by definition). */
  async function index({ state = 'all' } = {}) {
    const r = await listPhases({ state });
    if (!r.ok) return r;
    const rows = await mapLimit(
      r.phases,
      GH_CONCURRENCY,
      async (p) => {
        if (p.state !== 'open') return { ...p, themesDone: null, themes: null };
        const s = await subIssues(p.number);
        const themes = s.ok ? s.themes : [];
        return { ...p, themesDone: themes.filter((t) => t.state === 'closed').length, themes: themes.length, wipThemes: themes.filter((t) => t.state === 'open' && (t.wip || t.assignees.length)).map((t) => t.theme), todoThemes: themes.filter((t) => t.state === 'open' && !t.wip && !t.assignees.length).map((t) => t.theme) };
      },
    );
    return { ok: true, phases: rows };
  }

  async function candidates() {
    const [ph, prs, open] = await Promise.all([
      listPhases({ state: 'open', withBody: true }),
      json(['pr', 'list', ...R, '--state', 'open', '--limit', '200', '--json', 'number,body,closingIssuesReferences']),
      json(['issue', 'list', ...R, '--state', 'open', '--limit', '1000', '--json', 'number']),
    ]);
    if (!ph.ok) return ph;
    const phases = await mapLimit(ph.phases, GH_CONCURRENCY, async (p) => { const s = await subIssues(p.number); return { ...p, themes: s.ok ? s.themes : [] }; });
    const openNumbers = new Set(open.ok ? (open.data ?? []).map((i) => i.number) : []);
    return { ok: true, candidates: pickCandidates({ phases, prs: prs.ok ? prs.data ?? [] : [], openNumbers }), notes: [prs.ok ? null : `open PRs unreadable (${prs.kind})`, open.ok ? null : `open issues unreadable (${open.kind})`].filter(Boolean) };
  }

  async function editBody(n, body) {
    return write(['issue', 'edit', String(n), ...R, '--body-file', tmpFile(body, `issue-${n}.md`)]);
  }

  /** Create a label when missing; an existing one (any colour) is left as it is. */
  async function ensureLabel(name, { color = 'ededed', description = '' } = {}) {
    const r = await write(['label', 'create', name, ...R, '--color', color, '--description', description]);
    return !r.ok && /already exists/i.test(r.message) ? { ok: true, existed: true } : r;
  }

  /** `gh issue create` prints the new issue's URL; the number is its last path segment. */
  const numberFromUrl = (out) => Number(/\/issues\/(\d+)\s*$/.exec(out ?? '')?.[1] ?? NaN);

  /** The numeric database id that `sub_issues` takes (not the issue number). */
  async function databaseId(n) {
    if (dryRun && typeof n !== 'number') return { ok: true, id: `<id of ${n}>` };
    const r = await json(['api', `repos/${repo}/issues/${n}`, '--jq', '{id: .id}']);
    return r.ok ? { ok: true, id: r.data?.id } : r;
  }

  async function linkSubIssue(parent, child) {
    const id = await databaseId(child);
    if (!id.ok) return id;
    return write(['api', `repos/${repo}/issues/${parent}/sub_issues`, '-X', 'POST', '-F', `sub_issue_id=${id.id}`]);
  }

  /**
   * File a phase and its themes: `{title, category, body, themes:[{title, body}]}`. Titles are used as given;
   * each theme is created, then linked as a sub-issue. Dry-run numbers are placeholders (`<phase>`, `<theme 1>`).
   */
  async function file({ title, category, body, themes = [] }) {
    if (!CATEGORIES.includes(category)) return { ok: false, kind: 'usage', message: `category must be one of ${CATEGORIES.join('/')}` };
    if (parseTitle(title).phase == null) return { ok: false, kind: 'usage', message: `phase title must read "Phase N — Title", got "${title}"` };
    const p = await write(['issue', 'create', ...R, '--title', title, '--label', `phase,${category}`, '--body-file', tmpFile(body, 'phase.md')], { placeholder: '/issues/<phase>' });
    if (!p.ok) return p;
    const phaseNo = dryRun ? '<phase>' : numberFromUrl(p.out);
    const filed = [];
    for (const [i, t] of themes.entries()) {
      if (parseTitle(t.title).theme == null) return { ok: false, kind: 'usage', message: `theme title must read "Phase N · Theme X — name", got "${t.title}"`, phase: phaseNo, themes: filed };
      const c = await write(['issue', 'create', ...R, '--title', t.title, '--label', 'theme', '--body-file', tmpFile(t.body, `theme-${i + 1}.md`)], { placeholder: `/issues/<theme ${i + 1}>` });
      if (!c.ok) return { ...c, phase: phaseNo, themes: filed };
      const childNo = dryRun ? `<theme ${i + 1}>` : numberFromUrl(c.out);
      const l = await linkSubIssue(phaseNo, childNo);
      if (!l.ok) return { ...l, phase: phaseNo, themes: filed };
      filed.push({ number: childNo, title: t.title });
    }
    return { ok: true, phase: phaseNo, themes: filed };
  }

  /** Claim a theme (or phase): assign the current user and add the `wip` label. */
  async function claim(n) {
    const l = await ensureLabel(WIP_LABEL, { color: 'fbca04', description: 'Claimed: a session is building this' });
    if (!l.ok) return l;
    return write(['issue', 'edit', String(n), ...R, '--add-assignee', '@me', '--add-label', WIP_LABEL]);
  }

  async function tick(n, item) {
    const i = await issue(n);
    if (!i.ok) return i;
    const t = tickTask(i.issue.body, item);
    if (!t.ok) return t;
    if (!t.ticked) return { ok: true, already: true, number: n };
    const w = await editBody(n, t.body);
    return w.ok ? { ok: true, number: n, line: t.line } : w;
  }

  /** Replace one theme paragraph (or, with `theme` null, the whole section) in the phase issue's Headlines. */
  async function headlines(phaseIssue, { theme = null, text }) {
    const i = await issue(phaseIssue);
    if (!i.ok) return i;
    const r = theme ? replaceThemeParagraph(i.issue.body, theme, text) : { ok: true, body: replaceHeadlines(i.issue.body, text) };
    if (!r.ok) return r;
    const w = await editBody(phaseIssue, r.body);
    return w.ok ? { ok: true, number: phaseIssue, theme, replaced: r.replaced ?? true } : w;
  }

  /** Swap `refined-<N-1>` (any `refined-*`) for `refined-N`, N = current + 1. */
  async function refineStamp(phaseIssue) {
    const i = await issue(phaseIssue);
    if (!i.ok) return i;
    const nextN = i.issue.refined + 1;
    const label = `refined-${nextN}`;
    const l = await ensureLabel(label, { color: 'c5def5', description: `Phase refined ${nextN}×` });
    if (!l.ok) return l;
    const old = i.issue.labels.filter((x) => /^refined-\d+$/.test(x));
    const w = await write(['issue', 'edit', String(phaseIssue), ...R, ...old.flatMap((o) => ['--remove-label', o]), '--add-label', label]);
    return w.ok ? { ok: true, number: phaseIssue, refined: nextN, label } : w;
  }

  /** Close an issue (dropping `wip` first when it carries it), with an optional comment. */
  async function close(n, { comment } = {}) {
    const i = await issue(n);
    if (!i.ok) return i;
    if (i.issue.wip) {
      const u = await write(['issue', 'edit', String(n), ...R, '--remove-label', WIP_LABEL]);
      if (!u.ok) return u;
    }
    const w = await write(['issue', 'close', String(n), ...R, ...(comment ? ['--comment', comment] : [])]);
    return w.ok ? { ok: true, number: n } : w;
  }

  /**
   * Resolve the project board. Order: explicit `project` (number) > the issue's existing project item >
   * `$MIDNITE_TRACKER_PROJECT`. More than one board holding the issue, or none of the above, is 'ambiguous'
   * rather than a guess — the caller passes `--project N`.
   */
  async function resolveProject(n, { project, envProject = process.env[PROJECT_ENV] } = {}) {
    if (project != null) return { ok: true, project: Number(project), source: 'flag' };
    const r = await json(['issue', 'view', String(n), ...R, '--json', 'projectItems']);
    if (!r.ok) return r;
    const items = r.data?.projectItems ?? [];
    if (items.length > 1) return { ok: false, kind: 'ambiguous', message: `#${n} is on ${items.length} boards (${items.map((p) => p.title).join(', ')}); pass --project N` };
    if (items.length === 1) {
      const l = await json(['project', 'list', '--owner', owner, '--format', 'json']);
      const hit = l.ok ? (l.data?.projects ?? []).find((p) => p.title === items[0].title) : null;
      if (hit) return { ok: true, project: hit.number, source: 'issue' };
    }
    if (envProject) return { ok: true, project: Number(envProject), source: 'env' };
    return { ok: false, kind: 'ambiguous', message: `#${n} is on no project board; pass --project N or set ${PROJECT_ENV}` };
  }

  /** Set the Status single-select on the board card for issue `n` (adding the card when missing). */
  async function board(n, status, { project, envProject } = {}) {
    const p = await resolveProject(n, { project, envProject });
    if (!p.ok) return p;
    const [view, fields] = await Promise.all([
      json(['project', 'view', String(p.project), '--owner', owner, '--format', 'json']),
      json(['project', 'field-list', String(p.project), '--owner', owner, '--format', 'json']),
    ]);
    if (!view.ok) return view;
    if (!fields.ok) return fields;
    const field = (fields.data?.fields ?? []).find((f) => f.name === 'Status');
    if (!field) return { ok: false, kind: 'not-found', message: `project ${p.project} has no Status field` };
    const option = (field.options ?? []).find((o) => o.name.toLowerCase() === String(status).toLowerCase());
    if (!option) return { ok: false, kind: 'usage', message: `Status "${status}" is not one of: ${(field.options ?? []).map((o) => o.name).join(', ')}` };
    const add = await write(['project', 'item-add', String(p.project), '--owner', owner, '--url', `https://github.com/${repo}/issues/${n}`, '--format', 'json'], { placeholder: '{"id":"<item>"}' });
    if (!add.ok) return add;
    let itemId = '<item>';
    if (!dryRun) {
      try {
        itemId = JSON.parse(add.out).id;
      } catch {
        return { ok: false, kind: 'error', message: `unexpected item-add output: ${add.out}` };
      }
    }
    const e = await write(['project', 'item-edit', '--id', itemId, '--project-id', view.data.id, '--field-id', field.id, '--single-select-option-id', option.id]);
    return e.ok ? { ok: true, number: n, project: p.project, projectSource: p.source, status: option.name } : e;
  }

  /** Closed theme sub-issues in a `closed:` search window (`2026-11-17` or `2026-11-01..2026-11-07`). */
  async function closedThemes(search) {
    const r = await json(['issue', 'list', ...R, '--label', 'theme', '--state', 'closed', '--search', `closed:${search}`, '--limit', '500', '--json', 'number,title,closedAt']);
    return r.ok ? { ok: true, themes: (r.data ?? []).map((t) => ({ ...parseTitle(t.title), number: t.number, closedAt: t.closedAt })) } : r;
  }

  return { calls, dryRun, repo, write, listPhases, next, subIssues, issue, readPhase, findPhase, index, candidates, editBody, file, claim, tick, headlines, refineStamp, close, resolveProject, board, closedThemes, linkSubIssue, databaseId };
}
