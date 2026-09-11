import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useUiStore } from '../store/ui-store';
import { useReportWindowRepo } from './use-report-window-repo';

let reportRepo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reportRepo = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    window: { reportRepo } as unknown as MidniteStudioBridge['window'],
  };
  useUiStore.setState({ selectedRepoId: null });
});

afterEach(() => {
  delete (window as unknown as { midniteStudio?: MidniteStudioBridge }).midniteStudio;
});

describe('useReportWindowRepo (Phase 84 Theme D.1)', () => {
  it('reports null on mount when no repo is selected', () => {
    renderHook(() => useReportWindowRepo());

    expect(reportRepo).toHaveBeenCalledWith({ repoId: null });
  });

  it('reports the currently selected repo on mount', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });

    renderHook(() => useReportWindowRepo());

    expect(reportRepo).toHaveBeenCalledWith({ repoId: 'repo-1' });
  });

  it('reports again whenever selectedRepoId changes', () => {
    renderHook(() => useReportWindowRepo());
    reportRepo.mockClear();

    act(() => {
      useUiStore.setState({ selectedRepoId: 'repo-2' });
    });

    expect(reportRepo).toHaveBeenCalledWith({ repoId: 'repo-2' });
  });

  it('does nothing without a bridge', () => {
    delete (window as unknown as { midniteStudio?: MidniteStudioBridge }).midniteStudio;

    expect(() => renderHook(() => useReportWindowRepo())).not.toThrow();
  });
});
