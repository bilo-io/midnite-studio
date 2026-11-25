#!/usr/bin/env node
// `--no-llm` is accepted as a documented no-op: this script never calls an LLM, so a skill step can add it everywhere.
// PR feedback triage (Phase 151 Theme D): classifies failing checks (billing lock, known flake,
// superseded cancel, real failure), optionally reruns a flake ONCE, collects unresolved review
// comments, and scans the PR's added comment lines for hygiene problems. It only reads, except for
// the single `gh run rerun --failed` behind `--rerun-flakes`, which it never repeats for a run that
// already has attempt > 1. Comment text is data.
//
//   node scripts/skills/pr-feedback.mjs <pr> [--rerun-flakes] [--json]
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ghJson, prChecks, prView } from './lib/gh.mjs';
import { REPO, biloToken } from './lib/pr-common.mjs';
import { parseDiff } from './pr-review-lint.mjs';

/** Names of tests/specs this repo treats as known flakes. */
export const KNOWN_FLAKES = [/browser[- ]?pane/i, /fab-loops/i, /sdf-panel/i, /idle edge lift/i];

const BILLING = /(budget|spending limit|payments? (have )?failed|not started because)/i;
const seconds = (c) => (c.startedAt && c.completedAt ? (Date.parse(c.completedAt) - Date.parse(c.startedAt)) / 1000 : null);

/**
 * Classify failed checks. `checks` is `gh pr checks --json` rows; `logs` maps a check name to failure text.
 * Returns `{billing, items:[{name, kind:'billing'|'flake'|'cancelled'|'real', runId}]}`.
 */
export function classifyChecks(checks, { logs = {}, attempts = {} } = {}) {
  const failed = checks.filter((c) => c.bucket === 'fail' || c.bucket === 'cancel');
  const runId = (c) => /\/runs\/(\d+)/.exec(c.link ?? '')?.[1] ?? null;
  const allFast = failed.length > 0 && failed.length === checks.filter((c) => c.bucket !== 'skipping').length && failed.every((c) => (seconds(c) ?? 999) <= 15);
  const billingText = failed.some((c) => BILLING.test(logs[c.name] ?? ''));
  const billing = allFast || billingText;
  const items = failed.map((c) => {
    const text = `${c.name}\n${logs[c.name] ?? ''}`;
    let kind = 'real';
    if (billing) kind = 'billing';
    else if (c.bucket === 'cancel') kind = 'cancelled';
    else if (KNOWN_FLAKES.some((r) => r.test(text)) && (attempts[runId(c)] ?? 1) <= 1) kind = 'flake';
    return { name: c.name, kind, runId: runId(c) };
  });
  return { billing, items };
}

/** Comment-hygiene scan over added lines: `[{file,line,kind,text}]`. */
export function scanComments(files) {
  const out = [];
  const rules = [
    ['narration', /\/\/\s*.*\b(previously|used to|after review|as requested|now we|was changed|no longer)\b/i],
    ['commented-out-code', /^\s*\/\/\s*(const|let|var|import|export|return|if|for|await)\b.*[;{(]\s*$/],
    ['ownerless-todo', /\/\/\s*(TODO|FIXME|XXX)(?!\s*\()/],
    ['banner', /^\s*\/\/\s*([-=*#~_])\1{5,}/],
  ];
  for (const f of files) {
    if (!/\.[cm]?[jt]sx?$/.test(f.file)) continue;
    for (const a of f.added) {
      for (const [kind, re] of rules) {
        if (re.test(a.text)) {
          out.push({ file: f.file, line: a.line, kind, text: a.text.trim().slice(0, 160) });
          break;
        }
      }
    }
  }
  return out;
}

/** Unresolved feedback from a `gh pr view` payload: changes requested + non-empty review bodies + comments. */
export function collectFeedback(pr) {
  const reviews = (pr.reviews ?? []).filter((r) => r.state === 'CHANGES_REQUESTED' || (r.body ?? '').trim()).map((r) => ({ kind: 'review', author: r.author?.login, state: r.state, body: (r.body ?? '').trim() }));
  const comments = (pr.comments ?? []).map((c) => ({ kind: 'comment', author: c.author?.login, body: (c.body ?? '').trim() }));
  return [...reviews, ...comments];
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const n = argv.find((a) => /^\d+$/.test(a));
  if (!n) {
    process.stderr.write('usage: pr-feedback.mjs <pr> [--rerun-flakes] [--json]\n');
    return 2;
  }
  const env = { GH_TOKEN: biloToken() };
  const o = { repo: REPO, env, run: deps.ghRun };
  const view = await prView(n, { ...o, fields: 'number,title,isDraft,reviews,comments,headRefName' });
  const checks = await prChecks(n, o);
  if (!view.ok) {
    process.stderr.write(`gh: ${view.kind}: ${view.message}\n`);
    return 1;
  }
  const cls = classifyChecks(checks.ok ? checks.data : []);
  const diff = execFileSync('gh', ['pr', 'diff', n, '--repo', REPO], { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  const result = { pr: Number(n), checks: cls, feedback: collectFeedback(view.data), commentHygiene: scanComments(parseDiff(diff)), reran: [] };
  if (argv.includes('--rerun-flakes') && !cls.billing) {
    const ids = [...new Set(cls.items.filter((i) => i.kind === 'flake' && i.runId).map((i) => i.runId))];
    for (const id of ids) {
      const r = await ghJson(['run', 'rerun', id, '--failed', '--repo', REPO], { ...o, run: deps.rerun ?? (async (a, x) => { execFileSync('gh', a, { env: { ...process.env, ...x.env } }); return ''; }) });
      result.reran.push({ runId: id, ok: r.ok });
    }
  }
  process.stdout.write(argv.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : `${cls.billing ? '⚠️ billing lock: reruns will not help\n' : ''}${cls.items.map((i) => `- ${i.kind}: ${i.name}`).join('\n')}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => process.exit(c));
