// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClientManifest } from '@midnite/studio-feature-api-client/renderer';
import { databaseManifest } from '@midnite/studio-feature-database/renderer';
import { forgeManifest } from '@midnite/studio-feature-forge/renderer';
import { sessionsManifest } from '@midnite/studio-feature-sessions/renderer';
import { testsManifest } from '@midnite/studio-feature-tests/renderer';
import { FEATURE_PACKAGE_FOLDERS, FEATURE_PLACEMENT, placementOwners, type GraphRow } from '@midnite/studio-shared';

import { CoderApp } from './coder-app';
import { CODER_APP } from './coder-manifest';
import { coderStore } from './coder-store';

const CLI = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };
const REPO = { id: 'r1', path: '/Users/me/widgets', name: 'widgets', headRef: 'main', worktrees: [] };

const CONNECTION = { id: 'pg1', name: 'Local Postgres', provider: 'postgres', host: 'localhost', port: 5432, database: 'app', username: 'app' };
const COLLECTION = {
  id: 'api.postman_collection.json',
  fileName: 'api.postman_collection.json',
  collection: { info: { name: 'Widgets API' }, item: [{ name: 'List widgets', request: { method: 'GET', url: 'https://example.test/widgets' } }] },
};

function stubBridge() {
  const discover = vi.fn(async () => ({ repoId: 'r1', packages: [], generatedAt: 1 }));
  const listCollections = vi.fn(async () => ({ ok: true, value: [COLLECTION] }));
  const listConnections = vi.fn(async () => [CONNECTION]);
  window.midniteStudio = {
    apiClient: {
      listCollections,
      listEnvironments: async () => ({ ok: true, value: [] }),
      listHistory: async () => ({ ok: true, value: [] }),
      onRunProgress: () => () => undefined,
      onRunDone: () => () => undefined,
    },
    db: {
      listConnections,
      getSchema: async () => ({ ok: true, data: { connectionId: 'pg1', tables: [] } }),
      onQueryBatch: () => () => undefined,
      onQueryDone: () => () => undefined,
    },
    repos: { list: async () => [REPO], pickDirectory: async () => null, open: vi.fn(), close: vi.fn() },
    remotes: { list: async () => [{ name: 'origin', fetchUrl: '', pushUrl: '', forge: { kind: 'github', host: 'github.com', owner: 'me', repo: 'widgets' } }] },
    forge: {
      cliStatus: async () => CLI,
      pulls: async () => ({ cli: CLI, pulls: [], error: null }),
      runs: async () => ({ cli: CLI, runs: [], error: null }),
      subscribe: () => undefined,
      unsubscribe: () => undefined,
      onChanged: () => () => undefined,
    },
    forgeAccounts: { capabilities: async () => ({}) },
    tests: { discover, onOutput: () => () => undefined, onResult: () => () => undefined },
    log: {
      start: logStart,
      cancel: async () => undefined,
      onBatch: (fn: (e: { requestId: string; rows: GraphRow[] }) => void) => ((logListeners.batch = fn), () => undefined),
      onDone: (fn: (e: { requestId: string; total: number; truncated: boolean }) => void) => ((logListeners.done = fn), () => undefined),
    },
    status: { get: async () => STATUS, commitDetail: async () => null, commitStats: async () => ({ stats: {} }) },
  } as unknown as typeof window.midniteStudio;
  (window.midniteStudio as unknown as { repos: Record<string, unknown> }).repos['refs'] = async () => [];
  return { discover, listCollections, listConnections };
}

const STATUS = {
  branch: { head: 'main', oid: 'a'.repeat(40), upstream: null, ahead: 0, behind: 0, unborn: false, detached: false },
  entries: [],
  inProgress: null,
};
const ROW: GraphRow = {
  row: 0,
  lane: 0,
  colorIdx: 0,
  laneCount: 1,
  edges: [],
  commit: {
    sha: 'a'.repeat(40),
    parents: [],
    authorName: 'Ada',
    authorEmail: 'ada@example.com',
    authorDate: 1_700_000_000,
    committerDate: 1_700_000_000,
    subject: 'Initial import',
    refs: [],
    coAuthors: [],
    sessionTrailers: [],
  },
};
const logListeners: {
  batch?: (e: { requestId: string; rows: GraphRow[] }) => void;
  done?: (e: { requestId: string; total: number; truncated: boolean }) => void;
} = {};
const logStart = vi.fn(async ({ requestId }: { requestId: string }) => {
  queueMicrotask(() => {
    logListeners.batch?.({ requestId, rows: [ROW] });
    logListeners.done?.({ requestId, total: 1, truncated: false });
  });
});

let bridge: ReturnType<typeof stubBridge>;
beforeEach(() => {
  bridge = stubBridge();
  coderStore.setState({ selectedRepoId: null, view: 'reviews', writesEnabled: false });
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Coder composition', () => {
  it('is the owner the placement map names for forge, reviews, actions, tests, the API client, the database and sessions', () => {
    for (const folder of [...FEATURE_PACKAGE_FOLDERS.forge, 'tests', 'api-client', 'database', 'sessions'] as const) {
      expect(placementOwners(FEATURE_PLACEMENT[folder])[0]).toBe(CODER_APP.id);
    }
    expect(CODER_APP.features).toEqual([
      forgeManifest.feature,
      testsManifest.feature,
      apiClientManifest.feature,
      databaseManifest.feature,
      sessionsManifest.feature,
    ]);
  });

  it('shows the runtime host’s sessions in the Sessions tab with no repository selected — and offers no kill', async () => {
    const list = vi.fn(async () => ({
      broker: { mode: 'broker' as const },
      sessions: [
        {
          session: { id: 'a1', kind: 'shell' as const, title: 'flows', name: 'Started by Midnite Agents', cwd: '/f', repoId: '/f', createdAt: 1 },
          scrollback: new Uint8Array(0),
          live: { ptyId: 'p-a1', pid: 7, cols: 80, rows: 24 },
        },
      ],
    }));
    window.midniteStudio = {
      ...window.midniteStudio,
      repos: { list: async () => [], pickDirectory: async () => null, open: vi.fn(), close: vi.fn() },
      terminal: { list },
    } as unknown as typeof window.midniteStudio;
    coderStore.setState({ view: 'sessions' });
    render(<CoderApp />);
    expect(await screen.findByText('Started by Midnite Agents', undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText('No repository selected.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kill session' })).toBeNull();
    expect(list).toHaveBeenCalled();
  });

  it("wears the launcher catalog's accent and opens on Reviews", () => {
    expect(CODER_APP.accent).toBe('#2e7cfa');
    expect(CODER_APP.home).toBe('reviews');
  });

  it('lists the repositories main holds and selects the first', async () => {
    render(<CoderApp />);
    expect(await screen.findByText('widgets')).toBeTruthy();
    await waitFor(() => expect(coderStore.getState().selectedRepoId).toBe('r1'));
  });

  it('switches to Tests and asks main to discover the selected repository', async () => {
    render(<CoderApp />);
    await screen.findByText('widgets');
    fireEvent.click(screen.getByTestId('coder-tab-tests'));
    await waitFor(() => expect(bridge.discover).toHaveBeenCalledWith({ repoId: 'r1' }));
    expect(coderStore.getState().view).toBe('tests');
  });

  it('shows the selected repository’s history in the Graph tab — read-only, with no menu to write from', async () => {
    render(<CoderApp />);
    await screen.findByText('widgets');
    fireEvent.click(screen.getByTestId('coder-tab-graph'));
    expect(await screen.findByText('Initial import', undefined, { timeout: 5000 })).toBeTruthy();
    expect(logStart).toHaveBeenCalledWith(expect.objectContaining({ repoId: 'r1' }));
    fireEvent.contextMenu(screen.getByText('Initial import'));
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('shows the selected repository’s API collections in the API tab', async () => {
    render(<CoderApp />);
    await screen.findByText('widgets');
    fireEvent.click(screen.getByTestId('coder-tab-apiClient'));
    expect(await screen.findByText('Widgets API', undefined, { timeout: 5000 })).toBeTruthy();
    expect(bridge.listCollections).toHaveBeenCalledWith({ repoId: 'r1' });
    expect(coderStore.getState().view).toBe('apiClient');
  });

  it('shows the Database tab even with no repository selected — a connection is not a property of one', async () => {
    window.midniteStudio = { ...window.midniteStudio, repos: { list: async () => [], pickDirectory: async () => null, open: vi.fn(), close: vi.fn() } } as unknown as typeof window.midniteStudio;
    coderStore.setState({ view: 'database' });
    render(<CoderApp />);
    expect(await screen.findByText('Local Postgres', undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText('No repository selected.')).toBeNull();
    expect(bridge.listConnections).toHaveBeenCalled();
  });

  it('keeps review actions off until the switch is turned on', () => {
    render(<CoderApp />);
    const toggle = screen.getByLabelText('Review actions') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(coderStore.getState().writesEnabled).toBe(true);
  });
});
