#!/usr/bin/env node
// git-report: automates `midnite-git-report` (Phase 151 Theme C).
//   node scripts/skills/git-report.mjs [today|yesterday|YYYY-MM-DD|this-week|this-month|A..B]
//        [--json] [--no-pdf|--pdf] [--no-llm] [--out <dir>]
// Merged PRs (gh, window pinned to SAST) + phase progress (the category _INDEX.md tables only, never the
// phase docs) + done.md items shipped in the window -> markdown report, and for a complete day a PDF made
// by injecting the same data into pdf-template.html and printing it with headless Chrome.
// Read-only. Ollama only writes the one-line headline; a deterministic headline is the fallback.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bar, mdTable } from './lib/format.mjs';
import * as gh from './lib/gh.mjs';
import { isNoLlm, run as ollama } from './lib/ollama.mjs';
import { CATEGORIES, readIndex } from './lib/tasks-index.mjs';
import { resolveWindow, utcToSastHM, wantsPdf } from './sast.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TEMPLATE_REL = '.agents/skills/midnite-git-report/pdf-template.html';
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

/** `Phase 25 Theme D` / `phase 25` / `(phase-25)` in a PR title -> `{phase, theme}` (or nulls). */
export function phaseFromTitle(title) {
  const m = /phase[\s-]*(\d+)(?:[\s,·:-]*theme[s]?\s+([A-Z](?:[–,&\s-]+[A-Z])*))?/i.exec(title ?? '');
  return m ? { phase: Number(m[1]), theme: m[2]?.trim() ?? null } : { phase: null, theme: null };
}

/** gh PR rows -> `{number,title,url,mergedAt,additions,deletions,author,phase,theme,time}`, newest first. */
export function normalisePrs(rows) {
  return rows
    .map((p) => ({
      number: p.number,
      title: p.title,
      url: p.url,
      mergedAt: p.mergedAt,
      additions: p.additions ?? 0,
      deletions: p.deletions ?? 0,
      author: p.author?.login ?? p.author ?? '—',
      ...phaseFromTitle(p.title),
      time: utcToSastHM(p.mergedAt),
    }))
    .sort((a, b) => String(b.mergedAt).localeCompare(String(a.mergedAt)));
}

export function statusMix(all, merged) {
  const mergedN = merged.length;
  const mergedSet = new Set(merged.map((p) => p.number));
  let open = 0;
  let closed = 0;
  for (const p of all) {
    if (mergedSet.has(p.number)) continue;
    if (p.state === 'OPEN') open++;
    else if (p.state === 'CLOSED') closed++;
  }
  return { merged: mergedN, open, closed };
}

/** Aggregate the window's PRs per phase (null phase -> `—`). */
export function tackled(prs, shipped = {}) {
  const by = new Map();
  for (const p of prs) {
    const key = p.phase ?? '—';
    const e = by.get(key) ?? { phase: key, prs: [], additions: 0, deletions: 0 };
    e.prs.push(p);
    e.additions += p.additions;
    e.deletions += p.deletions;
    by.set(key, e);
  }
  return [...by.values()]
    .sort((a, b) => (a.phase === '—') - (b.phase === '—') || Number(b.phase) - Number(a.phase))
    .map((e) => ({ ...e, items: shipped[e.phase] ?? 0 }));
}

/** done.md entries dated inside `start..end`, counted per `Phase N` in the heading. */
export function shippedCounts(doneMd, start, end) {
  const out = {};
  for (const m of doneMd.matchAll(/^##\s+(\d{4}-\d{2}-\d{2})\s+[—-]\s+(.*)$/gm)) {
    if (m[1] < start || m[1] > end) continue;
    const { phase } = phaseFromTitle(m[2]);
    const key = phase ?? '—';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** The `Done` cell (`12/41` or `12 / 41`) -> numbers. */
export function parseDone(cell) {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(cell ?? '');
  return m ? { done: Number(m[1]), total: Number(m[2]) } : { done: 0, total: 0 };
}
const statusKind = (s = '') => (/✅/.test(s) ? 'done' : /🔄/.test(s) ? 'wip' : 'todo');
const dash = (s) => (s && s.trim() && s.trim() !== '—' ? s.trim() : '—');

/** Index rows (all categories) -> phase progress rows, straight from the table. */
export function phaseRows(rowsByCategory) {
  const out = [];
  for (const [category, rows] of Object.entries(rowsByCategory)) {
    for (const r of rows) {
      if (r.phase == null) continue;
      const { done, total } = parseDone(r.done);
      const pct = Number.parseInt(String(r.pct).replace(/[^\d]/g, ''), 10);
      out.push({
        category,
        phase: r.phase,
        title: r.title.replace(/^Phase\s+\d+\s*[·:—-]\s*/i, ''),
        status: statusKind(r.status),
        done,
        total,
        pct: Number.isFinite(pct) ? pct : total ? Math.floor((done / total) * 100) : 0,
        wip: dash(r.wip),
        todo: dash(r.todo),
      });
    }
  }
  return out.sort((a, b) => b.phase - a.phase);
}

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function deterministicHeadline({ prs, phases, tacklesRows }) {
  const add = prs.reduce((s, p) => s + p.additions, 0);
  const del = prs.reduce((s, p) => s + p.deletions, 0);
  const complete = phases.filter((p) => p.status === 'done').length;
  const touched = tacklesRows.filter((t) => t.phase !== '—').map((t) => t.phase);
  const adv = touched.length ? ` · phase${touched.length > 1 ? 's' : ''} ${touched.slice(0, 4).join(', ')} advanced` : '';
  return `${prs.length} PR${prs.length === 1 ? '' : 's'} · +${fmt(add)}/−${fmt(del)}${adv}; ${complete}/${phases.length} phases complete.`;
}

/** Everything the markdown and the PDF need. Pure. */
export function buildReport({ window: win, prs, status, phases, shipped = {}, headline, generated }) {
  const tacklesRows = tackled(prs, shipped);
  const add = prs.reduce((s, p) => s + p.additions, 0);
  const del = prs.reduce((s, p) => s + p.deletions, 0);
  const complete = phases.filter((p) => p.status === 'done').length;
  const head = headline ?? deterministicHeadline({ prs, phases, tacklesRows });
  const label = win.singleDay ? win.start : `${win.start} → ${win.end}`;
  return {
    window: win,
    label,
    status,
    prs,
    tackled: tacklesRows,
    phases,
    headline: head,
    linesAdded: `+${add}`,
    linesRemoved: `−${del}`,
    phasesComplete: `${complete} / ${phases.length}`,
    generated,
  };
}

const prLabel = (p) => (p.phase == null ? '—' : p.theme ? `${p.phase} · Theme ${p.theme}` : String(p.phase));

export function renderMarkdown(r) {
  const out = [`# 📈 Git report — ${r.label}`, ''];
  out.push(`${r.status.merged} merged · ${r.status.open} open · ${r.status.closed} closed-unmerged`, '');
  out.push('## 🔀 Merged PRs', '');
  out.push(
    r.prs.length
      ? mdTable(
          ['PR', 'Title', 'Phase', 'Δ lines', 'Merged (SAST)'],
          r.prs.map((p) => [`[#${p.number}](${p.url})`, p.title, prLabel(p), `+${p.additions} / −${p.deletions}`, p.time]),
        )
      : '— nothing merged in range',
    '',
  );
  out.push('## 🧭 Phases tackled', '');
  out.push(
    r.tackled.length
      ? mdTable(
          ['Phase', 'PRs', 'Δ lines (period)', 'Items → done'],
          r.tackled.map((t) => [String(t.phase), t.prs.map((p) => `#${p.number}`).join(' '), `+${t.additions} / −${t.deletions}`, String(t.items)]),
        )
      : '— none',
    '',
  );
  out.push('## 📊 Phase progress (overall)', '');
  const icon = { done: '✅', wip: '🔄', todo: '⬜' };
  out.push(
    mdTable(
      ['Phase', 'Status', 'Done / total', '%', 'Bar', '🔄 WIP', '◻ TODO'],
      r.phases.map((p) => [`${p.phase} · ${p.title}`, icon[p.status], `${p.done} / ${p.total}`, `${p.pct}%`, `\`${bar(p.pct)}\``, p.wip, p.todo]),
    ),
    '',
  );
  out.push(`**Headline:** ${r.headline}`);
  return out.join('\n');
}

/** Replace the block between DATA-START / DATA-END in the template with this run's `DATA`. */
export function injectTemplate(html, r) {
  const data = {
    date: r.label,
    generated: r.generated,
    status: r.status,
    linesAdded: r.linesAdded,
    linesRemoved: r.linesRemoved,
    phasesComplete: r.phasesComplete,
    prs: r.prs.map((p) => [p.number, p.title, prLabel(p), p.additions, p.deletions, p.time]),
    tackled: r.tackled.map((t) => [
      String(t.phase),
      t.prs.map((p) => `#${p.number}`).join(' '),
      t.additions,
      t.deletions,
      t.items,
    ]),
    tackledNote: '',
    phases: r.phases.map((p) => [p.phase, p.title, p.status, p.done, p.total, p.pct]),
    headline: r.headline,
  };
  const start = html.indexOf('/* DATA-START */');
  const end = html.indexOf('/* DATA-END */');
  if (start < 0 || end < start) throw new Error('template is missing its DATA-START / DATA-END markers');
  // `<` is escaped so a PR title can never close the <script> element.
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  return `${html.slice(0, start)}/* DATA-START */\nconst DATA = ${json};\n${html.slice(end)}`;
}

export function findChrome(exists = existsSync, env = process.env) {
  const candidates = [env.CHROME_PATH, ...CHROME_PATHS].filter(Boolean);
  return candidates.find((c) => exists(c)) ?? null;
}

/** Headless Chrome `--print-to-pdf`. Resolves `{ok, path?|reason}`; never throws. */
export function renderPdf({ chrome, htmlPath, pdfPath, exec = execFile }) {
  return new Promise((resolve) => {
    if (!chrome) return resolve({ ok: false, reason: 'no Chrome/Chromium/Edge binary found (set CHROME_PATH)' });
    const args = ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=3000', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href];
    exec(chrome, args, { timeout: 60_000 }, (err) => resolve(err ? { ok: false, reason: String(err.message) } : { ok: true, path: pdfPath }));
  });
}

/** Gather from gh + the index. `gh`/`readIdx`/`readDone` are injectable. */
export async function gather(win, { ghApi = gh, root = repoRoot, readIdx = readIndex, readDone } = {}) {
  const notes = [];
  const merged = await ghApi.ghJson(
    ['pr', 'list', '--state', 'merged', '--search', `merged:${win.search}`, '--json', 'number,title,url,mergedAt,additions,deletions,author', '--limit', '200'],
  );
  let prs = [];
  let status = { merged: 0, open: 0, closed: 0 };
  if (!merged.ok) notes.push(`gh unavailable (${merged.kind}): PR sections are empty`);
  else {
    prs = normalisePrs(merged.data ?? []);
    if (prs.length >= 200) notes.push('merged-PR cap (200) hit; the list is truncated');
    const all = await ghApi.ghJson(
      ['pr', 'list', '--state', 'all', '--search', `updated:${win.search}`, '--json', 'number,state', '--limit', '200'],
    );
    status = all.ok ? statusMix(all.data ?? [], prs) : { merged: prs.length, open: 0, closed: 0 };
  }
  const rowsByCategory = {};
  for (const c of CATEGORIES) {
    try {
      rowsByCategory[c] = readIdx(root, c);
    } catch {
      rowsByCategory[c] = [];
    }
  }
  const doneText = readDone ? readDone() : existsSync(path.join(root, '.midnite/tasks/done.md')) ? readFileSync(path.join(root, '.midnite/tasks/done.md'), 'utf8') : '';
  return { prs, status, phases: phaseRows(rowsByCategory), shipped: shippedCounts(doneText, win.start, win.end), notes };
}

export function parseArgs(argv) {
  const o = { spec: undefined, json: false, pdf: 'auto', noLlm: isNoLlm(argv, {}), out: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--pdf') o.pdf = 'yes';
    else if (a === '--no-pdf') o.pdf = 'no';
    else if (a === '--out') o.out = argv[++i];
    else if (!a.startsWith('--') && o.spec === undefined) o.spec = a;
  }
  return o;
}

export async function main(argv = process.argv.slice(2), now = new Date()) {
  const o = parseArgs(argv);
  const win = resolveWindow(o.spec ?? 'today', now);
  const g = await gather(win);
  const generated = `${utcToSastHM(now.toISOString())} SAST`;
  let report = buildReport({ window: win, ...g, generated });
  if (g.prs.length) {
    const llm = await ollama({
      task: 'note',
      noLlm: o.noLlm,
      prompt: `One sentence (max 25 words) headlining this day of work. PRs:\n${g.prs.map((p) => `- ${p.title}`).join('\n')}`,
      fallback: () => report.headline,
    });
    if (llm.source === 'ollama') report = { ...report, headline: llm.text.split('\n')[0] };
  }
  const md = renderMarkdown(report);
  if (o.json) console.log(JSON.stringify({ ...report, notes: g.notes }, null, 2));
  else console.log(md);
  for (const n of g.notes) console.error(`note: ${n}`);
  if (o.pdf === 'no' || (o.pdf === 'auto' && !wantsPdf(win, now))) return 0;
  const dir = o.out ?? path.join(tmpdir(), 'midnite-git-report');
  mkdirSync(dir, { recursive: true });
  const htmlPath = path.join(dir, `git-report-${win.end}.html`);
  writeFileSync(htmlPath, injectTemplate(readFileSync(path.join(repoRoot, TEMPLATE_REL), 'utf8'), report));
  const pdfPath = path.join(o.out ?? path.join(homedir(), 'Desktop'), `midnite-studio-git-report-${win.end}.pdf`);
  const res = await renderPdf({ chrome: findChrome(), htmlPath, pdfPath });
  console.error(res.ok ? `pdf: ${res.path}` : `pdf skipped: ${res.reason}`); // never fail the report over it
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(1); });
}
