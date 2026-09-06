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
    // The tab's own monitor strip drives the metrics stream itself (a
    // detached Optimizer window has no status bar to drive it), so the mock
    // bridge has to carry the channel it starts.
    metrics: {
      onSample: vi.fn(() => () => {}),
      start: vi.fn(),
      stop: vi.fn(),
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

/**
 * The hero and the accordions (adhoc: optimizer polish). The hero is one
 * element whose size and glyph change, not two swapped elements — asserted
 * through its accessible name and its size classes, since a CSS transition
 * is the one part of it jsdom cannot see.
 */
describe('SmartScanTab — the hero and the result accordions', () => {
  beforeEach(() => {
    useOptimizerStore.setState({
      scan: { state: 'idle', progress: 0, result: null, message: null },
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  const RESULT = scanResult({
    totalBytes: 660,
    byCategory: { ...EMPTY_BY_CATEGORY, dependencies: 500, buildOutput: 160 },
    byEcosystem: { ...EMPTY_BY_ECOSYSTEM, node: 660 },
    detectors: {
      'node-modules': { label: 'node_modules', producer: 'pnpm install' },
      'node-dist': { label: 'dist/', producer: 'pnpm build' },
    },
    items: [
      {
        path: '/repos/app/node_modules',
        bytes: 500,
        category: 'dependencies',
        repoId: 'repo-1',
        detectorId: 'node-modules',
        ecosystem: 'node',
        reclaim: 'costly',
      },
      {
        path: '/repos/app/packages/ui/dist',
        bytes: 100,
        category: 'buildOutput',
        repoId: 'repo-1',
        detectorId: 'node-dist',
        ecosystem: 'node',
        reclaim: 'cheap',
      },
      {
        path: '/repos/app/packages/core/dist',
        bytes: 60,
        category: 'buildOutput',
        repoId: 'repo-1',
        detectorId: 'node-dist',
        ecosystem: 'node',
        reclaim: 'cheap',
      },
    ],
  });

  it('before a scan the hero is the large, unlabelled target', () => {
    installBridge();
    renderTab();

    const hero = screen.getByRole('button', { name: 'Run Smart Scan' });
    expect(hero.className).toContain('h-32');
    expect(screen.getByText('Smart Scan')).toBeTruthy();
  });

  it('after a scan the same control shrinks and offers a re-run', () => {
    useOptimizerStore.getState().scanDone(RESULT);
    installBridge();
    renderTab();

    const hero = screen.getByRole('button', { name: 'Run Smart Scan again' });
    expect(hero.className).toContain('h-16');
    expect(hero.className).not.toContain('h-32');
    expect(screen.getByText('Scan complete')).toBeTruthy();
  });

  it('the largest group opens by itself, and collapses on click', () => {
    useOptimizerStore.getState().scanDone(RESULT);
    installBridge();
    renderTab();

    const header = screen.getByRole('button', { expanded: true, name: /Node/ });
    expect(screen.getByText('Build output')).toBeTruthy();

    fireEvent.click(header);
    expect(screen.queryByText('Build output')).toBeNull();
    expect(screen.getByRole('button', { expanded: false, name: /Node/ })).toBeTruthy();
  });

  it('drills down to the individual paths, sharing one collapsed prefix row', () => {
    useOptimizerStore.getState().scanDone(RESULT);
    installBridge();
    renderTab();

    // Both `dist/` items live under `/repos/app/packages`, which the trie
    // collapses into one row above the two leaves.
    expect(screen.getByText('/repos/app/packages/ui/dist')).toBeTruthy();
    expect(screen.getByText('/repos/app/packages/core/dist')).toBeTruthy();
    expect(screen.getAllByText('dist/')).toHaveLength(2);
  });

  it('a leaf cleans exactly its own path, costly item included', async () => {
    useOptimizerStore.getState().scanDone(RESULT);
    const { clean } = installBridge();
    renderTab();

    // node_modules is `costly`, so no bulk button will ever take it — this
    // per-item path is the only way to reclaim it.
    fireEvent.click(screen.getByRole('button', { name: 'Clean /repos/app/node_modules' }));
    expect(screen.getByRole('heading', { name: 'Clean node_modules?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));

    await waitFor(() => {
      expect(clean).toHaveBeenCalledWith({ paths: ['/repos/app/node_modules'] });
    });
  });
});
