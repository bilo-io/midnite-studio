import type { ReactNode } from 'react';

import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useOptimizerStore } from '../../store/optimizer-store';
import { useUiStore } from '../../store/ui-store';
import { StorageTab } from './storage-tab';

/**
 * Phase 73 Theme E — the Storage tab's System section: its own gate (the
 * Theme C three-way AND) and its own five states, following
 * `system-cache-consent.test.tsx`'s own `installBridge`/wrapper idiom.
 */

function createWrapper() {
  return ({ children }: { children: ReactNode }) => <DialogHost>{children}</DialogHost>;
}

function installBridge(overrides: Partial<MidniteStudioBridge['optimizer']> = {}) {
  const optimizer = {
    onScanProgress: vi.fn(() => () => undefined),
    onSystemScanProgress: vi.fn(() => () => undefined),
    systemScan: vi.fn(),
    systemClean: vi.fn(),
    systemReclaim: vi.fn(),
    ...overrides,
  } as unknown as MidniteStudioBridge['optimizer'];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    optimizer,
  } as Partial<MidniteStudioBridge>;
  return optimizer;
}

const GATE_ON = { optimizerEnabled: true, allowSystemCacheClean: true, systemCacheConsentGiven: true };
const GATE_OFF = { optimizerEnabled: false, allowSystemCacheClean: false, systemCacheConsentGiven: false };

const resetStores = () => {
  useUiStore.setState(GATE_OFF);
  useOptimizerStore.setState({
    scan: { state: 'idle', progress: 0, result: null, message: null },
    systemScan: { state: 'idle', progress: 0, result: null, message: null },
  });
};

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  resetStores();
});

describe('StorageTab — System caches gating (Phase 73 Theme C, E)', () => {
  it('is absent with the Optimizer switch off', () => {
    resetStores();
    useUiStore.setState({ ...GATE_ON, optimizerEnabled: false });
    installBridge();
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.queryByText(/Outside any repo Midnite manages/)).toBeNull();
  });

  it('is absent with allowSystemCacheClean off', () => {
    resetStores();
    useUiStore.setState({ ...GATE_ON, allowSystemCacheClean: false });
    installBridge();
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.queryByText(/Outside any repo Midnite manages/)).toBeNull();
  });

  it('is absent with systemCacheConsentGiven off', () => {
    resetStores();
    useUiStore.setState({ ...GATE_ON, systemCacheConsentGiven: false });
    installBridge();
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.queryByText(/Outside any repo Midnite manages/)).toBeNull();
  });

  it('renders with all three true — and even before a repo Smart Scan has run', () => {
    resetStores();
    useUiStore.setState(GATE_ON);
    installBridge();
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.getByText(/Outside any repo Midnite manages/)).toBeTruthy();
    expect(screen.getByText('Run a Smart Scan first', { exact: false })).toBeTruthy();
  });
});

describe('StorageTab — System caches states (Phase 73 Theme E)', () => {
  it('idle: prompts to scan', () => {
    resetStores();
    useUiStore.setState(GATE_ON);
    installBridge();
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(
      screen.getByText(/Scan your system caches to see what.s reclaimable outside your repos\./),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Scan system caches' })).toBeTruthy();
  });

  it('loading: shows the gauge with its own copy', () => {
    resetStores();
    useUiStore.setState(GATE_ON);
    installBridge();
    useOptimizerStore.setState({
      systemScan: { state: 'scanning', progress: 40, result: null, message: null },
    });
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.getByRole('img', { name: 'Checking your tool caches…: 40%' })).toBeTruthy();
  });

  it('empty result: reads as "none present", not zero bytes', () => {
    resetStores();
    useUiStore.setState(GATE_ON);
    installBridge();
    useOptimizerStore.setState({
      systemScan: {
        state: 'done',
        progress: 100,
        result: { totalBytes: 0, approximate: false, byEcosystem: {}, items: [] },
        message: null,
      },
    });
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(
      screen.getByText('None of the caches Midnite knows about are present on this machine.'),
    ).toBeTruthy();
  });

  it('error: renders the {ok:false} message verbatim', () => {
    resetStores();
    useUiStore.setState(GATE_ON);
    installBridge();
    useOptimizerStore.setState({
      systemScan: { state: 'error', progress: 0, result: null, message: 'permission denied' },
    });
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.getByText('permission denied')).toBeTruthy();
  });

  it('approximate: shows the minimums banner and prefixes affected rows with "at least"', () => {
    resetStores();
    useUiStore.setState(GATE_ON);
    installBridge();
    useOptimizerStore.setState({
      systemScan: {
        state: 'done',
        progress: 100,
        result: {
          totalBytes: 10,
          approximate: true,
          byEcosystem: { node: 10 },
          items: [
            {
              path: '/Users/x/.npm',
              bytes: 10,
              approximate: true,
              entryId: 'npm-cache',
              ecosystem: 'node',
              reclaim: 'costly',
              label: 'npm cache',
              producer: 'npm install',
            },
          ],
        },
        message: null,
      },
    });
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(
      screen.getByText(
        'One or more caches were too large to measure completely; the figures below are minimums.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('npm cache')).toBeTruthy();
    expect(screen.getByText(/^at least /)).toBeTruthy();
  });

  it('a row shows label/producer, never a bare path, and offers Move to Trash when no reclaim command is registered', () => {
    resetStores();
    useUiStore.setState(GATE_ON);
    installBridge();
    useOptimizerStore.setState({
      systemScan: {
        state: 'done',
        progress: 100,
        result: {
          totalBytes: 10,
          approximate: false,
          byEcosystem: { java: 10 },
          items: [
            {
              path: '/Users/x/.gradle/caches',
              bytes: 10,
              approximate: false,
              entryId: 'gradle-caches',
              ecosystem: 'java',
              reclaim: 'costly',
              label: 'Gradle caches',
              producer: 'gradle build',
            },
          ],
        },
        message: null,
      },
    });
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.getByText('Gradle caches')).toBeTruthy();
    expect(screen.getByText('gradle build')).toBeTruthy();
    expect(screen.queryByText('/Users/x/.gradle/caches')).toBeNull();
    expect(screen.getByRole('button', { name: 'Move to Trash' })).toBeTruthy();
  });

  it('a row for an entry with a registered reclaim command offers it as the primary action', () => {
    resetStores();
    useUiStore.setState(GATE_ON);
    installBridge();
    useOptimizerStore.setState({
      systemScan: {
        state: 'done',
        progress: 100,
        result: {
          totalBytes: 10,
          approximate: false,
          byEcosystem: { node: 10 },
          items: [
            {
              path: '/Users/x/Library/pnpm/store/v3',
              bytes: 10,
              approximate: false,
              entryId: 'pnpm-store',
              ecosystem: 'node',
              reclaim: 'costly',
              label: 'pnpm store',
              producer: 'pnpm install',
            },
          ],
        },
        message: null,
      },
    });
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.getByRole('button', { name: 'Run pnpm store prune' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Move to Trash' })).toBeNull();
  });

  it('clicking a plain-delete row opens the systemCache confirm with the byte figure', () => {
    resetStores();
    useUiStore.setState(GATE_ON);
    installBridge();
    useOptimizerStore.setState({
      systemScan: {
        state: 'done',
        progress: 100,
        result: {
          totalBytes: 1024,
          approximate: false,
          byEcosystem: { java: 1024 },
          items: [
            {
              path: '/Users/x/.gradle/caches',
              bytes: 1024,
              approximate: false,
              entryId: 'gradle-caches',
              ecosystem: 'java',
              reclaim: 'costly',
              label: 'Gradle caches',
              producer: 'gradle build',
            },
          ],
        },
        message: null,
      },
    });
    render(<StorageTab />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));

    expect(screen.getByRole('heading', { name: 'Clean Gradle caches?' })).toBeTruthy();
    expect(screen.getByText('1 KB will be freed.')).toBeTruthy();
  });
});
