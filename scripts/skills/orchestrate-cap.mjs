#!/usr/bin/env node
// Subagent cap state machine (Phase 151 Theme E). Logic behind orchestrate-cap.sh.
//
//   node scripts/skills/orchestrate-cap.mjs --cpu 41 --ram 55 [--cap 3] [--low-streak 0] [--state file] [--json]
//   node scripts/skills/orchestrate-cap.mjs --transcript agent.jsonl [--window 1000000] [--tail-kb 256] [--tail-lines 300]
//   flags on the cap run: --queued N (waiting agents), --max N (user ceiling, 2-6), --chart (3-line machine block)
//
// Capacity = max(CPU %, RAM %). > 80 lowers the cap by 1 (floor 2); < 60 on two checks in a row raises it by 1
// (ceiling 6); in between keeps it and resets the streak. Start cap is 3. Pure functions are exported; the CLI
// only reads the numbers it is given (orchestrate-cap.sh samples `top` + `memory_pressure`).
import { closeSync, fstatSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { bar } from './lib/format.mjs';

export const CAP_MIN = 2;
export const CAP_MAX = 6;
export const CAP_START = 3;
export const HIGH = 80;
export const LOW = 60;

/** `CPU usage: 5.2% user, 8.1% sys, 86.7% idle` -> 13.3 (percent busy), null when unparseable. */
export function parseCpu(line) {
  const m = /([\d.]+)%\s*idle/i.exec(String(line ?? ''));
  return m ? Math.round((100 - Number(m[1])) * 10) / 10 : null;
}

/** `System-wide memory free percentage: 42%` -> 58 (percent used), null when unparseable. */
export function parseRam(line) {
  const m = /free percentage:\s*([\d.]+)%/i.exec(String(line ?? ''));
  return m ? Math.round((100 - Number(m[1])) * 10) / 10 : null;
}

/** The user's ceiling, clamped into 2-6 (a bad value falls back to 6). */
export const clampMax = (max) => (Number.isFinite(Number(max)) ? Math.min(CAP_MAX, Math.max(CAP_MIN, Math.trunc(Number(max)))) : CAP_MAX);

export const capacity = (cpu, ram) => Math.max(Number(cpu) || 0, Number(ram) || 0);

/**
 * One tick of the state machine.
 * @returns {{cap:number, lowStreak:number, capacity:number, action:'lower'|'raise'|'keep'|'hold-low', reason:string}}
 */
export function nextCap({ cap = CAP_START, lowStreak = 0, cpu = 0, ram = 0, max = CAP_MAX } = {}) {
  const ceil = clampMax(max);
  const cur = Math.min(ceil, Math.max(CAP_MIN, Math.trunc(cap)));
  const cp = capacity(cpu, ram);
  if (cp > HIGH) {
    const next = Math.max(CAP_MIN, cur - 1);
    return { cap: next, lowStreak: 0, capacity: cp, action: next < cur ? 'lower' : 'keep', reason: `capacity ${cp}% > ${HIGH}%` };
  }
  if (cp < LOW) {
    const streak = lowStreak + 1;
    if (streak >= 2 && cur < ceil) {
      return { cap: cur + 1, lowStreak: 0, capacity: cp, action: 'raise', reason: `capacity ${cp}% < ${LOW}% twice running` };
    }
    return { cap: cur, lowStreak: streak, capacity: cp, action: 'hold-low', reason: `capacity ${cp}% < ${LOW}% (check ${Math.min(streak, 2)}/2)` };
  }
  return { cap: cur, lowStreak: 0, capacity: cp, action: 'keep', reason: `capacity ${cp}% in ${LOW}-${HIGH}%` };
}

/** How many running agents to stop gracefully (lowest priority first). */
export const surplus = (running, cap) => Math.max(0, running - cap);

/** The `🤖 Subagent CAP: <x> (<n> running)` line every spawn message and sitrep carries. */
export const capLine = (cap, running, queued = 0) => `🤖 Subagent CAP: ${cap} (${running} running${queued > 0 ? `, ${queued} queued` : ''})`;

/** The machine line: ASCII bars for CPU / RAM plus the cap. */
export function machineLine({ cpu, ram, cap, running = 0, queued = 0 }) {
  const p = (n) => `${bar(Math.round(n))} ${Math.round(n)}%`;
  return `CPU ${p(cpu)} · RAM ${p(ram)} · ${capLine(cap, running, queued)}`;
}

/** The three-line `🩺 Machine` block: CPU and RAM as 10-cell bars, then the cap as a 6-cell bar out of the 6 ceiling. */
export function chartBlock({ cpu, ram, cap, running = 0, queued = 0 }) {
  const p = (n) => `${bar(Math.round(n))} ${String(Math.round(n)).padStart(3)}%`;
  return [
    `🩺 Machine   CPU ${p(cpu)}   RAM ${p(ram)}`,
    `   CAP ${bar(Math.round((cap / CAP_MAX) * 100), CAP_MAX)} ${cap}/${CAP_MAX}`,
    `   ${capLine(cap, running, queued)}`,
  ].join('\n');
}

/** Last `maxLines` lines of the last `maxBytes` of a file; a transcript can be hundreds of MB and only the tail matters. */
export function readTail(path, { maxBytes = 256 * 1024, maxLines = 300 } = {}) {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const len = Math.min(size, maxBytes);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    let lines = buf.toString('utf8').split('\n');
    if (size > len) lines = lines.slice(1); // the first line is cut mid-record
    return lines.slice(-maxLines).join('\n');
  } finally {
    closeSync(fd);
  }
}

/**
 * Context tokens of the latest assistant turn in a Claude transcript (jsonl): input + cache read + cache creation.
 * Returns null when no usage record exists.
 */
export function contextTokens(jsonl) {
  let last = null;
  for (const line of String(jsonl).split('\n')) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const u = o?.message?.usage ?? o?.usage;
    if (u && typeof u === 'object') {
      last = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    }
  }
  return last;
}

/** Rotate at 40-60% of the window: `ok` < 40, `watch` 40-60, `rotate` >= 60. */
export function rotationState(tokens, windowSize = 1_000_000) {
  if (tokens == null) return { pct: null, state: 'unknown' };
  const pct = Math.round((tokens / windowSize) * 100);
  return { pct, state: pct >= 60 ? 'rotate' : pct >= 40 ? 'watch' : 'ok' };
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function main(argv = process.argv.slice(2), io = { out: (s) => process.stdout.write(`${s}\n`) }) {
  const transcript = arg(argv, '--transcript');
  if (transcript) {
    const tokens = contextTokens(
      readTail(transcript, { maxBytes: Number(arg(argv, '--tail-kb') ?? 256) * 1024, maxLines: Number(arg(argv, '--tail-lines') ?? 300) }),
    );
    const r = rotationState(tokens, Number(arg(argv, '--window') ?? 1_000_000));
    io.out(argv.includes('--json') ? JSON.stringify({ tokens, ...r }) : `context ${tokens ?? '?'} tokens (${r.pct ?? '?'}%) -> ${r.state}`);
    return 0;
  }
  const statePath = arg(argv, '--state');
  let saved = {};
  if (statePath) {
    try {
      saved = JSON.parse(readFileSync(statePath, 'utf8'));
    } catch {
      /* first run */
    }
  }
  const cpu = Number(arg(argv, '--cpu'));
  const ram = Number(arg(argv, '--ram'));
  if (!Number.isFinite(cpu) || !Number.isFinite(ram)) {
    process.stderr.write('usage: orchestrate-cap.mjs --cpu N --ram N [--cap N] [--low-streak N] [--running N] [--queued N] [--max N] [--chart] [--state file] [--json]\n');
    return 2;
  }
  const cap = Number(arg(argv, '--cap') ?? saved.cap ?? CAP_START);
  const lowStreak = Number(arg(argv, '--low-streak') ?? saved.lowStreak ?? 0);
  const running = Number(arg(argv, '--running') ?? 0);
  const queued = Number(arg(argv, '--queued') ?? 0);
  const max = clampMax(arg(argv, '--max'));
  const r = nextCap({ cap, lowStreak, cpu, ram, max });
  if (statePath) writeFileSync(statePath, JSON.stringify({ cap: r.cap, lowStreak: r.lowStreak }));
  const out = { ...r, cpu, ram, running, queued, max, stop: surplus(running, r.cap), line: machineLine({ cpu, ram, cap: r.cap, running, queued }) };
  if (argv.includes('--chart')) out.chart = chartBlock({ cpu, ram, cap: r.cap, running, queued });
  io.out(argv.includes('--json') ? JSON.stringify(out) : `${out.chart ?? out.line}\n${r.action}: ${r.reason}${out.stop ? ` · stop ${out.stop} agent(s) gracefully` : ''}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
