import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge, WindowDescriptor } from '@midnite/studio-shared';

import { useGraphStore } from '../graph/graph-store';
import { useLivenessStore } from '../../store/liveness-store';
import { useUiStore } from '../../store/ui-store';
import { LivenessSegment } from './liveness-segment';

let windowList: WindowDescriptor[] = [];

function installBridge(): void {
  windowList = [{ id: 1, role: 'main', repoId: null }];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    windowRole: 'main',
    window: {
      list: vi.fn(() => Promise.resolve(windowList)),
      onWindowsChanged: vi.fn(() => () => {}),
    } as unknown as MidniteStudioBridge['window'],
  };
}

beforeEach(() => {
  installBridge();
  useUiStore.setState({ selectedRepoId: null });
  useLivenessStore.setState({ lastWatchAt: null, watcherError: null });
  useGraphStore.setState({ restreamNonce: 0, repoId: null, requestId: null });
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: MidniteStudioBridge }).midniteStudio;
});

function renderSegment() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LivenessSegment />
    </QueryClientProvider>,
  );
}

describe('LivenessSegment (Phase 84 Theme I)', () => {
  it('is amber with no repository open', () => {
    renderSegment();

    const dot = screen.getByTestId('liveness-dot');
    expect(dot.getAttribute('data-sync-state')).toBe('amber');
  });

  it('is amber before the first watch event once a repo is selected', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });

    renderSegment();

    expect(screen.getByTestId('liveness-dot').getAttribute('data-sync-state')).toBe('amber');
  });

  it('turns green once a watch event for the selected repo is recorded', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    useLivenessStore.getState().recordWatchEvent(Date.now());

    renderSegment();

    expect(screen.getByTestId('liveness-dot').getAttribute('data-sync-state')).toBe('green');
  });

  it('is red when a watcher error is recorded, even with recent activity', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    useLivenessStore.getState().recordWatchEvent(Date.now());
    useLivenessStore.getState().recordWatcherError('disk full');

    renderSegment();

    expect(screen.getByTestId('liveness-dot').getAttribute('data-sync-state')).toBe('red');
  });

  it('opens a popover on click showing the per-window table (Theme D.3)', async () => {
    windowList = [
      { id: 1, role: 'main', repoId: 'repo-1' },
      { id: 2, role: 'terminal', repoId: null },
    ];
    useUiStore.setState({ selectedRepoId: 'repo-1' });

    renderSegment();
    fireEvent.click(screen.getByTestId('liveness-segment'));

    const panel = await waitFor(() => screen.getByTestId('liveness-segment-panel'));
    expect(panel.textContent).toContain('main');
    expect(panel.textContent).toContain('(this window)');
    expect(panel.textContent).toContain('terminal');
    expect(panel.textContent).toContain('repo-1');
    expect(screen.getByText('Refresh now')).toBeTruthy();
  });

  it('Refresh now is disabled with no repository open', () => {
    renderSegment();
    fireEvent.click(screen.getByTestId('liveness-segment'));

    const button = screen.getByText('Refresh now').closest('button');
    expect(button?.disabled).toBe(true);
  });

  it('Refresh now requests a graph restream for the selected repo', () => {
    useUiStore.setState({ selectedRepoId: 'repo-1' });
    renderSegment();
    fireEvent.click(screen.getByTestId('liveness-segment'));

    const before = useGraphStore.getState().restreamNonce;
    fireEvent.click(screen.getByText('Refresh now'));

    expect(useGraphStore.getState().restreamNonce).toBe(before + 1);
  });
});
