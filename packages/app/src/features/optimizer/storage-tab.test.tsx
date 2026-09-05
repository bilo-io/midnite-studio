import type { ReactNode } from 'react';

import type { MidniteStudioBridge, TrashSummary } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useOptimizerStore } from '../../store/optimizer-store';
import { useUiStore } from '../../store/ui-store';
import { StorageTab } from './storage-tab';

/**
 * Phase 73 Theme E — the Storage tab's System section: its own gate (the
 * Theme C three-way AND) and its own five states, following
 * `system-cache-consent.test.tsx`'s own `installBridge`/wrapper idiom.
 *
 * Phase 74 Theme D shares this file and this same `installBridge`/
 * `resetStores` idiom for the Trash card, which sits below the System
 * section in the rendered tab and is gated on its own, independent
 * three-way AND.
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
    trashSummary: vi.fn(),
    emptyTrash: vi.fn(),
    ...overrides,
  } as unknown as MidniteStudioBridge['optimizer'];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    optimizer,
  } as Partial<MidniteStudioBridge>;
  return optimizer;
}

const GATE_ON = { optimizerEnabled: true, allowSystemCacheClean: true, systemCacheConsentGiven: true };
const GATE_OFF = { optimizerEnabled: false, allowSystemCacheClean: false, systemCacheConsentGiven: false };

const READY_SUMMARY: TrashSummary = {
  itemCount: 3,
  totalBytes: 2_000_000,
  oldestModifiedAt: '2026-01-01T00:00:00.000Z',
  volumeCount: 2,
  truncated: false,
};

const resetStores = () => {
  useUiStore.setState({
    ...GATE_OFF,
    allowTrashEmpty: false,
    trashEmptyConsentGiven: false,
  });
  useOptimizerStore.setState({
    scan: { state: 'idle', progress: 0, result: null, message: null },
    systemScan: { state: 'idle', progress: 0, result: null, message: null },
    trash: { status: 'idle', summary: null, message: null },
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

describe('StorageTab — Trash card (Phase 74 Theme D)', () => {
  it('is absent when optimizerEnabled is false', () => {
    resetStores();
    useUiStore.setState({ allowTrashEmpty: true, trashEmptyConsentGiven: true });
    installBridge();
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.queryByText('Trash')).toBeNull();
  });

  it('is absent when allowTrashEmpty is false', () => {
    resetStores();
    useUiStore.setState({ optimizerEnabled: true, trashEmptyConsentGiven: true });
    installBridge();
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.queryByText('Trash')).toBeNull();
  });

  it('is absent when trashEmptyConsentGiven is false', () => {
    resetStores();
    useUiStore.setState({ optimizerEnabled: true, allowTrashEmpty: true });
    installBridge();
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.queryByText('Trash')).toBeNull();
  });

  function enableAll() {
    useUiStore.setState({
      optimizerEnabled: true,
      allowTrashEmpty: true,
      trashEmptyConsentGiven: true,
    });
  }

  it('renders the not-checked-yet state with a "Check Trash" button', () => {
    resetStores();
    enableAll();
    installBridge();
    render(<StorageTab />, { wrapper: createWrapper() });

    expect(screen.getByText('The Trash hasn’t been checked yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check Trash' })).toBeTruthy();
  });

  it('clicking "Check Trash" loads the summary and renders the has-items state', async () => {
    resetStores();
    enableAll();
    const { trashSummary } = installBridge({
      trashSummary: vi.fn().mockResolvedValue({ ok: true, value: READY_SUMMARY }),
    });
    render(<StorageTab />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: 'Check Trash' }));

    expect(await screen.findByText('3 items — 2 MB')).toBeTruthy();
    expect(trashSummary).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Oldest item last modified/)).toBeTruthy();
    expect(screen.getByText('Includes 1 other mounted disk.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Empty Trash…' })).not.toHaveProperty('disabled', true);
  });

  it('renders the empty state with a disabled "Empty Trash…" button', async () => {
    resetStores();
    enableAll();
    installBridge({
      trashSummary: vi.fn().mockResolvedValue({
        ok: true,
        value: { itemCount: 0, totalBytes: 0, oldestModifiedAt: null, volumeCount: 1, truncated: false },
      }),
    });
    render(<StorageTab />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: 'Check Trash' }));

    expect(await screen.findByText('The Trash is empty.')).toBeTruthy();
    const emptyButton = screen.getByRole('button', { name: 'Empty Trash…' }) as HTMLButtonElement;
    expect(emptyButton.disabled).toBe(true);
  });

  it('renders the error state with the message, and "Check Trash" still available to retry', async () => {
    resetStores();
    enableAll();
    installBridge({ trashSummary: vi.fn().mockResolvedValue({ ok: false, message: 'Something went wrong.' }) });
    render(<StorageTab />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: 'Check Trash' }));

    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check Trash' })).toBeTruthy();
  });

  it('the truncated line appears only when the summary says so', async () => {
    resetStores();
    enableAll();
    installBridge({
      trashSummary: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...READY_SUMMARY, truncated: true },
      }),
    });
    render(<StorageTab />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: 'Check Trash' }));

    expect(await screen.findByText('More than 200,000 entries — this is a floor.')).toBeTruthy();
  });

  it('clicking "Empty Trash…" opens a confirm that recomputes its own count', async () => {
    resetStores();
    enableAll();
    useOptimizerStore.setState({ trash: { status: 'ready', summary: READY_SUMMARY, message: null } });
    const freshSummary = { ...READY_SUMMARY, itemCount: 5 };
    installBridge({ trashSummary: vi.fn().mockResolvedValue({ ok: true, value: freshSummary }) });
    render(<StorageTab />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash…' }));

    expect(await screen.findByText('Empty the Trash?')).toBeTruthy();
    // The confirm's own count, once the re-check resolves — not the card's stale one.
    await waitFor(() => expect(screen.getByText('5 items will be permanently deleted — this cannot be undone.')).toBeTruthy());
  });
});
