import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REDACT_SAMPLES, SECRET_PATTERNS } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { BUNDLE_RECORDS, bundleFromSink, formatLogBundle, installCrashLogging } from './bundle';
import { createFileSink, type LogLevel } from './log-sink';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('formatLogBundle', () => {
  it('puts the boot line above the tail, with no home directory left in it', () => {
    const text = formatLogBundle(
      'midnite-monitor 0.0.4 started',
      [{ t: 1_700_000_000_000, level: 'error', msg: 'ENOENT /Users/tester/Dev/x.ts' }],
      '/Users/tester',
    );
    expect(text.split('\n')[0]).toBe('midnite-monitor 0.0.4 started');
    expect(text).toContain('2023-11-14T22:13:20.000Z ERROR ENOENT ~/Dev/x.ts');
    expect(text).not.toContain('tester');
  });

  it('renders an empty bundle as an empty string rather than a stray newline', () => {
    expect(formatLogBundle('', [])).toBe('');
  });

  it('lets no sample of any SECRET_PATTERN survive', () => {
    for (const p of SECRET_PATTERNS) {
      expect(Object.values(REDACT_SAMPLES).some((x) => new RegExp(p.source, p.flags).test(x))).toBe(true);
    }
    const records = Object.entries(REDACT_SAMPLES).map(([name, msg], i) => ({
      t: 1_700_000_000_000 + i,
      level: 'error',
      msg: `${name}: ${msg}`,
    }));
    const text = formatLogBundle(`boot ${REDACT_SAMPLES['github']}`, records, '/Users/tester');
    for (const sample of Object.values(REDACT_SAMPLES)) {
      expect(text).not.toContain(sample.split('\n')[1] ?? sample.slice(-12));
    }
  });
});

describe('bundleFromSink', () => {
  it('reads the last BUNDLE_RECORDS records of a real file sink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mstudio-bundle-'));
    dirs.push(dir);
    const sink = createFileSink({ dir, name: 'monitor.log', now: () => 1_700_000_000_000 });
    for (let i = 0; i < BUNDLE_RECORDS + 5; i += 1) sink.write('error', `line ${i}`);
    const lines = bundleFromSink(sink, 'boot', dir).split('\n');
    expect(lines[0]).toBe('boot');
    expect(lines).toHaveLength(BUNDLE_RECORDS + 1);
    expect(lines.at(-1)).toContain(`line ${BUNDLE_RECORDS + 4}`);
  });

  it('is just the boot line when there is no sink', () => {
    expect(bundleFromSink(null, 'boot')).toBe('boot');
  });
});

describe('installCrashLogging', () => {
  it("writes main's uncaught errors and rejections at error level", () => {
    const listeners = new Map<string, (value: never) => void>();
    const written: Array<[LogLevel, string]> = [];
    installCrashLogging((level, message) => written.push([level, message]), {
      on: (event: string, listener: (value: never) => void) => listeners.set(event, listener),
    });

    const error = new Error('boom');
    listeners.get('uncaughtException')?.(error as never);
    listeners.get('unhandledRejection')?.('nope' as never);

    expect(written).toEqual([
      ['error', `uncaught: ${error.stack}`],
      ['error', 'unhandled rejection: nope'],
    ]);
  });
});
