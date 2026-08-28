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
  /**
   * Hold every `forge.*` answer this long, in milliseconds.
   *
   * Zero — the default — leaves the bridge exactly as it was: the wrapper is
   * skipped entirely rather than resolving a zero-length timer, so no existing
   * spec changes shape or timing.
   *
   * It exists because a loading state is otherwise unphotographable. Real `gh`
   * calls are subprocesses and the mock answers in the same tick, so the
   * skeletons the Reviews view draws between those two moments never render at
   * all under test — they cannot be screenshotted, and a regression that
   * deleted them would pass every spec. See `reviews-loading-shots.spec.ts`.
   */
  forgeLatencyMs?: number;
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
  /**
   * Repo diagnostics (Phase 18). All three parts are optional because the
   * three states a spec cares about are reached by leaving parts out:
   * no `candidates` is a repo with no recognised linter, no `trust` is one
   * nobody has approved, and no `result` is one that has never been measured —
   * which the footer must render as ABSENT, not as zero problems.
   */
  diagnostics?: {
    candidates?: unknown[];
    trust?: { state: string; command: unknown; trustedAt: number | null };
    result?: unknown;
  };
  graphRows: unknown[];
  statusEntries: unknown[];
  /** Refs the sidebar and the BRANCH / TAG column render. */
  refs?: unknown[];
  /** Configured remotes, as `mgit:remotes:list` returns them (forge pre-derived). */
  remotes?: unknown[];
  /**
   * Overrides merged over the default `status.get` branch — ahead/behind, a
   * missing upstream, a detached HEAD.
   *
   * The sync button is a reading OF these numbers, so a spec that cannot set
   * them can only ever exercise the in-sync case.
   */
  branchStatus?: Record<string, unknown>;
  /**
   * Ops that answer with something other than `{ok:true}`, keyed by op name.
   *
   * A failed pull is a normal outcome the UI is supposed to render (the
   * conflict banner, and now the sync dialog), so it has to be reachable from
   * a fixture. Anything absent still succeeds.
   */
  opResults?: Record<string, unknown>;
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
  /**
   * Line counts per path, for the `+n −n` the Changes panel and the all-changes
   * tab render. Keyed `staged:<path>` / `unstaged:<path>` so a partially staged
   * file can carry a different pair on each side — the case the split exists
   * for. A path with no entry answers zero, exactly as the real handler does.
   */
  statusCounts?: Record<string, { insertions: number; deletions: number }>;
  /** `mgit:forge:*` answers. Absent means a repo with no GitHub remote. */
  forge?: {
    cli?: { reason: 'ready' | 'not-installed' | 'not-authenticated'; hint?: string };
    runs?: unknown[];
    pulls?: unknown[];
    /**
     * Per-scope `gh pr list` answers, for the Reviews groups.
     *
     * A scope with no entry falls back to `pulls`, so every spec written before
     * the groups landed still gets the listing it seeded — and a spec that
     * cares which group a PR shows up in seeds only the scopes it is about.
     *
     * Explicit fixtures rather than a filter over `pulls`, because two of the
     * three scopes are not derivable from a `ForgePull`: `mine` needs to know
     * who the viewer is, and `review-requested` is a fact the listing shape
     * does not carry at all. `gh` resolves both server-side against `@me`.
     */
    pullsByScope?: Partial<Record<'all' | 'mine' | 'review-requested', unknown[]>>;
    issues?: unknown[];
    /**
     * The repository has its issue tracker switched off.
     *
     * Its own fixture field rather than an `error` string, because the two
     * unlock different UI: `disabled` is a calm sentence, `error` is a red
     * card, and a spec that could only reach one of them could not tell them
     * apart. Nothing else in the forge fixture is affected by it.
     */
    issuesDisabled?: boolean;
    /** Job trees, keyed by run id — what expanding a run row reveals. */
    runDetail?: Record<string, { run?: unknown; jobs?: unknown[] }>;
    /**
     * Job logs, keyed by run id.
     *
     * Lines carry the real `job<TAB>step<TAB>timestamp message` prefix, because
     * that prefix is exactly what the Actions view's log model exists to split
     * — a fixture without it would exercise the un-prefixed fallback path and
     * nothing else. `truncated` is the other state worth seeding: it is the one
     * the whole ForgeRunLog shape was designed to make impossible to hide.
     */
    runLogs?: Record<
      string,
      {
        lines: string[];
        truncated?: boolean;
        omittedLines?: number;
        totalBytes?: number;
        /**
         * What `full: true` answers with, when a spec asks for the whole log.
         *
         * A separate payload rather than a flag, because that is what it is:
         * the capped and un-capped fetches are different requests with
         * different keys, and a fixture that returned the same lines for both
         * could not show that the button did anything.
         */
        full?: string[];
      }
    >;
    /** Workflow definitions, for the lazy `.yml` path lookup. */
    workflows?: unknown[];
    /**
     * `gh pr view` answers, keyed by PR number.
     *
     * Its own fixture rather than a widening of `pulls`, because that is what
     * it is in the app: the listing row and the opened detail are two fetches,
     * and a spec that seeded only `pulls` should still exercise the header's
     * "listing first, detail fills in" path.
     */
    pullDetail?: Record<string, Record<string, unknown>>;
    /**
     * `gh pr diff --patch` answers, keyed by PR number — already parsed.
     *
     * `FileDiff[]` rather than a raw patch, because the real handler parses in
     * main and the renderer never sees patch text. A fixture carrying a patch
     * would be exercising a parser this package does not run.
     */
    pullFiles?: Record<
      string,
      { files?: unknown[]; truncated?: boolean; omittedFiles?: number; totalBytes?: number }
    >;
    /** The merged conversation, keyed by PR number, in the order it renders. */
    pullComments?: Record<string, unknown[]>;
    /**
     * Inline review threads, keyed by PR number — `ForgeReviewThread[]`.
     *
     * Already grouped and already parsed, because the real handler parses the
     * GraphQL payload in main and the renderer only ever sees domain objects. A
     * fixture written in GraphQL's own field names (`isResolved`, `diffSide`)
     * would be exercising `gh-graphql.ts`'s parser, which this package does not
     * run — that parser has its own vitest suite against captured output.
     */
    pullThreads?: Record<string, unknown[]>;
    /**
     * What the nine write channels answer with.
     *
     * Its own field rather than reusing `error`, because a *refused write* and a
     * *failed read* unlock different UI and a spec that could only reach one
     * could not tell them apart: a read error paints the tab, a write error
     * paints the line beside the composer that caused it. `undefined` means
     * every write succeeds.
     */
    writeError?: string | null;
    error?: string | null;
  };
  /**
   * `mgit:stats:summary` — everything the dashboard draws.
   *
   * Merged over an all-zero envelope, so a spec sets only the arrays its
   * widgets read. **Absent means a repository with no history**, which is the
   * state every widget's empty case is written against — a freshly cloned repo,
   * not a broken one.
   */
  stats?: {
    calendar?: { date: string; count: number }[];
    contributors?: unknown[];
    activity?: unknown[];
    churn?: unknown;
    health?: Record<string, unknown>;
    truncated?: boolean;
    commitsScanned?: number;
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
   * Directory listings for the Files view and the Agent page's ~/.claude
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
  /**
   * The samples `metrics.onSample` pushes, in order, one per entry.
   *
   * **Omit a metric to reach the "unreadable on this machine" state** — that is
   * the only way to a three-readout cluster, and it is the state the whole
   * optional-fields design exists to make renderable. A sample with `gpu: 0`
   * is a different fixture and must render a fourth readout.
   *
   * `at` is written as an offset in milliseconds from an arbitrary epoch, not
   * a wall-clock time: the store evicts by timestamp, so a spec that wants a
   * cadence change needs to control the spacing, and `Date.now()` inside a
   * fixture cannot.
   *
   * Absent means no samples at all — the pre-Phase-18 footer, which is what
   * every spec written before this one expects.
   */
  metricsSamples?: Array<{
    at: number;
    cpu?: number;
    memory?: number;
    gpu?: number;
    disk?: number;
    memoryBytes?: { used: number; total: number };
    diskBytes?: { used: number; total: number };
    cpuInfo?: { cores: number; load1?: number };
  }>;
  /**
   * Repository tests (Phase 19). `packages` is what `tests.discover` answers
   * with — absent means a repository with no discoverable suites, the state
   * every empty case is written against. `trust` seeds which suite ids start
   * already trusted, keyed `${repoId}:${suiteId}`. `runResult` is what a
   * `tests.run` call resolves its stream with once the fixture's fake process
   * "closes" — a spec drives the run and reads the result off the live stream,
   * exactly as the real bridge does.
   */
  tests?: {
    packages?: unknown[];
    trusted?: string[];
    runResult?: unknown;
  };
};

export async function installMockBridge(page: Page, fixtures: MockFixtures): Promise<void> {
  await page.addInitScript((data: MockFixtures) => {
    /*
      Every method on an api object, held for `forgeLatencyMs` before it
      answers. Applied to the whole `forge` namespace at once rather than to
      the handful of reads a loading spec happens to need, so a call added
      later is slow too without anyone remembering to wrap it.
    */
    const latency = data.forgeLatencyMs ?? 0;
    const slowed = <T extends object>(api: T): T => {
      if (latency <= 0) return api;
      const entries = Object.entries(api as Record<string, unknown>).map(([name, value]) => [
        name,
        typeof value === 'function'
          ? async (...args: unknown[]) => {
              await new Promise((resolve) => setTimeout(resolve, latency));
              return (value as (...rest: unknown[]) => unknown)(...args);
            }
          : value,
      ]);
      return Object.fromEntries(entries) as T;
    };

    const noop = () => undefined;
    const unsubscribe = () => noop;
    const ok = async () => ({ ok: true as const });

    /** relPath helpers for the fs write mocks — mirrors `parentOf`/`joinRelPath` in `use-file-actions.ts`. */
    const parentDirOf = (relPath: string): string => {
      const index = relPath.lastIndexOf('/');
      return index === -1 ? '' : relPath.slice(0, index);
    };
    const baseNameOf = (relPath: string): string => {
      const index = relPath.lastIndexOf('/');
      return index === -1 ? relPath : relPath.slice(index + 1);
    };

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
    const writeError = () => data.forge?.writeError ?? null;
    /** A `ForgeWriteResult`. The seeded error is what a refusal reports. */
    const writeResult = (ok: boolean) => ({ cli: forgeCli(), ok, error: ok ? null : writeError() });
    /**
     * Every write, in order, on the window.
     *
     * The anchor a comment was posted with is invisible in the rendered result —
     * a thread on line 12 looks identical whether it was sent as `line: 12` or
     * as some position that happened to land there. A spec has to be able to
     * read the request itself.
     */
    const recordWrite = (channel: string, request: unknown): void => {
      const store = (window as unknown as { __mgitWrites?: unknown[] });
      store.__mgitWrites = [...(store.__mgitWrites ?? []), { channel, request }];
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
      /*
        `/tmp` so the fixture repo at `/tmp/midnite-git` sits inside "home" and
        the terminal header renders the `~`-collapsed path the specs assert on.
        The real value is `os.homedir()`; what matters here is only that the
        fixture cwd is under it.
      */
      homeDir: '/tmp',
      /*
        A real-looking machine name, not `localhost` — the OSC 7 specs emit
        payloads carrying it, which is the form a configured shell actually
        writes and the form the parser has to accept.
      */
      hostname: 'mock-machine.local',

      repos: {
        open: async () => ({ ok: true, repo }),
        list: async () => [repo],
        close: async () => undefined,
        refs: async () => data.refs ?? [],
        worktrees: async () => allWorktrees,
        worktreeAdd: ok,
        worktreeRemove: ok,
        reorder: noop,
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
            ...data.branchStatus,
          },
          entries:
            (req.worktreePath ? data.statusByWorktree?.[req.worktreePath] : undefined) ??
            data.statusEntries,
          inProgress: null,
        }),
        counts: async (req: { worktreePath?: string }) => {
          const entries = ((req.worktreePath
            ? data.statusByWorktree?.[req.worktreePath]
            : undefined) ?? data.statusEntries) as { path: string }[];
          const side = (prefix: 'staged' | 'unstaged') =>
            entries
              .map((entry) => ({
                path: entry.path,
                ...(data.statusCounts?.[`${prefix}:${entry.path}`] ?? {
                  insertions: 0,
                  deletions: 0,
                }),
              }))
              .filter((row) => row.insertions > 0 || row.deletions > 0);
          return { staged: side('staged'), unstaged: side('unstaged') };
        },
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
      forge: slowed({
        cliStatus: async () => forgeCli(),
        runs: async () => ({ cli: forgeCli(), runs: data.forge?.runs ?? [], error: forgeError() }),
        pulls: async (req: { scope?: 'all' | 'mine' | 'review-requested' }) => ({
          cli: forgeCli(),
          pulls: data.forge?.pullsByScope?.[req.scope ?? 'all'] ?? data.forge?.pulls ?? [],
          error: forgeError(),
        }),
        issues: async () => ({
          cli: forgeCli(),
          issues: data.forge?.issues ?? [],
          disabled: data.forge?.issuesDisabled === true,
          error: forgeError(),
        }),
        runDetail: async (req: { runId: string }) => {
          const seeded = data.forge?.runDetail?.[req.runId];
          if (!seeded) return { cli: forgeCli(), detail: null, error: forgeError() };
          // A run with no seeded `run` half still needs one: the real payload
          // always carries both, and a spec should not have to restate a run
          // it already listed above.
          const listed = (data.forge?.runs ?? []).find(
            (row) => (row as { id?: string }).id === req.runId,
          );
          return {
            cli: forgeCli(),
            detail: { run: seeded.run ?? listed, jobs: seeded.jobs ?? [] },
            error: null,
          };
        },
        runLog: async (req: { runId: string; full?: boolean }) => {
          const seeded = data.forge?.runLogs?.[req.runId];
          // No fixture means a run that has not finished — GitHub serves no log
          // for one, which is a `pending`, not an error.
          if (!seeded) return { cli: forgeCli(), log: null, pending: true, error: null };

          const whole = req.full === true && seeded.full !== undefined;
          return {
            cli: forgeCli(),
            log: {
              lines: whole ? seeded.full : seeded.lines,
              truncated: whole ? false : (seeded.truncated ?? false),
              omittedLines: whole ? 0 : (seeded.omittedLines ?? 0),
              totalBytes: seeded.totalBytes ?? 0,
              complete: whole || seeded.truncated !== true,
            },
            pending: false,
            error: null,
          };
        },
        workflows: async () => ({
          cli: forgeCli(),
          workflows: data.forge?.workflows ?? [],
          error: forgeError(),
        }),
        pullDetail: async (req: { number: number }) => {
          const seeded = data.forge?.pullDetail?.[String(req.number)];
          if (!seeded) return { cli: forgeCli(), detail: null, error: forgeError() };
          // The listing row fills the `pull` half, exactly as the real parser
          // does — a spec should not have to restate a PR it already listed.
          const listed = (data.forge?.pulls ?? []).find(
            (row) => (row as { number?: number }).number === req.number,
          );
          return {
            cli: forgeCli(),
            detail: {
              pull: seeded['pull'] ?? listed,
              body: seeded['body'] ?? '',
              headSha: seeded['headSha'] ?? null,
              baseBranch: seeded['baseBranch'] ?? '',
              additions: seeded['additions'] ?? 0,
              deletions: seeded['deletions'] ?? 0,
              changedFiles: seeded['changedFiles'] ?? 0,
              createdAt: seeded['createdAt'] ?? null,
              updatedAt: seeded['updatedAt'] ?? null,
              mergeable: seeded['mergeable'] ?? null,
              // Phase 20 F's blast radius, and G's reviewer suggestions.
              commitCount: seeded['commitCount'] ?? 0,
              commits: seeded['commits'] ?? [],
              reviewRequests: seeded['reviewRequests'] ?? [],
            },
            error: null,
          };
        },
        pullFiles: async (req: { number: number }) => {
          const seeded = data.forge?.pullFiles?.[String(req.number)];
          // No fixture is "no diff to show", not an empty one: `files: []`
          // would render "this pull request changes no files" as a fact.
          if (!seeded) return { cli: forgeCli(), files: null, error: forgeError() };
          return {
            cli: forgeCli(),
            files: {
              files: seeded.files ?? [],
              truncated: seeded.truncated ?? false,
              omittedFiles: seeded.omittedFiles ?? 0,
              totalBytes: seeded.totalBytes ?? 0,
            },
            error: null,
          };
        },
        pullComments: async (req: { number: number }) => ({
          cli: forgeCli(),
          comments: data.forge?.pullComments?.[String(req.number)] ?? [],
          error: forgeError(),
        }),
        pullThreads: async (req: { number: number }) => ({
          cli: forgeCli(),
          threads: data.forge?.pullThreads?.[String(req.number)] ?? [],
          error: forgeError(),
        }),

        /*
          The writes.

          They mutate `data.forge.pullThreads` in the page's own copy of the
          fixture, so a spec can post a comment and then assert it renders — a
          write that answered `ok: true` and changed nothing would let a broken
          invalidation pass. That is the whole point of modelling them as state
          rather than as a stub: `queries.ts` invalidates the thread key on
          success, and the refetch has to come back different.

          Every call is also recorded on `window.__mgitWrites` so a spec can
          assert the *anchor* — that a comment on line 12 was sent as line 12,
          with the head sha and a position — which no amount of re-reading the
          list can show.
        */
        reviewComment: async (req: Record<string, unknown>) => {
          recordWrite('reviewComment', req);
          if (writeError() !== null) return writeResult(false);
          const key = String(req['number']);
          const threads = (data.forge?.pullThreads?.[key] ?? []) as Record<string, unknown>[];
          threads.push({
            id: `PRRT_new_${String(threads.length + 1)}`,
            path: req['path'],
            line: req['line'],
            originalLine: req['line'],
            startLine: null,
            side: 'RIGHT',
            resolved: false,
            outdated: false,
            fileLevel: false,
            comments: [
              {
                id: `PRRC_new_${String(threads.length + 1)}`,
                databaseId: String(9000 + threads.length),
                author: 'you',
                body: req['body'],
                createdAt: '2026-08-27T12:00:00Z',
                url: '',
              },
            ],
          });
          if (data.forge) data.forge.pullThreads = { ...data.forge.pullThreads, [key]: threads };
          return writeResult(true);
        },
        reviewReply: async (req: Record<string, unknown>) => {
          recordWrite('reviewReply', req);
          if (writeError() !== null) return writeResult(false);
          const key = String(req['number']);
          const threads = (data.forge?.pullThreads?.[key] ?? []) as Record<string, unknown>[];
          for (const thread of threads) {
            const comments = (thread['comments'] ?? []) as Record<string, unknown>[];
            // The reply goes into whichever thread owns the target comment —
            // the same lookup the real endpoint does by `comment_id`.
            if (!comments.some((c) => c['databaseId'] === req['commentId'])) continue;
            comments.push({
              id: `PRRC_reply_${String(comments.length + 1)}`,
              databaseId: String(9500 + comments.length),
              author: 'you',
              body: req['body'],
              createdAt: '2026-08-27T12:05:00Z',
              url: '',
            });
            thread['comments'] = comments;
            break;
          }
          if (data.forge) data.forge.pullThreads = { ...data.forge.pullThreads, [key]: threads };
          return writeResult(true);
        },
        resolveThread: async (req: Record<string, unknown>) => {
          recordWrite('resolveThread', req);
          if (writeError() !== null) return writeResult(false);
          // Not repo-scoped in the request — a node id identifies the thread
          // globally — so every seeded PR is searched, exactly as GraphQL does.
          for (const threads of Object.values(data.forge?.pullThreads ?? {})) {
            for (const thread of threads as Record<string, unknown>[]) {
              if (thread['id'] === req['threadId']) thread['resolved'] = req['resolved'];
            }
          }
          return writeResult(true);
        },
        /*
          Themes F and G — the verdict, the merge and the nudges.

          Deliberately thinner than Theme E's three above: those mutate the
          seeded thread list so the UI updates the way a real write would, while
          these change state the fixture does not model (a PR's reviewDecision, a
          merge, a workflow attempt). What a spec can assert is the RECORDED
          REQUEST — that the app sent the verb the user chose, with the body they
          typed — plus how the UI behaves on refusal. Both are what these serve.
        */
        pullReview: async (req: Record<string, unknown>) => {
          recordWrite('pullReview', req);
          return writeResult(writeError() === null);
        },
        pullComment: async (req: Record<string, unknown>) => {
          recordWrite('pullComment', req);
          return writeResult(writeError() === null);
        },
        pullMerge: async (req: Record<string, unknown>) => {
          recordWrite('pullMerge', req);
          return writeResult(writeError() === null);
        },
        pullRequestReview: async (req: Record<string, unknown>) => {
          recordWrite('pullRequestReview', req);
          return writeResult(writeError() === null);
        },
        pullReady: async (req: Record<string, unknown>) => {
          recordWrite('pullReady', req);
          return writeResult(writeError() === null);
        },
        runRerun: async (req: Record<string, unknown>) => {
          recordWrite('runRerun', req);
          return writeResult(writeError() === null);
        },
      }),
      /*
        One payload, echoing back the window it was asked for.

        Echoed rather than fixed because the window is part of the query key:
        a spec that changes the toolbar's window and sees the same object back
        would not be able to tell a refetch from a cache hit.
      */
      stats: {
        summary: async (req: { repoId: string; window: string }) => ({
          repoId: req.repoId,
          window: req.window,
          generatedAt: 0,
          truncated: data.stats?.truncated ?? false,
          commitsScanned: data.stats?.commitsScanned ?? data.stats?.activity?.length ?? 0,
          calendar: data.stats?.calendar ?? [],
          contributors: data.stats?.contributors ?? [],
          activity: data.stats?.activity ?? [],
          churn: data.stats?.churn ?? null,
          health: {
            localBranches: 0,
            remoteBranches: 0,
            tags: 0,
            staleByAge: 0,
            mergedBranches: 0,
            oldestUnmergedAt: null,
            sizeBytes: null,
            looseObjects: null,
            ...(data.stats?.health ?? {}),
          },
        }),
      },
      shell: {
        openExternal: async (req: { url: string }) => {
          externalUrls.push(req.url);
          return { ok: true as const };
        },
        showItemInFolder: async (req: { relPath: string }) => {
          revealedPaths.push(req.relPath);
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
        Every op resolves to `{ok:true}` unless `opResults` says otherwise — but
        records itself first, either way.

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
            return data.opResults?.[String(name)] ?? { ok: true as const };
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
        create: async (req: { sessionId: string; agentId?: string; initialInput?: string }) => {
          const ptyId = `pty-${++ptyCount}`;
          ptySessions[ptyId] = req.sessionId;
          // `initialInput` is recorded, not just fed: it is the only place a
          // spec can read what the app decided to type into a fresh session,
          // and xterm's canvas cannot be queried for it afterwards.
          ptyCalls.creates.push({
            ptyId,
            sessionId: req.sessionId,
            ...(req.agentId === undefined ? {} : { agentId: req.agentId }),
            ...(req.initialInput === undefined ? {} : { initialInput: req.initialInput }),
          });
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
        onAgentChanged: (handler: (e: { ptyId: string; agentId: string | null }) => void) => {
          agentHandlers.push(handler);
          return () => {
            agentHandlers.splice(agentHandlers.indexOf(handler), 1);
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
        // Recorded, not dropped: "the wandered-into path is never persisted"
        // is only assertable against what the app actually tried to save.
        save: (req: { session: { id: string; cwd: string } }) => {
          terminalSaves.push(req.session);
        },
        forget: noop,
        reorder: noop,
      },
      agent: {
        /*
          The real roster, plus a probe result that mirrors the machine this
          phase was written on: three agents present, OpenClaude missing. The
          harness needs a MISSING one to have anything to assert about the `+`
          menu's disabled row — a roster where everything is installed exercises
          exactly one of the menu builder's four cases.
        */
        list: async () => ({
          agents: [
            {
              id: 'claude',
              label: 'Claude',
              command: 'claude',
              args: [],
              accent: '#D97757',
              install: 'npm i -g @anthropic-ai/claude-code',
            },
            {
              id: 'agy',
              label: 'Antigravity',
              command: 'agy',
              args: [],
              accent: '#4285F4',
              icon: 'antigravity',
              install: 'See antigravity.google/docs/cli for the Antigravity CLI',
            },
            {
              id: 'codex',
              label: 'Codex',
              command: 'codex',
              args: [],
              accent: '#10A37F',
              install: 'npm i -g @openai/codex',
            },
            {
              id: 'openclaude',
              label: 'OpenClaude',
              command: 'openclaude',
              args: [],
              accent: '#8B5CF6',
              install: 'npm i -g @gitlawb/openclaude',
            },
          ],
          status: [
            { id: 'claude', installed: true, resolvedPath: '/Users/e2e/.local/bin/claude' },
            { id: 'agy', installed: true, resolvedPath: '/Users/e2e/.local/bin/agy' },
            { id: 'codex', installed: true, resolvedPath: '/opt/homebrew/bin/codex' },
            { id: 'openclaude', installed: false, resolvedPath: null },
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
          // A fresh copy, not the live array: Theme C's create/rename/delete
          // mutate `data.fsDirs` in place, and react-query's structural
          // sharing treats a same-reference array as "unchanged data" and
          // skips notifying subscribers — so a stale write silently never
          // repaints unless every read hands out a new identity.
          return entries
            ? { ok: true, entries: entries.slice() }
            : { ok: false, message: 'no fixture for ' + key };
        },
        readFile: async (req: { scope: string; relPath: string }) => {
          const key = `${req.scope === 'repo' ? 'repo' : 'claude'}:${req.relPath}`;
          return data.fsFiles?.[key] ?? { kind: 'error', message: 'no fixture for ' + key };
        },
        /*
          The four writes below mutate `data.fsDirs`/`data.fsFiles` in place
          rather than returning a fixed `{ok:true}` — per the Phase 20 rule
          ("mocked writes must mutate seeded state"), a create/rename/delete
          spec re-queries the same `fsDirs` fixture the tree already reads, so
          a write that changed nothing is a write a spec can actually catch.
        */
        create: async (req: { relPath: string; kind: 'file' | 'directory' }) => {
          const parent = parentDirOf(req.relPath);
          const name = baseNameOf(req.relPath);
          const dir = data.fsDirs?.[`repo:${parent}`];
          if (!dir) return { ok: false, message: 'no fixture for repo:' + parent };
          if (dir.some((entry) => entry.name === name)) {
            return { ok: false, message: 'already exists' };
          }
          dir.push({ name, kind: req.kind === 'directory' ? 'dir' : 'file', size: 0, isIgnored: false });
          if (req.kind === 'directory') {
            data.fsDirs![`repo:${req.relPath}`] = [];
          } else {
            data.fsFiles = data.fsFiles ?? {};
            data.fsFiles[`repo:${req.relPath}`] = { kind: 'text', content: '', size: 0 };
          }
          return { ok: true as const };
        },
        rename: async (req: { fromRelPath: string; toRelPath: string }) => {
          const fromDir = data.fsDirs?.[`repo:${parentDirOf(req.fromRelPath)}`];
          const toDir = data.fsDirs?.[`repo:${parentDirOf(req.toRelPath)}`];
          if (!fromDir || !toDir) return { ok: false, message: 'no fixture' };
          const fromName = baseNameOf(req.fromRelPath);
          const index = fromDir.findIndex((entry) => entry.name === fromName);
          if (index === -1) return { ok: false, message: 'not found' };
          const toName = baseNameOf(req.toRelPath);
          if (toDir.some((entry) => entry.name === toName)) {
            return { ok: false, message: 'destination already exists' };
          }
          const [entry] = fromDir.splice(index, 1);
          toDir.push({ ...entry, name: toName });
          return { ok: true as const };
        },
        delete: async (req: { relPath: string }) => {
          const dir = data.fsDirs?.[`repo:${parentDirOf(req.relPath)}`];
          if (!dir) return { ok: false, message: 'no fixture' };
          const name = baseNameOf(req.relPath);
          const index = dir.findIndex((entry) => entry.name === name);
          if (index === -1) return { ok: false, message: 'not found' };
          dir.splice(index, 1);
          return { ok: true as const };
        },
        dirStats: async (req: { relPath: string }) => {
          let fileCount = 0;
          let totalBytes = 0;
          const queue = [req.relPath];
          while (queue.length > 0) {
            const current = queue.shift()!;
            const entries = data.fsDirs?.[`repo:${current}`] ?? [];
            for (const entry of entries) {
              if (entry.kind === 'dir') {
                queue.push(current.length > 0 ? `${current}/${entry.name}` : entry.name);
              } else {
                fileCount += 1;
                totalBytes += entry.size;
              }
            }
          }
          return { ok: true as const, fileCount, totalBytes, truncated: false };
        },
      },
      /*
        The diagnostics group.

        Deliberately stateful across calls rather than a pair of constants:
        the trust flow is a sequence — detect, approve, run — and each step's
        answer depends on the last. A mock that returned a fixed `trusted`
        status could never exercise the case the whole feature turns on, which
        is what the footer shows BEFORE anyone has approved anything.

        `run` refuses while untrusted, exactly as the handler does. A mock that
        happily linted for an untrusted repo would let a spec pass against
        behaviour main does not have.
      */
      diag: {
        trustStatus: async () => diagTrust,
        detect: async () => ({ candidates: data.diagnostics?.candidates ?? DEFAULT_CANDIDATES }),
        trust: async (req: { command: unknown }) => {
          diagTrust = {
            state: 'trusted',
            command: req.command,
            trustedAt: 1_700_000_000_000,
          };
          return diagTrust;
        },
        untrust: async () => {
          // The command survives revocation, as in the real store.
          diagTrust = { state: 'untrusted', command: diagTrust.command, trustedAt: null };
          return diagTrust;
        },
        run: async () => {
          // Counted, so a spec can prove the linter ran ONCE for a trusted
          // repo rather than once per render — the assertion that matters most
          // about a call that spawns a process.
          diagRuns += 1;
          if (diagTrust.state !== 'trusted') {
            return {
              ok: false,
              reason: 'untrusted',
              hint: 'Diagnostics are not enabled for this repository.',
            };
          }
          return (
            data.diagnostics?.result ?? {
              ok: true,
              errorCount: 0,
              warningCount: 0,
              rows: [],
              withheld: 0,
              ranAt: 1_700_000_000_000,
              durationMs: 12,
            }
          );
        },
      },
      /*
        A live stream, not an inert one.

        `watch.onEvent` and `menu.onCommand` above return a no-op unsubscribe
        and never push anything, which is fine for channels no spec drives. It
        would be quietly fatal here: an inert metrics stream renders an EMPTY
        flyout in every spec, and the assertions would pass while testing
        nothing at all. So this keeps a real handler array with a real splice
        teardown — the StrictMode double-mount the contract's `Unsubscribe`
        exists for is only observable if the teardown actually removes one.

        Samples go out asynchronously, as `log.start` does, so the renderer's
        subscribe-then-receive ordering stays on its normal path.
      */
      /*
        A live stream, like `metrics` — for the same reason: an inert
        `onOutput`/`onResult` would let every spec pass against a Tests view
        that never actually receives a run's output.
      */
      tests: {
        discover: async (req: { repoId: string }) => ({
          repoId: req.repoId,
          packages: data.tests?.packages ?? [],
          generatedAt: 1_700_000_000_000,
        }),
        trustStatus: async (req: { repoId: string; suiteId: string }) =>
          testsTrustedSet.has(`${req.repoId}:${req.suiteId}`)
            ? { state: 'trusted', trustedAt: 1_700_000_000_000 }
            : { state: 'untrusted', trustedAt: null },
        trust: async (req: { repoId: string; suiteId: string }) => {
          testsTrustedSet.add(`${req.repoId}:${req.suiteId}`);
          return { state: 'trusted', trustedAt: 1_700_000_000_000 };
        },
        untrust: async (req: { repoId: string; suiteId: string }) => {
          testsTrustedSet.delete(`${req.repoId}:${req.suiteId}`);
          return { state: 'untrusted', trustedAt: null };
        },
        run: async (req: { repoId: string; suiteId: string }) => {
          if (!testsTrustedSet.has(`${req.repoId}:${req.suiteId}`)) {
            return { ok: false, reason: 'untrusted' };
          }
          testsRunCounter += 1;
          const runId = `run-${testsRunCounter}`;
          setTimeout(() => {
            const chunk = 'running…\n';
            for (const handler of testsOutputHandlers) handler({ runId, chunk });
            const result = data.tests?.runResult ?? {
              ok: true,
              structured: true,
              exitCode: 0,
              passed: 1,
              failed: 0,
              skipped: 0,
              failures: [],
              output: chunk,
              truncated: false,
              ranAt: 1_700_000_000_000,
              durationMs: 5,
            };
            for (const handler of testsResultHandlers) {
              handler({ runId, suiteId: req.suiteId, result });
            }
          }, 0);
          return { ok: true, runId };
        },
        cancel: noop,
        onOutput: (handler: (e: unknown) => void) => {
          testsOutputHandlers.push(handler);
          return () => testsOutputHandlers.splice(testsOutputHandlers.indexOf(handler), 1);
        },
        onResult: (handler: (e: unknown) => void) => {
          testsResultHandlers.push(handler);
          return () => testsResultHandlers.splice(testsResultHandlers.indexOf(handler), 1);
        },
      },
      metrics: {
        start: (req: { intervalMs: number; freshDisk?: boolean }) => {
          metricsCalls.push(req);
          // Only the FIRST start emits the backlog. `start` is re-sent on
          // every cadence change, and replaying the fixture each time would
          // pile duplicate points into the store — which would then look like
          // a chart that grows every time the flyout is opened.
          if (metricsEmitted) return;
          metricsEmitted = true;
          setTimeout(() => {
            for (const sample of data.metricsSamples ?? []) {
              for (const handler of metricsHandlers) handler(sample);
            }
          }, 0);
        },
        stop: () => {
          metricsCalls.push({ intervalMs: 0, stopped: true });
        },
        onSample: (handler: (sample: unknown) => void) => {
          metricsHandlers.push(handler);
          return () => metricsHandlers.splice(metricsHandlers.indexOf(handler), 1);
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
        reload: noop,
      },
      windowChrome: {
        platform: 'darwin',
        /*
          `true`, matching what actually ships on macOS.

          This was `false`, and the mismatch had a visible cost nobody had
          noticed: `AppFrame` only sets `--titlebar-h` when it is drawing the
          window chrome itself, and `app.tsx`'s content box is sized
          `calc(100vh - var(--titlebar-h, 0px))`. With a NON-frameless window
          the shell renders a title bar in normal flow *and* leaves the
          variable unset, so the box claims the full viewport height starting
          40px down — and every spec ran against an app whose footer sat
          entirely below the fold.

          Nothing failed, because `toBeVisible()` asks for a non-empty box
          rather than one inside the viewport. It only surfaced when a spec
          tried to CLICK something down there.
        */
        frameless: true,
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
    /** `shell.showItemInFolder` calls (Phase 24 Theme C), recorded like `externalUrls`. */
    // eslint-disable-next-line no-var
    var revealedPaths: string[] = [];
    // eslint-disable-next-line no-var
    var metricsHandlers: Array<(sample: unknown) => void> = [];
    /** Every start/stop, so a spec can assert the cadence actually escalated. */
    // eslint-disable-next-line no-var
    var metricsCalls: Array<{ intervalMs: number; freshDisk?: boolean; stopped?: boolean }> = [];
    // eslint-disable-next-line no-var
    var metricsEmitted = false;

    // --- tests ---------------------------------------------------------------
    // eslint-disable-next-line no-var
    var testsOutputHandlers: Array<(e: unknown) => void> = [];
    // eslint-disable-next-line no-var
    var testsResultHandlers: Array<(e: unknown) => void> = [];
    /**
     * `${repoId}:${suiteId}` — seeded from the fixture, mutated by
     * trust/untrust. Always qualified with the fixture's fixed `repo-1`: a
     * suite id already contains `::` (`package::name`), so there is no bare
     * form to distinguish from a qualified one.
     */
    // eslint-disable-next-line no-var
    var testsTrustedSet = new Set<string>((data.tests?.trusted ?? []).map((id) => `repo-1:${id}`));
    // eslint-disable-next-line no-var
    var testsRunCounter = 0;

    // --- diagnostics -------------------------------------------------------
    /** Counted, so a spec can prove the linter ran once and not once per render. */
    // eslint-disable-next-line no-var
    var diagRuns = 0;
    /**
     * What `detect` proposes when a fixture does not say — a repo whose
     * ecosystem the detector registry recognises. A fixture wanting the
     * no-linter case passes `candidates: []`.
     */
    // eslint-disable-next-line no-var
    var DEFAULT_CANDIDATES = [
      {
        parser: 'eslint' as const,
        ecosystem: 'javascript' as const,
        detectorId: 'eslint-local',
        label: 'ESLint',
        command: 'node_modules/.bin/eslint',
        args: ['.', '--format', 'json'],
        evidence: ['eslint.config.mjs', 'node_modules/.bin/eslint'],
      },
    ];
    // eslint-disable-next-line no-var
    var clipboardWrites: string[] = [];
    /**
     * The trust grant, mutated by `trust`/`untrust` so the sequence a spec
     * drives is the sequence the real store would go through.
     */
    // eslint-disable-next-line no-var
    var diagTrust: { state: string; command: unknown; trustedAt: number | null } =
      data.diagnostics?.trust ?? { state: 'no-command', command: null, trustedAt: null };

    // --- the fake pty ------------------------------------------------------
    // eslint-disable-next-line no-var
    var dataHandlers: Array<(e: { ptyId: string; data: Uint8Array }) => void> = [];
    // eslint-disable-next-line no-var
    var exitHandlers: Array<(e: { ptyId: string; exitCode: number }) => void> = [];
    /*
      The live-agent probe's channel. There is no fake `ps` behind it: main's
      matcher is unit-tested against captured process listings, and what a spec
      needs here is the *renderer* half — that an event arriving on this channel
      swaps the right session's mark, and that a `null` is a different thing from
      never having heard.
    */
    // eslint-disable-next-line no-var
    var agentHandlers: Array<(e: { ptyId: string; agentId: string | null }) => void> = [];
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
    /*
      Every `TerminalSession` the app asked to persist, in order. Hoisted like
      `ptyCalls` because `terminal.save` is defined above this point.
    */
    // eslint-disable-next-line no-var
    var terminalSaves = [] as { id: string; cwd: string }[];
    // eslint-disable-next-line no-var
    var ptyCalls = {
      creates: [] as { ptyId: string; sessionId: string }[],
      inputs: [] as { ptyId: string; data: string }[],
      kills: [] as string[],
    };

    (window as unknown as { __mgitOps: unknown }).__mgitOps = opCalls;
    (window as unknown as { __mgitPty: unknown }).__mgitPty = ptyCalls;
    /*
      A spec's way to make the fake shell say something arbitrary — an escape
      sequence the app is supposed to react to, rather than a command the mock
      knows how to answer. OSC 7 is the first user: the only honest test of the
      handler is a real sequence arriving on `pty:data` and being parsed by the
      xterm the app actually built.
    */
    (window as unknown as { __mgitPtyWrite: unknown }).__mgitPtyWrite = (
      ptyId: string,
      data: string,
    ): boolean => {
      // Reports whether the pty existed. `write` no-ops on an unknown id, so a
      // spec whose pty numbering shifted would otherwise assert against a
      // sequence that was never delivered — and pass for the wrong reason.
      if (!(ptyId in ptySessions)) return false;
      write(ptyId, data);
      return true;
    };
    /*
      A spec's way to say "main's probe just noticed this". Reports whether the
      pty existed, for the same reason `__mgitPtyWrite` does: a spec whose pty
      numbering shifted would otherwise assert against an event that was never
      delivered and pass for the wrong reason.
    */
    (window as unknown as { __mgitPtyAgent: unknown }).__mgitPtyAgent = (
      ptyId: string,
      agentId: string | null,
    ): boolean => {
      if (!(ptyId in ptySessions)) return false;
      for (const handler of agentHandlers) handler({ ptyId, agentId });
      return true;
    };
    (window as unknown as { __mgitTerminalSaves: unknown }).__mgitTerminalSaves = terminalSaves;
    (window as unknown as { __mgitExternalUrls: unknown }).__mgitExternalUrls = externalUrls;
    (window as unknown as { __mgitRevealedPaths: unknown }).__mgitRevealedPaths = revealedPaths;
    (window as unknown as { __mgitClipboard: unknown }).__mgitClipboard = clipboardWrites;
    (window as unknown as { __mgitMetrics: unknown }).__mgitMetrics = metricsCalls;
    (window as unknown as { __mgitDiagRuns: unknown }).__mgitDiagRuns = () => diagRuns;
    /*
      A hook for the scripted cadence change.

      The dashed gridline only appears once the sampling interval has actually
      changed mid-series, which no fixture written up front can produce: the
      store needs points that arrived BEFORE and AFTER the change. So the spec
      pushes the second half itself, at the wider spacing, through the same
      handler array the real stream uses.
    */
    (window as unknown as { __mgitPushMetric: unknown }).__mgitPushMetric = (sample: unknown) => {
      for (const handler of metricsHandlers) handler(sample);
    };
  }, fixtures);
}
