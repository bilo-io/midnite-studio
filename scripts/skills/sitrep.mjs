#!/usr/bin/env node
// Sitrep renderer CLI (Phase 151 Theme B). Replaces the LLM rendering of the `midnite-sitrep-*` skills
// with deterministic code: the model only gathers (or this script does, through `gh`), then pipes rows in.
//
//   node scripts/skills/sitrep.mjs <view> [--pr 12,13 | --input rows.json | (open PRs)] [--repo o/r]
//        [--cap N] [--target <task|#n>] [--metric diff,ci,age,stage] [--since ISO] [--now ISO]
//        [--log-failed] [--no-llm] [--no-num] [--json]
//   views: table | graph | timeline | histogram | sequence | ci | all
//
// Rows are `gh pr view --json …` objects (plus optional extras, see `normalizeRow`) or already-normalised
// rows. Every renderer is a pure function of rows + `now`, exported for tests. Ollama is optional:
// Notes and CI log lines fall back to deterministic text under `--no-llm`, an unreachable daemon, etc.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { bar, diffCell, duration, mdTable } from './lib/format.mjs';
import { defaultRun as ghRun, ghJson, prChecks, prList, prView, runList } from './lib/gh.mjs';
import { isNoLlm, run as llm } from './lib/ollama.mjs';

export const MACOS_CAP = 5;
export const BILLING_RE = /Actions budget is preventing|job was not started because|spending limit/i;
const EFFORT_MIN = { S: 60, M: 120, L: 240 };

// ───────────────────────── small helpers ─────────────────────────
const ms = (iso) => (iso ? Date.parse(iso) : NaN);
const hhmmZ = (t) => `${new Date(t).toISOString().slice(11, 16)}Z`;
const words = (s, n) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, n)
    .join(' ')
    .replace(/[.,;:]+$/, '');
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const minutes = (a, b) => Math.max(0, Math.round((b - a) / 60000));
const fmtEta = (m) => (m < 60 ? `~${Math.max(1, Math.round(m))}m` : m < 600 ? `~${Math.round((m / 60) * 2) / 2}h`.replace('.5h', 'h30') : `~${Math.round(m / 60)}h`);
const short = (sec) => duration(Math.round(sec)).replace(/(\d+m)00s$/, '$1');
const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].length));
const padL = (s, n) => ' '.repeat(Math.max(0, n - [...s].length)) + s;

// ───────────────────────── normalise ─────────────────────────
/** Roll a `statusCheckRollup` up: `{total, passed, failed, pending, skipped, failing:[names]}`. Skips do not count toward `total`. */
export function rollupChecks(rollup = []) {
  const r = { total: 0, passed: 0, failed: 0, pending: 0, skipped: 0, failing: [] };
  for (const c of rollup ?? []) {
    const concl = String(c.conclusion ?? c.state ?? '').toUpperCase();
    const status = String(c.status ?? '').toUpperCase();
    if (['SKIPPED', 'NEUTRAL'].includes(concl)) {
      r.skipped++;
      continue;
    }
    r.total++;
    if (['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE', 'ACTION_REQUIRED'].includes(concl)) {
      r.failed++;
      r.failing.push(c.name ?? c.context ?? 'check');
    } else if (concl === 'SUCCESS') r.passed++;
    else if (status && status !== 'COMPLETED') r.pending++;
    else if (['PENDING', 'EXPECTED'].includes(concl) || !concl) r.pending++;
    else r.passed++;
  }
  return r;
}

/**
 * Turn a raw row into the shape every view reads. Accepts `gh pr view --json` fields plus optional extras:
 * `task` (row name), `label` (<=3 words), `effort` S|M|L, `deps` (numbers/labels), `progress`, `etaMin`,
 * `note`, `tags[]`, `status` (no-PR rows), `paths[]` or `files:[{path}]`, `runs[]`, `checks[]`, `events[]`,
 * `repo`, `launchedAt`, `readyAt`, `stageSince`, `failLogs{job:text}`.
 */
export function normalizeRow(raw, i = 0) {
  const author = raw.author?.login ?? raw.author ?? null;
  const paths = raw.paths ?? (Array.isArray(raw.files) ? raw.files.map((f) => f.path ?? f) : []);
  const body = String(raw.body ?? '');
  const bodyDeps = [...body.matchAll(/depends on\s+#(\d+)/gi)].map((m) => Number(m[1]));
  const merged = raw.state === 'MERGED' || Boolean(raw.mergedAt);
  return {
    i,
    raw,
    number: raw.number ?? null,
    url: raw.url ?? null,
    task: raw.task ?? (raw.number ? `#${raw.number}` : (raw.branch ?? `row-${i + 1}`)),
    label: raw.label ?? words(String(raw.title ?? '').replace(/^\w+(\([^)]*\))?!?:\s*/, ''), 3),
    title: raw.title ?? '',
    repo: raw.repo ?? '',
    author: author ? String(author).replace(/^@/, '') : null,
    isDraft: Boolean(raw.isDraft),
    merged,
    closed: raw.state === 'CLOSED',
    createdAt: ms(raw.createdAt),
    mergedAt: ms(raw.mergedAt),
    updatedAt: ms(raw.updatedAt),
    base: raw.baseRefName ?? raw.base ?? 'main',
    head: raw.headRefName ?? raw.head ?? null,
    headSha: raw.headRefOid ?? raw.headSha ?? null,
    mergeable: raw.mergeable ?? null,
    review: raw.reviewDecision ?? '',
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    files: raw.changedFiles ?? paths.length ?? 0,
    paths,
    ci: rollupChecks(raw.statusCheckRollup),
    deps: [...(raw.deps ?? []), ...bodyDeps],
    effort: raw.effort ?? 'M',
    progress: raw.progress ?? null,
    etaMin: raw.etaMin ?? null,
    note: raw.note ?? null,
    tags: raw.tags ?? [],
    status: raw.status ?? null,
    checks: raw.checks ?? [],
    runs: raw.runs ?? [],
    events: raw.events ?? [],
    launchedAt: ms(raw.launchedAt),
    readyAt: ms(raw.readyAt),
    stageSince: ms(raw.stageSince),
    failLogs: raw.failLogs ?? {},
  };
}

export const normalizeAll = (raws) => raws.map(normalizeRow);
const hasPr = (r) => r.number != null;

/** Progress percent per the sitrep scale (0 none · 60 draft · 70 ready+CI running · 80 green · 100 merged). */
export function progressOf(r) {
  if (r.progress != null) return r.progress;
  if (r.merged) return 100;
  if (!hasPr(r)) return 0;
  if (r.isDraft) return 60;
  return r.ci.pending || r.ci.failed ? 70 : 80;
}

/** The row's hard dependencies as indexes into `rows` (stacked base, explicit deps, `Depends on #n`). */
export function hardDeps(rows) {
  const byNum = new Map(rows.filter(hasPr).map((r) => [r.number, r]));
  const byLabel = new Map(rows.map((r) => [r.task, r]));
  const byHead = new Map(rows.filter((r) => r.head).map((r) => [r.head, r]));
  const out = new Map();
  for (const r of rows) {
    const set = new Set();
    const base = byHead.get(r.base);
    if (base && base !== r) set.add(base);
    for (const d of r.deps) {
      const t = typeof d === 'number' ? byNum.get(d) : (byLabel.get(d) ?? byNum.get(Number(String(d).replace('#', ''))));
      if (t && t !== r) set.add(t);
    }
    out.set(r, [...set]);
  }
  return out;
}

const statusOf = (r, deps) => {
  const stacked = (deps.get(r) ?? []).filter((d) => hasPr(d) && !d.merged && d.head === r.base);
  let s;
  if (r.merged) s = '🟣 Merged';
  else if (!hasPr(r)) s = r.status ?? (progressOf(r) > 0 ? '🚧 building' : '⬜ not started');
  else if (r.mergeable === 'CONFLICTING') s = '🔴 Conflict';
  else if (r.ci.failed) s = '🔴 CI failing';
  else if (r.review === 'CHANGES_REQUESTED') s = '💬 Changes requested';
  else if (r.isDraft) s = '🚧 Draft';
  else if (r.ci.pending) s = '🟡 CI running';
  else s = '🟢 Ready';
  const parts = [s];
  if (r.ci.total && hasPr(r)) parts.push(`CI ${r.ci.passed}/${r.ci.total}`);
  for (const d of stacked) parts.push(`⛓ #${d.number}`);
  parts.push(...r.tags);
  return parts.join(' · ');
};

/** ETA text from observed pace: elapsed against percent so far. */
export function etaOf(r, now) {
  const p = progressOf(r);
  if (r.merged || p >= 100) return 'done';
  if (r.etaMin != null) return fmtEta(r.etaMin);
  const waitingOnHuman = hasPr(r) && !r.isDraft && !r.ci.pending && !r.ci.failed;
  if (waitingOnHuman || !Number.isFinite(r.createdAt) || p <= 0) return '?';
  return fmtEta((minutes(r.createdAt, now) * (100 - p)) / p);
}

// ───────────────────────── notes (LLM optional) ─────────────────────────
const signalOf = (r) => {
  if (r.note) return r.note;
  if (r.merged) return null;
  if (r.mergeable === 'CONFLICTING') return 'merge conflict with base';
  if (r.ci.failed) return `${r.ci.failing.slice(0, 2).join(' and ')} failing`;
  if (r.review === 'CHANGES_REQUESTED') return 'changes requested by reviewer';
  return null;
};

/** One six-word note per row. Deterministic unless a signal exists and Ollama answers. */
export async function notesFor(rows, { noLlm = false, fetch, url } = {}) {
  return Promise.all(
    rows.map(async (r) => {
      const signal = signalOf(r);
      if (!signal) return '—';
      if (r.note) return words(r.note, 6) || '—';
      const res = await llm({
        task: 'note',
        noLlm,
        fetch,
        url,
        prompt: `Write a status note of at most six words, no punctuation at the end, no emoji.\nPR title: ${r.title}\nSignal: ${signal}\nNote:`,
        fallback: () => signal,
      });
      return words(String(res.text).split('\n')[0], 6) || '—';
    }),
  );
}

// ───────────────────────── view: table ─────────────────────────
const taskCell = (r) => (r.url ? `[${r.task === `#${r.number}` ? r.task : `${r.task} · #${r.number}`}](${r.url})` : `\`${r.task}\``);
const progressCell = (r) => (progressOf(r) >= 100 ? '✅ 100%' : `\`${bar(progressOf(r))}\` ${progressOf(r)}%`);

export function renderTable(rows, { now = Date.now(), notes, num = true } = {}) {
  const deps = hardDeps(rows);
  const headers = [...(num ? ['#'] : []), 'Task', 'Author', 'Progress', 'ETA', 'Diff', 'Status', 'Notes'];
  const body = rows.map((r, i) => [
    ...(num ? [i + 1] : []),
    taskCell(r),
    r.author ? `@${r.author}` : '—',
    progressCell(r),
    etaOf(r, now),
    diffCell({ added: r.additions, deleted: r.deletions, files: r.files }),
    statusOf(r, deps),
    notes?.[i] ?? '—',
  ]);
  const mean = rows.length ? Math.round(rows.reduce((s, r) => s + progressOf(r), 0) / rows.length) : 0;
  const etas = rows.map((r) => etaOf(r, now));
  const merged = rows.filter((r) => r.merged).length;
  const inReview = rows.filter((r) => hasPr(r) && !r.merged && !r.isDraft).length;
  const open = etas.filter((e) => e !== 'done');
  const allDone = !open.length ? 'done' : open.includes('?') ? '~?' : fmtEta(Math.max(...open.map((e) => etaMin(e))));
  const waiting = rows.some((r) => hasPr(r) && !r.merged && !r.isDraft && !r.ci.pending && !r.ci.failed) ? ', waiting on review' : '';
  return `${mdTable(headers, body)}\n\n${bar(mean, 20)} ${mean}% overall · ${merged}/${rows.length} merged · ${inReview} in review · all done ${allDone}${waiting}`;
}

function etaMin(text) {
  const m = /~(\d+(?:\.\d+)?)h(?:(\d+))?|~(\d+)m/.exec(text);
  if (!m) return 0;
  return m[3] ? Number(m[3]) : Number(m[1]) * 60 + (m[2] ? Number(m[2]) : m[0].includes('.5') ? 0 : 0);
}

// ───────────────────────── view: graph ─────────────────────────
/** Soft edges: unmerged rows that touch the same paths and are not already hard-related. */
export function softEdges(rows, deps) {
  const edges = [];
  const related = (a, b) => (deps.get(a) ?? []).includes(b) || (deps.get(b) ?? []).includes(a);
  const live = rows.filter((r) => !r.merged && r.paths.length);
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      if (related(live[i], live[j])) continue;
      const shared = live[i].paths.filter((p) => live[j].paths.includes(p));
      if (shared.length) edges.push({ a: live[i], b: live[j], files: shared });
    }
  return edges;
}

const abbrevFiles = (files) => {
  const names = [...new Set(files.map((f) => f.replace(/^.*\//, '').replace(/\.[^.]+$/, '')))];
  return names.slice(0, 2).join(' · ') + (names.length > 2 ? ' …' : '');
};

const markOf = (r, deps) => {
  if (r.merged) return '🟣';
  if (!hasPr(r)) return progressOf(r) > 0 ? '🚧' : '⬜';
  if (r.mergeable === 'CONFLICTING' || r.ci.failed) return '🔴';
  if ((deps.get(r) ?? []).some((d) => !d.merged)) return '⏳';
  if (r.isDraft) return '🚧';
  if (r.ci.pending || r.review === 'CHANGES_REQUESTED') return '⏳';
  return '✅';
};

/** Topological layers over unmerged rows: layer 0 has no unmerged hard dependency. */
export function mergeLayers(rows, deps) {
  const live = rows.filter((r) => !r.merged);
  const depth = new Map();
  const visit = (r, seen = new Set()) => {
    if (depth.has(r)) return depth.get(r);
    if (seen.has(r)) return 0;
    seen.add(r);
    const ds = (deps.get(r) ?? []).filter((d) => !d.merged);
    const d = ds.length ? 1 + Math.max(...ds.map((x) => visit(x, seen))) : 0;
    depth.set(r, d);
    return d;
  };
  live.forEach((r) => visit(r));
  const layers = [];
  for (const r of live) (layers[depth.get(r)] ??= []).push(r);
  return layers.filter(Boolean);
}

export function renderGraph(rows, { scope = 'sitrep', target } = {}) {
  const deps = hardDeps(rows);
  const soft = softEdges(rows, deps);
  const children = new Map(rows.map((r) => [r, []]));
  for (const r of rows) for (const d of deps.get(r) ?? []) children.get(d)?.push(r);
  const built = rows.filter(hasPr);
  const unbuilt = rows.filter((r) => !hasPr(r));
  const text = (r) => `${markOf(r, deps)} #${r.number} ${r.task === `#${r.number}` ? r.label : `${r.task} ${r.label}`.trim()}`;
  const width = Math.max(0, ...built.map((r) => [...text(r)].length));
  const seen = new Set();
  const full = (r) => (seen.has(r) ? `#${r.number}` : (seen.add(r), text(r)));
  const repos = [...new Set(built.map((r) => r.repo))];
  const used = new Set(rows.map((r) => markOf(r, deps)));
  const legendAll = { '✅': '✅ can merge now', '⏳': '⏳ blocked', '🔴': '🔴 failing', '🚧': '🚧 building', '🟣': '🟣 merged', '⬜': '⬜ not started' };
  const legend = [...Object.entries(legendAll).filter(([k]) => used.has(k)).map(([, v]) => v), '──▶ must merge first', ...(soft.length ? ['┄┄ same files (rebase, order free)'] : [])].join('   ');
  const out = [legend, '─'.repeat([...legend].length), ''];
  const softSeen = new Set();
  for (const repo of repos) {
    if (repo) out.push(repo);
    const group = built.filter((r) => r.repo === repo);
    for (const r of group) {
      const kids = children.get(r).filter(hasPr);
      const softSuffix = soft
        .filter((e) => (e.a === r || e.b === r) && !softSeen.has(e))
        .map((e) => (softSeen.add(e), ` ┄┄ #${(e.a === r ? e.b : e.a).number} (${abbrevFiles(e.files)})`))
        .join('');
      const head = seen.has(r) ? `#${r.number}` : full(r);
      const indent = ' '.repeat(2 + [...head].length + 1);
      if (!kids.length) {
        if (!(seen.has(r) && head.startsWith('#') && !softSuffix)) out.push(`  ${pad(head, width)}${softSuffix}`.trimEnd());
        continue;
      }
      kids.forEach((k, idx) => {
        const lead = kids.length === 1 ? '───▶' : idx === 0 ? '─┬─▶' : idx === kids.length - 1 ? '└──▶' : '├──▶';
        const child = seen.has(k) ? `#${k.number}` : full(k);
        out.push(idx === 0 ? `  ${pad(head, width)} ${lead} ${child}${softSuffix}` : `  ${' '.repeat(width + 1)} ${lead} ${child}`.replace(/^ {2}/, '  '));
        void indent;
      });
    }
    out.push('');
  }
  if (unbuilt.length) {
    out.push('not built');
    const chains = unbuilt.map((r) => {
      const ds = deps.get(r) ?? [];
      return ds.length ? `${ds.map((d) => d.task).join(' · ')} ──▶ ${r.task} ${r.label}`.trim() : `${r.task} ${r.label}`.trim();
    });
    out.push(...chains.map((c) => `  ${c}`), '');
  }
  const layers = mergeLayers(built, deps);
  const order = layers.slice(0, 8).map((layer, i) => {
    const names = layer.map((r) => `#${r.number}`).join(' · ');
    const action =
      i === 0
        ? layer.every((r) => markOf(r, deps) === '✅')
          ? 'merge now'
          : layer.some((r) => markOf(r, deps) === '🔴')
            ? 'fix CI or conflicts first'
            : 'wait for CI or review'
        : layer.some((r) => (deps.get(r) ?? []).some((d) => d.head === r.base))
          ? 're-target onto main, then rebase'
          : 'rebase onto main';
    return `${i + 1}. **${names}**: ${action}`;
  });
  const tgt = target ? rows.find((r) => r.task === target || `#${r.number}` === target || String(r.number) === String(target).replace('#', '')) : null;
  const path = tgt ? criticalPath(tgt, deps) : null;
  return [`#### 🔀 Merge graph · ${scope}`, '', '```', ...out.slice(0, out.at(-1) === '' ? -1 : undefined), '```', '', '**Merge order**', ...order, ...(path ? ['', `Critical path to ${tgt.task}: ${path.map((r) => r.task).join(' → ')}`] : [])].join('\n');
}

function criticalPath(target, deps) {
  const path = [];
  const walk = (r, seen = new Set()) => {
    if (seen.has(r)) return;
    seen.add(r);
    for (const d of deps.get(r) ?? []) if (!d.merged) walk(d, seen);
    path.push(r);
  };
  walk(target);
  return path;
}

// ───────────────────────── view: timeline ─────────────────────────
/**
 * Schedule unmerged rows under `cap` slots. Returns `{plan:[{row,start,finish,wait,elapsed,wave,live}], basis}`;
 * times are minutes from `now`. Live rows occupy slots from 0; others start when deps merged and a slot is free.
 */
export function schedule(rows, { cap = 3, now = Date.now(), target } = {}) {
  const deps = hardDeps(rows);
  const todo = rows.filter((r) => !r.merged);
  let fromTag = false;
  const dur = (r) => {
    const e = etaOf(r, now);
    if (e !== 'done' && e !== '?') return Math.max(5, etaMin(e) || 5);
    fromTag = true;
    return EFFORT_MIN[r.effort] ?? 120;
  };
  const tgt = target ? todo.find((r) => r.task === target || `#${r.number}` === target) : null;
  const critical = new Set(tgt ? criticalPath(tgt, deps) : []);
  const desc = (r, seen = new Set()) => {
    let n = 0;
    for (const o of todo) if (!seen.has(o) && (deps.get(o) ?? []).includes(r)) {
      seen.add(o);
      n += 1 + desc(o, seen);
    }
    return n;
  };
  const plan = new Map();
  const live = todo.filter((r) => (hasPr(r) || progressOf(r) > 0) && !(r.isDraft && false));
  for (const r of live) plan.set(r, { row: r, start: 0, finish: dur(r), wait: 0, elapsed: Number.isFinite(r.createdAt) ? minutes(r.createdAt, now) : 0, live: true });
  const pending = todo.filter((r) => !plan.has(r));
  const finishOf = (d) => (d.merged ? 0 : plan.get(d)?.finish);
  let t = 0;
  let guard = 0;
  while (pending.length && guard++ < 500) {
    const active = () => [...plan.values()].filter((p) => p.start <= t && p.finish > t).length;
    const ready = pending
      .filter((r) => (deps.get(r) ?? []).every((d) => finishOf(d) != null && finishOf(d) <= t))
      .sort((a, b) => Number(critical.has(b)) - Number(critical.has(a)) || desc(b) - desc(a) || a.i - b.i);
    for (const r of ready) {
      if (active() >= cap) break;
      plan.set(r, { row: r, start: t, finish: t + dur(r), wait: t, elapsed: 0, live: false });
      pending.splice(pending.indexOf(r), 1);
    }
    const next = [...plan.values()].map((p) => p.finish).filter((f) => f > t);
    if (!next.length) {
      if (pending.length) for (const r of pending.splice(0)) plan.set(r, { row: r, start: t, finish: t + dur(r), wait: t, elapsed: 0, live: false });
      break;
    }
    t = Math.min(...next);
  }
  const starts = [...new Set([...plan.values()].map((p) => p.start))].sort((a, b) => a - b);
  const list = [...plan.values()].map((p) => ({ ...p, wave: starts.indexOf(p.start) + 1 })).sort((a, b) => a.start - b.start || a.row.i - b.row.i);
  return { plan: list, basis: fromTag ? 'effort tags: S ≈ 1h, M ≈ 2h, L ≈ 4h end to end' : "today's observed pace", tgt };
}

export function renderTimeline(rows, { cap = 3, now = Date.now(), target, scope = 'sitrep' } = {}) {
  const { plan, basis, tgt } = schedule(rows, { cap, now, target });
  if (!plan.length) return `#### 🗓 Timeline · ${scope} · cap ${cap} · now ${hhmmZ(now)}\n\nNothing left to schedule.`;
  const shown = plan.slice(0, 16);
  const rest = plan.slice(16);
  const maxElapsed = Math.max(0, ...shown.map((p) => p.elapsed));
  const spanMin = Math.max(...plan.map((p) => p.finish)) + maxElapsed;
  const slice = [15, 30, 60].find((s) => spanMin / s <= 50) ?? 60;
  const grid = slice * 4 * 60000;
  const t0 = Math.floor((now - maxElapsed * 60000) / grid) * grid;
  const col = (min) => Math.floor((now + min * 60000 - t0) / (slice * 60000));
  const cols = col(Math.max(...plan.map((p) => p.finish))) + 1;
  const label = (p) => `${p.row.task}  ${p.row.label}`.trim();
  const lw = Math.max(...shown.map((p) => [...label(p)].length));
  const axis = Array.from({ length: cols + 3 }, () => ' ');
  const ticks = Array.from({ length: cols + 3 }, () => ' ');
  for (let c = 0; c < cols; c += 4) {
    const lab = hhmmZ(t0 + c * slice * 60000).slice(0, 3) === '00Z' ? '00Z' : hhmmZ(t0 + c * slice * 60000).replace(/:00Z$/, 'Z');
    [...lab].forEach((ch, k) => (axis[c + k] = ch));
    ticks[c] = '│';
  }
  const lines = [`${' '.repeat(lw + 2)}${axis.join('')}`, `${' '.repeat(lw + 2)}${ticks.join('')}`];
  for (const p of shown) {
    const cells = Array.from({ length: cols }, () => ' ');
    const nowC = col(0);
    if (p.live) for (let c = col(-p.elapsed); c < nowC; c++) cells[c] = '▓';
    else for (let c = nowC; c < col(p.start); c++) cells[c] = '·';
    for (let c = col(p.start); c <= col(p.finish); c++) cells[c] = '▒';
    cells[col(p.finish)] = '◆';
    const star = tgt && p.row === tgt ? ' ★' : '';
    lines.push(`${pad(label(p), lw)}  ${cells.join('').trimEnd()}`.padEnd(lw + 2 + cols) + `  wave ${p.wave}${star}`);
  }
  if (rest.length) lines.push(`… ${rest.length} later rows (${rest.map((p) => p.row.task).join(', ')}), all done ~${hhmmZ(now + Math.max(...plan.map((p) => p.finish)) * 60000)}`);
  const doneAt = hhmmZ(now + Math.max(...plan.map((p) => p.finish)) * 60000);
  const path = tgt ? `critical path: ${criticalPath(tgt, hardDeps(rows)).map((r) => r.task).join(' → ')}` : `last merge: ${plan.at(-1).row.task}`;
  const tgtAt = tgt ? `Target ${tgt.task} ~${hhmmZ(now + plan.find((p) => p.row === tgt).finish * 60000)} · ` : '';
  return [`#### 🗓 Timeline · ${scope} · cap ${cap} · now ${hhmmZ(now)}`, '', '```', ...lines, '```', `▓ done  ▒ estimated  · waiting  ◆ merge${tgt ? '  ★ target' : ''} · ${path}`, `${tgtAt}all done ~${doneAt} (${slice}m columns; estimates from ${basis})`].join('\n');
}

// ───────────────────────── view: histogram ─────────────────────────
const FRACS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
export const HIST_METRICS = ['diff', 'ci', 'age', 'stage'];

const latestRun = (r) => {
  const own = r.runs.filter((x) => !r.headSha || x.headSha === r.headSha);
  return own.sort((a, b) => ms(b.createdAt) - ms(a.createdAt))[0] ?? null;
};

/** `{value, unit, extra}` for a row and metric, or null when the row has no value for it. */
export function metricValue(r, metric, now) {
  if (metric === 'diff') return hasPr(r) || r.additions || r.deletions ? { value: r.additions + r.deletions, unit: '', extra: `📄 ${r.files}` } : null;
  if (metric === 'ci') {
    const run = latestRun(r);
    return run && run.status === 'completed' ? { value: minutes(ms(run.createdAt), ms(run.updatedAt)), unit: 'm', extra: '' } : null;
  }
  if (metric === 'age') return Number.isFinite(r.createdAt) ? { value: Math.round((now - r.createdAt) / 3600000), unit: 'h', extra: '' } : null;
  if (metric === 'stage') {
    const since = r.stageSince || (r.ci.pending ? ms(latestRun(r)?.createdAt) : r.updatedAt) || r.createdAt;
    return Number.isFinite(since) ? { value: minutes(since, now), unit: 'm', extra: '' } : null;
  }
  return null;
}

export function barOf(value, max, cells = 30) {
  const c = max > 0 ? (value / max) * cells : 0;
  const full = Math.floor(c);
  let frac = FRACS[Math.floor((c - full) * 8)];
  if (value > 0 && full === 0 && !frac) frac = '▏';
  return '█'.repeat(full) + frac;
}

export function renderHistogram(rows, { metrics = ['diff'], now = Date.now(), scope = 'sitrep' } = {}) {
  return metrics
    .map((metric) => {
      const items = rows.map((r) => ({ r, m: metricValue(r, metric, now) })).filter((x) => x.m);
      const missing = rows.length - items.length;
      const head = `#### 📊 Histogram · ${metric} · ${scope}`;
      if (!items.length) return `${head}\n\nNo row has a ${metric} value yet.`;
      items.sort((a, b) => b.m.value - a.m.value);
      const med = median(items.map((x) => x.m.value));
      const many = items.length > 15;
      const shown = many ? items.slice(0, 12) : items;
      const max = shown[0].m.value;
      const lw = Math.max(...shown.map((x) => [...`${x.r.task}  ${x.r.label}`.trim()].length));
      const vals = shown.map((x) => `${x.m.value.toLocaleString('en-US')}${x.m.unit}`);
      const vw = Math.max(...vals.map((v) => v.length));
      const lines = shown.map((x, i) => {
        const out = med > 0 && x.m.value > 2 * med ? ' ⚠️' : '';
        return `${pad(`${x.r.task}  ${x.r.label}`.trim(), lw)}  ${pad(barOf(x.m.value, max), 31)} ${padL(vals[i], vw)}${x.m.extra ? `  ${x.m.extra}` : ''}${out}`;
      });
      const mark = lw + 2 + Math.round((med / (max || 1)) * 30);
      lines.push(`${' '.repeat(mark)}┊ median ${med.toLocaleString('en-US')}${shown[0].m.unit}`);
      if (many) lines.push(`… ${items.length - 12} more`);
      return [head, '', '```', ...lines, '```', ...(missing ? [`${missing} row${missing > 1 ? 's have' : ' has'} no ${metric} value yet`] : [])].join('\n');
    })
    .join('\n\n');
}

// ───────────────────────── view: sequence ─────────────────────────
/** Derive timestamped events from row timestamps, runs and `events[]` (`{t, from, to, label, kind?}`), never inventing any. */
export function deriveEvents(rows) {
  const ev = [];
  for (const r of rows) {
    const who = r.task;
    if (Number.isFinite(r.launchedAt)) ev.push({ t: r.launchedAt, from: 'orchestrator', to: who, label: 'launch' });
    if (Number.isFinite(r.createdAt)) ev.push({ t: r.createdAt, from: who, to: 'CI', label: r.isDraft ? 'PR draft' : 'PR open' });
    if (Number.isFinite(r.readyAt)) ev.push({ t: r.readyAt, from: who, to: 'orchestrator', label: 'hand-back' });
    r.runs
      .filter((x) => !r.headSha || x.headSha === r.headSha)
      .sort((a, b) => ms(a.createdAt) - ms(b.createdAt))
      .forEach((x, n) => {
        ev.push({ t: ms(x.createdAt), from: 'CI', to: 'CI', label: `run ${n + 1}`, kind: 'loop-start' });
        if (x.status === 'completed') ev.push({ t: ms(x.updatedAt), from: 'CI', to: 'CI', label: x.conclusion === 'success' ? '✓ green' : `✗ ${x.conclusion ?? 'failed'}`, kind: 'loop-end' });
      });
    if (Number.isFinite(r.mergedAt)) ev.push({ t: r.mergedAt, from: 'orchestrator', to: 'main', label: 'squash-merge' });
    for (const e of r.events) ev.push({ ...e, t: typeof e.t === 'string' ? ms(e.t) : e.t });
  }
  return ev.filter((e) => Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
}

export function renderSequence(rows, { since, scope = 'sitrep', window = 'all time' } = {}) {
  let events = deriveEvents(rows);
  if (Number.isFinite(since)) events = events.filter((e) => e.t >= since);
  if (!events.length) return `#### 🧭 Sequence · ${scope} · ${window}\n\nNo timestamped events to draw.`;
  const rowNames = [...new Set(events.flatMap((e) => [e.from, e.to]).filter((n) => n && !['orchestrator', 'CI', 'main'].includes(n)))];
  const keep = rowNames.slice(0, 3);
  const fold = (n) => (['orchestrator', 'CI', 'main'].includes(n) || keep.includes(n) ? n : 'others');
  const lanes = ['orchestrator', ...keep, ...(rowNames.length > 3 ? ['others'] : []), 'CI', 'main'].filter((n) => events.some((e) => fold(e.from) === n || fold(e.to) === n) || n === 'orchestrator');
  const earlier = Math.max(0, events.length - 20);
  const shown = events.slice(earlier);
  const G = 12;
  const W = 18;
  const x = (n) => G + lanes.indexOf(n) * W;
  const total = G + lanes.length * W;
  const blank = () => {
    const l = Array.from({ length: total }, () => ' ');
    lanes.forEach((n) => (l[x(n)] = '│'));
    return l;
  };
  const put = (l, at, s) => [...s].forEach((ch, k) => at + k < l.length && (l[at + k] = ch));
  const header = Array.from({ length: total }, () => ' ');
  lanes.forEach((n) => put(header, x(n) - Math.floor([...n].length / 2), n));
  const out = [header.join('').trimEnd(), blank().join('').trimEnd()];
  if (earlier) out.push(`  …  ${earlier} earlier events`);
  for (const e of shown) {
    const l = blank();
    const a = fold(e.from);
    const b = fold(e.to);
    put(l, 0, hhmmZ(e.t));
    if (e.kind === 'loop-start') put(l, x(a), `├── ${e.label} ─┐`);
    else if (e.kind === 'loop-end') put(l, x(a), `│◀─ ${e.label} ─┘`);
    else if (a === b) put(l, x(a), `├ ${e.label}`);
    else {
      const left = Math.min(x(a), x(b));
      const right = Math.max(x(a), x(b));
      for (let c = left + 1; c < right; c++) l[c] = '─';
      put(l, left + 3, ` ${e.label} `);
      if (x(a) < x(b)) {
        l[x(a)] = '├';
        l[right - 1] = '▶';
      } else {
        l[x(a)] = '┤';
        l[left + 1] = '◀';
      }
    }
    out.push(l.join('').trimEnd());
  }
  out.push(blank().join('').trimEnd());
  const first = (f) => events.find(f)?.t;
  const last = (f) => [...events].reverse().find(f)?.t;
  const obs = [];
  const runStart = first((e) => e.kind === 'loop-start');
  const runEnd = last((e) => e.kind === 'loop-end');
  if (runStart && runEnd && runEnd >= runStart) obs.push(`CI ${short((runEnd - runStart) / 1000)}`);
  const launch = first((e) => e.label === 'launch');
  const ready = first((e) => e.label === 'hand-back');
  if (launch && ready) obs.push(`build ${short((ready - launch) / 1000)}`);
  const merge = last((e) => e.label === 'squash-merge');
  if (launch && merge) obs.push(`launch→merge ${short((merge - launch) / 1000)}`);
  return [`#### 🧭 Sequence · ${scope} · ${window}`, '', '```', ...out, '```', obs.length ? obs.join(' · ') : `${events.length} events`].join('\n');
}

// ───────────────────────── view: ci ─────────────────────────
const SHARD_RE = /^(.*?)\s*[([]?\s*(?:shard\s*)?(\d+)\s*\/\s*(\d+)\s*[)\]]?$/i;
const MACOS_RE = /^(gate-native|e2e)/i;

/** `{family, shard, of}` from a check name: strips a `Workflow / ` prefix and a trailing `(n/m)`. */
export function parseJob(name) {
  const n = String(name).replace(/^.*?\s\/\s/, '').trim();
  const m = SHARD_RE.exec(n);
  return m ? { family: m[1].trim(), shard: Number(m[2]), of: Number(m[3]) } : { family: n, shard: 1, of: 1 };
}

const cellMark = (c) => {
  if (BILLING_RE.test(`${c.description ?? ''} ${c.summary ?? ''} ${c.message ?? ''}`)) return '💸';
  const b = String(c.bucket ?? '').toLowerCase();
  if (b === 'pass') return '✅';
  if (b === 'fail') return '🔴';
  if (b === 'skipping') return '⏭';
  if (b === 'cancel') return '⊘';
  const st = String(c.state ?? '').toUpperCase();
  return st === 'IN_PROGRESS' || (c.startedAt && !c.completedAt && !/^0001/.test(c.startedAt)) ? '🟡' : '⏸';
};
const jobSeconds = (c) => (c.startedAt && c.completedAt && !/^0001/.test(c.startedAt) ? Math.max(0, (ms(c.completedAt) - ms(c.startedAt)) / 1000) : null);

/** First error-ish line of a failed log, timestamps stripped; billing stops are named as billing. */
export function logLine(log) {
  const text = String(log ?? '');
  if (BILLING_RE.test(text)) return 'billing stop: Actions budget is preventing further use (a re-run will not help)';
  const lines = text.split('\n').map((l) => l.replace(/^\S*\t[^\t]*\t/, '').replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s*/, '').trim()).filter(Boolean);
  const hit = lines.find((l) => /\b(error|failed|fail|expected|assertion|cannot|✗|×)\b/i.test(l) && !/^##\[group\]/.test(l)) ?? lines.at(-1) ?? 'failed (no log)';
  return trunc(hit.replace(/^##\[error\]/, ''), 140);
}

/** One-line failure summary: Ollama when reachable, otherwise `logLine`. */
export async function summarizeLog(log, opts = {}) {
  const fallback = () => logLine(log);
  if (BILLING_RE.test(String(log))) return fallback();
  const tail = String(log).split('\n').slice(-60).join('\n');
  const res = await llm({ task: 'classify', noLlm: opts.noLlm, fetch: opts.fetch, url: opts.url, prompt: `Name the cause of this CI failure in one line, under 120 characters, quoting the failing test or error. No preamble.\n\n${tail}`, fallback });
  return trunc(String(res.text).split('\n').find((l) => l.trim())?.trim() ?? fallback(), 140);
}

export async function renderCi(rows, { now = Date.now(), scope = 'sitrep', noLlm = false, fetch, url, mainSha } = {}) {
  const cirows = rows.filter((r) => r.checks.length || r.runs.length);
  if (!cirows.length) return `#### 🧪 CI · ${scope}\n\nNo CI data for these rows.`;
  const fams = [];
  const famOf = new Map();
  for (const r of cirows) {
    const by = new Map();
    for (const c of r.checks) {
      const j = parseJob(c.name);
      if (!fams.some((f) => f.name === j.family)) fams.push({ name: j.family, of: j.of });
      else fams.find((f) => f.name === j.family).of = Math.max(fams.find((f) => f.name === j.family).of, j.of);
      (by.get(j.family) ?? by.set(j.family, []).get(j.family)).push({ ...j, c });
    }
    famOf.set(r, by);
  }
  const headers = ['PR', ...fams.map((f) => (f.of > 1 ? `${f.name} 1–${f.of}` : f.name)), 'Wall'];
  const align = ['---', ...fams.map(() => ':-:'), '--:'];
  const stale = [];
  const body = cirows.map((r) => {
    const by = famOf.get(r);
    const cells = fams.map((f) => {
      const jobs = (by.get(f.name) ?? []).sort((a, b) => a.shard - b.shard);
      if (!jobs.length) return '—';
      const secs = jobs.map((j) => jobSeconds(j.c)).filter((s) => s != null);
      return `${jobs.map((j) => cellMark(j.c)).join('')}${secs.length ? ` ${short(Math.max(...secs))}` : ''}`;
    });
    const run = latestRun(r);
    const wall = run ? (run.status === 'completed' ? short((ms(run.updatedAt) - ms(run.createdAt)) / 1000) : `${short((now - ms(run.createdAt)) / 1000)}…`) : '—';
    for (const x of r.runs) if (x.status !== 'completed' && r.headSha && x.headSha && x.headSha !== r.headSha) stale.push(`run ${x.databaseId} (#${r.number} @ ${x.headSha.slice(0, 9)}, superseded)`);
    return [taskCell(r), ...cells, wall];
  });
  const grid = `${mdTable(headers, body).split('\n')[0]}\n|${align.join('|')}|\n${mdTable(headers, body).split('\n').slice(2).join('\n')}`;
  // macOS queue against the cap.
  const mac = { run: [], queued: [] };
  for (const r of cirows)
    for (const c of r.checks) {
      if (!MACOS_RE.test(parseJob(c.name).family) && !/macos/i.test(c.runner ?? '')) continue;
      const m = cellMark(c);
      if (m === '🟡') mac.run.push(r);
      else if (m === '⏸') mac.queued.push(r);
    }
  const uniq = (xs) => [...new Set(xs.map((r) => `#${r.number}`))];
  const lines = [];
  if (mac.run.length || mac.queued.length) {
    const waiting = uniq(mac.queued);
    const behind = uniq(mac.run).filter((n) => !waiting.includes(n));
    const q = mac.queued.length ? ` · ${mac.queued.length} queued (${waiting.join(', ')}${behind.length ? ` wait on ${behind.join(', ')}` : ''})` : '';
    lines.push(`macOS ${Math.min(mac.run.length, MACOS_CAP)}/${MACOS_CAP} running (${uniq(mac.run).join(', ') || 'none'})${q} · cap ${MACOS_CAP}`);
  }
  if (mainSha) for (const r of cirows) for (const x of r.runs) if (x.headBranch === 'main' && x.status !== 'completed' && x.headSha !== mainSha) stale.push(`run ${x.databaseId} (main @ ${x.headSha.slice(0, 9)}, behind)`);
  if (stale.length) lines.push(`Stale: ${[...new Set(stale)].join(' · ')}`);
  const billing = cirows.filter((r) => r.checks.some((c) => cellMark(c) === '💸'));
  if (billing.length) lines.push(`💸 ${billing.map((r) => `#${r.number}`).join(', ')}: Actions billing stop — a re-run will not help`);
  for (const r of cirows) {
    for (const c of r.checks.filter((x) => cellMark(x) === '🔴')) {
      const log = r.failLogs[c.name] ?? c.log;
      if (log == null) continue;
      lines.push(`🔴 #${r.number} ${parseJob(c.name).family}: \`${await summarizeLog(log, { noLlm, fetch, url })}\``);
    }
  }
  return [`#### 🧪 CI · ${scope}`, '', grid, '', ...lines].join('\n').trimEnd();
}

// ───────────────────────── gather + CLI ─────────────────────────
const PR_FIELDS = 'number,url,title,author,state,isDraft,mergeable,mergedAt,createdAt,updatedAt,baseRefName,headRefName,headRefOid,reviewDecision,additions,deletions,changedFiles,statusCheckRollup,body,files';
const arg = (argv, name) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};

export async function gather(argv, { run, stdin } = {}) {
  const input = arg(argv, '--input');
  if (input || stdin) return JSON.parse(input === '-' || !input ? stdin : readFileSync(input, 'utf8'));
  const repo = arg(argv, '--repo');
  const prs = arg(argv, '--pr');
  const opts = { repo, run };
  if (prs) {
    const got = await Promise.all(prs.split(',').map((n) => prView(n.trim().replace('#', ''), { ...opts, fields: PR_FIELDS })));
    const bad = got.find((g) => !g.ok);
    if (bad) throw new Error(`gh ${bad.kind}: ${bad.message}`);
    return got.map((g) => g.data);
  }
  const list = await prList({ ...opts, fields: PR_FIELDS });
  if (!list.ok) throw new Error(`gh ${list.kind}: ${list.message}`);
  return list.data;
}

/** Attach check lists, runs and (with --log-failed) failed-run logs for the views that need them. */
export async function enrich(raws, argv, { run } = {}) {
  const repo = arg(argv, '--repo');
  const logs = argv.includes('--log-failed');
  return Promise.all(
    raws.map(async (raw) => {
      const out = { ...raw };
      const branch = raw.headRefName ?? raw.head;
      if (!out.runs && branch) {
        const r = await runList({ branch, repo, run, limit: 5 });
        if (r.ok) out.runs = r.data;
      }
      if (!out.checks && raw.number) {
        const c = await prChecks(raw.number, { repo, run });
        if (c.ok) out.checks = c.data;
      }
      if (logs && !out.failLogs) {
        out.failLogs = {};
        const failed = (out.runs ?? []).find((x) => x.conclusion === 'failure');
        if (failed) {
          const res = await (run ?? ghRun)(['run', 'view', String(failed.databaseId), '--log-failed', ...(repo ? ['--repo', repo] : [])]).catch((e) => String(e.stderr ?? e));
          for (const c of (out.checks ?? []).filter((x) => String(x.bucket).toLowerCase() === 'fail')) out.failLogs[c.name] = res;
        }
      }
      return out;
    }),
  );
}

export const VIEWS = ['table', 'graph', 'timeline', 'histogram', 'sequence', 'ci', 'all'];

export async function render(view, rows, opts = {}) {
  const parts = [];
  const want = view === 'all' ? ['table', 'graph', 'timeline', 'histogram', 'sequence', 'ci'] : [view];
  for (const v of want) {
    if (v === 'table') parts.push(renderTable(rows, { ...opts, notes: await notesFor(rows, opts) }));
    else if (v === 'graph') parts.push(renderGraph(rows, opts));
    else if (v === 'timeline') parts.push(renderTimeline(rows, opts));
    else if (v === 'histogram') parts.push(renderHistogram(rows, opts));
    else if (v === 'sequence') parts.push(renderSequence(rows, opts));
    else if (v === 'ci') parts.push(await renderCi(rows, opts));
  }
  return parts.join('\n\n');
}

async function main(argv) {
  const view = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'table';
  if (!VIEWS.includes(view)) {
    console.error(`sitrep: unknown view "${view}" (${VIEWS.join(' | ')})`);
    return 1;
  }
  const stdin = process.stdin.isTTY || arg(argv, '--input') ? undefined : await new Promise((res) => {
    let s = '';
    process.stdin.on('data', (d) => (s += d)).on('end', () => res(s.trim() || undefined));
  });
  let raws = await gather(argv, { stdin });
  if (['ci', 'histogram', 'sequence', 'all'].includes(view)) raws = await enrich(raws, argv);
  const rows = normalizeAll(raws);
  if (argv.includes('--json')) {
    console.log(JSON.stringify(rows.map((r) => ({ ...r, raw: undefined, progress: progressOf(r) })), null, 2));
    return 0;
  }
  const now = arg(argv, '--now') ? Date.parse(arg(argv, '--now')) : Date.now();
  console.log(
    await render(view, rows, {
      now,
      cap: Number(arg(argv, '--cap') ?? 3),
      target: arg(argv, '--target'),
      metrics: (arg(argv, '--metric') ?? 'diff').split(',').filter((m) => HIST_METRICS.includes(m)),
      since: arg(argv, '--since') ? Date.parse(arg(argv, '--since')) : undefined,
      window: arg(argv, '--since') ? `since ${arg(argv, '--since')}` : 'all time',
      scope: arg(argv, '--repo') ?? 'sitrep',
      noLlm: isNoLlm(argv),
      num: !argv.includes('--no-num'),
    }),
  );
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => (console.error(`sitrep: ${e.message}`), process.exit(1)),
  );

export { ghJson };
