import { expect, type Page } from '@playwright/test';

/**
 * A stand-in for the preload bridge, installed before any app code runs.
 *
 * The renderer reaches the main process *only* through `window.midniteStudio`, so
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
  /**
   * Keyed by `${sha}:${path}` for commit diffs, `wt:${path}` for worktree ones,
   * and `stash:${selector}:${part}:${path}` for a stash part (Phase 22 Theme D)
   * — each also answers a `:${context}`-suffixed key first, same as commit
   * diffs, so a spec can assert a context expansion actually refetches.
   */
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
  /**
   * `status.get`'s `inProgress` — `null` (the default) is every ordinary spec;
   * set to drive `ConflictBanner`, which renders nothing at all otherwise.
   */
  inProgress?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null;
  /**
   * A conflicted path's parsed regions (Phase 47 Theme D), keyed by path —
   * the hunks half of what `status.conflictRegions` answers. A path with no
   * entry parses to zero regions, same as the real handler on an unmerged
   * path it can't read. `truncated` is always `false` unless the path is
   * also named in `conflictRegionsTruncated`.
   */
  conflictRegions?: Record<string, unknown[]>;
  /** Paths whose `conflictRegions` answer should report `truncated: true` — the "file too large" banner. */
  conflictRegionsTruncated?: Record<string, boolean>;
  /** Refs the sidebar and the BRANCH / TAG column render. */
  refs?: unknown[];
  /** What `stash.list` answers — the sidebar's Stashes section (Phase 22 Theme B). */
  stashes?: unknown[];
  /** What `stash.detail` answers, keyed by selector — the stash inspector (Phase 22 Theme D). */
  stashDetails?: Record<string, unknown>;
  /** What `reflog.list` answers for HEAD — the History view's Reflog tab (Phase 22 Theme G). */
  reflog?: unknown[];
  /** Per-ref override for `reflog.list`, keyed exactly as the request's `ref` arrives — proves the ref selector actually re-requests rather than re-filtering one fixed list. */
  reflogByRef?: Record<string, unknown[]>;
  /** Configured remotes, as `mstudio:remotes:list` returns them (forge pre-derived). */
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
  /** `mstudio:forge:*` answers. Absent means a repo with no GitHub remote. */
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
   * `mstudio:forge-project:*` answers (Phase 40 Theme G).
   *
   * Its own top-level fixture rather than a `forge.*` extension, matching the
   * bridge's own `forgeProject` namespace split — ProjectV2 is a distinct
   * `gh` surface with its own read/write shapes (see `forge-project.ts`).
   */
  forgeProject?: {
    /** `ForgeProject[]` — the boards `forgeProject.list` answers with. */
    projects?: unknown[];
    /** One board's field definitions, keyed by project id. */
    fields?: Record<string, unknown[]>;
    /**
     * One board's items, keyed by project id — always answered as a single
     * page (`nextCursor: null`), since pagination itself is `queries.ts`'s
     * own concern and already unit-tested there.
     */
    items?: Record<string, unknown[]>;
    /**
     * `ForgeProjectReadKind` for `list`/`items` — `'insufficient-scope'`
     * reaches the exact state the phase doc names: `gh` installed and
     * authenticated, but missing the `project` OAuth scope.
     */
    readKind?: 'ok' | 'insufficient-scope' | 'error';
    error?: string | null;
    /**
     * What `setField`/`addItem` answer with. Absent means every write
     * succeeds — matching `forge.writeError`'s own default — and a
     * successful `setField` mutates the seeded item's `fieldValues` in
     * place, so a spec can prove the edit actually persisted rather than
     * merely that the call was accepted.
     */
    writeResult?:
      | { ok: true }
      | { ok: false; kind: 'insufficient-scope'; hint?: string }
      | { ok: false; kind: 'error'; message: string };
  };
  /**
   * `mstudio:stats:summary` — everything the dashboard draws.
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
    timeline?: { sha: string; at: number; additions: number | null; deletions: number | null }[];
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
  terminalSessions?: {
    session: Record<string, unknown>;
    scrollback?: string;
    /**
     * A pty that survived a reload — Theme B's rebind path. Absent/undefined
     * means dead, same as `null`; a spec that wants a live row supplies the
     * shape `hydrate()` binds against.
     */
    live?: { ptyId: string; pid: number; cols: number; rows: number } | null;
    /** Whether this session belongs to a legacy broker protocol version. */
    legacy?: boolean;
  }[];
  /**
   * Directory listings for the Files view and the Agent page's ~/.claude
   * tree, keyed `repo:<relPath>` / `claude:<relPath>` ('' is the root).
   */
  fsDirs?: Record<
    string,
    Array<{ name: string; kind: 'file' | 'dir' | 'symlink'; size: number; isIgnored: boolean }>
  >;
  /**
   * File reads for the preview pane, keyed the same way. `version` defaults
   * to `{ mtimeMs: 1, size: content.length }` when omitted — only the
   * Phase 24 D editor spec, which drives a real write/stale-write round
   * trip, needs to seed one explicitly.
   */
  fsFiles?: Record<
    string,
    | { kind: 'text'; content: string; size: number; version?: { mtimeMs: number; size: number } }
    | { kind: 'binary' | 'too-large'; size: number }
    | { kind: 'error'; message: string }
  >;
  /**
   * `fs.search` results (Phase 24 Theme E), one fixed answer per spec — the
   * mock does not actually run `git grep` over `fsFiles`' fixture text, since
   * a spec's search query is fully under its own control anyway.
   */
  fsSearchResult?:
    | { ok: true; matches: { path: string; line: number; text: string }[]; truncated: boolean }
    | { ok: false; message: string };
  /**
   * `fs.listFiles` results (Phase 23 Theme G). If omitted, defaults to extracting file keys from `fsFiles` or empty.
   */
  fsListFilesResult?:
    | { ok: true; files: string[]; truncated: boolean }
    | { ok: false; message: string };
  /** The onboarding kit's `scaffold.plan` answer (Phase 49). Defaults to an
   *  empty, already-up-to-date plan when omitted. */
  scaffoldPlanResult?:
    | {
        ok: true;
        value: {
          targetRoot: string;
          templateVersion: string;
          entries: { path: string; status: string; bytes: number }[];
        };
      }
    | { ok: false; kind: 'error'; message: string };
  /** The onboarding kit's `scaffold.apply` answer (Phase 49). */
  scaffoldApplyResult?:
    | { ok: true; value: { written: string[]; skipped: { path: string; reason: string }[] } }
    | { ok: false; kind: 'error'; message: string };
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
  /**
   * Search fixtures (Phase 25).
   */
  search?: {
    commits?: unknown[];
    contentHits?: unknown[];
    error?: string;
  };
  /**
   * Blame fixtures (Phase 25), keyed by `${relPath}` or `${rev}:${relPath}`.
   */
  blame?: Record<string, unknown>;
  /**
   * Leave the profile untouched, so the app boots into onboarding.
   *
   * Every other spec is seeded as already-onboarded — see `installMockBridge`.
   */
  firstRun?: boolean;
  /**
   * Seeds the workflows domain's initial roster (Phase 43), read once into
   * the mock's own mutable array the way `terminalSessions` is. Named
   * `appWorkflows` rather than `workflows` — that name is already taken by
   * `forge.workflows`, the unrelated GitHub Actions `.yml` listing.
   */
  appWorkflows?: Array<{ id: string; [key: string]: unknown }>;
};


export async function installMockBridge(page: Page, fixtures: MockFixtures): Promise<void> {
  /*
    The packaged app ships macOS-only (`electron-builder.yml`: `mac` only,
    `moon run desktop:dist` produces an arm64 dmg/zip and nothing else) — so
    `chord.ts`'s `isMac()` is always true in the real product, and
    `terminal.toggle`'s chord is deliberately `Ctrl+\`` (never `Mod+\``) *because*
    of that: it is meant to mean "the physical Control key, on the platform
    this app only runs on." Playwright's Chromium reports whatever OS is
    actually running it, though, so `navigator.platform` reads `'Linux'` on
    the CI runner — and `chordFromEvent`'s own non-mac branch treats a bare
    Ctrl press AS `Mod` there (correct for a hypothetical Linux build, where
    Ctrl really is Mod), which `Control+\`` in `page.keyboard.press` then
    resolves to `Mod+\``, never matching the `Ctrl+\`` binding. That silent
    mismatch — not `@xterm/addon-webgl` — is what actually kept the terminal
    panel from ever opening on CI: every affected spec's own `open()` presses
    `Control+\``, and the page snapshot on failure shows "Toggle Terminal"
    never reaching `[pressed]`. Pinning `navigator.platform` here makes every
    e2e spec see the one platform this app is ever real on, which is what the
    suite is meant to simulate in the first place.
  */
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel', configurable: true });
  });

  /*
    Seed the app as already-onboarded, unless a spec asks for a first run.

    Both onboarding surfaces — `FirstRunModal` (gated on the persisted
    `onboardedAt`) and `OnboardingModal` (gated on `showOnboarding`) — are
    full-screen `fixed inset-0` overlays. A fresh profile is what every spec
    gets, so without this every click in the suite lands on a welcome modal
    instead of the app, and the failure reads as "the element is there but
    something intercepts pointer events" rather than as onboarding.

    Written straight into the persist key rather than driven through the UI:
    dismissing two modals at the top of fifty specs is fifty chances to forget,
    and onboarding is not what any of them is testing. The spec that does test
    it passes `firstRun: true` and gets the untouched fresh profile.

    Merged into whatever is already stored rather than replacing it, because an
    init script runs again on every navigation: overwriting the key wholesale
    would wipe the persisted UI state on `page.reload()`, and "survives a
    reload" is what a dozen specs assert. `version` is stamped only when there
    is nothing to merge into, so a fresh profile skips the store's `migrate`
    rather than being walked through five upgrades it never needed.
  */
  if (!fixtures.firstRun) {
    await page.addInitScript(() => {
      try {
        const stored = localStorage.getItem('midnite-studio.ui');
        const persisted = stored ? JSON.parse(stored) : { version: 6 };
        persisted.state = {
          selectedRepoId: 'repo-1',
          selectedWorktreePath: '/tmp/midnite-studio',
          ...persisted.state,
          onboardedAt: '2026-01-01T00:00:00.000Z',
          showOnboarding: false,
        };
        localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
      } catch {
        /* A profile this test cannot parse is one the app will discard too. */
      }
    });
  }

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
      id: 'repo-1:/tmp/midnite-studio',
      repoId: 'repo-1',
      path: '/tmp/midnite-studio',
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
      name: 'midnite-studio',
      path: '/tmp/midnite-studio',
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
      const store = (window as unknown as { __mstudioWrites?: unknown[] });
      store.__mstudioWrites = [...(store.__mstudioWrites ?? []), { channel, request }];
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

    /*
      Phase 32: a fake WebContentsView engine. No real page ever loads under
      Playwright's own Chromium — the renderer here is what's under test, not
      an embedded one — so `create` just records the tab existed and answers
      `ok: true`; nav state and chrome events stay whatever the store already
      holds unless a spec pushes one through `onEvent`'s handler list itself.
    */
    const browserTabIds = new Set<string>();
    const browserEventHandlers: ((e: unknown) => void)[] = [];

    (window as unknown as { midniteStudio: unknown }).midniteStudio = {
      /*
        `/tmp` so the fixture repo at `/tmp/midnite-studio` sits inside "home" and
        the terminal header renders the `~`-collapsed path the specs assert on.
        The real value is `os.homedir()`; what matters here is only that the
        fixture cwd is under it.
      */
      homeDir: '/tmp',
      /*
        A plausible shipped version, not `0.0.0` — the rail's version pill hides
        itself on the preload's unknown-version fallback, so the fixture has to
        name a real one for the strip to have anything in it.
      */
      appVersion: '1.2.3',
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
      search: {
        start: async (req: { mode: 'commits' | 'content'; requestId: string }) => {
          setTimeout(() => {
            if (req.mode === 'commits') {
              const commits = data.search?.commits ?? [];
              for (const handler of searchBatchHandlers) {
                handler({ requestId: req.requestId, mode: 'commits', commits });
              }
              for (const handler of searchDoneHandlers) {
                handler({
                  requestId: req.requestId,
                  mode: 'commits',
                  total: commits.length,
                  truncated: false,
                  ...(data.search?.error ? { error: data.search.error } : {}),
                });
              }
            } else {
              const hits = data.search?.contentHits ?? [];
              for (const handler of searchBatchHandlers) {
                handler({ requestId: req.requestId, mode: 'content', hits });
              }
              for (const handler of searchDoneHandlers) {
                handler({
                  requestId: req.requestId,
                  mode: 'content',
                  total: hits.length,
                  truncated: false,
                  ...(data.search?.error ? { error: data.search.error } : {}),
                });
              }
            }
          }, 0);
          return { ok: true as const, value: { started: true as const } };
        },
        cancel: async () => undefined,
        onBatch: (handler: (e: unknown) => void) => {
          searchBatchHandlers.push(handler);
          return () => searchBatchHandlers.splice(searchBatchHandlers.indexOf(handler), 1);
        },
        onDone: (handler: (e: unknown) => void) => {
          searchDoneHandlers.push(handler);
          return () => searchDoneHandlers.splice(searchDoneHandlers.indexOf(handler), 1);
        },
      },
      blame: {
        read: async (req: { relPath: string; rev?: string }) => {
          const key = req.rev ? `${req.rev}:${req.relPath}` : req.relPath;
          const fixture = data.blame?.[key] ?? data.blame?.[req.relPath];
          if (fixture) {
            return { ok: true as const, value: fixture };
          }
          return {
            ok: true as const,
            value: {
              path: req.relPath,
              commits: {},
              lines: [],
            },
          };
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
          inProgress: data.inProgress ?? null,
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
        // The Studio's read side (Phase 47 Theme D) — a path with no fixture
        // parses to zero regions, same as a fully-resolved or unmerged path.
        conflictRegions: async (req: { path: string }) => ({
          hunks: data.conflictRegions?.[req.path] ?? [],
          truncated: data.conflictRegionsTruncated?.[req.path] ?? false,
        }),
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

          Every call is also recorded on `window.__mstudioWrites` so a spec can
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
        ProjectV2 (Phase 40 Theme G), its own IPC namespace in the real
        bridge and kept that way here too. `list`/`items` share one
        `readKind` fixture because the real `INSUFFICIENT_SCOPES` failure can
        surface on either call — `ProjectsView` checks both.
      */
      forgeProject: slowed({
        /*
          Every read returns a deep clone of the fixture, never the fixture's
          own objects — `setField` below mutates the backing store in place,
          exactly as `reviewComment` mutates `data.forge.pullThreads`, and
          react-query's default structural sharing compares a refetch against
          the *previous* cached data by value. Handing out the same object
          reference on every call would let that mutation reach the already-
          cached data too (they would be the same object), so the "before"
          and "after" snapshots read identical and no re-render is scheduled
          — a mocking artifact a real `gh` subprocess, which always returns
          freshly parsed JSON, could never produce.
        */
        list: async () => ({
          cli: forgeCli(),
          projects: structuredClone(data.forgeProject?.projects ?? []),
          error: data.forgeProject?.error ?? null,
          kind: data.forgeProject?.readKind ?? 'ok',
        }),
        fields: async (req: { projectId: string }) => ({
          cli: forgeCli(),
          fields: structuredClone(data.forgeProject?.fields?.[req.projectId] ?? []),
          error: null,
          kind: 'ok',
        }),
        items: async (req: { projectId: string }) => ({
          cli: forgeCli(),
          items: structuredClone(data.forgeProject?.items?.[req.projectId] ?? []),
          nextCursor: null,
          error: data.forgeProject?.error ?? null,
          kind: data.forgeProject?.readKind ?? 'ok',
        }),
        /*
          A refusal is answered from the fixture verbatim; an acceptance
          mutates the seeded item's `fieldValues` in place — the same
          "mutate the fixture so a refetch comes back different" device
          `reviewComment` above uses — so the next `items` call, fired by
          `useSetProjectItemField`'s own invalidation, actually shows the new
          value rather than a stub that merely claims to have accepted it.
        */
        setField: async (req: Record<string, unknown>) => {
          recordWrite('forgeProjectSetField', req);
          const result = data.forgeProject?.writeResult;
          if (result && result.ok === false) {
            return result.kind === 'insufficient-scope'
              ? { ok: false as const, kind: 'insufficient-scope' as const, hint: result.hint ?? 'gh auth refresh -s project' }
              : { ok: false as const, kind: 'error' as const, message: result.message };
          }
          const projectId = req['projectId'] as string;
          const itemId = req['itemId'] as string;
          const value = req['value'] as Record<string, unknown>;
          const items = (data.forgeProject?.items?.[projectId] ?? []) as Record<string, unknown>[];
          for (const item of items) {
            if (item['id'] === itemId) {
              item['fieldValues'] = {
                ...(item['fieldValues'] as Record<string, unknown>),
                [value['fieldId'] as string]: value,
              };
            }
          }
          return { ok: true as const, kind: 'ok' as const };
        },
        addItem: async (req: Record<string, unknown>) => {
          recordWrite('forgeProjectAddItem', req);
          const result = data.forgeProject?.writeResult;
          if (result && result.ok === false) {
            return result.kind === 'insufficient-scope'
              ? { ok: false as const, kind: 'insufficient-scope' as const, hint: result.hint ?? 'gh auth refresh -s project' }
              : { ok: false as const, kind: 'error' as const, message: result.message };
          }
          return { ok: true as const, kind: 'ok' as const };
        },
        /*
          `clearField` (Phase 50 Theme C) — same fixture-mutation device as
          `setField` above, but removing the key entirely rather than
          replacing its value: a cleared cell has no `ForgeProjectFieldValue`
          to render, which `deriveColumns`'s "No status" fallback already
          expects (an item with no entry for the Status field id, not one
          holding an empty value).
        */
        clearField: async (req: Record<string, unknown>) => {
          recordWrite('forgeProjectClearField', req);
          const result = data.forgeProject?.writeResult;
          if (result && result.ok === false) {
            return result.kind === 'insufficient-scope'
              ? { ok: false as const, kind: 'insufficient-scope' as const, hint: result.hint ?? 'gh auth refresh -s project' }
              : { ok: false as const, kind: 'error' as const, message: result.message };
          }
          const projectId = req['projectId'] as string;
          const itemId = req['itemId'] as string;
          const fieldId = req['fieldId'] as string;
          const items = (data.forgeProject?.items?.[projectId] ?? []) as Record<string, unknown>[];
          for (const item of items) {
            if (item['id'] === itemId) {
              const fieldValues = { ...(item['fieldValues'] as Record<string, unknown>) };
              delete fieldValues[fieldId];
              item['fieldValues'] = fieldValues;
            }
          }
          return { ok: true as const, kind: 'ok' as const };
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
          timeline: data.stats?.timeline ?? [],
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
        Its own namespace, not folded into `ops`'s proxy above: `list` is a
        read answering from `data.stashes`, and `ops`'s proxy always stubs
        `{ok:true}` — a real answer needs a real method. The five writes
        record into the same `opCalls`, `op` prefixed `stash.` so a spec can
        tell `stash.push` apart from `push` (Phase 22 Theme B/E).
      */
      stash: {
        list: async () => data.stashes ?? [],
        push: async (args: unknown) => {
          opCalls.push({ op: 'stash.push', args });
          return data.opResults?.['stash.push'] ?? { ok: true as const };
        },
        apply: async (args: unknown) => {
          opCalls.push({ op: 'stash.apply', args });
          return data.opResults?.['stash.apply'] ?? { ok: true as const };
        },
        pop: async (args: unknown) => {
          opCalls.push({ op: 'stash.pop', args });
          return data.opResults?.['stash.pop'] ?? { ok: true as const };
        },
        branch: async (args: unknown) => {
          opCalls.push({ op: 'stash.branch', args });
          return data.opResults?.['stash.branch'] ?? { ok: true as const };
        },
        drop: async (args: unknown) => {
          opCalls.push({ op: 'stash.drop', args });
          return data.opResults?.['stash.drop'] ?? { ok: true as const };
        },
        detail: async (req: { selector: string }) => data.stashDetails?.[req.selector] ?? null,
        diff: async (req: { selector: string; part: string; path: string; context: number }) =>
          data.diffs[`stash:${req.selector}:${req.part}:${req.path}:${req.context}`] ??
          data.diffs[`stash:${req.selector}:${req.part}:${req.path}`] ??
          null,
      },
      /** The History view's Reflog tab (Phase 22 Theme G) — a plain read, same shape as `stash.list`. */
      reflog: {
        list: async (req: { ref?: string }) =>
          (req.ref ? data.reflogByRef?.[req.ref] : undefined) ?? data.reflog ?? [],
      },
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
        resize: (req: { ptyId: string; cols: number; rows: number }) => {
          ptyCalls.resizes.push(req);
        },
        snapshot: async (req: { ptyId: string }) => {
          ptyCalls.snapshots.push(req.ptyId);
          const chunks = outputLog[req.ptyId] ?? [];
          const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          return { bytes };
        },
        kill: (req: { ptyId: string }) => {
          ptyCalls.kills.push(req.ptyId);
          const sessionId = ptySessions[req.ptyId];
          delete ptySessions[req.ptyId];
          if (sessionId !== undefined) finalizeLoopRunOnExit(sessionId, 0);
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
        onCommandChanged: (handler: (e: { ptyId: string; command: string | null }) => void) => {
          commandHandlers.push(handler);
          return () => {
            commandHandlers.splice(commandHandlers.indexOf(handler), 1);
          };
        },
        onActivity: (
          handler: (e: { ptyId: string; activity: 'thinking' | 'waiting' | 'idle' | null }) => void,
        ) => {
          activityHandlers.push(handler);
          return () => {
            activityHandlers.splice(activityHandlers.indexOf(handler), 1);
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
          broker: { mode: 'broker' as const },
          sessions: (data.terminalSessions ?? []).map((entry) => {
            const live = entry.live ?? null;
            // A live row's pty must already exist in the fake process table —
            // it "survived" whatever this launch is rebinding after — so a
            // subsequent snapshot/input/resize against its ptyId behaves like
            // a real rebind rather than a silent no-op on an unknown id.
            if (live) {
              ptySessions[live.ptyId] = String(entry.session['id'] ?? '');
              outputLog[live.ptyId] ??= [encode(entry.scrollback ?? '')];
            }
            return {
              session: entry.session,
              scrollback: encode(entry.scrollback ?? ''),
              live,
              legacy: entry.legacy,
            };
          }),
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
              resume: ['--continue'],
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
              resume: ['resume', '--last'],
              accent: '#10A37F',
              install: 'npm i -g @openai/codex',
            },
            {
              id: 'cursor',
              label: 'Cursor',
              command: 'agent',
              args: [],
              resume: ['--continue'],
              accent: '#0066FF',
              icon: 'SiCursor',
              install: 'curl https://cursor.com/install -fsS | bash',
            },
            {
              id: 'copilot',
              label: 'Copilot',
              command: 'copilot',
              args: [],
              resume: ['--continue'],
              accent: '#6E40C9',
              icon: 'SiGithubcopilot',
              install: 'npm i -g @github/copilot',
            },
            {
              id: 'openclaude',
              label: 'OpenClaude',
              command: 'openclaude',
              args: [],
              accent: '#8B5CF6',
              install: 'npm i -g @gitlawb/openclaude',
            },
            {
              id: 'opencode',
              label: 'OpenCode',
              command: 'opencode',
              args: [],
              resume: ['--continue'],
              accent: '#03B000',
              install: 'npm i -g opencode-ai',
            },
            {
              id: 'kilo',
              label: 'Kilo Code',
              command: 'kilo',
              args: [],
              resume: ['--continue'],
              accent: '#FF5500',
              install: 'npm i -g @kilocode/cli',
            },
            {
              id: 'aider',
              label: 'Aider',
              command: 'aider',
              args: [],
              resume: ['--restore-chat-history'],
              accent: '#D93838',
              install: 'pip install -U aider-chat',
            },
            {
              id: 'cline',
              label: 'Cline',
              command: 'cline',
              args: [],
              resume: ['--continue'],
              accent: '#5F52FF',
              icon: 'SiCline',
              install: 'npm i -g cline',
            },
          ],
          status: [
            { id: 'claude', installed: true, resolvedPath: '/Users/e2e/.local/bin/claude' },
            { id: 'agy', installed: true, resolvedPath: '/Users/e2e/.local/bin/agy' },
            { id: 'codex', installed: true, resolvedPath: '/opt/homebrew/bin/codex' },
            { id: 'cursor', installed: true, resolvedPath: '/usr/local/bin/agent' },
            { id: 'copilot', installed: true, resolvedPath: '/usr/local/bin/copilot' },
            { id: 'openclaude', installed: false, resolvedPath: null },
            { id: 'opencode', installed: true, resolvedPath: '/opt/homebrew/bin/opencode' },
            { id: 'kilo', installed: true, resolvedPath: '/Users/e2e/.local/bin/kilo' },
            { id: 'aider', installed: true, resolvedPath: '/Users/e2e/.local/bin/aider' },
            { id: 'cline', installed: true, resolvedPath: '/usr/local/bin/cline' },
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
      /*
        Councils (Phase 34). `run.start` skips simulating a real pty settle
        barrier — that orchestration is main-only and already covered by
        `council-runner.test.ts` — and instead answers with an already-
        `completed` run, canned per-member output included, so a spec can
        assert the run view renders member tabs and a synthesis straight
        away rather than choreographing a fake multi-process race.
      */
      council: {
        list: async () => ({ councils }),
        get: async (req: { id: string }) => ({ council: councils.find((c) => c.id === req.id) ?? null }),
        create: async (req: { name: string; description?: string }) => {
          const now = Date.now();
          const council = {
            id: `council-${councils.length + 1}`,
            name: req.name,
            ...(req.description === undefined ? {} : { description: req.description }),
            members: [
              { id: 'm1', name: 'Optimist', provider: 'agy' as const, role: 'Argue the best case.' },
              { id: 'm2', name: 'Skeptic', provider: 'codex' as const, role: 'Find the strongest objection.' },
              { id: 'm3', name: 'Pragmatist', provider: 'opencode' as const, role: 'Focus on what is achievable.' },
              { id: 'm4', name: 'Visionary', provider: 'agy' as const, role: 'Ignore near-term constraints.' },
            ],
            synthProvider: 'agy' as const,
            createdAt: now,
            updatedAt: now,
          };
          councils = [...councils, council];
          return { ok: true as const, value: council };
        },
        updateMembers: async (req: { id: string; members: unknown[]; synthProvider: string }) => {
          const index = councils.findIndex((c) => c.id === req.id);
          if (index === -1) return { ok: false as const, kind: 'error' as const, message: 'Council not found.' };
          const updated = { ...councils[index], members: req.members, synthProvider: req.synthProvider, updatedAt: Date.now() };
          councils = [...councils.slice(0, index), updated, ...councils.slice(index + 1)];
          return { ok: true as const, value: updated };
        },
        remove: async (req: { id: string }) => {
          const before = councils.length;
          councils = councils.filter((c) => c.id !== req.id);
          return before === councils.length
            ? { ok: false as const, kind: 'error' as const, message: 'Council not found.' }
            : { ok: true as const };
        },
        run: {
          start: async (req: { councilId: string; prompt: string }) => {
            const council = councils.find((c) => c.id === req.councilId);
            if (!council) return { ok: false as const, kind: 'error' as const, message: 'Council not found.' };
            const now = Date.now();
            const run = {
              id: `run-${++councilRunCounter}`,
              councilId: req.councilId,
              prompt: req.prompt,
              format: 'brainstorm' as const,
              status: 'completed' as const,
              synthProvider: council.synthProvider,
              members: council.members.map((m: { id: string; name: string; provider: string; role: string }) => ({
                memberId: m.id,
                name: m.name,
                provider: m.provider,
                role: m.role,
                status: 'succeeded' as const,
                output: `${m.name}'s answer to: ${req.prompt}`,
                truncated: false,
                startedAt: now,
                endedAt: now,
              })),
              synthesisOutput: `Synthesis of the panel's views on: ${req.prompt}`,
              synthesisTruncated: false,
              createdAt: now,
              updatedAt: now,
            };
            councilRuns = [...councilRuns, run];
            return { ok: true as const, value: run };
          },
          get: async (req: { runId: string }) => ({ run: councilRuns.find((r) => r.id === req.runId) ?? null }),
          list: async (req: { councilId: string }) => ({
            runs: councilRuns.filter((r) => r.councilId === req.councilId),
          }),
          skipMember: async () => ({ ok: true as const }),
          retryMember: async () => ({ ok: true as const }),
        },
      },
      /**
       * Workflows (Phase 43). `run` answers with an already-`completed` run
       * rather than driving the real topological engine — that orchestration
       * is main-only and already covered by `workflow-engine.test.ts` — the
       * same call `council.run.start` makes above, for the same reason.
       */
      workflow: {
        list: async () => ({ workflows }),
        save: async (req: { workflow: { id: string; [key: string]: unknown } }) => {
          const index = workflows.findIndex((w) => w.id === req.workflow.id);
          workflows =
            index === -1
              ? [...workflows, req.workflow]
              : [...workflows.slice(0, index), req.workflow, ...workflows.slice(index + 1)];
          return { ok: true as const, value: req.workflow };
        },
        delete: async (req: { id: string }) => {
          const before = workflows.length;
          workflows = workflows.filter((w) => w.id !== req.id);
          workflowRuns = workflowRuns.filter((r) => r.workflowId !== req.id);
          return before === workflows.length
            ? { ok: false as const, kind: 'error' as const, message: 'Workflow not found.' }
            : { ok: true as const };
        },
        run: async (req: { workflowId: string }) => {
          const workflow = workflows.find((w) => w.id === req.workflowId);
          if (!workflow) return { ok: false as const, kind: 'error' as const, message: 'Workflow not found.' };
          const now = Date.now();
          // Shaped to the real `WorkflowRunSchema` (`nodes`, not `nodeRuns` —
          // nothing consumed this object until Theme G's run view, which is
          // what caught the drift), so RunHistoryList/RunNodeDetail have
          // something real to read rather than an always-empty run.
          const run = {
            id: `workflow-run-${++workflowRunCounter}`,
            workflowId: req.workflowId,
            workflowName: workflow.name,
            status: 'completed' as const,
            nodes: workflow.nodes.map((node: { id: string; kind: string; label: string }) => ({
              nodeId: node.id,
              kind: node.kind,
              label: node.label,
              status: 'succeeded' as const,
              truncated: false,
              gatedDownstream: false,
              startedAt: now,
              endedAt: now + 120,
            })),
            edges: workflow.edges,
            startedAt: now,
            endedAt: now + 120,
          };
          workflowRuns = [...workflowRuns, run];
          return { ok: true as const, value: run };
        },
        cancel: async () => {},
        runs: {
          list: async (req: { workflowId: string }) => ({
            runs: workflowRuns.filter((r) => r.workflowId === req.workflowId),
          }),
          get: async (req: { runId: string }) => ({ run: workflowRuns.find((r) => r.id === req.runId) ?? null }),
        },
        onRunChanged: () => () => {},
      },
      /** The demo API status pill (Phase 43 Theme D). No push event — the
       *  renderer polls, so `status` just answers whatever `start`/`stop`
       *  last left `demoApiRunning` at. */
      demoApi: {
        start: async () => {
          demoApiRunning = true;
          return { ok: true as const, value: { running: true as const, port: 54321 } };
        },
        stop: async () => {
          demoApiRunning = false;
          return { ok: true as const };
        },
        status: async () =>
          demoApiRunning ? { running: true as const, port: 54321 } : { running: false as const },
      },
      loopRuns: {
        list: async () => ({ runs: loopRuns }),
        start: async (req: {
          loopId: string;
          sessionId: string;
          composedPrompt: string;
          checkedModifierIds: string[];
        }) => {
          const record = {
            id: `loop-run-${++loopRunCounter}`,
            ...req,
            startedAt: Date.now(),
            status: 'running' as const,
          };
          loopRuns = [...loopRuns, record];
          for (const handler of loopRunsHandlers) handler();
          return { ok: true as const, value: record };
        },
        stop: async (req: { sessionId: string }) => {
          loopRuns = loopRuns.map((run) =>
            run['sessionId'] === req.sessionId && run['status'] === 'running'
              ? { ...run, status: 'stopped', endedAt: Date.now() }
              : run,
          );
          for (const handler of loopRunsHandlers) handler();
          return { ok: true as const };
        },
        onChanged: (handler: () => void) => {
          loopRunsHandlers.push(handler);
          return () => {
            loopRunsHandlers.splice(loopRunsHandlers.indexOf(handler), 1);
          };
        },
      },
      browser: {
        create: async (req: { tabId: string; url: string }) => {
          browserTabIds.add(req.tabId);
          return { ok: true as const };
        },
        close: (req: { tabId: string }) => {
          browserTabIds.delete(req.tabId);
        },
        navigate: noop,
        back: noop,
        forward: noop,
        reload: noop,
        stop: noop,
        setBounds: noop,
        setVisible: noop,
        activate: noop,
        devtools: noop,
        find: noop,
        findStop: noop,
        clearData: ok,
        onEvent: (handler: (e: unknown) => void) => {
          browserEventHandlers.push(handler);
          return () => {
            browserEventHandlers.splice(browserEventHandlers.indexOf(handler), 1);
          };
        },
      },
      cli: {
        status: async () => ({ installed: false, path: null, target: null, managed: false }),
        install: async () => ({ ok: true as const, value: { installed: true, path: '/usr/local/bin/midnite-studio', target: '/usr/local/bin/midnite-studio', managed: true } }),
        uninstall: async () => ({ ok: true as const, value: { installed: false, path: null, target: null, managed: false } }),
      },
      update: {
        check: noop,
        download: noop,
        restart: noop,
        setChannel: noop,
        onState: unsubscribe,
        releaseNotes: async (req: { version: string }) => ({
          version: req.version,
          notes: '### Added\n\n- A version pill in the rail.',
          error: null,
        }),
      },
      systemHealth: async () => ({
        git: { path: '/usr/bin/git', version: 'git version 2.39.5' },
        shell: '/bin/zsh',
        sshAgent: { running: true, keys: 1 },
        cli: { installed: false, path: null, target: null, managed: false },
      }),
      protocol: {
        onDeepLink: unsubscribe,
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
          const entry = data.fsFiles?.[key];
          if (!entry) return { kind: 'error', message: 'no fixture for ' + key };
          if (entry.kind !== 'text') return entry;
          return { ...entry, version: entry.version ?? { mtimeMs: 1, size: entry.content.length } };
        },
        // Phase 24 D: overwrites the fixture's own content/version in place —
        // mirroring `writeFile`'s real `fstat` check lets a spec drive a
        // genuine stale-write round trip rather than a fixed `{ok:true}`.
        writeFile: async (req: {
          relPath: string;
          content: string;
          expectedVersion: { mtimeMs: number; size: number };
        }) => {
          const key = `repo:${req.relPath}`;
          const entry = data.fsFiles?.[key];
          if (!entry || entry.kind !== 'text') return { ok: false, message: 'no fixture for ' + key };
          const current = entry.version ?? { mtimeMs: 1, size: entry.content.length };
          if (
            current.mtimeMs !== req.expectedVersion.mtimeMs ||
            current.size !== req.expectedVersion.size
          ) {
            return {
              ok: false,
              kind: 'error',
              message: 'the file changed on disk since it was last read',
              code: 'stale-write',
            };
          }
          data.fsFiles![key] = {
            kind: 'text',
            content: req.content,
            size: req.content.length,
            version: { mtimeMs: current.mtimeMs + 1, size: req.content.length },
          };
          return { ok: true as const };
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
        search: async () => data.fsSearchResult ?? { ok: true as const, matches: [], truncated: false },
        listFiles: async () => {
          if (data.fsListFilesResult) return data.fsListFilesResult;
          if (data.fsFiles) {
            const files = Object.keys(data.fsFiles).map((k) => k.replace(/^repo:/, ''));
            return { ok: true as const, files, truncated: false };
          }
          return { ok: true as const, files: [], truncated: false };
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
        The onboarding kit (Phase 49). One fixed answer per spec, like
        `fsSearchResult` above — a spec's plan/apply expectations are fully
        under its own control, so there is nothing for the mock to derive
        from `fsFiles`/`fsDirs` here.
      */
      scaffold: {
        plan: async () =>
          data.scaffoldPlanResult ?? {
            ok: true,
            value: { targetRoot: '/tmp/repo', templateVersion: '1.0.0', entries: [] },
          },
        apply: async () =>
          data.scaffoldApplyResult ?? { ok: true, value: { written: [], skipped: [] } },
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
      // Present but off: the renderer only marks when the preload says the
      // MSTUDIO_PERF flag was set, and an e2e run never sets it.
      perf: { enabled: false, mark: () => {} },
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
      cli: {
        status: async () => ({ installed: false, path: null, target: null, managed: false }),
        install: async () => ({ ok: true, value: { installed: true, path: '/usr/local/bin/midnite-studio', target: '/usr/local/bin/midnite-studio', managed: true } }),
        uninstall: async () => ({ ok: true, value: { installed: false, path: null, target: null, managed: false } }),
      },
      update: {
        check: noop,
        download: noop,
        restart: noop,
        setChannel: noop,
        onState: unsubscribe,
        releaseNotes: async (req: { version: string }) => ({
          version: req.version,
          notes: '### Added\n\n- A version pill in the rail.',
          error: null,
        }),
      },
      systemHealth: async () => ({
        git: { path: '/usr/bin/git', version: 'git version 2.45.0' },
        shell: '/bin/zsh',
        sshAgent: { running: true, keys: 1 },
        cli: { installed: false, path: null, target: null, managed: false },
      }),
      protocol: {
        onDeepLink: unsubscribe,
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
    // eslint-disable-next-line no-var
    var searchBatchHandlers: Array<(e: unknown) => void> = [];
    // eslint-disable-next-line no-var
    var searchDoneHandlers: Array<(e: unknown) => void> = [];


    // Published on `window` so a test can read the ops back, and clear the
    // array between gestures.
    // eslint-disable-next-line no-var
    var opCalls: Array<{ op: string; args: unknown }> = [];
    // Unique per create, so a spec can tell two terminals' streams apart.
    // eslint-disable-next-line no-var
    var ptyCount = 0;
    // --- FAB loop runs (Phase 35) --------------------------------------------
    /*
      The ledger, in memory. Faithful to main in the one way a spec cares
      about: `start` mints the record (id, startedAt, status) rather than
      trusting the renderer, and `stop` finalises by SESSION id — so a spec can
      assert the composed prompt a Start actually carried, which is the whole
      point of the record existing.
    */
    // eslint-disable-next-line no-var
    var loopRuns: Array<Record<string, unknown>> = [];
    /**
     * What main does on a pty exit, mirrored here: `noteSessionExit` finalises
     * whichever run is still `running` for that session as `exited`
     * (`loop-runs.ts`). Only a run that Stop has not already finalised matches,
     * which is why stopping and exiting cannot both write an end.
     */
    // eslint-disable-next-line no-var
    var finalizeLoopRunOnExit = (sessionId: string, exitCode: number): void => {
      let touched = false;
      loopRuns = loopRuns.map((run) => {
        if (run['sessionId'] !== sessionId || run['status'] !== 'running') return run;
        touched = true;
        return { ...run, status: 'exited', endedAt: Date.now(), exitCode };
      });
      if (touched) for (const handler of loopRunsHandlers) handler();
    };
    // eslint-disable-next-line no-var
    var loopRunCounter = 0;
    // eslint-disable-next-line no-var
    var loopRunsHandlers: Array<() => void> = [];
    // --- councils (Phase 34) ------------------------------------------------
    // eslint-disable-next-line no-var
    var councils: Array<{ id: string; [key: string]: unknown }> = [];
    // eslint-disable-next-line no-var
    var councilRuns: Array<{ id: string; councilId: string; [key: string]: unknown }> = [];
    // eslint-disable-next-line no-var
    var councilRunCounter = 0;
    // --- workflows (Phase 43) ------------------------------------------------
    /** Read once from the fixture, then mutated by `save`/`delete` like `councils`. */
    // eslint-disable-next-line no-var
    var workflows: Array<{ id: string; [key: string]: unknown }> = data.appWorkflows
      ? [...data.appWorkflows]
      : [];
    // eslint-disable-next-line no-var
    var workflowRuns: Array<{ id: string; workflowId: string; [key: string]: unknown }> = [];
    // eslint-disable-next-line no-var
    var workflowRunCounter = 0;
    /** The demo API pill's (Phase 43 Theme D) own toggle state — a fixed mock
     *  port keeps every run's screenshot/assertion deterministic. */
    // eslint-disable-next-line no-var
    var demoApiRunning = false;
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
    /** Every command-changed subscription, for Theme E's naming-from-process-tree tests. */
    // eslint-disable-next-line no-var
    var commandHandlers: Array<(e: { ptyId: string; command: string | null }) => void> = [];
    /** Every activity subscription, for Theme F/G's activity-indicator tests. */
    // eslint-disable-next-line no-var
    var activityHandlers: Array<
      (e: { ptyId: string; activity: 'thinking' | 'waiting' | 'idle' | null }) => void
    > = [];
    /** What has been written to each pty so far, for `pty.snapshot` to answer with. */
    // eslint-disable-next-line no-var
    var outputLog: Record<string, Uint8Array[]> = {};

    /**
     * A coloured prompt, escape sequences and all.
     *
     * Real pty bytes carry them, and the whole no-base64 rule on `pty:data`
     * exists so xterm is the one thing decoding them. A mock that sent plain
     * ASCII would quietly stop testing that.
     */
    // eslint-disable-next-line no-var
    var PROMPT = '\x1b[32m➜\x1b[0m \x1b[36mmidnite-studio\x1b[0m $ ';

    /** Canned answers, keyed by the line typed. Anything else gets a not-found. */
    // eslint-disable-next-line no-var
    var TRANSCRIPT: Record<string, string> = {
      'git status': 'On branch main\r\nnothing to commit, working tree clean\r\n',
      ls: 'CLAUDE.md  README.md  docs  packages  todo\r\n',
      claude: '\x1b[38;2;217;119;87m✻\x1b[0m Welcome to Claude Code\r\n',
      pwd: '/tmp/midnite-studio\r\n',
    };

    // eslint-disable-next-line no-var
    var encode = (text: string) => new TextEncoder().encode(text);

    // eslint-disable-next-line no-var
    var write = (ptyId: string, text: string) => {
      // A killed pty is silent, the way a dead process is: writing after kill
      // would let a spec pass against output no real terminal could produce.
      if (!(ptyId in ptySessions)) return;
      const bytes = encode(text);
      (outputLog[ptyId] ??= []).push(bytes);
      const event = { ptyId, data: bytes };
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
      /** One entry per `pty.resize` call — asserts a tween fits once, not per frame. */
      resizes: [] as { ptyId: string; cols: number; rows: number }[],
      /** One ptyId per `pty.snapshot` call — a reveal replaying live output, not the disk log. */
      snapshots: [] as string[],
    };

    /*
      A spec's way to simulate an external edit landing on disk between a
      file's read and its save — the only way to drive a genuine stale-write
      round trip through `writeFile`'s own version check (Phase 24 D).
    */
    (window as unknown as { __mstudioStaleFile: (relPath: string) => void }).__mstudioStaleFile = (
      relPath,
    ) => {
      const key = `repo:${relPath}`;
      const entry = data.fsFiles?.[key];
      if (!entry || entry.kind !== 'text') return;
      const version = entry.version ?? { mtimeMs: 1, size: entry.content.length };
      data.fsFiles![key] = { ...entry, version: { mtimeMs: version.mtimeMs + 100, size: version.size } };
    };

    (window as unknown as { __mstudioOps: unknown }).__mstudioOps = opCalls;
    (window as unknown as { __mstudioPty: unknown }).__mstudioPty = ptyCalls;
    /*
      A spec's way to make the fake shell say something arbitrary — an escape
      sequence the app is supposed to react to, rather than a command the mock
      knows how to answer. OSC 7 is the first user: the only honest test of the
      handler is a real sequence arriving on `pty:data` and being parsed by the
      xterm the app actually built.
    */
    (window as unknown as { __mstudioPtyWrite: unknown }).__mstudioPtyWrite = (
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
      pty existed, for the same reason `__mstudioPtyWrite` does: a spec whose pty
      numbering shifted would otherwise assert against an event that was never
      delivered and pass for the wrong reason.
    */
    (window as unknown as { __mstudioPtyAgent: unknown }).__mstudioPtyAgent = (
      ptyId: string,
      agentId: string | null,
    ): boolean => {
      if (!(ptyId in ptySessions)) return false;
      for (const handler of agentHandlers) handler({ ptyId, agentId });
      return true;
    };
    /**
     * A spec's way to say "the process probe just saw the foreground command
     * change" — Theme E's naming-from-process-tree path, same reporting
     * contract as `__mstudioPtyAgent`.
     */
    (window as unknown as { __mstudioPtyCommand: unknown }).__mstudioPtyCommand = (
      ptyId: string,
      command: string | null,
    ): boolean => {
      if (!(ptyId in ptySessions)) return false;
      for (const handler of commandHandlers) handler({ ptyId, command });
      return true;
    };
    /**
     * A spec's way to say "main's activity detector just changed its guess" —
     * Theme F/G's path, same reporting contract as `__mstudioPtyAgent`.
     */
    (window as unknown as { __mstudioPtyActivity: unknown }).__mstudioPtyActivity = (
      ptyId: string,
      activity: 'thinking' | 'waiting' | 'idle' | null,
    ): boolean => {
      if (!(ptyId in ptySessions)) return false;
      for (const handler of activityHandlers) handler({ ptyId, activity });
      return true;
    };
    /**
     * A pty that died on its own — the loop finishing its work, the agent
     * quitting, the shell exiting — rather than one the app asked to kill.
     *
     * `pty.kill` already fires the same handlers, but it is the *app-initiated*
     * path, which Stop covers; the case Phase 35's checklist distrusts is the
     * one nothing in the renderer initiated, so it needs a seam of its own.
     * Removes the id from the fake process table first, so a snapshot or an
     * input aimed at it afterwards behaves like the dead pty it is.
     */
    (window as unknown as { __mstudioPtyExit: unknown }).__mstudioPtyExit = (
      ptyId: string,
      exitCode = 0,
    ): boolean => {
      const sessionId = ptySessions[ptyId];
      if (sessionId === undefined) return false;
      delete ptySessions[ptyId];
      finalizeLoopRunOnExit(sessionId, exitCode);
      for (const handler of [...exitHandlers]) handler({ ptyId, exitCode });
      return true;
    };
    /**
     * Push a `mstudio:browser:event` the way main would (Phase 32 Theme A) —
     * a spec's only way to make a mocked engine crash, rename a page or
     * refuse a download, since no real `WebContentsView` exists here.
     */
    (window as unknown as { __mstudioBrowserEvent: unknown }).__mstudioBrowserEvent = (event: unknown) => {
      for (const handler of [...browserEventHandlers]) handler(event);
    };
    (window as unknown as { __mstudioBrowserTabs: unknown }).__mstudioBrowserTabs = () => [...browserTabIds];
    /*
      A getter, not the array: `loopRuns` is REASSIGNED on every start and
      stop (the ledger is immutable-updated the way main's is), so a spec
      holding the original reference would read a snapshot frozen at install
      time and quietly assert nothing.
    */
    (window as unknown as { __mstudioLoopRuns: unknown }).__mstudioLoopRuns = () => loopRuns;
    (window as unknown as { __mstudioTerminalSaves: unknown }).__mstudioTerminalSaves = terminalSaves;
    (window as unknown as { __mstudioExternalUrls: unknown }).__mstudioExternalUrls = externalUrls;
    (window as unknown as { __mstudioRevealedPaths: unknown }).__mstudioRevealedPaths = revealedPaths;
    (window as unknown as { __mstudioClipboard: unknown }).__mstudioClipboard = clipboardWrites;
    (window as unknown as { __mstudioMetrics: unknown }).__mstudioMetrics = metricsCalls;
    (window as unknown as { __mstudioDiagRuns: unknown }).__mstudioDiagRuns = () => diagRuns;
    /*
      A hook for the scripted cadence change.

      The dashed gridline only appears once the sampling interval has actually
      changed mid-series, which no fixture written up front can produce: the
      store needs points that arrived BEFORE and AFTER the change. So the spec
      pushes the second half itself, at the wider spacing, through the same
      handler array the real stream uses.
    */
    (window as unknown as { __mstudioPushMetric: unknown }).__mstudioPushMetric = (sample: unknown) => {
      for (const handler of metricsHandlers) handler(sample);
    };
  }, fixtures);
}

/**
 * Click a rail link safely.
 *
 * The rail is collapsed to icons until hovered, so a plain `.click()` races
 * its own hover-expand reflow: the pointer lands on the collapsed icon's
 * centre, the resulting `mouseenter` starts the rail growing to show labels,
 * and by the time `mousedown`/`mouseup` land at that same fixed screen point
 * the link has reflowed out from under it — onto whatever now occupies that
 * pixel, never onto the link. No amount of waiting *after* a click that never
 * reached its target can recover it. Hovering first and waiting for the
 * link's own expanded label to render turns "wait out the race" into a real,
 * observable precondition — `changes-panel.spec.ts`'s `clickChangesNav`
 * carried this fix first; this is the same fix promoted so every spec
 * navigating the rail shares one implementation instead of re-discovering it.
 */
export async function clickRailLink(page: Page, name: string): Promise<void> {
  const link = page.getByRole('link', { name, exact: true });
  await link.hover();
  await expect(link.getByText(name, { exact: true })).toBeVisible();
  await link.click();
}
