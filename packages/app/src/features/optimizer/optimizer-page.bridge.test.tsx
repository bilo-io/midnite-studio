import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useOptimizerStore } from '../../store/optimizer-store';
import { OptimizerPage } from './optimizer-page';

/**
 * Migrated from `e2e/optimizer.spec.ts` (Phase 82 Theme C, wave 3) — the four
 * tabs, Smart Scan handing its result to Storage, the per-row and per-group
 * Clean confirms, the extra-root folder picker, the GPU tab's static info and
 * disabled toggles, the Memory tab's gauges/filter/terminate flow, and the
 * Trash card's three-gate visibility and confirm. 12 of the original 14
 * tests moved here; 2 stay in Playwright, below.
 *
 * `OptimizerPage` has no internal `React.lazy` boundary — only the outer
 * `view-registry.tsx` lazy-loads the *view*, which mounting the component
 * directly bypasses — so no chunk warm-up is needed here (the same
 * conclusion `actions-view.bridge.test.tsx` reached for `ActionsView`).
 *
 * **2 of the original 14 stay in Playwright**, both under `test.describe('the
 * feature gate')`: "the view is absent from the rail with the setting off,
 * and appears once switched on" needs the app's outer rail and its Settings
 * navigation, and "a persisted activeView of optimizer the setting no longer
 * allows redirects to Graph" tests `app.tsx`'s own redirect — neither is
 * reachable by mounting `OptimizerPage` alone, since both are about whether
 * the view is reachable/shown at all rather than about anything inside it.
 */

const SCAN_RESULT = {
  totalBytes: 300,
  byCategory: { dependencies: 200, buildOutput: 100, toolCache: 0, staleWorktree: 0, looseObjects: 0 },
  byEcosystem: {
    node: 300,
    multi: 0,
    rust: 0,
    cpp: 0,
    dotnet: 0,
    python: 0,
    java: 0,
    swift: 0,
    ruby: 0,
    git: 0,
  },
  detectors: {
    'node-modules': { label: 'node_modules', producer: 'npm/pnpm/yarn install' },
    'node-dist': { label: 'dist/', producer: 'npm run build' },
  },
  items: [
    {
      path: '/tmp/midnite-studio/node_modules',
      bytes: 200,
      category: 'dependencies',
      repoId: 'repo-1',
      detectorId: 'node-modules',
      ecosystem: 'node',
      reclaim: 'costly',
    },
    {
      path: '/tmp/midnite-studio/dist',
      bytes: 100,
      category: 'buildOutput',
      repoId: 'repo-1',
      detectorId: 'node-dist',
      ecosystem: 'node',
      reclaim: 'cheap',
    },
  ],
  truncated: false,
  truncatedRoots: [],
};

const GPU_STATS = { model: 'Apple M2 Pro', vramBytes: 16 * 1024 * 1024 * 1024, loadPercent: 37 };

const NODE_PROCESS = {
  pid: 1001,
  ppid: 1,
  name: 'node server.js',
  argv: 'node /Users/bilo/project/server.js',
  rssBytes: 450 * 1024 * 1024,
  cpuPercent: 12.5,
  ours: true,
};

const WINDOW_SERVER_PROCESS = {
  pid: 2001,
  ppid: 1,
  name: 'WindowServer',
  argv: '/System/Library/CoreServices/WindowServer -display',
  rssBytes: 800 * 1024 * 1024,
  cpuPercent: 5.2,
  ours: false,
};

/**
 * The three consent flags the Storage tab's System/Trash sections gate on
 * (Phase 73 Theme C, Phase 74 Theme D/E), applied via `uiState` — the jsdom
 * equivalent of the e2e spec's own `seedOptimizerEnabled`/`seedTrashGate`,
 * which write straight into the persisted key rather than choreographing the
 * settings UI, and for the same reason `renderView`'s own doc comment gives:
 * `useUiStore` is a module singleton hydrated once at import time, so a
 * `localStorage` seed after that point is invisible to it.
 */
const GATE_STATE = {
  optimizerEnabled: true,
  allowSystemCacheClean: true,
  systemCacheConsentGiven: true,
  allowTrashEmpty: true,
  trashEmptyConsentGiven: true,
};

const tab = (name: 'Smart Scan' | 'Storage' | 'Memory' | 'GPU') =>
  within(screen.getByRole('navigation', { name: 'Optimizer tabs' })).getByRole('button', { name });

async function openOptimizer(
  data: MockFixtures = fixtures,
  uiState: Record<string, unknown> = GATE_STATE,
): Promise<void> {
  renderView(<OptimizerPage />, { fixtures: data, uiState });
  await screen.findByRole('heading', { name: 'Workspace Optimizer' });
}

beforeEach(() => {
  useOptimizerStore.setState({
    tab: 'smartScan',
    scan: { state: 'idle', progress: 0, result: null, message: null },
    processes: [],
    memory: null,
    gpu: null,
    systemScan: { state: 'idle', progress: 0, result: null, message: null },
    systemCatalogue: null,
    trash: { status: 'idle', summary: null, message: null },
  });
});

afterEach(cleanup);

describe('OptimizerPage, assembled through the real bridge', () => {
  it('the four tabs render and switch', async () => {
    await openOptimizer();

    expect(tab('Smart Scan').getAttribute('aria-current')).toBe('page');

    fireEvent.click(tab('Storage'));
    // A regex, not the exact string: Testing Library's `getByText` matches a
    // node's WHOLE normalised text by default (unlike Playwright's own
    // substring default), and the real sentence continues past this phrase.
    expect(await screen.findByText(/Run a Smart Scan first/)).toBeTruthy();

    fireEvent.click(tab('Memory'));
    expect(screen.getByPlaceholderText('Filter processes or PID…')).toBeTruthy();

    fireEvent.click(tab('GPU'));
    expect(screen.getByText('Load, last 60s')).toBeTruthy();

    fireEvent.click(tab('Smart Scan'));
    expect(await screen.findByText(/Finds reclaimable space/)).toBeTruthy();
  });

  it('a scan hands its ScanResult to Storage', async () => {
    await openOptimizer({ ...fixtures, optimizer: { scanResult: SCAN_RESULT } });

    fireEvent.click(screen.getByRole('button', { name: 'Run Smart Scan' }));
    expect(await screen.findByText('300 B reclaimable')).toBeTruthy();
    // 'nodeModules' renamed to 'dependencies' (Phase 72 Theme C).
    expect(screen.getByText('Dependencies')).toBeTruthy();
    expect(screen.getByText('Build output')).toBeTruthy();

    fireEvent.click(tab('Storage'));
    expect(screen.getByRole('img', { name: 'Reclaimable storage by category' })).toBeTruthy();
    expect(screen.getByText('/tmp/midnite-studio/node_modules')).toBeTruthy();
    expect(screen.getByText('/tmp/midnite-studio/dist')).toBeTruthy();
  });

  it('Clean shows the confirm with a real item count and byte figure, and the item leaves the list on confirm', async () => {
    await openOptimizer({ ...fixtures, optimizer: { scanResult: SCAN_RESULT } });
    fireEvent.click(screen.getByRole('button', { name: 'Run Smart Scan' }));
    await screen.findByText('Dependencies');

    // Phase 72 Theme D: the per-category row's Clean button is scoped to one
    // (ecosystem, category) pair — every SCAN_RESULT item is `node`.
    fireEvent.click(screen.getByRole('button', { name: 'Clean Node Dependencies' }));

    expect(await screen.findByRole('heading', { name: 'Clean Dependencies?' })).toBeTruthy();
    expect(screen.getByText('1 item will be moved to the trash.')).toBeTruthy();
    expect(screen.getByText('200 B will be freed.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));

    await waitFor(() => expect(screen.queryByText('Dependencies')).toBeNull());
    expect(screen.getByText('Build output')).toBeTruthy();
  });

  it('the ecosystem group Clean button cleans only the cheap items in it, and a costly-only group is disabled', async () => {
    await openOptimizer({
      ...fixtures,
      optimizer: {
        scanResult: {
          ...SCAN_RESULT,
          totalBytes: 500,
          byCategory: {
            dependencies: 400,
            buildOutput: 100,
            toolCache: 0,
            staleWorktree: 0,
            looseObjects: 0,
          },
          byEcosystem: { ...SCAN_RESULT.byEcosystem, node: 500 },
          items: [
            ...SCAN_RESULT.items,
            {
              path: '/tmp/midnite-studio/other/node_modules',
              bytes: 200,
              category: 'dependencies',
              repoId: 'repo-1',
              detectorId: 'node-modules',
              ecosystem: 'node',
              reclaim: 'costly',
            },
          ],
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run Smart Scan' }));
    await screen.findByText('Dependencies');

    // The group holds one cheap item (dist, 100 B) and two costly items (400 B
    // of node_modules) — the group Clean button cleans the cheap one only.
    // A plain string `name` already means the whole accessible name here
    // (unlike Playwright's own substring default), so "Clean Node" does not
    // also match "Clean Node Dependencies".
    fireEvent.click(screen.getByRole('button', { name: 'Clean Node' }));
    expect(await screen.findByRole('heading', { name: 'Clean Node?' })).toBeTruthy();
    expect(screen.getByText('100 B will be freed.')).toBeTruthy();
    expect(screen.getByText('npm run build will need to run again.')).toBeTruthy();
    expect(
      screen.getByText(
        '2 items need a re-download to restore and were left alone — clean them individually.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));

    await waitFor(() => expect(screen.queryByText('Build output')).toBeNull());
    // The two costly node_modules items remain — the group button is now
    // disabled because only costly items are left in it.
    expect(
      (screen.getByRole('button', { name: 'Clean Node' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('the extra-root folder picker', async () => {
    await openOptimizer({
      ...fixtures,
      optimizer: { scanResult: SCAN_RESULT },
      pickDirectoryResult: '/Users/bilo/side-project',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add a folder to scan' }));
    expect(await screen.findByText('/Users/bilo/side-project')).toBeTruthy();

    // The chosen root survives a scan — dismissible, not implicit.
    fireEvent.click(screen.getByRole('button', { name: 'Run Smart Scan' }));
    expect(await screen.findByText('300 B reclaimable')).toBeTruthy();
    expect(screen.getByText('/Users/bilo/side-project')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove extra scan folder' }));
    await waitFor(() => expect(screen.queryByText('/Users/bilo/side-project')).toBeNull());
    expect(screen.getByRole('button', { name: 'Add a folder to scan' })).toBeTruthy();
  });

  it('the GPU tab renders info and a growing 60s chart, no temperature field, and disabled Tweak toggles', async () => {
    await openOptimizer({ ...fixtures, optimizer: { gpu: GPU_STATS } });
    fireEvent.click(tab('GPU'));

    expect(await screen.findByText('Apple M2 Pro')).toBeTruthy();
    expect(screen.getByText('17.2 GB VRAM')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'GPU load, last 60 seconds' })).toBeTruthy();

    expect(screen.queryByText(/temperature/i)).toBeNull();

    for (const label of ['Prefer integrated GPU', 'Disable GPU acceleration for terminals']) {
      expect(screen.getByText(label, { exact: false })).toBeTruthy();
    }
    expect(screen.getAllByText(/not wired yet/)[0]).toBeTruthy();
    expect(document.querySelectorAll('input[type="checkbox"][disabled]')).toHaveLength(2);
  });

  it('the Memory tab renders memory gauges, 4-segment breakdown, and process list', async () => {
    await openOptimizer({
      ...fixtures,
      optimizer: {
        memory: {
          totalBytes: 16 * 1024 * 1024 * 1024,
          usedBytes: 12 * 1024 * 1024 * 1024,
          wiredBytes: 3 * 1024 * 1024 * 1024,
          activeBytes: 5 * 1024 * 1024 * 1024,
          compressedBytes: 2 * 1024 * 1024 * 1024,
          cachedBytes: 2 * 1024 * 1024 * 1024,
          freeBytes: 4 * 1024 * 1024 * 1024,
        },
        processes: [NODE_PROCESS, WINDOW_SERVER_PROCESS],
      },
    });

    fireEvent.click(tab('Memory'));

    expect(await screen.findByText('Memory Used')).toBeTruthy();
    expect(screen.getByText('Cached Files')).toBeTruthy();
    expect(screen.getByText('Free RAM')).toBeTruthy();

    expect(screen.getByText('Wired', { exact: true })).toBeTruthy();
    expect(screen.getByText('Active', { exact: true })).toBeTruthy();
    expect(screen.getByText('Compressed', { exact: true })).toBeTruthy();

    expect(screen.getByText('node server.js')).toBeTruthy();
    expect(screen.getByText('WindowServer', { exact: true })).toBeTruthy();

    // Foreign process is protected; the midnite-owned one has a Terminate button.
    expect(screen.getByText('Protected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Terminate' })).toBeTruthy();
  });

  it('filtering the Memory tab by process name or PID', async () => {
    await openOptimizer({
      ...fixtures,
      optimizer: { processes: [NODE_PROCESS, WINDOW_SERVER_PROCESS] },
    });

    fireEvent.click(tab('Memory'));
    expect(await screen.findByText('node server.js')).toBeTruthy();
    expect(screen.getByText('WindowServer', { exact: true })).toBeTruthy();

    const input = screen.getByPlaceholderText('Filter processes or PID…');
    fireEvent.change(input, { target: { value: 'node' } });
    expect(screen.getByText('node server.js')).toBeTruthy();
    expect(screen.queryByText('WindowServer', { exact: true })).toBeNull();

    fireEvent.change(input, { target: { value: '2001' } });
    expect(screen.queryByText('node server.js')).toBeNull();
    expect(screen.getByText('WindowServer', { exact: true })).toBeTruthy();

    fireEvent.change(input, { target: { value: 'nonexistent' } });
    expect(screen.getByText('No matching processes found.')).toBeTruthy();
  });

  it('terminating an owned process with confirmation dialog', async () => {
    await openOptimizer({ ...fixtures, optimizer: { processes: [NODE_PROCESS] } });

    fireEvent.click(tab('Memory'));
    expect(await screen.findByText('node server.js')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Terminate' }));

    expect(screen.getByRole('heading', { name: 'Terminate Process (PID 1001)' })).toBeTruthy();
    expect(screen.getByText('Send SIGTERM to stop node server.js?')).toBeTruthy();

    // Dismissing keeps the process.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Terminate Process (PID 1001)' })).toBeNull();
    expect(screen.getByText('node server.js')).toBeTruthy();

    // Re-opening and confirming terminates the process.
    fireEvent.click(screen.getByRole('button', { name: 'Terminate' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Terminate' }));

    await waitFor(() => expect(screen.queryByText('node server.js')).toBeNull());
  });

  it('the Trash card is visible with all three gates on', async () => {
    await openOptimizer();
    fireEvent.click(tab('Storage'));
    expect(await screen.findByText('Trash', { exact: true })).toBeTruthy();
  });

  it('the Trash card is absent when allowTrashEmpty is off', async () => {
    await openOptimizer(fixtures, { ...GATE_STATE, allowTrashEmpty: false });
    fireEvent.click(tab('Storage'));
    expect(screen.queryByText('Trash', { exact: true })).toBeNull();
  });

  it('clicking "Empty Trash…" opens a confirm gated by the requireAck checkbox', async () => {
    await openOptimizer({
      ...fixtures,
      optimizer: {
        trash: {
          itemCount: 7,
          totalBytes: 12_000_000,
          oldestModifiedAt: '2026-01-01T00:00:00.000Z',
          volumeCount: 1,
          truncated: false,
        },
      },
    });
    fireEvent.click(tab('Storage'));

    fireEvent.click(screen.getByRole('button', { name: 'Check Trash' }));
    expect(await screen.findByText(/^7 items/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash…' }));
    expect(screen.getByRole('heading', { name: 'Empty the Trash?' })).toBeTruthy();

    const confirmButton = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Empty Trash',
    });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand this cannot be undone' }));
    expect((confirmButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(confirmButton);
    await waitFor(() =>
      expect(
        screen.queryByText(/^0 items/) ?? screen.queryByText('The Trash is empty.'),
      ).toBeTruthy(),
    );
  });
});
