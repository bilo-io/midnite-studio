import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Streams answer over EVENT channels, so the window that ASKED has to be the
 * window that is sent the batches.
 *
 * `logStart` resolved its target with `getWindow()` — always the main window —
 * regardless of which renderer invoked it. A detached Graph page therefore
 * started a stream, main received every row, and the popout sat on an empty
 * graph for the life of the window. Same shape for `searchStart`.
 */

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown, sender: object) => unknown>(),
  startedFor: [] as object[],
  mainWindow: { id: 1, isDestroyed: () => false },
  popout: { id: 2, isDestroyed: () => false },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: { sender: object }, raw: unknown) => unknown) => {
      mocks.handlers.set(channel, (payload, sender) => fn({ sender }, payload));
    },
    on: () => undefined,
  },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  BrowserWindow: { fromWebContents: (sender: unknown) => sender },
}));

vi.mock('../window-manager', () => ({
  // The real `resolveWindow` maps a webContents back to its window; here the
  // sender IS the window, which is enough to prove the routing.
  resolveWindow: (sender: object) => sender,
}));

vi.mock('../log-service', () => ({
  startLog: (win: object) => {
    mocks.startedFor.push(win);
  },
  cancelLog: () => undefined,
  readCommit: async () => null,
}));

vi.mock('../repo-registry', () => ({
  getRepo: () => ({ id: 'repo-1', path: '/tmp/repo-1' }),
  listRepos: async () => [],
}));

describe('stream handlers route to the sender, not to main', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.startedFor.length = 0;
  });

  it('starts the log stream for the popout that asked, not the main window', async () => {
    const { registerRepoHandlers } = await import('./repo-handlers');
    registerRepoHandlers(() => mocks.mainWindow as never);

    const logStart = mocks.handlers.get('mstudio:log:start');
    expect(logStart).toBeDefined();

    await logStart?.(
      { requestId: 'r1', repoId: 'repo-1', limit: 500, revisions: [] },
      mocks.popout,
    );

    expect(mocks.startedFor).toEqual([mocks.popout]);
    expect(mocks.startedFor).not.toContain(mocks.mainWindow);
  });
})
