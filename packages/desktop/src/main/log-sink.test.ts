import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { capFile, createFileSink, rotateFiles, type LogRecord } from './log-sink';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mstudio-log-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

function lines(path: string): LogRecord[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as LogRecord);
}

describe('createFileSink', () => {
  it('writes an error record synchronously, before the caller returns', () => {
    // The whole reason for the sync/async split: a crash record has to survive
    // the crash it is recording.
    const sink = createFileSink({ dir, now: () => 1000 });
    sink.write('error', 'boom');
    expect(lines(sink.path)).toEqual([{ t: 1000, level: 'error', msg: 'boom' }]);
  });

  it('buffers info and warn until a flush', () => {
    const sink = createFileSink({ dir, now: () => 5 });
    sink.write('info', 'a');
    sink.write('warn', 'b');
    expect(() => readFileSync(sink.path, 'utf8')).toThrow();
    sink.flush();
    expect(lines(sink.path).map((r) => r.msg)).toEqual(['a', 'b']);
  });

  it('keeps causal order: an error flushes what was queued ahead of it', () => {
    const sink = createFileSink({ dir });
    sink.write('info', 'before');
    sink.write('error', 'boom');
    expect(lines(sink.path).map((r) => r.msg)).toEqual(['before', 'boom']);
  });

  it('escapes a newline rather than splitting one record into two lines', () => {
    const sink = createFileSink({ dir });
    sink.write('error', 'Error: x\n    at foo (bar.js:1:1)');
    const raw = readFileSync(sink.path, 'utf8').split('\n').filter((l) => l.length > 0);
    expect(raw).toHaveLength(1);
    expect(lines(sink.path)[0]?.msg).toContain('\n    at foo');
  });

  it('redacts the home directory on the way in, not only on the way out', () => {
    const sink = createFileSink({ dir, homeDir: '/Users/someone' });
    sink.write('error', 'ENOENT /Users/someone/Dev/x.ts');
    expect(lines(sink.path)[0]?.msg).toBe('ENOENT ~/Dev/x.ts');
  });

  it('rotates at the size boundary and keeps exactly generations + 1 files', () => {
    const sink = createFileSink({ dir, maxBytes: 200, generations: 3 });
    // Each record is well over 20 bytes, so 3 kB is many rotations' worth.
    for (let i = 0; i < 120; i += 1) sink.write('error', `record ${i} ${'x'.repeat(40)}`);
    const files = readdirSync(dir).sort();
    expect(files).toEqual(['main.1.log', 'main.2.log', 'main.3.log', 'main.log']);
    // The newest is under the cap, and the generation that would have been
    // `main.4.log` is gone rather than accumulating.
    expect(readFileSync(join(dir, 'main.log'), 'utf8').length).toBeLessThanOrEqual(200);
  });

  it('degrades to console-only on a write failure, once, without throwing', () => {
    const onFailure = vi.fn();
    // A path whose parent is a FILE: `mkdirSync` cannot create the directory,
    // which is the cheapest portable stand-in for a read-only volume.
    const blocker = join(dir, 'blocked');
    writeFileSync(blocker, 'not a directory');
    const sink = createFileSink({ dir: join(blocker, 'logs'), onFailure });

    expect(() => sink.write('error', 'first')).not.toThrow();
    expect(() => sink.write('error', 'second')).not.toThrow();
    expect(() => sink.write('info', 'third')).not.toThrow();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0]?.[0]).toContain('file sink disabled');
  });

  it('tails the last n records and skips a torn line', () => {
    const sink = createFileSink({ dir, now: () => 7 });
    for (let i = 0; i < 5; i += 1) sink.write('error', `r${i}`);
    // Simulate a hard kill mid-append.
    writeFileSync(sink.path, `${readFileSync(sink.path, 'utf8')}{"t":1,"lev`);
    expect(sink.tail(3).map((r) => r.msg)).toEqual(['r2', 'r3', 'r4']);
  });

  it('tails nothing before the file exists', () => {
    expect(createFileSink({ dir }).tail(10)).toEqual([]);
  });

  it('stops writing after close', () => {
    const sink = createFileSink({ dir });
    sink.write('error', 'kept');
    sink.close();
    sink.write('error', 'dropped');
    expect(lines(sink.path).map((r) => r.msg)).toEqual(['kept']);
  });
});

describe('rotateFiles / capFile', () => {
  it('shifts generations and drops the oldest', () => {
    writeFileSync(join(dir, 'x.log'), 'newest');
    writeFileSync(join(dir, 'x.1.log'), 'older');
    writeFileSync(join(dir, 'x.2.log'), 'oldest');
    rotateFiles(dir, 'x.log', 2);
    expect(readdirSync(dir).sort()).toEqual(['x.1.log', 'x.2.log']);
    expect(readFileSync(join(dir, 'x.1.log'), 'utf8')).toBe('newest');
    expect(readFileSync(join(dir, 'x.2.log'), 'utf8')).toBe('older');
  });

  it('is a no-op when there is nothing to rotate', () => {
    expect(() => rotateFiles(dir, 'absent.log', 3)).not.toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });

  it('caps a file only once it is at the limit', () => {
    writeFileSync(join(dir, 'broker.log'), 'x'.repeat(50));
    expect(capFile(dir, 'broker.log', 100, 2)).toBe(false);
    expect(capFile(dir, 'broker.log', 50, 2)).toBe(true);
    expect(readdirSync(dir)).toEqual(['broker.1.log']);
  });
});
