import type { Page } from '@playwright/test';

/**
 * A stand-in for the preload bridge, installed before any app code runs.
 *
 * The renderer reaches the main process *only* through `window.midniteGit`, so
 * replacing that object is enough to drive the whole UI from a test — no
 * Electron, no real repository, no git binary. Fixtures go in as plain data and
 * come back through the same call signatures the preload exposes.
 *
 * Serialised into the page via `addInitScript`, so this function body may not
 * close over anything from the test file.
 */
export type MockFixtures = {
  /** Keyed by `${sha}:${path}` for commit diffs, and `wt:${path}` for worktree ones. */
  diffs: Record<string, unknown>;
  commitDetail: { sha: string; body: string; stat: string; files: unknown[] };
  graphRows: unknown[];
  statusEntries: unknown[];
  /** Refs the sidebar and the BRANCH / TAG column render. */
  refs?: unknown[];
};

export async function installMockBridge(page: Page, fixtures: MockFixtures): Promise<void> {
  await page.addInitScript((data: MockFixtures) => {
    const noop = () => undefined;
    const unsubscribe = () => noop;
    const ok = async () => ({ ok: true as const });

    const worktree = {
      id: 'repo-1:/tmp/midnite-git',
      repoId: 'repo-1',
      path: '/tmp/midnite-git',
      branch: 'main',
      headSha: 'a'.repeat(40),
      locked: false,
      isMain: true,
      prunable: false,
    };

    const repo = {
      id: 'repo-1',
      name: 'midnite-git',
      path: '/tmp/midnite-git',
      headRef: 'main',
      worktrees: [worktree],
    };

    // Diff lookups fall back to a well-formed empty FileDiff rather than
    // undefined: the real handler does the same, and a test that silently gets
    // `undefined` fails somewhere far from the cause.
    const emptyDiff = (path: string) => ({
      path,
      oldPath: null,
      change: 'modified',
      binary: false,
      oldMode: null,
      newMode: null,
      hunks: [],
      insertions: 0,
      deletions: 0,
      contextLines: 3,
      combined: false,
      truncated: false,
      droppedLines: 0,
    });

    (window as unknown as { midniteGit: unknown }).midniteGit = {
      repos: {
        open: async () => ({ ok: true, repo }),
        list: async () => [repo],
        close: async () => undefined,
        refs: async () => data.refs ?? [],
        worktrees: async () => [worktree],
        worktreeAdd: ok,
        worktreeRemove: ok,
        pickDirectory: async () => null,
      },
      log: {
        start: async (req: { requestId: string }) => {
          // Echo the caller's requestId: the store discards batches tagged with
          // an id it no longer wants, so a hardcoded one is silently dropped and
          // the graph sits on "Reading history…" forever.
          //
          // Pushed asynchronously, as the real stream does, which keeps the
          // renderer's request-id bookkeeping on its normal path.
          setTimeout(() => {
            for (const handler of batchHandlers) {
              handler({ requestId: req.requestId, rows: data.graphRows });
            }
            for (const handler of doneHandlers) {
              handler({
                requestId: req.requestId,
                total: data.graphRows.length,
                truncated: false,
              });
            }
          }, 0);
        },
        cancel: async () => undefined,
        onBatch: (handler: (e: unknown) => void) => {
          batchHandlers.push(handler);
          return () => batchHandlers.splice(batchHandlers.indexOf(handler), 1);
        },
        onDone: (handler: (e: unknown) => void) => {
          doneHandlers.push(handler);
          return () => doneHandlers.splice(doneHandlers.indexOf(handler), 1);
        },
      },
      status: {
        get: async () => ({
          branch: {
            head: 'main',
            oid: 'a'.repeat(40),
            upstream: 'origin/main',
            ahead: 0,
            behind: 0,
            unborn: false,
            detached: false,
          },
          entries: data.statusEntries,
          inProgress: null,
        }),
        commitDetail: async () => data.commitDetail,
        fileDiff: async (req: { path: string }) =>
          data.diffs[`wt:${req.path}`] ?? emptyDiff(req.path),
        commitFileDiff: async (req: { sha: string; path: string; context: number }) =>
          // The expanded variant is keyed separately so a test can assert that
          // asking for more context actually refetches.
          data.diffs[`${req.sha}:${req.path}:${req.context}`] ??
          data.diffs[`${req.sha}:${req.path}`] ??
          emptyDiff(req.path),
      },
      /*
        Every op still resolves to `{ok:true}` — but records itself first.

        A drop gesture is only half-verified by the right menu appearing: the
        item has to be wired to the operation it names. Recording the calls lets
        a test assert that "Merge X into Y" really reaches `ops.merge` carrying
        X, which no amount of asserting on menu labels can show.
      */
      ops: new Proxy(
        {},
        {
          get: (_target, name) => async (args: unknown) => {
            opCalls.push({ op: String(name), args });
            return { ok: true as const };
          },
        },
      ),
      pty: {
        // `ok: true` is not decoration — `PtyCreateResponse` is a discriminated
        // union, and without the tag the renderer reads every create as a
        // failure and renders the panel as "terminal unavailable". Nothing
        // asserted on it, so the e2e app quietly ran with a broken terminal.
        create: async () => ({ ok: true as const, ptyId: `pty-${++ptyCount}` }),
        input: noop,
        resize: noop,
        kill: noop,
        onData: unsubscribe,
        onExit: unsubscribe,
      },
      /*
        No saved sessions and the built-in roster: the e2e app starts with a
        clean terminal panel, and a spec that wants restored ones seeds them
        itself.
      */
      terminal: {
        list: async () => ({ sessions: [] }),
        save: noop,
        forget: noop,
        reorder: noop,
      },
      agent: {
        list: async () => ({
          agents: [
            { id: 'claude', label: 'Claude', command: 'claude', args: [], accent: '#D97757' },
          ],
        }),
      },
      watch: { onEvent: unsubscribe },
      menu: { onCommand: unsubscribe },
      window: {
        minimize: noop,
        toggleMaximize: noop,
        close: noop,
        getState: async () => ({ maximized: false, fullScreen: false, focused: true }),
        onStateChange: unsubscribe,
      },
      windowChrome: {
        platform: 'darwin',
        frameless: false,
        onFullscreenChange: unsubscribe,
        onFocusChange: unsubscribe,
        setBackgroundColor: noop,
      },
    };

    // Declared after use above because `var` hoisting is what makes the closure
    // in `log.start` legal; keeping them here groups the stream plumbing.
    // eslint-disable-next-line no-var
    var batchHandlers: Array<(e: unknown) => void> = [];
    // eslint-disable-next-line no-var
    var doneHandlers: Array<(e: unknown) => void> = [];

    // Published on `window` so a test can read the ops back, and clear the
    // array between gestures.
    // eslint-disable-next-line no-var
    var opCalls: Array<{ op: string; args: unknown }> = [];
    // Unique per create, so a spec can tell two terminals' streams apart.
    // eslint-disable-next-line no-var
    var ptyCount = 0;
    (window as unknown as { __mgitOps: unknown }).__mgitOps = opCalls;
  }, fixtures);
}
