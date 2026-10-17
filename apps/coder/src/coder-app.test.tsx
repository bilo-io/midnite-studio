// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClientManifest } from '@midnite/studio-feature-api-client/renderer';
import { databaseManifest } from '@midnite/studio-feature-database/renderer';
import { forgeManifest } from '@midnite/studio-feature-forge/renderer';
import { sessionsManifest } from '@midnite/studio-feature-sessions/renderer';
import { tasksManifest } from '@midnite/studio-feature-tasks/renderer';
import { testsManifest } from '@midnite/studio-feature-tests/renderer';
import {
  capabilitiesFor,
  encodeAgentRunParam,
  FEATURE_PACKAGE_FOLDERS,
  FEATURE_PLACEMENT,
  placementOwners,
  type GraphRow,
} from '@midnite/studio-shared';

import { CoderApp } from './coder-app';
import { CODER_APP } from './coder-manifest';
import { coderStore } from './coder-store';
import { dialogStore } from './compose/coder-chrome';
import { coderTasksStore } from './compose/tasks-store';

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
  dialogStore.setState({ request: null });
  window.midniteStudio = undefined;
});

/** One Roadmap board with one issue card, served by the forge-project stub; returns the items spy. */
function stubBoard() {
  const BOARD = { id: 'PVT_1', number: 7, title: 'Roadmap', url: 'https://github.com/orgs/me/projects/7', closed: false };
  const STATUS_FIELD = {
    id: 'F_status',
    name: 'Status',
    dataType: 'single_select',
    options: [
      { id: 'O_todo', name: 'Todo', color: 'GRAY' },
      { id: 'O_done', name: 'Done', color: 'GREEN' },
    ],
  };
  const ITEM = {
    id: 'PVTI_1',
    content: {
      type: 'issue',
      id: 'I_1',
      number: 42,
      title: 'Wire the write path',
      url: 'https://github.com/me/widgets/issues/42',
      state: 'OPEN',
      assignees: [],
      body: '',
      labels: [],
      dependencies: { blockedBy: [], parent: null, subIssues: [], blockedByTruncated: false, subIssuesTruncated: false },
    },
    fieldValues: { F_status: { fieldId: 'F_status', dataType: 'single_select', optionId: 'O_todo', name: 'Todo' } },
  };
  const items = vi.fn(async () => ({ cli: CLI, items: [ITEM], nextCursor: null, error: null, kind: 'ok' }));
  const forge = (window.midniteStudio as unknown as { forge: Record<string, unknown> }).forge;
  forge['issues'] = async () => ({ cli: CLI, issues: [], error: null });
  (window.midniteStudio as unknown as Record<string, unknown>)['forgeAccounts'] = { capabilities: async () => capabilitiesFor('github') };
  (window.midniteStudio as unknown as Record<string, unknown>)['forgeProject'] = {
    list: async () => ({ cli: CLI, projects: [BOARD], error: null, kind: 'ok' }),
    fields: async () => ({ cli: CLI, fields: [STATUS_FIELD], error: null, kind: 'ok' }),
    items,
  };
  return { BOARD, ITEM, items };
}

/** Renders Coder on the Tasks tab with the Roadmap board picked. */
async function openBoard(BOARD: { id: string }) {
  coderTasksStore.setState({ projectBoardByRepo: {}, projectsMode: { r1: 'board' } });

  render(<CoderApp />);
  await screen.findByText('widgets');
  fireEvent.click(screen.getByTestId('coder-tab-tasks'));
  const source = await screen.findByRole('combobox', { name: 'Task source' }, { timeout: 5000 });
  // The boards arrive after the picker renders (Repo issues is built in); pick once Roadmap is listed.
  await screen.findByRole('option', { name: 'Roadmap' }, { timeout: 5000 });
  fireEvent.change(source, { target: { value: BOARD.id } });
}

describe('Coder composition', () => {
  it('is the owner the placement map names for forge, reviews, actions, tests, the API client, the database, sessions and tasks', () => {
    for (const folder of [...FEATURE_PACKAGE_FOLDERS.forge, 'tests', 'api-client', 'database', 'sessions', 'tasks'] as const) {
      expect(placementOwners(FEATURE_PLACEMENT[folder])[0]).toBe(CODER_APP.id);
    }
    expect(CODER_APP.features).toEqual([
      forgeManifest.feature,
      testsManifest.feature,
      apiClientManifest.feature,
      databaseManifest.feature,
      sessionsManifest.feature,
      tasksManifest.feature,
    ]);
  });

  it('shows the selected repository’s boards in the Tasks tab — and nothing on a card starts an agent', async () => {
    const { BOARD, items } = stubBoard();
    await openBoard(BOARD);
    expect(await screen.findByText('Wire the write path', undefined, { timeout: 5000 })).toBeTruthy();
    expect(items).toHaveBeenCalledWith(expect.objectContaining({ projectId: BOARD.id }));
    // The board memory is the one Reviews' "Add to project" writes, so the two tabs agree.
    expect(coderTasksStore.getState().projectBoardByRepo).toEqual({ r1: BOARD.id });
    expect(window.localStorage.getItem('midnite-coder.forge.projectBoardByRepo')).toBe(JSON.stringify({ r1: BOARD.id }));
    // No terminal and no agent roster in Coder: a card offers no Start, Stop or terminal.
    expect(screen.queryByRole('button', { name: 'Start agent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop agent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show terminal' })).toBeNull();
  });

  describe('a card’s agent-run hand-off', () => {
    /** The bridge's hand-off slice, with Studio named as the receiver unless a test says otherwise. */
    function stubHandoff(receiver: 'studio' | null = 'studio', ok = true) {
      const open = vi.fn(async (_req: { link: string }) => ({ ok }));
      const runReceiver = vi.fn(async () => ({ receiver }));
      (window.midniteStudio as unknown as Record<string, unknown>)['handoff'] = { open, runReceiver };
      return { open, runReceiver };
    }

    it('sends exactly the card’s run — its URL and its skill, nothing else — once Review actions is on, and runs nothing itself', async () => {
      const { BOARD, ITEM } = stubBoard();
      const { open, runReceiver } = stubHandoff();
      coderStore.setState({ writesEnabled: true });
      await openBoard(BOARD);
      const play = await screen.findByRole('button', { name: 'Run in an agent' }, { timeout: 5000 });
      expect((play as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(play);

      await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
      expect(runReceiver).toHaveBeenCalledTimes(1);
      // An ad-hoc card (no "Phase N" in its title): the picker's default is /midnite-create-adhoc.
      const run = { issueUrl: ITEM.content.url, skill: '/midnite-create-adhoc' };
      expect(open).toHaveBeenCalledWith({ link: `midnite://open?app=agents&run=${encodeAgentRunParam(run)}` });
      // The outcome says where it went and that the confirm is Studio's.
      expect(await screen.findByRole('dialog', { name: 'Sent to Midnite Studio' })).toBeTruthy();
      expect(screen.getByText(/Nothing runs until you do/)).toBeTruthy();
      // Coder's bridge has no pty create: nothing here could start a session.
      expect('create' in ((window.midniteStudio as unknown as { pty?: object }).pty ?? {})).toBe(false);
    });

    it('sends nothing while Review actions is off — the button is disabled and says why', async () => {
      const { BOARD } = stubBoard();
      const { open, runReceiver } = stubHandoff();
      await openBoard(BOARD);
      const play = (await screen.findByRole('button', { name: 'Run in an agent' }, { timeout: 5000 })) as HTMLButtonElement;
      expect(play.disabled).toBe(true);
      expect(play.title).toBe('Turn on Review actions to hand a card to an agent');
      fireEvent.click(play);
      expect(open).not.toHaveBeenCalled();
      expect(runReceiver).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('with nothing to receive it, opens no link and offers the prompt to copy instead', async () => {
      const { BOARD, ITEM } = stubBoard();
      const { open } = stubHandoff(null);
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      coderStore.setState({ writesEnabled: true });
      await openBoard(BOARD);
      fireEvent.click(await screen.findByRole('button', { name: 'Run in an agent' }, { timeout: 5000 }));
      const dialog = await screen.findByRole('dialog', { name: 'Copy the prompt instead?' });
      expect(open).not.toHaveBeenCalled();
      expect(dialog.textContent).toContain(`/midnite-create-adhoc ${ITEM.content.url}`);
      fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
      expect(writeText).toHaveBeenCalledWith(`/midnite-create-adhoc ${ITEM.content.url}`);
      vi.unstubAllGlobals();
    });

    it('offers the prompt to copy when the link could not be opened, rather than claiming it was sent', async () => {
      const { BOARD } = stubBoard();
      const { open } = stubHandoff('studio', false);
      coderStore.setState({ writesEnabled: true });
      await openBoard(BOARD);
      fireEvent.click(await screen.findByRole('button', { name: 'Run in an agent' }, { timeout: 5000 }));
      expect(await screen.findByRole('dialog', { name: 'Copy the prompt instead?' })).toBeTruthy();
      expect(open).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog', { name: 'Sent to Midnite Studio' })).toBeNull();
    });
  });

  it('reads the Review actions switch for task writes too — off until it is turned on', () => {
    expect(coderTasksStore.getState().forgeWritesEnabled).toBe(false);
    coderStore.getState().setWritesEnabled(true);
    expect(coderTasksStore.getState().forgeWritesEnabled).toBe(true);
    coderStore.getState().setWritesEnabled(false);
    expect(coderTasksStore.getState().forgeWritesEnabled).toBe(false);
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
