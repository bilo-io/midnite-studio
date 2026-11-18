// Sitrep renderers: fixture rows in, exact text shapes out. No gh, no git, no Ollama (vitest/node).
import { describe, expect, it } from 'vitest';

import {
  barOf, logLine, metricValue, mergeLayers, hardDeps, normalizeAll, normalizeRow, notesFor, parseJob, progressOf,
  renderCi, renderGraph, renderHistogram, renderSequence, renderTable, renderTimeline, rollupChecks, schedule, summarizeLog, etaOf,
} from './sitrep.mjs';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();
const ok = { conclusion: 'SUCCESS', status: 'COMPLETED' };
const run = (id, sha, createdMin, updatedMin, extra = {}) => ({ databaseId: id, headSha: sha, headBranch: 'b', createdAt: iso(createdMin), updatedAt: iso(updatedMin), status: 'completed', conclusion: 'success', ...extra });

const RAW = [
  { number: 10, url: 'https://github.com/o/r/pull/10', title: 'feat(a): contract types', author: { login: 'bilo-io' }, state: 'OPEN', isDraft: false, headRefName: 'a', baseRefName: 'main', headRefOid: 'aaa111', additions: 120, deletions: 8, changedFiles: 6, createdAt: iso(120), mergeable: 'MERGEABLE', reviewDecision: '', statusCheckRollup: [ok, ok, ok], files: [{ path: 'src/types.ts' }, { path: 'src/util.ts' }], task: 'PR-1', label: 'contract types', effort: 'S',
    runs: [run(1, 'aaa111', 100, 90)], checks: [{ name: 'gate-node', bucket: 'pass', startedAt: iso(100), completedAt: iso(91) }, { name: 'e2e (1/4)', bucket: 'pass', startedAt: iso(100), completedAt: iso(88) }] },
  { number: 11, url: 'https://github.com/o/r/pull/11', title: 'feat(b): gating', author: { login: 'kurt' }, state: 'OPEN', isDraft: false, headRefName: 'b', baseRefName: 'a', headRefOid: 'bbb222', additions: 3000, deletions: 40, changedFiles: 40, createdAt: iso(60), mergeable: 'MERGEABLE', statusCheckRollup: [ok, { conclusion: '', status: 'IN_PROGRESS' }], files: [{ path: 'src/util.ts' }], task: 'PR-2', label: 'nature gating',
    runs: [run(2, 'bbb222', 20, 0, { status: 'in_progress', conclusion: null }), run(3, 'old999', 55, 40, { status: 'in_progress', conclusion: null })],
    checks: [{ name: 'gate-node', bucket: 'pass', startedAt: iso(20), completedAt: iso(10) }, { name: 'e2e (1/4)', state: 'IN_PROGRESS', bucket: 'pending', startedAt: iso(10) }, { name: 'e2e (2/4)', state: 'QUEUED', bucket: 'pending' }] },
  { number: 12, url: 'https://github.com/o/r/pull/12', title: 'fix(c): carbon', author: { login: 'bilo-io' }, state: 'OPEN', isDraft: true, headRefName: 'c', baseRefName: 'main', additions: 5, deletions: 5, changedFiles: 1, createdAt: iso(30), mergeable: 'CONFLICTING', statusCheckRollup: [{ conclusion: 'FAILURE', status: 'COMPLETED', name: 'gate-node' }], deps: [10], task: 'PR-3', label: 'carbon row', checks: [{ name: 'gate-node', bucket: 'fail', startedAt: iso(30), completedAt: iso(29) }], failLogs: { 'gate-node': '2026-11-17T11:31:00Z ##[error]typecheck-node.test.mjs expected 38 projects, got 39\nexit 1' } },
  { number: 9, url: 'https://github.com/o/r/pull/9', title: 'chore: done', author: { login: 'bilo-io' }, state: 'MERGED', mergedAt: iso(300), createdAt: iso(400), additions: 84, deletions: 66, changedFiles: 8, headRefName: 'z', baseRefName: 'main', task: 'PR-0', label: 'done thing' },
  { task: 'TASK-D', label: 'not started', branch: 'x', deps: ['PR-3'], effort: 'M' },
];
const rows = () => normalizeAll(RAW);

describe('normalise + shared rules', () => {
  it('rolls checks up and skips skipped ones', () => {
    expect(rollupChecks([ok, { conclusion: 'SKIPPED' }, { status: 'IN_PROGRESS' }, { conclusion: 'FAILURE', name: 'x' }])).toMatchObject({ total: 3, passed: 1, pending: 1, failed: 1, skipped: 1, failing: ['x'] });
  });
  it('progress follows the scale', () => {
    const r = rows();
    expect(r.map(progressOf)).toEqual([80, 70, 60, 100, 0]);
  });
  it('hard deps: stacked base, explicit deps, body "Depends on #n"', () => {
    const r = rows();
    const d = hardDeps(r);
    expect(d.get(r[1]).map((x) => x.number)).toEqual([10]);
    expect(d.get(r[2]).map((x) => x.number)).toEqual([10]);
    expect(d.get(r[4]).map((x) => x.number)).toEqual([12]);
    expect(normalizeRow({ number: 1, body: 'Depends on #7' }).deps).toEqual([7]);
  });
  it('ETA: done, ? when waiting on a human, pace otherwise', () => {
    const r = rows();
    expect(etaOf(r[3], NOW)).toBe('done');
    expect(etaOf(r[0], NOW)).toBe('?');
    expect(etaOf(r[1], NOW)).toBe('~26m'); // 60m elapsed at 70%
  });
});

describe('table', () => {
  it('renders the house columns, diff glyphs, status tags and batch line', async () => {
    const t = renderTable(rows(), { now: NOW, notes: await notesFor(rows(), { noLlm: true }) });
    const lines = t.split('\n');
    expect(lines[0]).toBe('| # | Task | Author | Progress | ETA | Diff | Status | Notes |');
    expect(t).toContain('[PR-1 · #10](https://github.com/o/r/pull/10) | @bilo-io | `████████░░` 80%');
    expect(t).toContain('🟩 +3000 🟥 -40 📄 40');
    expect(t).toContain('🟡 CI running · CI 1/2 · ⛓ #10');
    expect(t).toContain('🔴 Conflict · CI 0/1');
    expect(t).toContain('✅ 100% | done');
    expect(t).toContain('`TASK-D` | — | `░░░░░░░░░░` 0% | ? | — | ⬜ not started');
    expect(t.split('\n').at(-1)).toMatch(/^█+░* \d+% overall · 1\/5 merged · 2 in review · all done ~\?/);
  });
  it('--no-num drops the # column; notes are deterministic and at most six words', async () => {
    const r = rows();
    const notes = await notesFor(r, { noLlm: true });
    expect(notes[2]).toBe('merge conflict with base');
    expect(notes[0]).toBe('—');
    expect(renderTable(r, { now: NOW, notes, num: false }).split('\n')[0]).toBe('| Task | Author | Progress | ETA | Diff | Status | Notes |');
    const long = await notesFor([normalizeRow({ number: 1, note: 'one two three four five six seven eight' })], { noLlm: true });
    expect(long[0]).toBe('one two three four five six');
  });
  it('uses Ollama for notes when it answers, falls back when it does not', async () => {
    const r = [rows()[2]];
    const fetch = async (u) => (String(u).endsWith('/api/tags') ? { ok: true, json: async () => ({ models: [{ name: 'gemma4:e2b' }] }) } : { ok: true, json: async () => ({ response: 'Conflicts with main, rebase needed today please' }) });
    expect((await notesFor(r, { fetch }))[0]).toBe('Conflicts with main, rebase needed today');
    const down = async () => { throw new Error('refused'); };
    expect((await notesFor(r, { fetch: down }))[0]).toBe('merge conflict with base');
  });
});

describe('graph', () => {
  it('draws hard and soft edges, unbuilt chain and merge order', () => {
    const g = renderGraph(rows(), { scope: 'o/r' });
    expect(g).toContain('#### 🔀 Merge graph · o/r');
    expect(g).toMatch(/✅ #10 PR-1 contract types\s+─┬─▶ ⏳ #11 PR-2 nature gating/);
    expect(g).toContain('└──▶ 🔴 #12 PR-3 carbon row');
    expect(g).toContain('not built');
    expect(g).toContain('PR-3 ──▶ TASK-D not started');
    expect(g).toContain('**Merge order**');
    expect(g).toContain('1. **#10**: merge now');
    expect(g).toContain('2. **#11 · #12**: re-target onto main, then rebase');
  });
  it('soft edges name the shared files', () => {
    const a = normalizeRow({ number: 1, task: 'A', label: 'one', paths: ['src/x.ts', 'src/y.ts'], headRefName: 'a' });
    const b = normalizeRow({ number: 2, task: 'B', label: 'two', paths: ['src/x.ts'], headRefName: 'b' });
    expect(renderGraph([a, b])).toContain('┄┄ #2 (x)');
  });
  it('layers are topological', () => {
    const r = rows();
    expect(mergeLayers(r.filter((x) => x.number), hardDeps(r)).map((l) => l.map((x) => x.number))).toEqual([[10], [11, 12]]);
  });
});

describe('timeline', () => {
  it('schedules waves under the cap with a target and critical path', () => {
    const r = rows();
    const { plan } = schedule(r, { cap: 1, now: NOW });
    const tasks = plan.map((p) => p.row.task);
    expect(tasks).toContain('TASK-D');
    const d = plan.find((p) => p.row.task === 'TASK-D');
    const c = plan.find((p) => p.row.task === 'PR-3');
    expect(d.start).toBeGreaterThanOrEqual(c.finish);
  });
  it('never runs more unstarted rows than the cap', () => {
    const many = Array.from({ length: 5 }, (_, i) => normalizeRow({ task: `T${i}`, label: 'x', effort: 'S' }));
    const { plan } = schedule(many, { cap: 2, now: NOW });
    for (const p of plan) expect(plan.filter((q) => q.start <= p.start && q.finish > p.start).length).toBeLessThanOrEqual(2);
    expect(Math.max(...plan.map((p) => p.wave))).toBe(3);
  });
  it('renders the chart, legend and finish line', () => {
    const t = renderTimeline(rows(), { cap: 2, now: NOW, target: 'TASK-D' });
    expect(t).toContain('#### 🗓 Timeline · sitrep · cap 2 · now 12:00Z');
    expect(t).toMatch(/TASK-D {2}not started .*◆.*wave \d ★/);
    expect(t).toContain('▓ done  ▒ estimated  · waiting  ◆ merge  ★ target · critical path:');
    expect(t).toMatch(/Target TASK-D ~\d\d:\d\dZ · all done ~\d\d:\d\dZ \(\d+m columns; estimates from/);
  });
});

describe('histogram', () => {
  it('sorts descending, flags 2x outliers, marks the median', () => {
    const h = renderHistogram(rows(), { metrics: ['diff'], now: NOW });
    const lines = h.split('\n');
    expect(lines[0]).toBe('#### 📊 Histogram · diff · sitrep');
    expect(h).toContain('3,040');
    expect(h).toMatch(/PR-2 {2}nature gating\s+█{30}\s+3,040 {2}📄 40 ⚠️/);
    expect(h).toMatch(/┊ median 139/);
    expect(h.indexOf('3,040')).toBeLessThan(h.indexOf('128'));
  });
  it('bars: fractional glyphs, never empty for non-zero', () => {
    expect(barOf(100, 100)).toBe('█'.repeat(30));
    expect(barOf(1, 1000)).toBe('▏');
    expect(barOf(50, 100)).toBe('█'.repeat(15));
  });
  it('ci / age / stage metrics and missing-value line', () => {
    const r = rows();
    expect(metricValue(r[0], 'ci', NOW)).toMatchObject({ value: 10, unit: 'm' });
    expect(metricValue(r[1], 'ci', NOW)).toBeNull();
    expect(metricValue(r[0], 'age', NOW)).toMatchObject({ value: 2, unit: 'h' });
    const h = renderHistogram(r, { metrics: ['ci'], now: NOW });
    expect(h).toContain('PR-1');
    expect(h).toMatch(/4 rows have no ci value yet/);
  });
  it('folds past 15 bars', () => {
    const many = Array.from({ length: 20 }, (_, i) => normalizeRow({ number: i + 1, task: `T${i}`, additions: i + 1, deletions: 0 }));
    expect(renderHistogram(many, { now: NOW })).toContain('… 8 more');
  });
});

describe('sequence', () => {
  it('draws lifelines, arrows, CI loops and the observation line', () => {
    const r = rows().slice(0, 1);
    r[0].launchedAt = NOW - 130 * 60000;
    r[0].readyAt = NOW - 105 * 60000;
    r[0].mergedAt = NOW - 85 * 60000;
    const s = renderSequence(r, { scope: 'o/r', window: '3h' });
    expect(s).toContain('#### 🧭 Sequence · o/r · 3h');
    expect(s).toMatch(/orchestrator\s+PR-1\s+CI\s+main/);
    expect(s).toMatch(/09:50Z\s+├─+ launch/);
    expect(s).toMatch(/├── run 1 ─┐/);
    expect(s).toMatch(/│◀─ ✓ green ─┘/);
    expect(s).toMatch(/squash-merge[ ─]*▶/);
    expect(s.split('\n').at(-1)).toMatch(/^CI 10m/);
    expect(s.split('\n').at(-1)).toContain('launch→merge 45m');
  });
  it('never invents events', () => {
    expect(renderSequence([normalizeRow({ task: 'x' })])).toContain('No timestamped events');
  });
  it('collapses to the latest 20 events', () => {
    const events = Array.from({ length: 30 }, (_, i) => ({ t: NOW + i * 1000, from: 'orchestrator', to: 'main', label: `e${i}` }));
    expect(renderSequence([normalizeRow({ task: 'x', events })])).toContain('10 earlier events');
  });
});

describe('ci', () => {
  it('builds the job grid, queue, stale runs and quoted failures', async () => {
    const out = await renderCi(rows(), { now: NOW, noLlm: true });
    expect(out).toContain('#### 🧪 CI · sitrep');
    expect(out).toContain('| PR | gate-node | e2e 1–4 | Wall |');
    expect(out).toContain('|---|:-:|:-:|--:|');
    expect(out).toMatch(/PR-1 · #10\]\(https:\/\/github.com\/o\/r\/pull\/10\) \| ✅ 9m \| ✅ 12m \| 10m/);
    expect(out).toContain('🟡⏸');
    expect(out).toContain('…');
    expect(out).toContain('macOS 1/5 running (#11) · 1 queued (#11) · cap 5');
    expect(out).toContain('Stale: run 3 (#11 @ old999, superseded)');
    expect(out).toContain('🔴 #12 gate-node: `typecheck-node.test.mjs expected 38 projects, got 39`');
  });
  it('recognises a billing stop and names it as billing', async () => {
    const r = normalizeAll([{ number: 5, url: 'u', task: 'B', checks: [{ name: 'gate-node', bucket: 'fail', startedAt: iso(1), completedAt: iso(1), description: 'The job was not started because an Actions budget is preventing further use' }] }]);
    const out = await renderCi(r, { now: NOW, noLlm: true });
    expect(out).toContain('💸');
    expect(out).toContain('Actions billing stop');
  });
  it('job parsing and log lines', () => {
    expect(parseJob('CI / e2e (3/4)')).toEqual({ family: 'e2e', shard: 3, of: 4 });
    expect(parseJob('gate-native')).toEqual({ family: 'gate-native', shard: 1, of: 1 });
    expect(logLine('2026-11-17T01:02:03.4Z ##[error]boom failed hard')).toBe('boom failed hard');
    expect(logLine('The job was not started because an Actions budget is preventing further use')).toMatch(/^billing stop/);
  });
  it('summarizeLog uses ministral/gemma when up, regex when --no-llm', async () => {
    const fetch = async (u) => (String(u).endsWith('/api/tags') ? { ok: true, json: async () => ({ models: [{ name: 'ministral-3:3b' }] }) } : { ok: true, json: async () => ({ response: 'vitest: foo.test.ts fails on line 3\nextra' }) });
    expect(await summarizeLog('x', { fetch })).toBe('vitest: foo.test.ts fails on line 3');
    expect(await summarizeLog('Error: nope', { noLlm: true })).toBe('Error: nope');
  });
});
