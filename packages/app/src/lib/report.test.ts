import type { ErrorReport, MidniteStudioBridge } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../store/ui-store';
import { __resetErrorReports, reportError, reportSignature } from './report';

const error = vi.fn();

function installBridge(impl: (report: ErrorReport) => void = error): void {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    windowRole: 'main',
    report: { error: impl },
  } as Partial<MidniteStudioBridge> as MidniteStudioBridge;
}

function sent(): ErrorReport[] {
  return error.mock.calls.map(([report]) => report as ErrorReport);
}

/** A stack whose first frame is stable, so the signature is too. */
function boom(message = 'kaboom'): Error {
  const err = new TypeError(message);
  err.stack = `TypeError: ${message}\n    at Renderer (graph-view.tsx:12:3)\n    at App (app.tsx:1:1)`;
  return err;
}

describe('reportError (Phase 65 Theme C)', () => {
  beforeEach(() => {
    error.mockClear();
    __resetErrorReports();
  });

  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('is a silent no-op with no bridge — jsdom has none', () => {
    expect(() => reportError('boundary', boom())).not.toThrow();
    expect(error).not.toHaveBeenCalled();
  });

  it('survives a bridge that predates the report group', () => {
    (window as unknown as { midniteStudio: unknown }).midniteStudio = { windowRole: 'main' };
    expect(() => reportError('window-error', boom())).not.toThrow();
  });

  it('sends the boundary shape Phase 60 will call it with', () => {
    installBridge();
    reportError('boundary', boom(), { componentStack: '\n    in GraphView' });

    const report = sent()[0];
    expect(report?.source).toBe('boundary');
    expect(report?.name).toBe('TypeError');
    expect(report?.message).toBe('kaboom');
    expect(report?.stack).toContain('graph-view.tsx');
    expect(report?.componentStack).toBe('\n    in GraphView');
    expect(report?.role).toBe('main');
  });

  it('stamps the view read from the store at send time, not at install time', () => {
    installBridge();
    useUiStore.setState({ activeView: 'graph' });
    reportError('boundary', boom('first'));
    useUiStore.setState({ activeView: 'settings' });
    reportError('boundary', boom('second'));

    expect(sent().map((r) => r.view)).toEqual(['graph', 'settings']);
  });

  it('caps each signature independently, and says so when one is muted', () => {
    installBridge();
    // The storm: one error, every frame.
    for (let i = 0; i < 10; i += 1) reportError('window-error', boom('looping'));

    const names = sent().map((r) => r.name);
    // Three real reports, then one record explaining the silence.
    expect(names).toEqual(['TypeError', 'TypeError', 'TypeError', 'ReportCapReached']);
    expect(sent()[3]?.message).toContain('suppressed');

    // …and a genuinely different bug that arrives afterwards is NOT silenced by
    // it. This is the whole reason the cap is per-signature and not per-session.
    error.mockClear();
    reportError('window-error', boom('a different bug'));
    expect(sent().map((r) => r.message)).toEqual(['a different bug']);
  });

  it('treats the same bug reached through two stacks as one signature', () => {
    const a = boom('same');
    const b = boom('same');
    b.stack = `TypeError: same\n    at Renderer (graph-view.tsx:12:3)\n    at Other (other.tsx:9:9)`;
    expect(reportSignature('TypeError', 'same', a.stack ?? '')).toBe(
      reportSignature('TypeError', 'same', b.stack ?? ''),
    );
  });

  it('stops entirely once too many distinct signatures have been seen', () => {
    installBridge();
    for (let i = 0; i < 60; i += 1) reportError('window-error', boom(`unique ${i}`));

    const last = sent().at(-1);
    expect(last?.name).toBe('ReportSignatureLimit');
    // One announcement, not one per subsequent error.
    expect(sent().filter((r) => r.name === 'ReportSignatureLimit')).toHaveLength(1);
  });

  it('reports a thrown non-Error rather than dropping it', () => {
    installBridge();
    reportError('unhandled-rejection', 'just a string');
    reportError('unhandled-rejection', { code: 7 });

    expect(sent().map((r) => r.name)).toEqual(['thrown-string', 'thrown-value']);
    expect(sent()[1]?.message).toBe('{"code":7}');
  });

  it('truncates to the schema caps so main never rejects its own renderer', () => {
    installBridge();
    const big = boom('x'.repeat(5000));
    big.stack = 'y'.repeat(20000);
    reportError('boundary', big, { componentStack: 'z'.repeat(20000) });

    const report = sent()[0];
    expect(report?.message.length).toBe(1024);
    expect(report?.stack.length).toBe(8192);
    expect(report?.componentStack?.length).toBe(8192);
  });

  it('swallows a throwing bridge instead of turning one bug into two', () => {
    installBridge(() => {
      throw new Error('IPC is gone too');
    });
    expect(() => reportError('boundary', boom())).not.toThrow();
  });
});
