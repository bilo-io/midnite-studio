import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetPerfMarks, markOnce } from './perf';

const mark = vi.fn();

function installBridge(enabled: boolean): void {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    perf: { enabled, mark },
  } as Partial<MidniteStudioBridge> as MidniteStudioBridge;
}

describe('renderer perf marks (Phase 36 Theme A)', () => {
  beforeEach(() => {
    mark.mockClear();
    __resetPerfMarks();
  });

  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('sends each mark exactly once, however often the site re-runs', () => {
    installBridge(true);

    // StrictMode double-mounts every effect, and every graph batch after the
    // first arrives through the same callback — "first" has to mean first.
    markOnce('first-view-rendered');
    markOnce('first-view-rendered');
    markOnce('graph-first-batch');

    expect(mark.mock.calls.map(([m]) => m.name)).toEqual([
      'first-view-rendered',
      'graph-first-batch',
    ]);
  });

  it('sends nothing when the preload says the flag is unset', () => {
    installBridge(false);

    markOnce('renderer-boot');

    expect(mark).not.toHaveBeenCalled();
  });

  it('survives a bridge with no perf key — the e2e mock and jsdom both have one', () => {
    (window as unknown as { midniteStudio: unknown }).midniteStudio = {};

    expect(() => markOnce('renderer-boot')).not.toThrow();
  });

  it('survives no bridge at all', () => {
    expect(() => markOnce('renderer-boot')).not.toThrow();
  });
});
