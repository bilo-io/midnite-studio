import { mkdtempSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrameDecoder, encodeControl, PROTOCOL, type Frame } from './protocol';
import { createBrokerServer, type IPtyLike, type SpawnPtyFn } from './server';

/**
 * Phase 36 Theme G — the 16ms output coalescing, and the ordering it must not break.
 *
 * The gate that produced this change: `broadcastData` was one socket write and
 * one whole-buffer scrollback realloc per pty chunk, and under `yes` the broker
 * sat at 96.8% of a core for 7.6 MB/s. Coalescing into one frame per 16ms window
 * took that to 1.16% of a core per MB/s — 11× less CPU per byte — but it buys
 * that by holding bytes back for up to 16ms, and every path that can *observe* a
 * stream has to flush first or it reads history that is stale, doubled, or short.
 *
 * So these tests are about ordering, not throughput. Throughput is measured by
 * `scripts/perf/broker-load.mjs`, which is where a number belongs; what belongs
 * in a test is the invariant a later refactor could silently reverse.
 */
const COALESCE_MS = 16;

/**
 * Long enough for a 16ms window to have closed even when the whole suite is
 * running in parallel on a loaded machine, short enough to keep this file quick.
 * 60ms was not: a late timer under load left a flushed frame still in flight.
 */
const AFTER_WINDOW_MS = COALESCE_MS * 10;

function createFakePty(pid = 1000): {
  pty: IPtyLike;
  emitData: (data: string) => void;
  emitExit: (exitCode: number, signal?: number) => void;
} {
  let dataListener: ((data: string) => void) | null = null;
  let exitListener: ((e: { exitCode: number; signal?: number }) => void) | null = null;

  const pty: IPtyLike = {
    pid,
    onData: (l) => {
      dataListener = l;
      return { dispose: () => {} };
    },
    onExit: (l) => {
      exitListener = l;
      return { dispose: () => {} };
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => exitListener?.({ exitCode: 0 })),
  };

  return {
    pty,
    emitData: (d) => dataListener?.(d),
    emitExit: (code, sig) => exitListener?.({ exitCode: code, signal: sig }),
  };
}

/** A connected, hello'd client that records every frame the broker sends it. */
async function client(socketPath: string): Promise<{
  frames: Frame[];
  send: (buf: Buffer) => void;
  text: () => string;
  close: () => void;
}> {
  const socket = net.connect(socketPath);
  const decoder = createFrameDecoder();
  const frames: Frame[] = [];

  socket.on('data', (chunk) => {
    frames.push(...decoder.push(chunk));
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('error', reject);
  });

  socket.write(
    encodeControl({ t: 'hello', id: 1, protocol: PROTOCOL, appVersion: '0.1.0', pid: process.pid }),
  );
  await new Promise((r) => setTimeout(r, 20));

  return {
    frames,
    send: (buf) => socket.write(buf),
    /** Every data frame's payload, concatenated in arrival order. */
    text: () =>
      frames
        .filter((f): f is Extract<Frame, { type: 0x01 }> => f.type === 0x01)
        .map((f) => new TextDecoder().decode(f.data))
        .join(''),
    close: () => socket.destroy(),
  };
}

const started: Array<{ close: () => Promise<void> }> = [];

async function broker(spawnPty: SpawnPtyFn): Promise<{ socketPath: string; userDataDir: string }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mstudio-coalesce-test-'));
  const socketPath = join(userDataDir, 'b.sock');
  const server = createBrokerServer({ socketPath, userDataDir, spawnPty });
  started.push(server);
  await new Promise((r) => setTimeout(r, 20));
  return { socketPath, userDataDir };
}

afterEach(async () => {
  for (const server of started.splice(0)) await server.close();
});

const createSession = (sessionId: string, cwd: string): Buffer =>
  encodeControl({ t: 'create', id: 2, sessionId, cwd, cols: 80, rows: 24, env: {} });

describe('per-pty output coalescing', () => {
  it('merges the chunks of one window into a single data frame, in order', async () => {
    const fake = createFakePty();
    const { socketPath, userDataDir } = await broker(() => fake.pty);
    const c = await client(socketPath);

    c.send(createSession('s1', userDataDir));
    await new Promise((r) => setTimeout(r, 30));

    for (const part of ['alpha ', 'beta ', 'gamma']) fake.emitData(part);
    await new Promise((r) => setTimeout(r, AFTER_WINDOW_MS));

    const data = c.frames.filter((f) => f.type === 0x01);
    // The point of the change: three chunks, one frame — not three.
    expect(data).toHaveLength(1);
    expect(c.text()).toBe('alpha beta gamma');

    c.close();
  });

  it('keeps ordering across windows', async () => {
    const fake = createFakePty();
    const { socketPath, userDataDir } = await broker(() => fake.pty);
    const c = await client(socketPath);

    c.send(createSession('s1', userDataDir));
    await new Promise((r) => setTimeout(r, 30));

    fake.emitData('first ');
    await new Promise((r) => setTimeout(r, AFTER_WINDOW_MS));
    fake.emitData('second');
    await new Promise((r) => setTimeout(r, AFTER_WINDOW_MS));

    expect(c.frames.filter((f) => f.type === 0x01)).toHaveLength(2);
    expect(c.text()).toBe('first second');

    c.close();
  });

  it('never interleaves two ptys into one frame', async () => {
    const a = createFakePty(1001);
    const b = createFakePty(1002);
    const ptys = [a.pty, b.pty];
    let next = 0;
    const { socketPath, userDataDir } = await broker(() => ptys[next++] ?? a.pty);
    const c = await client(socketPath);

    c.send(encodeControl({ t: 'create', id: 2, sessionId: 'a', cwd: userDataDir, cols: 80, rows: 24, env: {} }));
    await new Promise((r) => setTimeout(r, 30));
    c.send(encodeControl({ t: 'create', id: 3, sessionId: 'b', cwd: userDataDir, cols: 80, rows: 24, env: {} }));
    await new Promise((r) => setTimeout(r, 30));

    a.emitData('AAA');
    b.emitData('BBB');
    await new Promise((r) => setTimeout(r, AFTER_WINDOW_MS));

    const data = c.frames.filter((f): f is Extract<Frame, { type: 0x01 }> => f.type === 0x01);
    // Two ptys, two frames, each carrying only its own bytes — a shared buffer
    // would have produced one frame with both, addressed to whichever id flushed.
    expect(data).toHaveLength(2);
    for (const frame of data) {
      const text = new TextDecoder().decode(frame.data);
      expect(text === 'AAA' || text === 'BBB').toBe(true);
    }

    c.close();
  });

  it('flushes buffered output BEFORE the exit frame', async () => {
    const fake = createFakePty();
    const { socketPath, userDataDir } = await broker(() => fake.pty);
    const c = await client(socketPath);

    c.send(createSession('s1', userDataDir));
    await new Promise((r) => setTimeout(r, 30));

    // Output and exit inside the same window: without the flush in `onExit` the
    // client sees the exit and never sees the last line the process printed.
    fake.emitData('goodbye\n');
    fake.emitExit(0);
    await new Promise((r) => setTimeout(r, AFTER_WINDOW_MS));

    const kinds = c.frames.map((f) =>
      f.type === 0x01 ? 'data' : (f.message as { t: string }).t,
    );
    const dataAt = kinds.indexOf('data');
    const exitAt = kinds.indexOf('exit');
    expect(dataAt).toBeGreaterThanOrEqual(0);
    expect(exitAt).toBeGreaterThanOrEqual(0);
    expect(dataAt).toBeLessThan(exitAt);
    expect(c.text()).toBe('goodbye\n');

    c.close();
  });

  it('a snapshot does not hand back bytes it is also about to broadcast', async () => {
    const fake = createFakePty();
    const { socketPath, userDataDir } = await broker(() => fake.pty);
    const c = await client(socketPath);

    c.send(createSession('s1', userDataDir));
    await new Promise((r) => setTimeout(r, 30));

    fake.emitData('in the window');
    // Deliberately INSIDE the 16ms window, which is the whole point: the snapshot
    // handler must not flush. Flushing broadcasts to every client — including the
    // one asking — so the bytes would land once as a data frame and again inside
    // the reply, and the renderer's replay gate writes both. Sent straight away
    // rather than after half a window: on a loaded machine an 8ms pause was
    // enough for the timer to fire first, which tests the wrong thing.
    c.send(encodeControl({ t: 'snapshot', id: 9, sessionId: 's1' }));
    await new Promise((r) => setTimeout(r, AFTER_WINDOW_MS));

    const reply = c.frames.find(
      (f) => f.type === 0x00 && (f.message as { t: string; id?: number }).id === 9,
    );
    expect(reply).toBeDefined();
    // Through `unknown`: `ControlMessage`'s reply arm carries an index signature
    // rather than this field by name, so a direct cast is (correctly) refused.
    const { bytesBase64 } =
      reply?.type === 0x00
        ? (reply.message as unknown as { bytesBase64: string })
        : { bytesBase64: '' };
    const snapshotText = Buffer.from(bytesBase64, 'base64').toString('utf8');

    // Exactly one of the two carries it — never both. The stream is the one that
    // does, because the buffer had not flushed when the snapshot was answered,
    // and staleness the replay gate already handles beats duplication it cannot
    // detect.
    const inSnapshot = snapshotText.includes('in the window');
    const inStream = c.text().includes('in the window');
    expect(inSnapshot && inStream).toBe(false);
    expect(inSnapshot || inStream).toBe(true);

    c.close();
  });
});
