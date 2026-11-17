#!/usr/bin/env node
// Phase verification driver (Phase 151 Theme E) — the deterministic half of `midnite-verify`.
//
//   node scripts/skills/verify-phase.mjs [--phase N] [--root DIR] [--json] [--full]
//   node scripts/skills/verify-phase.mjs --phase N --tick 151.E.1,151.E.2          # check off automated items
//   node scripts/skills/verify-phase.mjs --phase N --complete --confirm [--summary "..."]   # after human sign-off
//
// Default: locate the oldest incomplete phase (or --phase), partition its checklist into automated vs human
// items, run `tracker-check.mjs`, and LIST the focused commands to run (they need the touched files, so they
// are never run here). It never runs the full `moon run :typecheck :lint :test` unless --full is passed (that
// gate exhausts RAM on the dev machine). Writes need explicit flags: --tick edits the phase doc, --complete (with
// --confirm) flips the phase row to DONE in its category `_INDEX.md` and appends to `done.md`.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORIES, countCheckboxes, parseIndex, writeIndexRow } from './lib/tasks-index.mjs';

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

/** Oldest incomplete phase across the category tables: lowest number whose status is not DONE. */
export function oldestIncomplete(root) {
  const rows = [];
  for (const category of CATEGORIES) {
    const file = join(root, '.midnite/tasks', category, '_INDEX.md');
    if (!existsSync(file)) continue;
    for (const r of parseIndex(readFileSync(file, 'utf8'))) if (r.phase != null) rows.push({ ...r, category });
  }
  return rows.filter((r) => !/✅|DONE/.test(r.status)).sort((a, b) => a.phase - b.phase)[0] ?? null;
}

export function findPhase(root, phase) {
  for (const category of CATEGORIES) {
    const file = join(root, '.midnite/tasks', category, '_INDEX.md');
    if (!existsSync(file)) continue;
    const row = parseIndex(readFileSync(file, 'utf8')).find((r) => r.phase === Number(phase));
    if (row) return { ...row, category };
  }
  return null;
}

/** The gate: what runs by default, what is merely listed, and what --full adds. */
export function planGate({ full = false } = {}) {
  const steps = [{ name: 'tracker-check', cmd: ['node', 'scripts/tracker-check.mjs'], run: true }];
  steps.push({ name: 'focused tests', cmd: ['npx', 'vitest', 'run', '<changed test files>'], run: false, note: 'run the tests of the packages the phase touched' });
  steps.push({ name: 'focused lint', cmd: ['npx', 'eslint', '<touched files>'], run: false });
  steps.push({ name: 'full gate', cmd: FULL_GATE, run: full, note: full ? undefined : 'opt-in (--full): exhausts RAM on the dev machine' });
  return steps;
}

/** Flip a phase's row to DONE and clear its WIP/TODO theme cells (row only, no prose). */
export function markIndexDone(text, phase) {
  return text
    .split('\n')
    .map((line) => {
      const m = /^\|\s*\[(\d+)\b/.exec(line);
      if (!m || Number(m[1]) !== Number(phase)) return line;
      const cells = line.replace(/^\||\|\s*$/g, '').split(/(?<!\\)\|/);
      cells[1] = ' ✅ DONE ';
      cells[6] = ' — ';
      cells[7] = ' — ';
      return `|${cells.join('|')}|`;
    })
    .join('\n');
}

export function doneEntry({ phase, title, date, summary }) {
  return `\n## ${date} — Phase ${phase} — ${title}\n\n${summary}\n`;
}

const defaultExec = (cmd, { cwd }) => {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

/** Run the verification. `exec` is injectable for tests. */
export function verify({ root, phase, full = false, run = false, exec = defaultExec } = {}) {
  const row = phase != null ? findPhase(root, phase) : oldestIncomplete(root);
  if (!row) return { ok: false, error: phase != null ? `phase ${phase} not found in any _INDEX.md` : 'no incomplete phase' };
  const docPath = join(root, '.midnite/tasks', row.category, row.path);
  const text = readFileSync(docPath, 'utf8');
  const items = partitionItems(text);
  const counts = countCheckboxes(text);
  const openAutomated = items.filter((i) => !i.done && i.kind === 'automated');
  const openHuman = items.filter((i) => !i.done && i.kind === 'human');
  const gate = planGate({ full });
  const results = gate
    .filter((s) => s.run)
    .map((s) => ({ name: s.name, cmd: s.cmd.join(' '), ...exec(s.cmd, { cwd: root }) }))
    .map((r) => ({ name: r.name, cmd: r.cmd, code: r.code, tail: r.out.trim().split('\n').slice(-12).join('\n') }));
  return {
    ok: true,
    phase: row.phase,
    category: row.category,
    title: row.title,
    docPath,
    counts: { done: counts.done, open: counts.open, total: counts.total },
    openAutomated,
    openHuman,
    gate: gate.map(({ name, cmd, run: r, note }) => ({ name, cmd: cmd.join(' '), ran: r, note })),
    results,
    passed: results.every((r) => r.code === 0),
  };
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function render(r) {
  const lines = [`Phase ${r.phase} (${r.category}) — ${r.title}`, `checklist ${r.counts.done}/${r.counts.total} done`];
  lines.push(`\nAutomated, still open (${r.openAutomated.length}):`, ...r.openAutomated.map((i) => `  - ${i.id ?? `L${i.line + 1}`} ${i.text}`));
  lines.push(`\nHuman sign-off, still open (${r.openHuman.length}):`, ...r.openHuman.map((i) => `  - ${i.id ?? `L${i.line + 1}`} ${i.text}`));
  lines.push('\nGate:');
  for (const g of r.gate) lines.push(`  ${g.ran ? 'ran ' : 'todo'} ${g.cmd}${g.note ? `  (${g.note})` : ''}`);
  for (const x of r.results) lines.push(`\n${x.code === 0 ? 'PASS' : 'FAIL'} ${x.cmd}${x.code === 0 ? '' : `\n${x.tail}`}`);
  return lines.join('\n');
}

export function main(argv = process.argv.slice(2), out = (s) => process.stdout.write(`${s}\n`)) {
  const root = arg(argv, '--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const phase = arg(argv, '--phase');
  const base = { root, phase: phase != null ? Number(phase) : undefined, full: argv.includes('--full'), run: argv.includes('--run') };
  const tick = arg(argv, '--tick');
  if (tick != null || argv.includes('--complete')) {
    if (phase == null) return out('--tick/--complete need --phase N'), 2;
    const row = findPhase(root, phase);
    if (!row) return out(`phase ${phase} not found`), 1;
    const docPath = join(root, '.midnite/tasks', row.category, row.path);
    if (tick != null) {
      const r = tickItems(readFileSync(docPath, 'utf8'), tick.split(',').filter(Boolean), { allAutomated: tick === 'all' });
      writeFileSync(docPath, r.text);
      out(`ticked ${r.ticked.length}: ${r.ticked.join(', ')}`);
      return 0;
    }
    if (!argv.includes('--confirm')) return out('--complete needs --confirm (human sign-off first)'), 2;
    const c = countCheckboxes(readFileSync(docPath, 'utf8'));
    if (c.open > 0) return out(`refusing: ${c.open} item(s) still open — tick or defer them first`), 3;
    writeIndexRow(root, row.category, row.phase, { done: c.done, total: c.total });
    const idx = join(root, '.midnite/tasks', row.category, '_INDEX.md');
    writeFileSync(idx, markIndexDone(readFileSync(idx, 'utf8'), row.phase));
    const date = new Date().toISOString().slice(0, 10);
    appendFileSync(join(root, '.midnite/tasks/done.md'), doneEntry({ phase: row.phase, title: row.title.replace(/^\d+\s*·\s*/, ''), date, summary: arg(argv, '--summary') ?? 'Verified and signed off.' }));
    out(`phase ${row.phase} marked DONE`);
    return 0;
  }
  const r = verify(base);
  if (!r.ok) return out(r.error), 1;
  out(argv.includes('--json') ? JSON.stringify(r, null, 2) : render(r));
  return r.passed ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
