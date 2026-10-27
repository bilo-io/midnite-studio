import { CHANNELS, type ErrorReport, type ForgeCliStatus } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GhRunner } from '@midnite/studio-feature-report/main';
import type { LogRecord, LogSink } from '@midnite/studio-runtime';

import { loggerFrom } from '../log';
import { registerReportHandlers, setBootLine } from './report-handlers';

/**
 * Studio's composition of the report feature — the handlers' own behaviour is the feature's test
 * (`packages/features/report/main/index.test.ts`); this file holds that desktop wires them through
 * its own `ipcMain` helpers, its logger, its boot line and Electron's shell and clipboard.
 */

// `vi.hoisted` because vitest lifts `vi.mock` above the imports.
const { on, handle, showItemInFolder, openExternal, writeText, getPath } = vi.hoisted(() => ({
  on: vi.fn(),
  handle: vi.fn(),
  showItemInFolder: vi.fn(),
  openExternal: vi.fn(async () => {}),
  writeText: vi.fn(),
  getPath: vi.fn(() => '/Users/tester'),
}));
vi.mock('electron', () => ({
  ipcMain: { on, handle },
  shell: { showItemInFolder, openExternal, trashItem: vi.fn() },
  clipboard: { writeText },
  app: { getPath },
}));
// `handle.ts` reaches `window-manager` for `handleFromSender`, which this module does not use.
vi.mock('../window-manager', () => ({ resolveWindow: () => null }));

function send(raw: unknown): void {
  const [, listener] = on.mock.calls.find(([channel]) => channel === CHANNELS.reportError) ?? [];
  if (typeof listener !== 'function') throw new Error('no listener on the report channel');
  (listener as (event: unknown, raw: unknown) => void)({}, raw);
}

async function invoke(channel: string, raw: unknown = undefined): Promise<unknown> {
  const [, listener] = handle.mock.calls.find(([name]) => name === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler on ${channel}`);
  return (listener as (event: unknown, raw: unknown) => Promise<unknown>)({}, raw);
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

const READY: ForgeCliStatus = { reason: 'ready', binPath: '/usr/bin/gh', hint: '' };
const gh: GhRunner = {
  status: vi.fn(async () => READY),
  run: vi.fn(async () => ({ output: '', stdout: 'https://github.com/bilo-io/midnite-apps/issues/9\n', exitCode: 0 })),
};

const report: ErrorReport = {
  source: 'boundary',
  name: 'TypeError',
  message: 'x is not a function',
  stack: 'TypeError: x is not a function',
  view: 'graph',
  role: 'main',
  at: 1_700_000_000_000,
};

describe('report handlers — Studio’s composition of the report feature', () => {
  beforeEach(() => {
    on.mockClear();
    handle.mockClear();
    showItemInFolder.mockClear();
    openExternal.mockClear();
    writeText.mockClear();
    setBootLine('');
  });

  it('logs a crash report — and an invalid one — through desktop’s logger', () => {
    const lines: string[] = [];
    registerReportHandlers({ log: loggerFrom((m) => lines.push(m)), sink: () => null, gh });
    send(report);
    expect(() => send({ source: 'nowhere' })).not.toThrow();
    expect(lines[0]).toContain('[renderer] boundary main/graph: TypeError: x is not a function');
    expect(lines[1]).toContain('[report] rejected a report');
  });

  it('reveals the sink’s own file through shell.showItemInFolder', async () => {
    const sink = fakeSink();
    registerReportHandlers({ log: loggerFrom(() => {}), sink: () => sink, gh });
    await expect(invoke(CHANNELS.reportReveal)).resolves.toEqual({ ok: true });
    expect(showItemInFolder).toHaveBeenCalledWith(sink.path);
  });

  it('bundles the boot line set at boot above the tail, redacted against the home directory', async () => {
    setBootLine('midnite-studio 0.3.1 packaged=true brokerBuild=deadbeef darwin/arm64');
    const sink = fakeSink([{ t: 1_700_000_000_000, level: 'error', msg: 'ENOENT /Users/tester/Dev/x.ts' }]);
    registerReportHandlers({ log: loggerFrom(() => {}), sink: () => sink, gh });
    const { text } = (await invoke(CHANNELS.reportBundle)) as { text: string };
    expect(text.split('\n')[0]).toContain('midnite-studio 0.3.1');
    expect(text).toContain('~/Dev/x.ts');
    expect(text).not.toContain('tester');
  });

  it('files with Studio’s labels, unchanged', async () => {
    registerReportHandlers({ log: loggerFrom(() => {}), sink: () => null, gh });
    await expect(invoke(CHANNELS.reportSubmitIssue, { title: 't', body: 'b', kind: 'bug' })).resolves.toMatchObject({ ok: true });
    expect(vi.mocked(gh.run).mock.calls.at(-1)?.[0]).toMatch(/--label 'bug' --label 'app: midnite-studio'$/);
  });

  it('opens a midnite-apps page through shell.openExternal and copies through the clipboard', async () => {
    registerReportHandlers({ log: loggerFrom(() => {}), sink: () => null, gh });
    const url = 'https://github.com/bilo-io/midnite-apps/issues/9';
    await expect(invoke(CHANNELS.reportOpenUrl, { url })).resolves.toEqual({ ok: true });
    expect(openExternal).toHaveBeenCalledWith(url);
    await expect(invoke(CHANNELS.reportCopy, { text: 'report' })).resolves.toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith('report');
  });
});
