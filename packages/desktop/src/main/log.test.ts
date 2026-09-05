import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger, defaultLogger, formatError, getLogSink, setLogSink } from './log';
import type { LogLevel, LogSink } from './log-sink';

/** A sink that records what it was told, and optionally blows up doing it. */
function fakeSink(onWrite?: () => void): LogSink & { records: Array<[LogLevel, string]> } {
  const records: Array<[LogLevel, string]> = [];
  return {
    records,
    path: '/tmp/fake/main.log',
    write(level, message) {
      records.push([level, message]);
      onWrite?.();
    },
    tail: () => [],
    flush: () => {},
    close: () => {},
  };
}

let consoleWarn: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  setLogSink(null);
  consoleWarn.mockRestore();
  consoleError.mockRestore();
});

describe('Logger', () => {
  it('is callable AND carries levels — the widening that cost no call site', () => {
    const sink = fakeSink();
    setLogSink(sink);
    const log = createLogger();

    // The ~40 existing call sites, unchanged.
    log('[browser] tab created');
    // The new form, for the handful of callers with a reason.
    log.info('[boot] ready');
    log.error('[renderer] gone', new Error('killed'));

    expect(sink.records.map(([level]) => level)).toEqual(['warn', 'info', 'error']);
  });

  it('maps the bare call to warn, so nothing silently changed level', () => {
    const sink = fakeSink();
    setLogSink(sink);
    createLogger()('plain line');
    expect(sink.records[0]).toEqual(['warn', 'plain line']);
    expect(consoleWarn).toHaveBeenCalledWith('plain line');
  });

  it('appends a stack to an error, and stringifies a non-Error throw', () => {
    const sink = fakeSink();
    setLogSink(sink);
    const log = createLogger();

    log.error('boom', new Error('inner'));
    expect(sink.records[0]?.[1]).toContain('boom\n');
    expect(sink.records[0]?.[1]).toContain('Error: inner');

    log.error('odd', { code: 7 });
    expect(sink.records[1]?.[1]).toContain('{"code":7}');

    log.error('bare');
    expect(sink.records[2]?.[1]).toBe('bare');
  });

  it('reaches the console whether or not a sink is installed', () => {
    const log = createLogger();
    log.error('no sink here');
    expect(consoleError).toHaveBeenCalledWith('no sink here');
  });

  it('swallows a throwing sink rather than crashing its caller', () => {
    setLogSink(
      fakeSink(() => {
        throw new Error('disk gone');
      }),
    );
    expect(() => createLogger()('still fine')).not.toThrow();
    expect(consoleWarn).toHaveBeenCalledWith('still fine');
  });

  it('exposes the installed sink for the handlers that need its path', () => {
    expect(getLogSink()).toBeNull();
    const sink = fakeSink();
    setLogSink(sink);
    expect(getLogSink()).toBe(sink);
  });

  it('ships one shared instance for the modules that import it directly', () => {
    const sink = fakeSink();
    setLogSink(sink);
    defaultLogger.info('shared');
    expect(sink.records[0]).toEqual(['info', 'shared']);
  });
});

describe('formatError', () => {
  it('prefers a stack, falls back to name and message', () => {
    const err = new Error('x');
    expect(formatError(err)).toBe(err.stack);
    err.stack = '';
    expect(formatError(err)).toBe('Error: x');
  });

  it('passes a thrown string through and JSON-encodes an object', () => {
    expect(formatError('just a string')).toBe('just a string');
    expect(formatError({ a: 1 })).toBe('{"a":1}');
  });

  it('survives a value JSON cannot encode', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => formatError(circular)).not.toThrow();
  });
});
