// @vitest-environment node
import { createRecordingContext, type LogRecord, type LogSink } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, type ErrorReport, type ForgeCliStatus } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { formatReport, reportIssueMenuItem, reportMain, reportManifest, type ReportMainServices } from './index';
import type { GhRunner } from './gh';

function fakeSink(records: LogRecord[] = []): LogSink & { written: Array<[string, string]> } {
  const written: Array<[string, string]> = [];
  return {
    written,
    path: '/Users/tester/Library/Application Support/Midnite Studio/logs/main.log',
    write: (level, msg) => void written.push([level, msg]),
    tail: () => records,
    flush: () => {},
    close: () => {},
  };
}

const READY: ForgeCliStatus = { reason: 'ready', binPath: '/usr/bin/gh', hint: '' };

function setup(overrides: Partial<ReportMainServices> = {}) {
  const ctx = createRecordingContext();
  const gh: GhRunner = {
    status: vi.fn(async () => READY),
    run: vi.fn(async () => ({ output: '', stdout: 'https://github.com/bilo-io/midnite-apps/issues/9\n', exitCode: 0 })),
  };
  const services: ReportMainServices = {
    sink: () => null,
    homeDir: () => '/Users/tester',
    gh,
    openExternal: vi.fn(async () => {}),
    writeClipboard: vi.fn(),
    revealPath: vi.fn(),
    ...overrides,
  };
  reportMain.register(ctx, services);
  return { ctx, gh, services };
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

describe('report feature main', () => {
  it('registers exactly the manifest’s channels', () => {
    const { ctx } = setup();
    expect([...ctx.channels].sort()).toEqual([...reportManifest.ipc, ...reportManifest.sends].sort());
    expect(reportMain.channels).toEqual(reportManifest.ipc);
  });

  it('writes a well-formed crash report to the sink at error level', async () => {
    const sink = fakeSink();
    const { ctx } = setup({ sink: () => sink });
    await ctx.invoke(CHANNELS.reportError, report);
    expect(sink.written).toHaveLength(1);
    expect(sink.written[0]?.[0]).toBe('error');
    expect(sink.written[0]?.[1]).toContain('[renderer] boundary main/graph: TypeError: x is not a function');
  });

  it('LOGS an invalid crash report rather than dropping it', async () => {
    const lines: string[] = [];
    const { ctx } = setup({ logError: (line) => lines.push(line) });
    await ctx.invoke(CHANNELS.reportError, { source: 'nowhere' });
    await ctx.invoke(CHANNELS.reportError, undefined);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).toContain('[report] rejected a report');
  });

  it('answers log-path with the sink it has, and null when it has none', async () => {
    await expect(setup().ctx.invoke(CHANNELS.reportLogPath)).resolves.toEqual({ path: null });
    const sink = fakeSink();
    await expect(setup({ sink: () => sink }).ctx.invoke(CHANNELS.reportLogPath)).resolves.toEqual({ path: sink.path });
  });

  it('reveals the file it owns, and fails rather than revealing nothing', async () => {
    const sink = fakeSink();
    const withSink = setup({ sink: () => sink });
    await expect(withSink.ctx.invoke(CHANNELS.reportReveal)).resolves.toEqual({ ok: true });
    expect(withSink.services.revealPath).toHaveBeenCalledWith(sink.path);

    const without = setup();
    await expect(without.ctx.invoke(CHANNELS.reportReveal)).resolves.toMatchObject({ ok: false });
    expect(without.services.revealPath).not.toHaveBeenCalled();
  });

  it('bundles the boot line above the tail, with no home directory left in it', async () => {
    const sink = fakeSink([{ t: 1_700_000_000_000, level: 'error', msg: 'ENOENT /Users/tester/Dev/x.ts' }]);
    const { ctx } = setup({ sink: () => sink, bootLine: () => 'midnite-studio 0.3.1 packaged=true darwin/arm64' });
    const { text } = (await ctx.invoke(CHANNELS.reportBundle)) as { text: string };
    expect(text.split('\n')[0]).toContain('midnite-studio 0.3.1');
    expect(text).toContain('~/Dev/x.ts');
    expect(text).not.toContain('tester');
  });

  it('files through the injected gh, labelled with the app, and answers gh-status from it', async () => {
    const { ctx, gh } = setup();
    const result = await ctx.invoke(CHANNELS.reportSubmitIssue, {
      title: '[bug] it crashed',
      body: 'diagnostics',
      kind: 'bug',
      app: 'midnite-monitor',
    });
    expect(result).toEqual({ ok: true, cli: READY, error: null, url: 'https://github.com/bilo-io/midnite-apps/issues/9' });
    expect(vi.mocked(gh.run).mock.calls[0]?.[0]).toContain("--label 'app: midnite-monitor'");
    await expect(ctx.invoke(CHANNELS.reportGhStatus)).resolves.toEqual(READY);
  });

  it('defaults the app to Studio, so Studio’s labels are unchanged', async () => {
    const { ctx, gh } = setup();
    await ctx.invoke(CHANNELS.reportSubmitIssue, { title: 't', body: 'b', kind: 'feature' });
    expect(vi.mocked(gh.run).mock.calls[0]?.[0]).toMatch(/--label 'enhancement' --label 'app: midnite-studio'$/);
  });

  it('resolves an error rather than throwing on an invalid submit, and attempts nothing', async () => {
    const { ctx, gh } = setup();
    const result = (await ctx.invoke(CHANNELS.reportSubmitIssue, { title: '', body: 'b', kind: 'bug' })) as {
      ok: boolean;
      error: string | null;
      url: string | null;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.url).toBeNull();
    await expect(ctx.invoke(CHANNELS.reportSubmitIssue, { title: 't', body: 'b', kind: 'bug', app: 'evil; rm -rf' })).resolves.toMatchObject({ ok: false });
    expect(gh.run).not.toHaveBeenCalled();
  });

  it('opens a midnite-apps issue page, and nothing else', async () => {
    const { ctx, services } = setup();
    await expect(
      ctx.invoke(CHANNELS.reportOpenUrl, { url: 'https://github.com/bilo-io/midnite-apps/issues/new?template=bug.yml' }),
    ).resolves.toEqual({ ok: true });
    for (const url of ['https://example.com/', 'https://github.com/bilo-io/midnite-studio/issues/1', 'file:///etc/passwd']) {
      await expect(ctx.invoke(CHANNELS.reportOpenUrl, { url })).resolves.toMatchObject({ ok: false });
    }
    expect(services.openExternal).toHaveBeenCalledTimes(1);
  });

  it('copies through the injected clipboard, and reports a refusal instead of throwing', async () => {
    const ok = setup();
    await expect(ok.ctx.invoke(CHANNELS.reportCopy, { text: 'title\n\nbody' })).resolves.toEqual({ ok: true });
    expect(ok.services.writeClipboard).toHaveBeenCalledWith('title\n\nbody');

    const refused = setup({
      writeClipboard: () => {
        throw new Error('clipboard locked');
      },
    });
    await expect(refused.ctx.invoke(CHANNELS.reportCopy, { text: 'x' })).resolves.toEqual({ ok: false, message: 'clipboard locked' });
    // A report longer than the generic clipboard cap still copies — the cap is the issue body's.
    await expect(ok.ctx.invoke(CHANNELS.reportCopy, { text: 'x'.repeat(20_000) })).resolves.toEqual({ ok: true });
  });
});

describe('formatReport', () => {
  it('names role and view on the head line, and omits an absent view', () => {
    expect(formatReport(report).split('\n')[0]).toBe('[renderer] boundary main/graph: TypeError: x is not a function');
    const { view: _view, ...noView } = report;
    expect(formatReport(noView).split('\n')[0]).toBe('[renderer] boundary main: TypeError: x is not a function');
  });
});

describe('reportIssueMenuItem', () => {
  it('sends report:open to the window when clicked', () => {
    const send = vi.fn();
    const item = reportIssueMenuItem(send);
    expect(item.label).toBe('Report an Issue…');
    item.click();
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.reportOpen, undefined);
  });
});
