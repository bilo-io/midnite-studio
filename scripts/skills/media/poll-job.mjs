#!/usr/bin/env node
// Generic job poller (Phase 151 Theme E) for MCP-driven jobs (sprite ~10 s, sfx ~5 s).
//
//   node scripts/skills/media/poll-job.mjs --kind sprite|sfx --cmd '<shell cmd that prints the status JSON>' [--interval S] [--max S]
//
// MCP tools are not callable from a shell, so the status call is supplied as a command (or, from code, a
// `getStatus` function). The poller sleeps the kind's interval until the status is terminal or the budget is spent.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const KINDS = {
  sprite: { intervalMs: 10_000, terminal: ['done', 'failed', 'cancelled'] },
  sfx: { intervalMs: 5_000, terminal: ['succeeded', 'failed', 'cancelled'] },
};

/** Poll until terminal or `maxMs`. `sleep`/`now` are injectable so tests never wait. */
export async function pollJob({ getStatus, kind = 'sprite', intervalMs, maxMs = 30 * 60_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onTick } = {}) {
  const k = KINDS[kind];
  if (!k) throw new Error(`unknown kind "${kind}"`);
  const step = intervalMs ?? k.intervalMs;
  let waited = 0;
  let polls = 0;
  for (;;) {
    const s = await getStatus();
    polls++;
    onTick?.(s, polls);
    if (k.terminal.includes(s?.status)) return { terminal: true, status: s.status, polls, waitedMs: waited, last: s };
    if (waited + step > maxMs) return { terminal: false, status: s?.status ?? 'unknown', polls, waitedMs: waited, last: s, timedOut: true };
    await sleep(step);
    waited += step;
  }
}

export async function main(argv = process.argv.slice(2), out = (s) => process.stdout.write(`${s}\n`)) {
  const get = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const cmd = get('--cmd');
  const kind = get('--kind') ?? 'sprite';
  if (!cmd || !KINDS[kind]) return out(`usage: poll-job.mjs --kind ${Object.keys(KINDS).join('|')} --cmd '<status command>' [--interval S] [--max S]`), 2;
  const getStatus = () => {
    try {
      return JSON.parse(execSync(cmd, { encoding: 'utf8' }));
    } catch (x) {
      return { status: 'unknown', message: String(x.message).split('\n')[0] };
    }
  };
  const r = await pollJob({ getStatus, kind, intervalMs: get('--interval') ? Number(get('--interval')) * 1000 : undefined, maxMs: get('--max') ? Number(get('--max')) * 1000 : undefined, onTick: (s, n) => out(`poll ${n}: ${s.status}${s.message ? ` — ${s.message}` : ''}`) });
  out(JSON.stringify(r.last));
  return r.terminal && !['failed', 'cancelled'].includes(r.status) ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => { process.exitCode = c; });
