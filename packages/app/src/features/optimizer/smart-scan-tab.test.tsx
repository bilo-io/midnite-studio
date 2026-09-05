import type { MidniteStudioBridge, ScanResult } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useOptimizerStore } from '../../store/optimizer-store';
import { SmartScanTab } from './smart-scan-tab';

const EMPTY_BY_CATEGORY = {
  dependencies: 0,
  buildOutput: 0,
  toolCache: 0,
  staleWorktree: 0,
  looseObjects: 0,
};

const EMPTY_BY_ECOSYSTEM = {
  node: 0,
  multi: 0,
  rust: 0,
  cpp: 0,
  dotnet: 0,
  python: 0,
  java: 0,
  swift: 0,
  ruby: 0,
  go: 0,
  git: 0,
};

function scanResult(over: Partial<ScanResult>): ScanResult {
  return {
    totalBytes: 0,
    byCategory: EMPTY_BY_CATEGORY,
    byEcosystem: EMPTY_BY_ECOSYSTEM,
    detectors: {},
    items: [],
    truncated: false,
    truncatedRoots: [],
    ...over,
  };
}

function installBridge(cleanImpl?: (req: { paths: string[] }) => Promise<unknown>) {
  const clean =
    cleanImpl ?? vi.fn().mockResolvedValue({ ok: true, value: { freedBytes: 0, skipped: [] } });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    optimizer: {
      scan: vi.fn(),
      onScanProgress: vi.fn(() => () => {}),
      clean,
      processes: vi.fn(),
      kill: vi.fn(),
      gpu: vi.fn(),
    },
  } as unknown as Partial<MidniteStudioBridge>;
  return { clean };
}

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <SmartScanTab />
      </DialogHost>
    </QueryClientProvider>,
  );
}

describe('SmartScanTab', () => {
  beforeEach(() => {
    useOptimizerStore.setState({
      scan: { state: 'idle', progress: 0, result: null, message: null },
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('renders the zero-item empty copy rather than a blank frame', () => {
    useOptimizerStore.getState().scanDone(scanResult({ totalBytes: 0 }));
    installBridge();
    renderTab();

    expect(
      screen.getByText('Nothing to reclaim — every repo this app manages is already clean.'),
    ).toBeTruthy();
  });

  it('an all-costly group renders a disabled Clean button and opens no dialog', () => {
    useOptimizerStore.getState().scanDone(
      scanResult({
        totalBytes: 300,
        byCategory: { ...EMPTY_BY_CATEGORY, dependencies: 300 },
        byEcosystem: { ...EMPTY_BY_ECOSYSTEM, python: 300 },
        detectors: { 'py-venv': { label: 'Virtualenv', producer: 'python -m venv' } },
        items: [
          {
            path: '/repo/.venv',
            bytes: 300,
            category: 'dependencies',
            repoId: 'repo-1',
            detectorId: 'py-venv',
            ecosystem: 'python',
            reclaim: 'costly',
          },
        ],
      }),
    );
    const { clean } = installBridge();
    renderTab();

    const button = screen.getByRole('button', { name: 'Clean Python' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(screen.queryByRole('heading', { name: 'Clean Python?' })).toBeNull();
    expect(clean).not.toHaveBeenCalled();
  });

  it('the group Clean button cleans only the cheap items, naming both producers and the skipped costly item', async () => {
    useOptimizerStore.getState().scanDone(
      scanResult({
        totalBytes: 400,
        byCategory: { ...EMPTY_BY_CATEGORY, toolCache: 40, buildOutput: 60, dependencies: 300 },
        byEcosystem: { ...EMPTY_BY_ECOSYSTEM, python: 400 },
        detectors: {
          'det-a': { label: 'Tool cache A', producer: 'tool A' },
          'det-b': { label: 'Build output B', producer: 'tool B' },
          'det-c': { label: 'Virtualenv', producer: 'python -m venv' },
        },
        items: [
          {
            path: '/repo/.cache-a',
            bytes: 40,
            category: 'toolCache',
            repoId: 'repo-1',
            detectorId: 'det-a',
            ecosystem: 'python',
            reclaim: 'cheap',
          },
          {
            path: '/repo/build-b',
            bytes: 60,
            category: 'buildOutput',
            repoId: 'repo-1',
            detectorId: 'det-b',
            ecosystem: 'python',
            reclaim: 'cheap',
          },
          {
            path: '/repo/.venv',
            bytes: 300,
            category: 'dependencies',
            repoId: 'repo-1',
            detectorId: 'det-c',
            ecosystem: 'python',
            reclaim: 'costly',
          },
        ],
      }),
    );
    const { clean } = installBridge();
    renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'Clean Python' }));

    expect(screen.getByRole('heading', { name: 'Clean Python?' })).toBeTruthy();
    expect(screen.getByText('100 B will be freed.')).toBeTruthy();
    expect(screen.getByText('tool A and tool B will need to run again.')).toBeTruthy();
    expect(
      screen.getByText(
        '1 item need a re-download to restore and were left alone — clean them individually.',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));

    await waitFor(() => {
      expect(clean).toHaveBeenCalledWith({ paths: ['/repo/.cache-a', '/repo/build-b'] });
    });
  });
});
