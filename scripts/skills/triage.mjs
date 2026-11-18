#!/usr/bin/env node
// Read-only forge triage (Phase 151 Theme B). Replaces the LLM rendering of `midnite-triage`:
//
//   node scripts/skills/triage.mjs [prs|issues|all] [--repo o/r] [--input fixture.json] [--now ISO] [--no-llm]
//
// One batched `gh pr list` (+ `gh issue list`), status marks per the skill, most-actionable-first sort, the
// markdown table(s) and the three-line footer. Never writes. Ollama (`draft`) may phrase the one-sentence
// recommendation; the deterministic sentence is the fallback. `--input` takes `{prs, issues}` JSON.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { mdTable } from './lib/format.mjs';
import { issueList, prList } from './lib/gh.mjs';
import { isNoLlm, run as llm } from './lib/ollama.mjs';
import { rollupChecks } from './sitrep.mjs';

const PR_FIELDS = 'number,title,url,author,isDraft,createdAt,updatedAt,mergeable,reviewDecision,statusCheckRollup,labels,additions,deletions';
const ISSUE_FIELDS = 'number,title,url,author,createdAt,updatedAt,labels,assignees';
const DAY = 86400000;

export const isBot = (author) => {
  const login = String(author?.login ?? author ?? '');
  return author?.is_bot === true || /\[bot\]$/.test(login) || /^(dependabot|renovate)/i.test(login);
};

export const trunc = (s, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const ageDays = (iso, now) => Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
export const ageMark = (d) => (d < 2 ? '🕐' : d <= 7 ? '🕒' : '🕗');

/** Derive every mark and sort rank for one PR. */
export function classifyPr(pr, now = Date.now()) {
  const roll = rollupChecks(pr.statusCheckRollup);
  const checks = !roll.total ? '⚪' : roll.failed ? '❌' : roll.pending ? '🟡' : '✅';
  const review = { APPROVED: '👍', CHANGES_REQUESTED: '🔴', REVIEW_REQUIRED: '👀' }[pr.reviewDecision] ?? '⚪';
  const merge = { MERGEABLE: '🟢', CONFLICTING: '⚔️' }[pr.mergeable] ?? '❔';
  const bot = isBot(pr.author);
  const kind = bot ? '🤖' : pr.isDraft ? '📝' : '👤';
  const days = ageDays(pr.createdAt, now);
  // ready to land → failing → changes requested → awaiting review → drafts
  let rank = 3;
  if (pr.isDraft) rank = 4;
  else if (checks === '✅' && review === '👍') rank = 0;
  else if (checks === '❌') rank = 1;
  else if (review === '🔴') rank = 2;
  return { pr, checks, review, merge, kind, bot, days, age: `${ageMark(days)} ${days}d`, rank };
}

export function sortPrs(prs, now = Date.now()) {
  return prs.map((p) => classifyPr(p, now)).sort((a, b) => a.rank - b.rank || b.days - a.days || a.pr.number - b.pr.number);
}

const link = (n, url) => (url ? `[#${n}](${url})` : `#${n}`);
const delta = (p) => `+${p.additions ?? 0}/−${p.deletions ?? 0}`;

export function renderPrTable(rows) {
  return mdTable(
    ['PR', 'Title', 'Kind', 'Checks', 'Review', 'Merge', 'Age', 'Δ'],
    rows.map((c) => [link(c.pr.number, c.pr.url), trunc(c.pr.title ?? ''), c.kind, c.checks, c.review, c.merge, c.age, delta(c.pr)]),
  ).replace('|---|---|---|---|---|---|---|---|', '| --- | --- | :-: | :-: | :-: | :-: | :-: | --- |');
}

export function renderIssueTable(issues, now = Date.now()) {
  const rows = [...issues].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return mdTable(
    ['Issue', 'Title', 'Labels', 'Assignee', 'Age'],
    rows.map((i) => {
      const d = ageDays(i.createdAt, now);
      return [link(i.number, i.url), trunc(i.title ?? ''), (i.labels ?? []).map((l) => l.name ?? l).join(', ') || '—', (i.assignees ?? []).map((a) => `@${a.login ?? a}`).join(' ') || '—', `${ageMark(d)} ${d}d`];
    }),
  );
}

export function counts(rows) {
  const n = (f) => rows.filter(f).length;
  return `${rows.length} open · ${n((c) => c.rank === 0)} ready to land · ${n((c) => c.rank === 1)} failing · ${n((c) => c.rank === 3 || c.rank === 2)} awaiting review · ${n((c) => c.bot)} bot`;
}

export function legend(rows) {
  const used = (key, table) => Object.entries(table).filter(([m]) => rows.some((c) => c[key] === m)).map(([m, w]) => `${m} ${w}`);
  return [
    ...used('checks', { '✅': 'green', '❌': 'failing', '🟡': 'pending', '⚪': 'none' }),
    ...used('review', { '👍': 'approved', '🔴': 'changes requested', '👀': 'review required' }),
    ...used('merge', { '🟢': 'mergeable', '⚔️': 'conflicting', '❔': 'unknown' }),
    ...used('kind', { '🤖': 'bot', '👤': 'human', '📝': 'draft' }),
    '🕐 <2d · 🕒 2–7d · 🕗 >7d',
  ].join(' · ');
}

/** Deterministic one-sentence suggestion about the top-ranked row. */
export function recommend(rows) {
  const top = rows[0];
  if (!top) return 'Nothing open: no action needed.';
  const n = `#${top.pr.number}`;
  if (top.rank === 0) return `Land ${n} first: checks are green and it is approved.`;
  if (top.rank === 1) return `Fix CI on ${n}: its checks are failing.`;
  if (top.rank === 2) return `Address the requested changes on ${n}.`;
  if (top.rank === 3) return `Review ${n}: it is waiting on a reviewer.`;
  return `Only drafts are open; finish ${n} and mark it ready.`;
}

const oneSentence = (s) => (String(s).trim().split(/(?<=[.!?])\s/)[0] ?? '').replace(/\n.*/s, '');

export async function renderTriage({ prs = [], issues = [], scope = 'prs', now = Date.now(), noLlm = false, fetch, url } = {}) {
  const out = [];
  const rows = sortPrs(prs, now);
  if (scope !== 'issues') {
    if (!rows.length) out.push('No open PRs.');
    else {
      out.push(renderPrTable(rows), '');
      const rec = await llm({
        task: 'draft',
        noLlm,
        fetch,
        url,
        prompt: `One sentence, under 25 words, naming the single highest-value next action for this PR queue (suggestion only).\n${rows.slice(0, 8).map((c) => `#${c.pr.number} ${c.pr.title} checks=${c.checks} review=${c.review} merge=${c.merge}`).join('\n')}`,
        fallback: () => recommend(rows),
      });
      out.push(`${counts(rows)}`, legend(rows), oneSentence(rec.text) || recommend(rows));
    }
  }
  if (scope !== 'prs') {
    if (scope === 'all' && out.length) out.push('');
    out.push(...(scope === 'all' ? ['### Issues', ''] : []), issues.length ? renderIssueTable(issues, now) : 'No open issues.');
  }
  return out.join('\n');
}

const arg = (argv, name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

export async function gather(argv, scope, { run } = {}) {
  const input = arg(argv, '--input');
  if (input) {
    const j = JSON.parse(readFileSync(input, 'utf8'));
    return { prs: j.prs ?? [], issues: j.issues ?? [] };
  }
  const repo = arg(argv, '--repo');
  const [p, i] = await Promise.all([
    scope === 'issues' ? { ok: true, data: [] } : prList({ repo, run, fields: PR_FIELDS }),
    scope === 'prs' ? { ok: true, data: [] } : issueList({ repo, run, fields: ISSUE_FIELDS }),
  ]);
  const bad = [p, i].find((x) => !x.ok);
  if (bad) throw new Error(`gh ${bad.kind}: ${bad.message}`);
  return { prs: p.data ?? [], issues: i.data ?? [] };
}

async function main(argv) {
  const scope = ['prs', 'issues', 'all'].find((s) => argv.includes(s)) ?? 'prs';
  const data = await gather(argv, scope);
  console.log(await renderTriage({ ...data, scope, now: arg(argv, '--now') ? Date.parse(arg(argv, '--now')) : Date.now(), noLlm: isNoLlm(argv) }));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main(process.argv.slice(2)).then(
    (c) => process.exit(c),
    (e) => (console.error(`triage: ${e.message}`), process.exit(1)),
  );
