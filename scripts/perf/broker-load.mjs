#!/usr/bin/env node
/**
 * Broker cost under a chatty pty — Phase 36 Theme G's second gate.
 *
 * The question: `broadcastData` in `broker/server.ts` is one socket write per pty
 * chunk with no coalescing. Under `yes` — the chattiest thing a terminal can
 * hold — does that cost measurable CPU? If it does, the fix is a per-pty buffer
 * flushed every 16 ms as one frame; if it does not, the deferral recorded in
 * phase 30 is acquitted and closed.
 *
 * Deliberately NOT driven through the app. The broker is a standalone process
 * that speaks a socket protocol, and the subsystem under test is the broker plus
 * one client — so this script is that client. Launching Electron and clicking a
 * terminal open would add a renderer, a compositor and an xterm to the CPU being
 * attributed to the broker, which is the opposite of what a measurement wants.
 *
 * CPU comes from `ps -o cputime` differenced across the window and divided by
 * elapsed wall time — percent of one core over exactly the interval asked for.
 * Same reasoning as `idle-cpu.mjs`: macOS's `%cpu` is a decaying average over up
 * to a minute of history and would smear the spawn into the reading.
 *
 *   moon run desktop:bundle
 *   node scripts/perf/broker-load.mjs [--seconds=10]
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const BROKER = join(REPO_ROOT, 'packages', 'desktop', 'dist', 'bundle', 'broker.js');

const seconds = Number(
  (process.argv.slice(2).find((a) => a.startsWith('--seconds=')) ?? '--seconds=10').split('=')[1],
);

if (!existsSync(BROKER)) {
  console.error(`missing ${BROKER} → moon run desktop:bundle`);
  process.exit(2);
}

/** Cumulative CPU seconds for a pid, from `ps` — the same source as idle-cpu.mjs. */
function cpuSeconds(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'cputime=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    // `mm:ss.ss`, or `hh:mm:ss` once it gets interesting.
    const parts = out.split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  } catch {
    return null;
  }
}

const rss = (pid) => {
  try {
    return Math.round(Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim()) / 1024);
  } catch {
    return null;
  }
};

const userData = mkdtempSync(join(tmpdir(), 'mstudio-broker-load-'));
const socketPath = join(userData, 'broker.sock');

// `ELECTRON_RUN_AS_NODE` is what the broker expects of itself; running it under
// plain node is the same thing without shipping an Electron binary into the
// measurement.
const broker = spawn(process.execPath, [BROKER, '--socket', socketPath, '--user-data', userData], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, MSTUDIO_PERF: '1', ELECTRON_RUN_AS_NODE: '1' },
});

const brokerLines = [];
for (const stream of [broker.stdout, broker.stderr]) {
  stream?.setEncoding('utf8');
  let partial = '';
  stream?.on('data', (chunk) => {
    partial += chunk;
    const lines = partial.split('\n');
    partial = lines.pop() ?? '';
    for (const line of lines) if (line.includes('[perf]')) brokerLines.push(line.trim());
  });
}

const cleanup = () => {
  try {
    broker.kill('SIGKILL');
  } catch {}
  rmSync(userData, { recursive: true, force: true });
};
process.on('exit', cleanup);

/** Wait for the broker to create its socket. */
async function waitForSocket(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

if (!(await waitForSocket())) {
  console.error('broker never created its socket');
  process.exit(1);
}

const encodeControl = (msg) => {
  const json = JSON.stringify(msg);
  const len = Buffer.byteLength(json, 'utf8');
  const buf = Buffer.allocUnsafe(5 + len);
  buf[0] = 0x00;
  buf.writeUInt32BE(len, 1);
  buf.write(json, 5, len, 'utf8');
  return buf;
};

const client = connect(socketPath);
await new Promise((r, j) => {
  client.once('connect', r);
  client.once('error', j);
});

/*
  Every data frame is read and discarded. A client that stops reading is a
  different experiment: the socket's buffer fills, `write` starts returning false,
  and what gets measured is backpressure rather than the write cost. Counting the
  bytes we actually receive also cross-checks the broker's own counter.
*/
let received = 0;
let frames = 0;
client.on('data', (chunk) => {
  received += chunk.length;
  frames += 1;
});

client.write(encodeControl({ t: 'hello', id: 1, protocol: 1, appVersion: '0.0.0', pid: process.pid }));
client.write(
  encodeControl({
    t: 'create',
    id: 2,
    sessionId: 'perf-broker-load',
    cwd: REPO_ROOT,
    cols: 120,
    rows: 40,
    // `yes` with no argument prints "y\n" as fast as the pty will take it — the
    // upper bound on how chatty a real command can be.
    env: { TERM: 'xterm-256color', PATH: process.env['PATH'] ?? '' },
    initialInput: 'yes\r',
  }),
);

// Let the spawn and the first burst settle before the window opens, so what is
// measured is steady state rather than startup.
await new Promise((r) => setTimeout(r, 2000));

const cpu0 = cpuSeconds(broker.pid);
const wall0 = Date.now();
const bytes0 = received;
const frames0 = frames;

process.stderr.write(`measuring ${seconds}s of \`yes\` through the broker…\n`);
await new Promise((r) => setTimeout(r, seconds * 1000));

const cpu1 = cpuSeconds(broker.pid);
const elapsed = (Date.now() - wall0) / 1000;
const rssMb = rss(broker.pid);

const pct = cpu0 !== null && cpu1 !== null ? ((cpu1 - cpu0) / elapsed) * 100 : null;
const mbPerSec = (received - bytes0) / 1024 / 1024 / elapsed;
const framesPerSec = (frames - frames0) / elapsed;

console.log(`\nbroker under \`yes\` — ${elapsed.toFixed(1)}s window, 1 client\n`);
console.log(`  broker CPU        ${pct === null ? 'unavailable' : `${pct.toFixed(1)}% of one core`}`);
console.log(`  throughput        ${mbPerSec.toFixed(1)} MB/s to the client`);
console.log(`  socket reads/s    ${framesPerSec.toFixed(0)} (client side; the kernel coalesces)`);
console.log(`  broker RSS        ${rssMb === null ? 'unavailable' : `${rssMb} MB`}`);
if (brokerLines.length > 0) {
  console.log(`\n  broker's own counter, last line:\n    ${brokerLines[brokerLines.length - 1]}`);
}
console.log('');

// The gate, stated where the number is produced: >2% of a core is the threshold
// Theme G set for implementing 16ms frame coalescing.
const THRESHOLD_PCT = 2;
if (pct !== null) {
  console.log(
    pct > THRESHOLD_PCT
      ? `INDICTED: ${pct.toFixed(1)}% > ${THRESHOLD_PCT}% — implement per-pty 16ms coalescing.`
      : `ACQUITTED: ${pct.toFixed(1)}% ≤ ${THRESHOLD_PCT}% — no coalescing needed.`,
  );
}
console.log('');

client.destroy();
process.exit(0);
