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
  /**
   * Keyed by resolved sha, so a spec can navigate between commits — clicking a
   * parent or a linkified sha is the Theme B behaviour under test, and a single
   * record could only ever answer for one of them.
   */
  commitDetails: Record<string, unknown>;
  /**
   * What `repos.revParse` answers, keyed by the abbreviation asked for.
   *
   * An abbreviation with no entry resolves to `{sha: null}`, which is how the
   * "commit is not in this repository" state is reached.
   */
  revisions?: Record<string, string>;
  graphRows: unknown[];
  statusEntries: unknown[];
  /** Refs the sidebar and the BRANCH / TAG column render. */
  refs?: unknown[];
  /** Configured remotes, as `mgit:remotes:list` returns them (forge pre-derived). */
  remotes?: unknown[];
  /**
   * Extra checkouts beyond the built-in main one.
   *
   * The default repo has a single main worktree, which is enough for most
   * specs and useless for the sidebar's per-checkout counts — those only mean
   * anything once two checkouts disagree about how dirty they are.
   */
  worktrees?: { path: string; branch: string; isMain?: boolean; locked?: boolean }[];
  /**
   * Status entries per checkout, keyed by worktree path.
   *
   * `statusEntries` remains the answer for any path with no entry here, so
   * existing specs keep the single-status behaviour they were written against.
   */
  statusByWorktree?: Record<string, unknown[]>;
  /** `mgit:forge:*` answers. Absent means a repo with no GitHub remote. */
  forge?: {
    cli?: { reason: 'ready' | 'not-installed' | 'not-authenticated'; hint?: string };
    runs?: unknown[];
    pulls?: unknown[];
    error?: string | null;
  };
  /**
   * Sessions `terminal.list` restores, each with the scrollback to replay.
   *
   * A restored session comes back with NO process — that is the whole point of
   * persisting one — so seeding these is how a spec reaches the dimmed-until-
   * revived state without quitting an app it never launched.
   *
   * `scrollback` is written as a plain string here and encoded to the
   * `Uint8Array` the contract requires on the way in; a fixture file should not
   * have to spell out byte arrays.
   */
  terminalSessions?: { session: Record<string, unknown>; scrollback?: string }[];
  /**
   * Directory listings for the Folder view and the Agent page's ~/.claude
   * tree, keyed `repo:<relPath>` / `claude:<relPath>` ('' is the root).
   */
  fsDirs?: Record<
    string,
    Array<{ name: string; kind: 'file' | 'dir' | 'symlink'; size: number; isIgnored: boolean }>
  >;
  /** File reads for the preview pane, keyed the same way. */
  fsFiles?: Record<
    string,
    | { kind: 'text'; content: string; size: number }
    | { kind: 'binary' | 'too-large'; size: number }
    | { kind: 'error'; message: string }
  >;
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

    const extraWorktrees = (data.worktrees ?? []).map((entry) => ({
      id: `repo-1:${entry.path}`,
      repoId: 'repo-1',
      path: entry.path,
      branch: entry.branch,
      headSha: 'b'.repeat(40),
      locked: entry.locked ?? false,
      isMain: entry.isMain ?? false,
      prunable: false,
    }));
    const allWorktrees = [worktree, ...extraWorktrees];

    const repo = {
      id: 'repo-1',
      name: 'midnite-git',
      path: '/tmp/midnite-git',
      headRef: 'main',
      worktrees: allWorktrees,
    };

    /*
      No `forge` fixture means a repository with no GitHub remote — which the
      real handler reports as `not-installed` with an explanatory hint, so the
      sections render nothing at all. That is the correct default for the specs
      that predate this feature.
    */
    const forgeCli = () => ({
      reason: data.forge?.cli?.reason ?? 'not-installed',
      binPath: null,
      hint: data.forge?.cli?.hint ?? 'This repository has no GitHub remote.',
    });
    const forgeError = () => data.forge?.error ?? null;

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
        worktrees: async () => allWorktrees,
        worktreeAdd: ok,
        worktreeRemove: ok,
        pickDirectory: async () => null,
        revParse: async (req: { rev: string }) => ({ sha: data.revisions?.[req.rev] ?? null }),
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
        get: async (req: { worktreePath?: string }) => ({
          branch: {
            head: 'main',
            oid: 'a'.repeat(40),
            upstream: 'origin/main',
            ahead: 0,
            behind: 0,
            unborn: false,
            detached: false,
          },
          entries:
            (req.worktreePath ? data.statusByWorktree?.[req.worktreePath] : undefined) ??
            data.statusEntries,
          inProgress: null,
        }),
        // Null for an unknown sha, exactly as the real handler does — the
        // inspector's not-found state is unreachable otherwise.
        commitDetail: async (req: { sha: string }) => data.commitDetails[req.sha] ?? null,
        fileDiff: async (req: { path: string }) =>
          data.diffs[`wt:${req.path}`] ?? emptyDiff(req.path),
        commitFileDiff: async (req: { sha: string; path: string; context: number }) =>
          // The expanded variant is keyed separately so a test can assert that
          // asking for more context actually refetches.
          data.diffs[`${req.sha}:${req.path}:${req.context}`] ??
          data.diffs[`${req.sha}:${req.path}`] ??
          emptyDiff(req.path),
      },
      remotes: {
        list: async () => data.remotes ?? [],
      },
      /*
        Records the URL and then answers as the real handler does.

        Recorded rather than stubbed silently because the assertion worth making
        is which URL a link hands over — a button that opens the WRONG project
        page looks identical to one that opens the right one from the outside.
        The protocol allow-list itself is enforced in main and unit-tested there;
        what this can show is that the renderer only ever asks for https URLs.
      */
      forge: {
        cliStatus: async () => forgeCli(),
        runs: async () => ({ cli: forgeCli(), runs: data.forge?.runs ?? [], error: forgeError() }),
        pulls: async () => ({
          cli: forgeCli(),
          pulls: data.forge?.pulls ?? [],
          error: forgeError(),
        }),
      },
      shell: {
        openExternal: async (req: { url: string }) => {
          externalUrls.push(req.url);
          return { ok: true as const };
        },
      },
      /*
        Recorded rather than stubbed, for the same reason as openExternal: the
        assertion worth making about a copy button is WHAT it copied. In the real
        app this is Electron's clipboard because the packaged renderer is a
        `file://` origin and `navigator.clipboard` needs a secure context —
        which is also why there is nothing here for a spec to read back except
        what the bridge was handed.
      */
      clipboard: {
        writeText: async (req: { text: string }) => {
          clipboardWrites.push(req.text);
          return { ok: true as const };
        },
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
      /*
        A fake pty that actually talks back.

        Not a stub: xterm only paints what arrives on `pty:data`, so a `create`
        that resolves and then goes silent leaves a blank pane — which looks
        identical to a broken one and makes every screenshot an empty rectangle.
        This one writes a prompt when it opens, echoes what is typed, and answers
        a couple of commands from a canned transcript. Escape sequences are
        included deliberately (the prompt is coloured), because the bytes the
        real pty sends have them and a mock that omits them would hide any
        regression in how they are decoded.
      */
      pty: {
        // `ok: true` is not decoration — `PtyCreateResponse` is a discriminated
        // union, and without the tag the renderer reads every create as a
        // failure and renders the panel as "terminal unavailable". Nothing
        // asserted on it, so the e2e app quietly ran with a broken terminal.
        create: async (req: { sessionId: string; initialInput?: string }) => {
          const ptyId = `pty-${++ptyCount}`;
          ptySessions[ptyId] = req.sessionId;
          ptyCalls.creates.push({ ptyId, sessionId: req.sessionId });
          // A tick later, the way a real shell takes a moment to come up —
          // immediate output would race the renderer's own attach.
          setTimeout(() => {
            write(ptyId, PROMPT);
            if (req.initialInput) feed(ptyId, req.initialInput);
          }, 10);
          return { ok: true as const, ptyId };
        },
        input: (req: { ptyId: string; data: string }) => {
          ptyCalls.inputs.push(req);
          feed(req.ptyId, req.data);
        },
        resize: noop,
        kill: (req: { ptyId: string }) => {
          ptyCalls.kills.push(req.ptyId);
          delete ptySessions[req.ptyId];
          for (const handler of exitHandlers) handler({ ptyId: req.ptyId, exitCode: 0 });
        },
        onData: (handler: (e: { ptyId: string; data: Uint8Array }) => void) => {
          dataHandlers.push(handler);
          return () => {
            dataHandlers.splice(dataHandlers.indexOf(handler), 1);
          };
        },
        onExit: (handler: (e: { ptyId: string; exitCode: number }) => void) => {
          exitHandlers.push(handler);
          return () => {
            exitHandlers.splice(exitHandlers.indexOf(handler), 1);
          };
        },
      },
      /*
        Restored sessions come from the fixture, and the roster is the builtin
        one. A spec that wants a clean panel simply passes none, which is what
        every pre-existing spec does.
      */
      terminal: {
        list: async () => ({
          sessions: (data.terminalSessions ?? []).map((entry) => ({
            session: entry.session,
            scrollback: encode(entry.scrollback ?? ''),
          })),
        }),
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
        claudeInfo: async () => ({
          installed: true,
          version: '2.1.34',
          method: 'npm',
          binPath: '/Users/e2e/.nvm/versions/node/v22.12.0/bin/claude',
        }),
        claudeUpdate: async () => ({ ok: true as const, exitCode: 0 }),
        onClaudeUpdateData: unsubscribe,
      },
      fs: {
        listDir: async (req: { scope: string; relPath: string }) => {
          const key = `${req.scope === 'repo' ? 'repo' : 'claude'}:${req.relPath}`;
          const entries = data.fsDirs?.[key];
          return entries ? { ok: true, entries } : { ok: false, message: 'no fixture for ' + key };
        },
        readFile: async (req: { scope: string; relPath: string }) => {
          const key = `${req.scope === 'repo' ? 'repo' : 'claude'}:${req.relPath}`;
          return data.fsFiles?.[key] ?? { kind: 'error', message: 'no fixture for ' + key };
        },
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
    // eslint-disable-next-line no-var
    var externalUrls: string[] = [];
    // eslint-disable-next-line no-var
    var clipboardWrites: string[] = [];

    // --- the fake pty ------------------------------------------------------
    // eslint-disable-next-line no-var
    var dataHandlers: Array<(e: { ptyId: string; data: Uint8Array }) => void> = [];
    // eslint-disable-next-line no-var
    var exitHandlers: Array<(e: { ptyId: string; exitCode: number }) => void> = [];
    /** Which session each live pty belongs to — a killed pty is deleted, not flagged. */
    // eslint-disable-next-line no-var
    var ptySessions: Record<string, string> = {};

    /**
     * A coloured prompt, escape sequences and all.
     *
     * Real pty bytes carry them, and the whole no-base64 rule on `pty:data`
     * exists so xterm is the one thing decoding them. A mock that sent plain
     * ASCII would quietly stop testing that.
     */
    // eslint-disable-next-line no-var
    var PROMPT = '\x1b[32m➜\x1b[0m \x1b[36mmidnite-git\x1b[0m $ ';

    /** Canned answers, keyed by the line typed. Anything else gets a not-found. */
    // eslint-disable-next-line no-var
    var TRANSCRIPT: Record<string, string> = {
      'git status': 'On branch main\r\nnothing to commit, working tree clean\r\n',
      ls: 'CLAUDE.md  README.md  docs  packages  todo\r\n',
      claude: '\x1b[38;2;217;119;87m✻\x1b[0m Welcome to Claude Code\r\n',
      pwd: '/tmp/midnite-git\r\n',
    };

    // eslint-disable-next-line no-var
    var encode = (text: string) => new TextEncoder().encode(text);

    // eslint-disable-next-line no-var
    var write = (ptyId: string, text: string) => {
      // A killed pty is silent, the way a dead process is: writing after kill
      // would let a spec pass against output no real terminal could produce.
      if (!(ptyId in ptySessions)) return;
      const event = { ptyId, data: encode(text) };
      for (const handler of dataHandlers) handler(event);
    };

    /**
     * One keystroke's worth of input, echoed the way a line-buffered shell does.
     *
     * Return is what runs a line, so the buffer accumulates until one arrives —
     * which is also what makes "revive a restored session by pressing Enter"
     * testable as the gesture it actually is.
     */
    // eslint-disable-next-line no-var
    var buffers: Record<string, string> = {};
    // eslint-disable-next-line no-var
    var feed = (ptyId: string, data: string) => {
      if (!(ptyId in ptySessions)) return;
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          const line = (buffers[ptyId] ?? '').trim();
          buffers[ptyId] = '';
          write(ptyId, '\r\n');
          if (line) {
            write(ptyId, TRANSCRIPT[line] ?? `zsh: command not found: ${line}\r\n`);
          }
          write(ptyId, PROMPT);
        } else if (ch === '\x7f') {
          const buffer = buffers[ptyId] ?? '';
          if (buffer) {
            buffers[ptyId] = buffer.slice(0, -1);
            write(ptyId, '\b \b');
          }
        } else {
          buffers[ptyId] = (buffers[ptyId] ?? '') + ch;
          write(ptyId, ch);
        }
      }
    };

    /*
      The pty's traffic, published for the specs.

      xterm paints through the WebGL addon, so everything a terminal displays is
      canvas pixels — unreachable by any DOM query. What IS observable, and is
      the more precise thing to assert anyway, is what crossed the bridge: that
      hiding the panel neither killed a pty nor started a second one is exactly
      the Phase 9 contract being overturned, stated in the terms it was written.
    */
    // eslint-disable-next-line no-var
    var ptyCalls = {
      creates: [] as { ptyId: string; sessionId: string }[],
      inputs: [] as { ptyId: string; data: string }[],
      kills: [] as string[],
    };

    (window as unknown as { __mgitOps: unknown }).__mgitOps = opCalls;
    (window as unknown as { __mgitPty: unknown }).__mgitPty = ptyCalls;
    (window as unknown as { __mgitExternalUrls: unknown }).__mgitExternalUrls = externalUrls;
    (window as unknown as { __mgitClipboard: unknown }).__mgitClipboard = clipboardWrites;
  }, fixtures);
}
