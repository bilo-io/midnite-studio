#!/usr/bin/env node
// CI watcher (Phase 151 Theme H): polls a PR's checks until green/merged/closed, classifies failures
// with pr-feedback's classifier, reruns a known flake ONCE, stops fast on a billing lock and prints
// the failing job's `--log-failed` tail. Replaces the hand-run `until` loops in the PR skills.
//
//   node scripts/skills/ci-watch.mjs <pr> [--until green|merged|closed] [--rerun-flakes-once]
//        [--interval s] [--timeout m] [--json] [--no-llm]
//
// Exit codes: 0 reached target, 1 real failure, 2 usage, 3 timeout, 4 billing lock, 5 closed/merged
// when waiting for green, 6 gh error. `--no-llm` is accepted and a no-op (no LLM use here).
import { fileURLToPath } from 'node:url';
import { defaultRun, ghJson, prView } from './lib/gh.mjs';
import { REPO, arg, repoToken } from './lib/pr-common.mjs';
import { classifyChecks } from './pr-feedback.mjs';

export const EXIT = { ok: 0, fail: 1, usage: 2, timeout: 3, billing: 4, closed: 5, error: 6 };
export const LOG_TAIL_LINES = 80;

export const tail = (text, n = LOG_TAIL_LINES) => String(text).split('\n').slice(-n).join('\n');

/** Pure decision for one poll: `{done, code?, reason, rerun[]}`. */
export function decide({ view, checks, until = 'green', rerunFlakes = false, reran = new Set() }) {
  const state = view.state; // OPEN | MERGED | CLOSED
  if (until === 'merged') {
    if (state === 'MERGED') return { done: true, code: EXIT.ok, reason: 'merged' };
    if (state === 'CLOSED') return { done: true, code: EXIT.closed, reason: 'closed without merging' };
    return { done: false, reason: 'waiting for merge' };
  }
  if (until === 'closed') return state === 'OPEN' ? { done: false, reason: 'still open' } : { done: true, code: EXIT.ok, reason: state.toLowerCase() };
  if (state !== 'OPEN') return { done: true, code: EXIT.closed, reason: `PR is ${state.toLowerCase()}` };
  const cls = classifyChecks(checks);
  if (cls.billing) return { done: true, code: EXIT.billing, reason: 'Actions billing lock: CI will not run; reruns will not help', cls };
  const pending = checks.filter((c) => c.bucket === 'pending');
  const real = cls.items.filter((i) => i.kind === 'real');
  const flakes = cls.items.filter((i) => i.kind === 'flake' && i.runId && !reran.has(i.runId));
  if (rerunFlakes && flakes.length) return { done: false, reason: 'rerunning known flake', rerun: [...new Set(flakes.map((f) => f.runId))], cls };
  if (real.length || (cls.items.length && pending.length === 0)) return { done: true, code: EXIT.fail, reason: `failing: ${cls.items.map((i) => `${i.kind}:${i.name}`).join(', ')}`, cls };
  if (pending.length) return { done: false, reason: `${pending.length} pending` };
  if (checks.length === 0) return { done: false, reason: 'no checks yet' };
  return { done: true, code: EXIT.ok, reason: 'all checks green' };
}

/**
 * `gh pr checks` exits non-zero (8) while checks fail or pend yet still prints the JSON, so read stdout off
 * the rejection too. "no checks reported" is an empty list; anything unparseable is `null`.
 */
export async function fetchChecks(n, { run, env, repo }) {
  const args = ['pr', 'checks', String(n), '--json', 'name,state,bucket,workflow,link,startedAt,completedAt', '--repo', repo];
  let out;
  try {
    out = await run(args, { env });
  } catch (e) {
    out = e?.stdout;
    if (!out || !String(out).trim()) return /no checks/i.test(String(e?.stderr ?? e?.message ?? '')) ? [] : null;
  }
  try {
    return String(out).trim() ? JSON.parse(out) : [];
  } catch {
    return null;
  }
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('usage: ci-watch.mjs <pr> [--until green|merged|closed] [--rerun-flakes-once] [--interval s] [--timeout m] [--json] [--no-llm]\n');
    return EXIT.ok;
  }
  const n = argv.find((a) => /^\d+$/.test(a));
  const until = arg(argv, '--until') ?? 'green';
  if (!n || !['green', 'merged', 'closed'].includes(until)) {
    process.stderr.write('usage: ci-watch.mjs <pr> [--until green|merged|closed] [--rerun-flakes-once] [--interval s] [--timeout m]\n');
    return EXIT.usage;
  }
  const interval = Number(arg(argv, '--interval') ?? 30) * 1000;
  const timeout = Number(arg(argv, '--timeout') ?? 30) * 60_000;
  const json = argv.includes('--json');
  const rerunFlakes = argv.includes('--rerun-flakes-once');
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((s) => process.stderr.write(`${s}\n`));
  const run = deps.ghRun ?? defaultRun;
  const o = { repo: REPO, env: { GH_TOKEN: deps.token ?? repoToken() }, run };
  const start = now();
  const reran = new Set();
  let last = null;
  for (;;) {
    const view = await prView(n, { ...o, fields: 'state,isDraft,headRefName,url' });
    if (!view.ok) {
      log(`gh: ${view.kind}: ${view.message}`);
      return EXIT.error;
    }
    const checks = await fetchChecks(n, o);
    if (checks === null) {
      log('gh pr checks failed');
      return EXIT.error;
    }
    const d = decide({ view: view.data, checks, until, rerunFlakes, reran });
    if (d.reason !== last) log(`pr #${n}: ${d.reason}`);
    last = d.reason;
    if (d.rerun) {
      for (const id of d.rerun) {
        reran.add(id);
        await ghJson(['run', 'rerun', id, '--failed', '--repo', REPO], { ...o, run: deps.rerun ?? run });
      }
    } else if (d.done) {
      const failing = (d.cls?.items ?? []).filter((i) => i.kind === 'real' && i.runId);
      const logs = [];
      for (const f of failing.slice(0, 2)) {
        try {
          const out = await run(['run', 'view', f.runId, '--log-failed', '--repo', REPO], { env: o.env });
          logs.push({ name: f.name, tail: tail(out) });
        } catch (e) {
          logs.push({ name: f.name, tail: `(could not fetch log: ${String(e?.message ?? e).slice(0, 200)})` });
        }
      }
      const result = { pr: Number(n), code: d.code, reason: d.reason, reran: [...reran], logs };
      (deps.out ?? ((s) => process.stdout.write(s)))(json ? `${JSON.stringify(result, null, 2)}\n` : `${d.reason}\n${logs.map((l) => `--- ${l.name}\n${l.tail}`).join('\n')}${logs.length ? '\n' : ''}`);
      return d.code;
    }
    if (now() - start >= timeout) {
      log(`timeout after ${Math.round((now() - start) / 60_000)}m: ${last}`);
      return EXIT.timeout;
    }
    await sleep(interval);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => process.exit(c));
