// vitest/jsdom: composition, the home view and the two ports — none of it needs a real browser.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { optimizerManifest } from '@midnite/studio-feature-optimizer/renderer';
import { FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { CleanerApp } from './cleaner-app';
import { CLEANER_APP } from './cleaner-manifest';
import { CLEANER_SETTINGS_KEY, createCleanerHost } from './compose/cleaner-host';
import { dialogStore } from './compose/cleaner-chrome';

/** Report an Issue's slice of the bridge: only `onOpen` is read until the dialog opens (the feature's own tests cover the rest). */
let openReport: (() => void) | null = null;
const REPORT_BRIDGE = {
  onOpen: vi.fn((handler: () => void) => {
    openReport = handler;
    return () => undefined;
  }),
  ghStatus: vi.fn(async () => ({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' })),
  bundle: vi.fn(async () => ({ text: '' })),
};

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
  dialogStore.setState({ request: null });
});

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}
const memory = () => new MemoryStorage() as unknown as Storage;

describe('Cleaner composition', () => {
  it('is the owner the placement map names for the optimizer feature', () => {
    expect(placementOwners(FEATURE_PLACEMENT.optimizer)[0]).toBe(CLEANER_APP.id);
    expect(CLEANER_APP.features).toEqual([optimizerManifest.feature]);
  });

  it('opens on a view the optimizer feature actually registers', () => {
    expect([...FEATURE_VIEWS.optimizer]).toContain(CLEANER_APP.home);
  });

  it("wears the launcher catalog's accent", () => {
    expect(CLEANER_APP.accent).toBe('#14b8a6');
  });
});

describe('Cleaner home view', () => {
  it('renders the optimizer framed as Cleaner', async () => {
    render(<CleanerApp host={createCleanerHost(memory())} />);
    expect(screen.getByRole('heading', { name: 'Cleaner' })).toBeDefined();
    expect(screen.getByText('Workspace optimizer')).toBeDefined();
    // The optimizer view is a lazy chunk: its tab strip arrives once loaded.
    await waitFor(() => expect(screen.getAllByText('Smart Scan').length).toBeGreaterThan(0));
  });

  it('opens the feature settings pages from the header', async () => {
    render(<CleanerApp host={createCleanerHost(memory())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cleaner settings' }));
    expect(screen.getByRole('button', { name: 'Close settings' })).toBeDefined();
    expect(screen.getByRole('main', { name: 'Cleaner' }).textContent?.length).toBeGreaterThan(0);
  });
});

describe('Cleaner ports', () => {
  it('defaults every destructive switch off and persists changes to its own key', () => {
    const storage = memory();
    const host = createCleanerHost(storage);
    const s = host.getSettings();
    expect([s.optimizerEnabled, s.allowSystemCacheClean, s.allowTrashEmpty]).toEqual([false, false, false]);
    s.setOptimizerEnabled(true);
    expect(JSON.parse(storage.getItem(CLEANER_SETTINGS_KEY) ?? '{}').optimizerEnabled).toBe(true);
    expect(createCleanerHost(storage).getSettings().optimizerEnabled).toBe(true);
  });

  it('shows the blast radius and runs a confirm only from its own button', () => {
    let ran = 0;
    render(<CleanerApp host={createCleanerHost(memory())} />);
    dialogStore.setState({
      request: {
        title: 'Clean 3 items',
        confirmLabel: 'Move to Trash',
        danger: true,
        blastRadius: { count: 3, sample: [] },
        blastRadiusKind: 'files',
        onConfirm: () => {
          ran += 1;
        },
      },
    });
    // setState outside act: re-query after the store notifies.
    return waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Clean 3 items' })).toBeDefined();
      expect(screen.getByRole('status').textContent).toContain('3 items will be moved to the trash.');
      expect(ran).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
      expect(ran).toBe(1);
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});

describe('Report an Issue', () => {
  it("mounts the report feature's host: main's report:open event opens its dialog", async () => {
    openReport = null;
    // The optimizer view subscribes to the scan and metrics streams on mount; the rest of its bridge is idle here.
    const idle = () => () => undefined;
    window.midniteStudio = {
      report: REPORT_BRIDGE,
      optimizer: { onScanProgress: idle, onSystemScanProgress: idle },
      metrics: { start: vi.fn(), stop: vi.fn(), onSample: idle },
    } as unknown as typeof window.midniteStudio;
    render(<CleanerApp host={createCleanerHost(memory())} />);
    await waitFor(() => expect(openReport).not.toBeNull());
    act(() => openReport?.());
    expect(await screen.findByTestId('report-issue-dialog')).toBeDefined();
  });
});
