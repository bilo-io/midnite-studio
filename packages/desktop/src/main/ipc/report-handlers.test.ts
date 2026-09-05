import { CHANNELS, type ErrorReport } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loggerFrom } from '../log';
import type { LogRecord, LogSink } from '../log-sink';
import { formatBundle, formatReport, registerReportHandlers, setBootLine } from './report-handlers';

// `vi.hoisted` because vitest lifts `vi.mock` above the imports — the factory
// has to close over spies that already exist by then.
const { on, handle, showItemInFolder, getPath } = vi.hoisted(() => ({
  on: vi.fn(),
  handle: vi.fn(),
  showItemInFolder: vi.fn(),
  getPath: vi.fn(() => '/Users/tester'),
}));
vi.mock('electron', () => ({
  ipcMain: { on, handle },
  shell: { showItemInFolder },
  app: { getPath },
}));
// `handle.ts` reaches `window-manager` for `handleFromSender`, which this
// module does not use; stubbing it keeps the whole window graph out of a unit
// test about payload validation.
vi.mock('../window-manager', () => ({ resolveWindow: () => null }));

/** Invoke the one-way listener the way `ipcRenderer.send` would. */
function send(raw: unknown): void {
  const [, listener] = on.mock.calls.find(([channel]) => channel === CHANNELS.reportError) ?? [];
  if (typeof listener !== 'function') throw new Error('no listener on the report channel');
  (listener as (event: unknown, raw: unknown) => void)({}, raw);
}

/** Invoke one `ipcMain.handle` listener by channel. */
async function invoke(channel: string): Promise<unknown> {
  const [, listener] = handle.mock.calls.find(([name]) => name === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler on ${channel}`);
  return (listener as (event: unknown, raw: unknown) => Promise<unknown>)({}, undefined);
}

function fakeSink(records: LogRecord[] = []): LogSink {
  return {
    path: '/Users/tester/Library/Application Support/Midnite Studio/logs/main.log',
    write: () => {},
    tail: () => records,
    flush: () => {},
    close: () => {},
  };
}

const report: ErrorReport = {
  source: 'boundary',
  name: 'TypeError',
  message: 'x is not a function',
  stack: 'TypeError: x is not a function\n    at GraphView (graph-view.tsx:1:1)',
  componentStack: '\n    in GraphView',
  view: 'graph',
  role: 'main',
  at: 1_700_000_000_000,
};

describe('report handlers (Phase 65 Theme B)', () => {
  beforeEach(() => {
    on.mockClear();
    handle.mockClear();
    showItemInFolder.mockClear();
    setBootLine('');
  });

  it('logs a well-formed report at error level', () => {
    const lines: string[] = [];
    registerReportHandlers({ log: loggerFrom((m) => lines.push(m)), sink: () => null });

    send(report);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[renderer] boundary main/graph: TypeError: x is not a function');
    expect(lines[0]).toContain('in GraphView');
  });

  it('LOGS an invalid payload rather than dropping it — the inversion of perf', () => {
    // `perf-handlers.ts` drops a malformed mark on purpose. Every clause of that
    // reasoning reverses here: a report is rare, it is the only record, and a
    // payload malformed enough to fail `safeParse` is itself the evidence.
    const lines: string[] = [];
    registerReportHandlers({ log: loggerFrom((m) => lines.push(m)), sink: () => null });

    expect(() => send({ source: 'nowhere' })).not.toThrow();
    expect(() => send('not an object')).not.toThrow();
    expect(() => send(undefined)).not.toThrow();

    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line).toContain('[report] rejected a report');
  });

  it('answers log-path with the sink it has, and null when it has none', async () => {
    registerReportHandlers({ log: loggerFrom(() => {}), sink: () => null });
    await expect(invoke(CHANNELS.reportLogPath)).resolves.toEqual({ path: null });

    handle.mockClear();
    const sink = fakeSink();
    registerReportHandlers({ log: loggerFrom(() => {}), sink: () => sink });
    await expect(invoke(CHANNELS.reportLogPath)).resolves.toEqual({ path: sink.path });
  });

  it('reveals the file it owns, taking no path from the caller', async () => {
    const sink = fakeSink();
    registerReportHandlers({ log: loggerFrom(() => {}), sink: () => sink });

    await expect(invoke(CHANNELS.reportReveal)).resolves.toEqual({ ok: true });
    expect(showItemInFolder).toHaveBeenCalledWith(sink.path);
  });

  it('fails reveal rather than revealing nothing when the sink never opened', async () => {
    registerReportHandlers({ log: loggerFrom(() => {}), sink: () => null });
    const result = (await invoke(CHANNELS.reportReveal)) as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it('bundles the boot line above the tail, with no home directory left in it', async () => {
    setBootLine('midnite-studio 0.3.1 packaged=true brokerBuild=deadbeef darwin/arm64');
    const sink = fakeSink([
      { t: 1_700_000_000_000, level: 'error' as const, msg: 'ENOENT /Users/tester/Dev/x.ts' },
    ]);
    registerReportHandlers({
      log: loggerFrom(() => {}),
      sink: () => sink,
      homeDir: () => '/Users/tester',
    });

    const { text } = (await invoke(CHANNELS.reportBundle)) as { text: string };
    expect(text.split('\n')[0]).toContain('midnite-studio 0.3.1');
    expect(text).toContain('~/Dev/x.ts');
    // The one string in the app designed to be pasted somewhere public.
    expect(text).not.toContain('tester');
  });
});

describe('formatters', () => {
  it('names role and view on the head line, and omits an absent view', () => {
    expect(formatReport(report).split('\n')[0]).toBe(
      '[renderer] boundary main/graph: TypeError: x is not a function',
    );
    const { view: _view, ...noView } = report;
    expect(formatReport({ ...noView }).split('\n')[0]).toBe(
      '[renderer] boundary main: TypeError: x is not a function',
    );
  });

  it('renders an empty bundle as an empty string rather than a stray newline', () => {
    expect(formatBundle('', [])).toBe('');
  });
});
