#!/usr/bin/env node
// Phase verification driver (Phase 151 Theme E, on the forge since Theme G) — the deterministic half of
// `midnite-verify`. The phase is a GitHub issue; its checklist is the task lists of its theme sub-issues.
//
//   node scripts/skills/verify-phase.mjs [--phase N] [--json] [--full] [--dry-run]
//   node scripts/skills/verify-phase.mjs --phase N --tick 151.E.1,151.E.2          # tick automated items in the sub-issues
//   node scripts/skills/verify-phase.mjs --phase N --complete --confirm [--summary "..."]   # after human sign-off
//
// Default: locate the oldest open phase issue (or --phase N, the phase number), partition its themes'
// checklist into automated vs human items, and LIST the focused commands to run (they need the touched
// files, so they are never run here). It never runs the full `moon run :typecheck :lint :test` unless --full
// is passed (that gate exhausts RAM on the dev machine). Writes need explicit flags: --tick edits the theme
// sub-issue bodies; --complete (with --confirm) closes every open theme sub-issue and then the phase issue.
// The Headlines ✅ sentence stays with the agent (`node scripts/skills/tracker.mjs headlines …`).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { countTasks, createTracker } from './lib/forge-tracker.mjs';
import { biloToken } from './lib/pr-common.mjs';
import { shellLine } from './tracker.mjs';

export const FULL_GATE = ['moon', 'run', ':typecheck', ':lint', ':test'];
const HUMAN = /open,?\s+for a human|for a human|human[- ](?:pass|verif|sign)|manual(?:ly)?\b|by hand|eyeball|visual(?:ly)? (?:check|review)|sign[- ]?off/i;
const EXCLUDED = /⏳\s*\*{0,2}\s*deferred|❌\s*\*{0,2}\s*OUT OF SCOPE/i;

/** Split every checklist item into automated / human / excluded, remembering its line index and `151.E.1`-style id. */
export function partitionItems(text) {
  const items = [];
  const lines = text.split('\n');
  let theme = null;
  lines.forEach((line, i) => {
    const h = /^###\s+(?:Theme\s+)?([A-Z])\b/.exec(line);
    if (h) theme = h[1];
    else if (/^##\s/.test(line)) theme = null;
    const m = /^(\s*[-*]\s+)\[([ xX])\]\s+(.*)$/.exec(line);
    if (!m) return;
    const body = m[3];
    const id = /\*\*(\d+\.[A-Z]\.\d+)\*\*/.exec(body)?.[1] ?? null;
    const excluded = EXCLUDED.test(body.slice(0, 60));
    items.push({
      line: i,
      id,
      theme,
      done: m[2] !== ' ',
      excluded,
      kind: excluded ? 'excluded' : HUMAN.test(body) ? 'human' : 'automated',
      text: body.replace(/^\*\*\d+\.[A-Z]\.\d+\*\*\s*/, '').replace(/\*\*/g, '').slice(0, 140),
    });
  });
  return items;
}

/** Check off items by id (`151.E.1`) or, with `all:'automated'`, every open automated item. Returns new text + ids ticked. */
export function tickItems(text, ids = [], { allAutomated = false } = {}) {
  const lines = text.split('\n');
  const ticked = [];
  for (const it of partitionItems(text)) {
    if (it.done || it.excluded) continue;
    if ((it.id && ids.includes(it.id)) || (allAutomated && it.kind === 'automated')) {
      lines[it.line] = lines[it.line].replace(/\[ \]/, '[x]');
      ticked.push(it.id ?? `line ${it.line + 1}`);
    }
  }
  return { text: lines.join('\n'), ticked };
}

/** Oldest incomplete phase: the lowest-numbered open phase issue. */
export const oldestIncomplete = (phases) => phases.filter((p) => p.state === 'open').sort((a, b) => a.phase - b.phase)[0] ?? null;

/** A phase's checklist as one text: each theme sub-issue's body under a `### Theme X — name` heading. */
export const phaseText = (themes) => themes.map((t) => `### Theme ${t.theme ?? '?'} — ${t.name}\n${t.body ?? ''}`).join('\n\n');

/** Resolve `--phase N` (or the oldest open phase) to `{ok, phase}` with its theme sub-issues. */
export async function loadPhase(tracker, phaseNo) {
  let n;
  if (phaseNo != null) {
    const f = await tracker.findPhase(phaseNo);
    if (!f.ok) return f;
    n = f.number;
  } else {
    const l = await tracker.listPhases({ state: 'open' });
    if (!l.ok) return l;
    const o = oldestIncomplete(l.phases);
    if (!o) return { ok: false, kind: 'not-found', message: 'no open phase issue' };
    n = o.number;
  }
  return tracker.readPhase(n);
}

/** The gate: what runs by default, what is merely listed, and what --full adds. */
export function planGate({ full = false } = {}) {
  // tracker-check is gone with the tracked tracker (planning moved to forge issues), so nothing runs by default.
  const steps = [];
  steps.push({ name: 'focused tests', cmd: ['npx', 'vitest', 'run', '<changed test files>'], run: false, note: 'run the tests of the packages the phase touched' });
  steps.push({ name: 'focused lint', cmd: ['npx', 'eslint', '<touched files>'], run: false });
  steps.push({ name: 'full gate', cmd: FULL_GATE, run: full, note: full ? undefined : 'opt-in (--full): exhausts RAM on the dev machine' });
  return steps;
}

const defaultExec = (cmd, { cwd }) => {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

/** Run the verification. `tracker` (forge-tracker) and `exec` are injectable for tests. */
export async function verify({ tracker, phase, full = false, root = process.cwd(), exec = defaultExec } = {}) {
  const loaded = await loadPhase(tracker, phase);
  if (!loaded.ok) return { ok: false, error: `${loaded.kind}: ${loaded.message}` };
  const p = loaded.phase;
  const text = phaseText(p.themes);
  const items = partitionItems(text);
  const counts = countTasks(text);
  const openAutomated = items.filter((i) => !i.done && i.kind === 'automated');
  const openHuman = items.filter((i) => !i.done && i.kind === 'human');
  const gate = planGate({ full });
  const results = gate
    .filter((s) => s.run)
    .map((s) => ({ name: s.name, cmd: s.cmd.join(' '), ...exec(s.cmd, { cwd: root }) }))
    .map((r) => ({ name: r.name, cmd: r.cmd, code: r.code, tail: r.out.trim().split('\n').slice(-12).join('\n') }));
  return {
    ok: true,
    phase: p.phase,
    issue: p.number,
    category: p.category,
    title: p.name,
    url: p.url,
    themes: p.themes.map((t) => ({ theme: t.theme, number: t.number, state: t.state })),
    counts: { done: counts.done, open: counts.open, total: counts.total },
    openAutomated,
    openHuman,
    gate: gate.map(({ name, cmd, run: r, note }) => ({ name, cmd: cmd.join(' '), ran: r, note })),
    results,
    passed: results.every((r) => r.code === 0),
  };
}

/** Tick items by id (or `all` automated) in each theme sub-issue body; one body edit per changed theme. */
export async function tickPhase(tracker, phase, ids, { allAutomated = false } = {}) {
  const ticked = [];
  for (const t of phase.themes) {
    if (t.state !== 'open') continue;
    const r = tickItems(t.body ?? '', ids, { allAutomated });
    if (!r.ticked.length) continue;
    const w = await tracker.editBody(t.number, r.text);
    if (!w.ok) return { ...w, ticked };
    ticked.push(...r.ticked.map((id) => `${id} (#${t.number})`));
  }
  return { ok: true, ticked };
}

/** Close every open theme sub-issue, then the phase issue. Refuses while any item is open. */
export async function completePhase(tracker, phase, { summary } = {}) {
  const c = countTasks(phaseText(phase.themes));
  if (c.open > 0) return { ok: false, kind: 'open-items', message: `refusing: ${c.open} item(s) still open — tick or defer them first` };
  const note = `Verified: ${c.done}/${c.total} items.${summary ? ` ${summary}` : ''}`;
  for (const t of phase.themes.filter((x) => x.state === 'open')) {
    const r = await tracker.close(t.number, { comment: note });
    if (!r.ok) return r;
  }
  const r = await tracker.close(phase.number, { comment: note });
  return r.ok ? { ok: true, note } : r;
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function render(r) {
  const lines = [`Phase ${r.phase} (#${r.issue}, ${r.category ?? '—'}) — ${r.title}`, `checklist ${r.counts.done}/${r.counts.total} done · themes ${r.themes.map((t) => `${t.theme}${t.state === 'closed' ? '✓' : ''}`).join(' ')}`];
  lines.push(`\nAutomated, still open (${r.openAutomated.length}):`, ...r.openAutomated.map((i) => `  - [${i.theme}] ${i.id ?? `L${i.line + 1}`} ${i.text}`));
  lines.push(`\nHuman sign-off, still open (${r.openHuman.length}):`, ...r.openHuman.map((i) => `  - [${i.theme}] ${i.id ?? `L${i.line + 1}`} ${i.text}`));
  lines.push('\nGate:');
  for (const g of r.gate) lines.push(`  ${g.ran ? 'ran ' : 'todo'} ${g.cmd}${g.note ? `  (${g.note})` : ''}`);
  for (const x of r.results) lines.push(`\n${x.code === 0 ? 'PASS' : 'FAIL'} ${x.cmd}${x.code === 0 ? '' : `\n${x.tail}`}`);
  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(`${s}\n`), tracker, exec } = {}) {
  const root = arg(argv, '--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const phase = arg(argv, '--phase');
  const dryRun = argv.includes('--dry-run');
  const t = tracker ?? createTracker({ dryRun, env: process.env.GH_TOKEN ? undefined : { GH_TOKEN: biloToken() || undefined } });
  const tick = arg(argv, '--tick');
  if (tick != null || argv.includes('--complete')) {
    if (phase == null) return out('--tick/--complete need --phase N'), 2;
    if (argv.includes('--complete') && !argv.includes('--confirm')) return out('--complete needs --confirm (human sign-off first)'), 2;
    const loaded = await loadPhase(t, Number(phase));
    if (!loaded.ok) return out(`${loaded.kind}: ${loaded.message}`), 1;
    const r = tick != null
      ? await tickPhase(t, loaded.phase, tick.split(',').filter(Boolean), { allAutomated: tick === 'all' })
      : await completePhase(t, loaded.phase, { summary: arg(argv, '--summary') });
    if (!r.ok) return out(r.message), r.kind === 'open-items' ? 3 : 1;
    out(tick != null ? `ticked ${r.ticked.length}: ${r.ticked.join(', ')}` : `phase ${loaded.phase.phase} closed (#${loaded.phase.number}) — ${r.note}`);
    if (dryRun) out(['# dry run — nothing was written', ...t.calls.map(shellLine)].join('\n'));
    return 0;
  }
  const r = await verify({ tracker: t, root, phase: phase != null ? Number(phase) : undefined, full: argv.includes('--full'), exec });
  if (!r.ok) return out(r.error), 1;
  out(argv.includes('--json') ? JSON.stringify(r, null, 2) : render(r));
  return r.passed ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => (process.exitCode = c));
