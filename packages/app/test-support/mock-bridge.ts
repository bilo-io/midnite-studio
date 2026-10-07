import { expect, type Page } from '@playwright/test';
import type {
  BatteryReading,
  ForgeAccount,
  ReachableRepo,
  ForgeCapability,
  ForgeKind,
  GamePlaytestEntry,
  GamePlaytestResult,
  Note,
  SyncStatusEvent,
  TestPackage,
  TestRunResult,
} from '@midnite/studio-shared';

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
/**
 * Every role a second window can carry — the four panels first, then the five
 * pages. Spelled out here rather than imported from `@midnite/studio-shared`
 * because this module is serialised into the page whole (`addInitScript`) and
 * may not close over anything, imports included.
 */
export type PopoutRole =
  | 'terminal'
  | 'repos'
  | 'fab'
  | 'browser'
  | 'graph'
  | 'actions'
  | 'changes'
  | 'files'
  | 'database'
  | 'dashboard'
  | 'search'
  | 'tests'
  | 'projects'
  | 'reviews'
  | 'issues'
  | 'history'
  | 'optimizer'
  | 'apps-spotify'
  | 'apps-google-calendar'
  | 'apps-youtube';

export type MockFixtures = {
  /**
   * The Finance dashboard's market data and simulated portfolio (`markets.*`).
   * Everything is generated in-process from a seeded PRNG — a spec that mounts
   * the Finance dashboard never reaches a network, and the same symbol always
   * draws the same chart.
   */
  markets?: {
    /** Cash per currency, in that currency's own units. Default USD 1,000 / EUR 500 / ZAR 10,000. */
    balances?: Record<string, number>;
    /** Held assets. Default 0.5 BTC and 10 AAPL. */
    holdings?: {
      symbol: string;
      name: string;
      kind: 'crypto' | 'stock' | 'etf';
      quantity: number;
    }[];
    watchlist?: string[];
    /** Make every series/quote call answer with an error — the "provider down" path. */
    down?: boolean;
    news?: {
      title: string;
      link: string;
      source: string;
      origin: string;
      publishedAt: number | null;
    }[];
  };
  /**
   * Commit signatures to graft onto the mock agent roster, keyed by `agentId`.
   *
   * The roster below deliberately ships WITHOUT `signatures`, unlike
   * `BUILTIN_AGENTS`, and ~90 specs depend on that: `classifyProvenance`
   * matches a commit's author and its `Co-Authored-By` trailers against the
   * roster, and the shared commit fixture carries a
   * `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` line — so adding
   * Claude's real signature to the default roster silently reclassifies that
   * commit from `human` to `mixed` for every spec that opens it.
   *
   * A spec that WANTS provenance to fire asks for it here instead. Absent —
   * the default — leaves the roster exactly as it was.
   */
  agentSignatures?: { agentId: string; emails: string[]; names: string[] }[];
  /**
   * Installed Ollama models `ollama.list()` answers with (Phase 96 Theme H) —
   * the Settings ▸ Agent backend/model picker's own model source. Absent
   * means no models installed, not "daemon unreachable" — nothing here
   * exercises the daemon-down path, which is main's own `ollamaStatus`
   * concern, not this fixture's.
   *
   * `capabilities`/`contextLength`/`numCtx` back `ollama.show()` (Phase 96
   * Theme G's fit-for-agents warning on this same picker) — defaulted to a
   * fit model (`tools` + 128k) so no existing spec's picker starts showing a
   * warning it never asked for; a spec exercising the warning sets them.
   */
  ollamaModels?: {
    name: string;
    size?: number;
    capabilities?: string[];
    contextLength?: number;
    numCtx?: number;
  }[];
  /**
   * Overrides `update.releaseNotes`'s canned body (Phase 29 Theme F). Absent
   * falls back to the existing canned copy every spec before this fixture
   * existed was written against, so nothing already passing changes shape —
   * this exists only so `slides.spec.ts` can seed a body with a real h1 to
   * assert a presented deck's cover title against.
   */
  releaseNotesOverride?: string;
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
   * deleted them would pass every spec. See `reviews-loading.spec.ts`.
   */
  forgeLatencyMs?: number;
  /**
   * Phase 66 Theme H — API Client collections, in `ApiCollectionSummary`'s own
   * shape: `{id, fileName, collection}`, where `collection` is the whole
   * Postman v2.1 document.
   *
   * The summary embeds the document rather than a count, so `readCollection`
   * needs no separate fixture — it answers from this same list, keyed by `id`
   * (which is the file name, exactly as `collection-io.ts` mints it).
   */
  apiCollections?: { id: string; fileName: string; collection: unknown }[];
  /** Overrides the canned 200 that `sendRequest` answers with. */
  apiResponse?: unknown;
  /**
   * Phase 70 Theme A — environments, in `ApiEnvironmentSummary`'s own shape
   * (`{id, fileName, environment}`, `id === fileName`). Seeds
   * `apiClient.listEnvironments`/`readEnvironment`; `saveEnvironment` and
   * `deleteEnvironment` mutate a copy of this list in place, so a spec that
   * creates or edits an environment sees it reflected on the next list read.
   */
  apiEnvironments?: {
    id: string;
    fileName: string;
    environment: {
      id: string;
      name: string;
      values: { key: string; value?: string; type?: string; enabled?: boolean }[];
    };
  }[];
  /** Seeds `environment-io.ts`'s own once-per-repo confirm gate as already
   *  satisfied — a save with secret rows answers `saved` outright instead of
   *  `needs-confirm`. Defaults to `false`, the real gate's own default for a
   *  repo nothing has protected yet. */
  apiEnvGitignoreProtected?: boolean;
  /** Collection ids whose scripts start already trusted (Phase 70 Theme B) —
   *  `runScript`/`runCollection` skip the consent gate for these; every other
   *  collection id starts untrusted, exactly as a fresh checkout would. */
  apiTrustedCollections?: string[];
  /** The canned `ScriptRun` a trusted (or `runAnyway`) `runScript` call
   *  resolves with — `{results, logs, mutations, error}`, Theme B's own
   *  shape. Absent means an empty, error-free run. */
  apiScriptRun?: {
    results: { name: string; passed: boolean; error?: string }[];
    logs?: string[];
    mutations?: {
      environment: Record<string, string>;
      collectionVariables: Record<string, string>;
    };
    error?: string | null;
  };
  /**
   * Phase 70 Theme C — the collection runner's per-item results, replayed in
   * order as real `onRunProgress` events `apiRunItemDelayMs` apart (default
   * 30ms) so a spec can click Stop between two of them, exactly the shape
   * `ApiRunItemResult` carries.
   */
  apiRunItems?: {
    itemPath: string[];
    name: string;
    method: string;
    status: 'passed' | 'failed' | 'error' | 'skipped';
    durationMs?: number;
    response?: unknown;
    assertions?: { name: string; passed: boolean; error?: string }[];
    error?: string | null;
  }[];
  /** Milliseconds between two `apiRunItems` progress events — default 30. */
  apiRunItemDelayMs?: number;
  /** Seeds `apiClient.listHistory` (Phase 70 Theme D). */
  apiHistory?: unknown[];
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
  /**
   * Whether `git cat-file -e` would find a blob — the gate on a pull
   * request's "Fetch to compare" affordance (Phase 26 Theme H), keyed by
   * `${rev}:${path}`. Defaults to `true` (present) for any key not named
   * here, so a spec that does not care about this never has to say so.
   */
  blobExists?: Record<string, boolean>;
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
   * Repo ids that start with Theme E's stamp hook already "installed" — a
   * fixture starting point for `hooks.status`; `hooks.install`/`uninstall`
   * mutate the same set live, exactly as the real main-process disk check
   * would answer differently once a repo's hook file changes underneath it.
   */
  hookInstalledRepos?: string[];
  /** Per-repo `hooks.install` refusal message — the "pre-existing hook" case. */
  hookInstallError?: Record<string, string>;
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
   * Additional repositories beyond the fixed `repo-1` — a second (or third)
   * entry for `repos.list`, each with its own single main worktree. The mock
   * bridge otherwise hardcodes one repo, which is why "opening a PR from
   * repo A vs. repo B lands in two different tab groups" had no second repo
   * to switch to (Phase 71 Theme E). Pair with `forge.pullsByRepo` to give
   * each its own pull list.
   */
  extraRepos?: { id: string; name: string; path: string; headRef?: string }[];
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
    /**
     * Per-repo `gh pr list` answers, keyed by `repoId` — for a multi-repo fixture
     * (`extraRepos`), so a PR opened from repo A's Reviews view and one opened
     * from repo B's carry different `originRepoId`s and land in different tab
     * groups (Phase 71 Theme E). A repoId with no entry falls back to
     * `pullsByScope`/`pulls`, exactly as an unscoped request does.
     */
    pullsByRepo?: Record<string, unknown[]>;
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
    /**
     * `gh issue view` answers, keyed by issue number — the listing row and the
     * opened body are two fetches, mirroring `pullDetail`'s own split.
     */
    issueDetail?: Record<string, { issue?: unknown; body?: string }>;
    /** The comment thread, keyed by issue number — `ForgeComment[]`. */
    issueComments?: Record<string, unknown[]>;
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
   * Archived sessions for the Sessions view (Phase 67) — `ClosedSession` rows,
   * newest last, the order main stores them in. The mock reverses on read the
   * way the real store does.
   */
  closedSessions?: Record<string, unknown>[];
  /**
   * Archived transcripts keyed by session id, as plain strings encoded on the
   * way out — a fixture should not have to spell out byte arrays.
   */
  sessionTranscripts?: Record<string, string>;
  /**
   * Saved notes on disk (Phase 86 Theme F).
   */
  notes?: Record<string, unknown>[];
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
    { ok: true; files: string[]; truncated: boolean } | { ok: false; message: string };
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
  /** The open repo's own agent skills (`scaffold.listRepoSkills`) — the
   *  Projects card skill picker's suggestions. Defaults to none, which leaves
   *  the picker on its built-in task catalogue. */
  repoSkills?: { name: string; description: string; source: '.claude' | '.agents' | '.codex' }[];
  /** The onboarding kit's `scaffold.installUserSkills` answer. */
  scaffoldInstallUserSkillsResult?:
    | { ok: true; value: { copied: string[]; targetDir: string } }
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
    battery?: BatteryReading;
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
   * Search fixtures (Phase 25). One fixed answer per spec, exactly like
   * `fsSearchResult` above — the mock does not run `git log`/`git grep`
   * over anything, so a spec's query text is under its own control.
   *
   * `delayMs` (default 0) is what lets `search-view.spec.ts` build a real
   * race between two in-flight searches: fired via `setTimeout`, so a spec
   * that wants a second query to land while the first is still "running"
   * gives it enough headroom to fire `start` before the first's `setTimeout`
   * elapses.
   */
  search?: {
    commits?: unknown[];
    contentHits?: unknown[];
    error?: string;
    truncated?: boolean;
    delayMs?: number;
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
   * Stored forge accounts `forgeAccounts.list` answers with (Phase 90 Theme
   * L's account-switcher baselines). Omitted, the list is empty — the
   * zero-account state every other spec renders. The active id is not a
   * bridge fixture: it lives in the renderer store, so seed it with
   * `seedUiState({ forgeActiveAccountId })`.
   */
  forgeAccounts?: ForgeAccount[];
  /** Rows `forgeAccounts.reachableRepos` answers with, for any account.
   *  Omitted, it answers `unsupported` (see the `forgeAccounts` mock). */
  reachableRepos?: ReachableRepo[];
  /**
   * Seeds the workflows domain's initial roster (Phase 43), read once into
   * the mock's own mutable array the way `terminalSessions` is. Named
   * `appWorkflows` rather than `workflows` — that name is already taken by
   * `forge.workflows`, the unrelated GitHub Actions `.yml` listing.
   */
  appWorkflows?: Array<{ id: string; [key: string]: unknown }>;
  /**
   * Seeded councils (Phase 34), mutated afterwards by `create`/`updateMembers`/
   * `remove` the way `appWorkflows` is. Every existing council spec instead
   * creates one through the UI — this exists for a spec (Phase 47 Theme E)
   * that needs one to already exist before the page loads.
   */
  councils?: Array<{ id: string; [key: string]: unknown }>;
  /**
   * Video Studio (Phase 44) — global, discovered projects rather than a
   * registry, mirroring `councils`' own "read once, mutated by `create`/
   * `remove`" shape. `studioStatus`/`toolchain` are keyed by project id so a
   * spec can put one project in `failed` while another stays `stopped`;
   * omitted keys fall back to `{state: 'stopped'}` / both binaries and both
   * Theme F skills found, the un-blocked default no spec here needs to seed
   * around.
   */
  video?: {
    root?: string | null;
    /**
     * Phase 99 Theme D — what `root.resolve` answers. Defaults to the
     * `global` source at `root ?? '/videos'`, so a spec that seeds only
     * `projects` sees them; `{root: null, source: null}` shows Setup Video.
     */
    resolution?: {
      root: string | null;
      source: string | null;
      setupTarget: string | null;
      engine?: string;
    };
    projects?: Array<{ id: string; [key: string]: unknown }>;
    studioStatus?: Record<string, { state: string; [key: string]: unknown }>;
    toolchain?: Record<string, { node: unknown; npx: unknown; [key: string]: unknown }>;
    files?: Record<string, Array<{ name: string; [key: string]: unknown }>>;
    fileContent?: Record<string, string | null>;
    renders?: Record<string, Array<{ id: string; [key: string]: unknown }>>;
  };
  /**
   * Media ▸ Games (Phase 107 Themes A + B). `list` seeds the explorer; `settings` the Settings page.
   * `create`/`run`/`stop` mutate an in-memory copy. Run state and console output are pushed from a spec
   * through `window.__mstudioMockGames.runState(...)` / `.console(...)`, which the mock installs.
   */
  games?: {
    list?: Array<{
      gameId: string;
      name: string;
      path: string;
      engine?: 'phaser' | 'three' | null;
      dimension?: '2d' | '3d' | null;
      starter?: string | null;
      dirty?: boolean;
      valid?: boolean;
      issue?: string | null;
    }>;
    settings?: {
      gamesRoot?: string | null;
      defaultEngine?: 'phaser' | 'three';
      defaultNetwork?: 'off' | 'on';
      squashRunCommits?: boolean;
    };
    resolvedRoot?: string;
    rootProblem?: string | null;
    /** The game the `game` popout hosts at boot (Theme B Pop out). */
    popped?: string | null;
    /** Theme N: picker candidates by tab, and the re-sync answer (`state` per imported asset). */
    assetSources?: Record<
      string,
      Array<{ repoPath: string; name: string; items: Array<{ path: string; label: string; kind: string; bytes: number }> }>
    >;
    assetSync?: Array<{ name: string; kind: string; state: 'current' | 'changed' | 'missing'; importedAt: string }>;
    /**
     * Theme O: `playtests/*.json` as the Playtests menu lists them. A run answers `playtestRun` when
     * given, else marks every requested valid play-test passed, and saves it as that entry's `last`.
     */
    playtests?: GamePlaytestEntry[];
    playtestRun?: { passed: boolean; runs: GamePlaytestResult[] };
    /** Theme P: what an export answers (default: success at a path built from the format and `dest`). */
    exportResult?: { ok: false; message: string } | { ok: true; warnings?: string[] };
  };
  /**
   * Media page (Phase 99 Theme A). `files` is keyed `<tab>:<project>` → file
   * path → text content; a project with no files is `{}`. `ffmpeg` defaults to
   * found. Writes and removes mutate an in-memory copy, like `video.projects`.
   */
  media?: {
    files?: Record<string, Record<string, string>>;
    /** SF3D (Phase 103 Theme J): the starting install state; `licenceSha256` = consent already given. */
    /** Maps (Phase 108): `keySet` makes the MapTiler sources available; the cache readout. */
    map?: { keySet?: boolean; cacheBytes?: number; cacheCapMB?: number };
    sf3d?: { state?: 'not-installed' | 'installed'; licenceSha256?: string; hold?: boolean; holdFraction?: number };
    ffmpeg?:
      { found: true; path: string; version: string | null } | { found: false; reason: string };
    /**
     * Theme C: `media.image.providers()`'s answer. Defaults to Gemini ready,
     * OpenAI missing its key, agy disabled, Ollama without image models.
     * `generate` writes `count` placeholder files into `image:<project>`.
     */
    /** Local audio engine + Ollama status (`media.audio.engine()`); defaults to model ready, Ollama up with llama3.2:3b. */
    audioEngine?: {
      musicgen: {
        state: 'missing' | 'downloading' | 'ready' | 'unavailable';
        downloadBytes: number;
        reason?: string;
      };
      ollama: { running: boolean; models: string[]; model: string | null; recommended: string };
    };
    imageProviders?: Array<{
      id: 'gemini' | 'openai' | 'agy' | 'ollama';
      available: boolean;
      reason?: string;
      missingKey: boolean;
      models: { id: string; label: string }[];
    }>;
    /**
     * Models tab: `media.model.providers()`'s answer. Defaults to Ollama
     * running with a text model and a vision model installed. `generate`
     * writes the `.json/.mtl/.obj/.fbx` quartet into `model:<project>`.
     */
    modelProviders?: {
      ollama: {
        available: boolean;
        reason?: string;
        models: { id: string; label: string; vision: boolean; embedding?: boolean }[];
      };
    };
    /**
     * Terrain tab: `media.terrain.*`. Terrains live in `files['terrain:<group>']` as
     * `<terrain>/terrain.json`. `build` answers `needs-height-source` when the spec has neither a
     * heightmap nor noise, else `built` with `stats` (default: a 513² terrain).
     *
     * Sprites: `media.sprite.*`; assets live in `files['sprite:<group>']` as `<asset>/sprite.json`.
     */
    terrain?: { stats?: Record<string, unknown> };
  };
  /**
   * The Chats page (`chats.*`). `seed` is a list of whole `Chat` objects
   * (the persisted shape); absent means no chats. `reply` is the text the fake
   * agent streams back in three chunks (default "Here is the answer."), and
   * `changes` makes every reply carry a pending change set with two files, one
   * of them two hunks — enough to drive the card and the review modal.
   */
  chats?: {
    seed?: Array<Record<string, unknown>>;
    reply?: string;
    changes?: boolean;
    /** Make `send` fail with this message, for the "put the message back" path. */
    sendError?: string;
    /** Accepting this path answers a conflict instead of applying. */
    conflictOn?: string;
    /** Milliseconds between streamed chunks (default 20) — raise it to hold a reply mid-stream. */
    chunkMs?: number;
    /** What `chats.skills` answers (the composer's `/` picker); a small default set when absent. */
    skills?: Array<{ name: string; description: string; scope: 'project' | 'user' | 'plugin' }>;
    /** What `chats.files` answers (the composer's `@` picker); a small default tree when absent. */
    files?: string[];
  };
  /**
   * Database connections (Phase 61). Absent means an empty list — the
   * default "No connections yet" empty state `database-shots.spec.ts` shoots
   * first, before seeding one to shoot the connections list.
   */
  dbConnections?: Array<{ id: string; name: string; provider: string; [key: string]: unknown }>;
  /**
   * A connection's introspected schema tree (Phase 61 Theme F), keyed by
   * `connectionId`. Absent means `{ tables: [] }` — the shape `getSchema`
   * always returned before this batch — so every spec that does not care
   * about the schema tree keeps working unchanged.
   *
   * A `'*'` entry is a fallback answered for ANY connection id that has no
   * exact match — Theme J's own specs add a connection through the real
   * `ConnectionDialog` flow, which mints its id with `crypto.randomUUID()`
   * (`connection-dialog.tsx`'s `buildConfig`), so no fixture can name it in
   * advance. `database-shots.spec.ts` keys its schema by the fixed `c1` it
   * seeds directly and never hits this fallback.
   */
  dbSchemaByConnection?: Record<string, { tables: unknown[] }>;
  /**
   * Phase 61 Theme J: seed rows for the query-stream mock's tiny in-memory
   * SQL engine, keyed by table name — what a query tab's `SELECT * FROM
   * <table>` renders, and what its generated `UPDATE` (Theme H's inline
   * editing) mutates in place, so a staleness re-`SELECT` sees a prior edit
   * or the test's own manufactured concurrent write (`__mstudioDbWrite`,
   * below). Absent means every table reads as zero rows — a spec exercising
   * only the destructive-statement gate never needs to seed this.
   */
  dbTableRows?: Record<string, { columns: string[]; rows: Array<Record<string, unknown>> }>;
  /**
   * Which surface `main.tsx` renders (Phase 55) — `'main'`, the default, for
   * `<App />`; any popout role for `<DetachedRoot role={…} />` standalone.
   * Only the two `detached-*-shots.spec.ts` files set it.
   *
   * Both kinds of popout role are accepted: the four panels, which MOVE out
   * of the main window when detached, and the five pages, which duplicate
   * into a second window instead.
   */
  windowRole?: 'main' | PopoutRole;
  /**
   * Extra popout roles `window.list()` reports as open, alongside `main`.
   * `useWindowSync` (`use-window-sync.ts`) reconciles `ui-store`'s four
   * `*Detached` flags against exactly this list on every mount — writing
   * `terminalDetached: true` straight into localStorage without this is
   * clobbered back to `false` the instant that hook's effect runs, since main
   * (this list) is the reconciliation's only source of truth.
   */
  openPopoutRoles?: PopoutRole[];
  /**
   * What `repos.pickDirectory()` answers — `null` (the default) is the user
   * cancelling the native picker; a path is a spec driving the extra-root
   * folder picker through to a real choice.
   */
  pickDirectoryResult?: string | null;
  /**
   * The Workspace Optimizer (Phase 59 Themes C/E). `scan()` answers with
   * this `ScanResult`-shaped object after firing every registered
   * `onScanProgress` handler once at `{done: total, total}` — real progress
   * ticks are the walker's own job in main, not this fixture's — and `gpu()`
   * answers with this `GpuStats`-shaped object, `{model: null, vramBytes:
   * null, loadPercent: null}` if left unset (a headless-probe fixture, not
   * an error state).
   */
  optimizer?: {
    scanResult?: {
      totalBytes: number;
      byCategory: Record<string, number>;
      /** Phase 72 Theme C — the ecosystem-grouped totals alongside `byCategory`. */
      byEcosystem?: Record<string, number>;
      /** Phase 72 Theme C — `label`/`producer` per matched `detectorId`. */
      detectors?: Record<string, { label: string; producer: string }>;
      items: Array<{
        path: string;
        bytes: number;
        category: string;
        repoId: string | null;
        detectorId?: string;
        ecosystem?: string;
        reclaim?: string;
      }>;
      truncated: boolean;
      /** Phase 72 Theme E fills this; empty until then. */
      truncatedRoots?: string[];
    };
    gpu?: { model: string | null; vramBytes: number | null; loadPercent: number | null };
    processes?: Array<{
      pid: number;
      ppid?: number;
      name: string;
      argv?: string;
      rssBytes: number | null;
      cpuPercent: number | null;
      ours: boolean;
    }>;
    /** Phase 85 Theme B — surfaced by `optimizer.processes()` alongside `processes`/`memory` below. */
    processesError?: string | null;
    memory?: {
      totalBytes: number;
      usedBytes?: number;
      wiredBytes: number;
      activeBytes: number;
      compressedBytes: number;
      cachedBytes: number;
      freeBytes: number;
    };
    /**
     * Phase 73 — the system-wide cache registry's own catalogue/scan
     * fixtures, a parallel family to `scanResult` above and never merged
     * with it (see `domain/system-optimizer.ts`'s own docblock).
     */
    systemCatalogue?: Array<{
      entryId: string;
      label: string;
      producer: string;
      ecosystem: string;
      reclaim: string;
    }>;
    systemScanResult?: {
      totalBytes: number;
      approximate: boolean;
      byEcosystem?: Record<string, number>;
      items: Array<{
        path: string;
        bytes: number;
        approximate: boolean;
        entryId: string;
        ecosystem: string;
        reclaim: string;
        label: string;
        producer: string;
      }>;
    };
    /**
     * Phase 74 Theme D/E — `trashSummary()` answers with this shape;
     * `undefined` (the default) is an empty Trash, `{itemCount: 0, ...}`.
     * `emptyTrash` always succeeds against this fixture — a failing empty is
     * not exercised here (it is covered at the unit level in
     * `trash-service.test.ts`'s stderr-mapping suite).
     */
    trash?: {
      itemCount: number;
      totalBytes: number;
      oldestModifiedAt: string | null;
      volumeCount: number;
      truncated: boolean;
    };
  };
  /**
   * The MCP server's Settings-page state (Phase 57 Theme F). Off by default —
   * matching the real app's own default and keeping the status-bar
   * `McpIndicator` out of every spec's DOM — because a segment only
   * `mcp-shots.spec.ts` cares about was previously on for the whole suite and
   * broke unrelated specs two ways: its `title` text (`"…open Settings"`)
   * collided with `getByRole('button', { name: 'Settings' })` in
   * `diagnostics.spec.ts`, and its extra status-bar width tipped
   * `terminal.spec.ts`'s zero-scroll-room assertion by a pixel. Only
   * `mcp-shots.spec.ts` now passes `{ enabled: true }`.
   */
  mcp?: { enabled?: boolean; allowUi?: boolean; allowGateDecide?: boolean; allowModels?: boolean; allowGames?: boolean; allowTerrains?: boolean; allowSprites?: boolean };
  /**
   * Phase 33 Theme G — the Tests view's discovered suites, trust grants and
   * canned run result. This field existed in `mock-bridge.ts`'s own reads
   * (`data.tests?.packages`, `.trusted`, `.runResult`) and in specs that set
   * it (`tests-view.spec.ts`) long before `MockFixtures` declared it — a gap
   * only Theme B's typecheck coverage of this file caught, since `e2e/**` was
   * never type-checked. Shapes borrowed straight from
   * `@midnite/studio-shared`'s own `tests.ts` rather than restated by hand.
   */
  tests?: {
    packages?: TestPackage[];
    /** Suite ids already trusted, bare (no repoId prefix) — `trust()` below
     *  stores its own grants keyed `${repoId}:${suiteId}`, and this seed is
     *  prefixed with the fixed `repo-1` fixture repo id to match. */
    trusted?: string[];
    runResult?: TestRunResult;
  };
  /**
   * Phase 87 (Theme G) — the Knowledge view's IPC surface. `graph` seeds
   * `knowledge.getGraph`'s `ready` answer directly in `KnowledgeGraphPayload`'s
   * own wire shape (nodes/links/positions/builtAtCommit/cached/commitsBehind),
   * so a spec states the exact laid-out graph a real sigma canvas has to
   * render rather than a raw `graph.json` it would have to run Theme A's own
   * projection/layout over. `undefined` answers `absent` (the un-graphified
   * repo state Theme F already covers under vitest) — every canvas spec here
   * sets it. `nodeDetails`, keyed by node id, is what a real pointer click's
   * `getNodeDetail` round trip answers; an id with no entry answers
   * `not-found`, exactly like a click racing a repo switch.
   */
  knowledge?: {
    graph?: {
      nodes: {
        id: string;
        label: string;
        community: number;
        communityName: string;
        fileType: string;
      }[];
      links: {
        source: string;
        target: string;
        relation: string;
        weight: number;
        confidence: number;
      }[];
      positions: Record<string, { x: number; y: number }>;
      builtAtCommit?: string;
      cached?: boolean;
      commitsBehind?: number | null;
    };
    nodeDetails?: Record<string, { sourceFile: string; sourceLocation: string }>;
  };
};


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

  Extracted to a named, exported top-level function (rather than left as an
  anonymous `page.addInitScript` callback) so a jsdom test can run the exact
  same side effect — `installMockBridgeJsdom` below calls it directly instead
  of re-deriving it. It closes over nothing, so it stays valid either serialised
  via `toString()` into a page, or invoked in-process under jsdom.
*/
export function pinPlatform(): void {
  Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel', configurable: true });
}

/*
  Seed the app as already-onboarded, unless a spec asks for a first run.

  The setup overlay (Phase 98, gated on the persisted `setupState`) is a
  full-screen `fixed inset-0` overlay. A fresh profile is what every spec
  gets, so without this every click in the suite lands on a welcome modal
  instead of the app, and the failure reads as "the element is there but
  something intercepts pointer events" rather than as onboarding.

  Written straight into the persist key rather than driven through the UI:
  dismissing the overlay at the top of fifty specs is fifty chances to forget,
  and onboarding is not what any of them is testing. The spec that does test
  it passes `firstRun: true` and gets the untouched fresh profile.

  Merged into whatever is already stored rather than replacing it, because an
  init script runs again on every navigation: overwriting the key wholesale
  would wipe the persisted UI state on `page.reload()`, and "survives a
  reload" is what a dozen specs assert. `version` is stamped only when there
  is nothing to merge into, so a fresh profile skips the store's `migrate`
  rather than being walked through five upgrades it never needed.

  Extracted alongside `pinPlatform` for the same reason: a jsdom `beforeEach`
  can call this directly and get the identical seed a Playwright spec gets.
*/
export function seedOnboardedProfile(): void {
  try {
    const stored = localStorage.getItem('midnite-studio.ui');
    const persisted = stored ? JSON.parse(stored) : { version: 6 };
    persisted.state = {
      selectedRepoId: 'repo-1',
      selectedWorktreePath: '/tmp/midnite-studio',
      ...persisted.state,
      setupState: {
        completedAt: '2026-01-01T00:00:00.000Z',
        dismissedAt: null,
        lastPageId: null,
        skippedPageIds: [],
      },
    };
    localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
  } catch {
    /* A profile this test cannot parse is one the app will discard too. */
  }
}

export type InstallMockBridgeOptions = {
  /** When true (default), fail the test on CSP console errors. */
  cspGuard?: boolean;
};

export async function installMockBridge(
  page: Page,
  fixtures: MockFixtures,
  options: InstallMockBridgeOptions = {},
): Promise<void> {
  if (options.cspGuard !== false) {
    const { installCspConsoleGuard } = await import('./csp-console-guard');
    await installCspConsoleGuard(page);
  }

  await page.addInitScript(pinPlatform);

  if (!fixtures.firstRun) {
    await page.addInitScript(seedOnboardedProfile);
  }

  await page.addInitScript(buildMockBridge, fixtures);
}

/**
 * Builds the fake `window.midniteStudio` bridge — every namespace and method
 * the preload exposes, backed by in-memory state derived from `fixtures`.
 *
 * Serialised whole into the page via `page.addInitScript(buildMockBridge,
 * fixtures)` (Playwright calls `toString()` on it), so this function body may
 * not close over anything from the module scope it is declared in, and must
 * stay a plain, self-contained function — no imports used at runtime, no
 * references to `installMockBridge`, `pinPlatform` or anything else declared
 * in this file. It also assigns `window.midniteStudio` itself as a side
 * effect (so the Playwright path above needs nothing further) and returns the
 * same object, which is what lets `installMockBridgeJsdom` reuse it under
 * jsdom without a real page to serialise into.
 */
/*
  No `: MidniteStudioBridge` return-type annotation, deliberately.

  Typing this file for the first time (Theme B moves it under `test-support/`,
  which the tsconfig now includes) surfaced that the fake is not structurally
  complete: it has never implemented the `rebase` namespace at all (five
  methods — `start`/`continue`/`abort`/`skip`/`status` — genuinely absent, not
  a typo). Forcing the annotation would mean either fabricating a `rebase`
  stub nobody asked for and no spec exercises (scope creep this theme
  explicitly avoids — it moves no tests and changes no behaviour) or reaching
  for `as MidniteStudioBridge`, which silently hides exactly the gap a real
  type would have caught. Leaving the return type inferred keeps every other
  namespace checked against real shapes (which is most of the value) without
  either of those. Filed as a finding rather than fixed here: whichever spec
  eventually needs `rebase` mocked (none does today) is the right moment to
  add it for real.
*/
export function buildMockBridge(data: MockFixtures) {
  // Helpers live INSIDE the function: it is serialised into the page whole, so module scope is not there.
  /**
   * The Models library tree, derived from the mock's flat `model:<project>` file maps: a top-level key is a
   * group; a file under `<folder>/` belongs to that model folder (nested groups: any directory without a
   * 3D file); loose files are legacy sets.
   */
  function mockModelTree(files: Record<string, Record<string, string>>): unknown[] {
    const names = (paths: string[]) => paths.map((name) => ({ name, size: 1, mtimeMs: 1 }));
    const manifestOf = (text: string | undefined): unknown => {
      if (!text) return null;
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        return parsed.version === 1 && parsed.agent && parsed.details ? parsed : null;
      } catch {
        return null;
      }
    };
    const has3d = (list: string[]) => list.some((n) => /\.(obj|fbx|glb)$/.test(n));
    return Object.keys(files)
      .filter((key) => key.startsWith('model:'))
      .sort()
      .map((key) => {
        const project = key.slice('model:'.length);
        const entries = Object.entries(files[key] ?? {});
        const build = (prefix: string, depth: number): unknown[] => {
          const under = entries.filter(([path]) => path.startsWith(prefix));
          const direct = under.filter(([path]) => !path.slice(prefix.length).includes('/'));
          const dirs = [...new Set(under.map(([path]) => path.slice(prefix.length)).filter((rest) => rest.includes('/')).map((rest) => rest.split('/')[0]!))];
          const out: unknown[] = dirs.map((dir) => {
            const dirPrefix = `${prefix}${dir}/`;
            const inside = entries.filter(([path]) => path.startsWith(dirPrefix));
            const directNames = inside.filter(([path]) => !path.slice(dirPrefix.length).includes('/')).map(([path]) => path.slice(dirPrefix.length));
            const path = `${project}/${dirPrefix}`.replace(/\/$/, '');
            if (has3d(directNames) || directNames.includes('model.json')) {
              return {
                kind: 'model',
                name: dir,
                path,
                manifest: manifestOf(files[key]?.[`${dirPrefix}model.json`]),
                files: names(directNames),
                legacy: false,
                mtimeMs: 1,
              };
            }
            return { kind: 'group', name: dir, path, children: build(dirPrefix, depth + 1), mtimeMs: 1 };
          });
          const stems = new Map<string, string[]>();
          for (const [path] of direct) {
            const name = path.slice(prefix.length);
            const stem = name.replace(/\.ref\.[^./]+$/, '').replace(/\.[^./]+$/, '');
            stems.set(stem, [...(stems.get(stem) ?? []), name]);
          }
          for (const [stem, list] of stems) {
            if (!has3d(list)) continue;
            out.push({ kind: 'model', name: stem, path: `${project}/${prefix}${stem}`.replace(/\/$/, ''), manifest: null, files: names(list), legacy: true, mtimeMs: 1 });
          }
          return out;
        };
        return { kind: 'group', name: project, path: project, children: build('', 1), mtimeMs: 1 };
      });
  }

  /** Moves (`to` set), copies (`copy`) or removes (`to === null`) a library path in the mock's file maps. */
  function mockMoveModelPath(
    files: Record<string, Record<string, string>>,
    from: string,
    to: string | null,
    copy = false,
  ): Record<string, Record<string, string>> {
    const next = { ...files };
    const [fromProject, ...fromRest] = from.split('/');
    const fromKey = `model:${fromProject}`;
    const prefix = fromRest.join('/');
    const toParts = to === null ? null : to.split('/');
    if (prefix === '') {
      // A top-level group.
      if (to === null) {
        delete next[fromKey];
      } else {
        next[`model:${toParts![0]}`] = files[fromKey] ?? {};
        if (!copy) delete next[fromKey];
      }
      return next;
    }
    const source = files[fromKey] ?? {};
    const kept: Record<string, string> = {};
    const moved: Record<string, string> = {};
    for (const [path, content] of Object.entries(source)) {
      if (path === prefix || path.startsWith(`${prefix}/`)) moved[path] = content;
      else kept[path] = content;
    }
    next[fromKey] = copy ? source : kept;
    if (toParts) {
      const toKey = `model:${toParts[0]}`;
      const toPrefix = toParts.slice(1).join('/');
      const target = { ...(next[toKey] ?? {}) };
      for (const [path, content] of Object.entries(moved)) target[toPrefix + path.slice(prefix.length)] = content;
      next[toKey] = target;
    }
    return next;
  }

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
  /** What the mock install probe reports — OpenClaude missing, the rest present. */
  const AGENT_STATUS = [
    {
      id: 'claude',
      installed: true,
      resolvedPath: '/Users/e2e/.local/bin/claude',
      version: '2.1.34',
    },
    {
      id: 'cursor',
      installed: true,
      resolvedPath: '/usr/local/bin/cursor-agent',
      version: '2026.09.10',
    },
    { id: 'agy', installed: true, resolvedPath: '/Users/e2e/.local/bin/agy', version: '1.2.2' },
    { id: 'codex', installed: true, resolvedPath: '/opt/homebrew/bin/codex', version: '0.7.0' },
    { id: 'copilot', installed: true, resolvedPath: '/usr/local/bin/copilot', version: '1.0.83' },
    { id: 'openclaude', installed: false, resolvedPath: null },
    {
      id: 'opencode',
      installed: true,
      resolvedPath: '/opt/homebrew/bin/opencode',
      version: '1.18.30',
    },
    { id: 'kilo', installed: true, resolvedPath: '/Users/e2e/.local/bin/kilo', version: '7.5.6' },
    {
      id: 'aider',
      installed: true,
      resolvedPath: '/Users/e2e/.local/bin/aider',
      version: '0.86.2',
    },
    { id: 'cline', installed: true, resolvedPath: '/usr/local/bin/cline', version: '3.0.60' },
  ];

  const ok = async () => ({ ok: true as const });

  /**
   * Graft `data.agentSignatures` onto the roster, by `agentId`.
   *
   * Declared inside the builder, like every other helper here, because this
   * whole function is serialised into the page by `addInitScript` — a
   * module-level helper would be `undefined` by the time the bridge runs.
   */
  const graftSignatures = <T extends { id: string }>(
    agents: T[],
    signatures: MockFixtures['agentSignatures'],
  ): T[] =>
    !signatures?.length
      ? agents
      : agents.map((agent) => {
          const match = signatures.find((s) => s.agentId === agent.id);
          return match ? { ...agent, signatures: match } : agent;
        });

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

  /** `extraRepos` mapped into the same shape, each with its own single main worktree. */
  const extraRepoEntries = (data.extraRepos ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    path: entry.path,
    headRef: entry.headRef ?? 'main',
    worktrees: [
      {
        id: `${entry.id}:${entry.path}`,
        repoId: entry.id,
        path: entry.path,
        branch: entry.headRef ?? 'main',
        headSha: 'c'.repeat(40),
        locked: false,
        isMain: true,
        prunable: false,
      },
    ],
  }));
  const allRepos = [repo, ...extraRepoEntries];

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
    const store = window as unknown as { __mstudioWrites?: unknown[] };
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
  /**
   * Every `setVisible` call, in order — the only way a spec can see
   * whether the real engine would currently be painting a tab, since
   * there's no `WebContentsView` here for a screenshot to catch escaping
   * its container.
   */
  const browserVisibleCalls: Array<{ tabId: string; visible: boolean }> = [];
  /** Every `browser.zoom` call, in order — the e2e zoom spec's assertion surface (Theme G). */
  const browserZoomCalls: Array<{ tabId: string; factor: number }> = [];
  /** Every `browser.stop` call, in order — the e2e stop-button spec's assertion surface (Theme G). */
  const browserStopCalls: Array<{ tabId: string }> = [];
  /** Every `browser.setKeepAwake` call, in order (Phase 84 Theme F). */
  const browserKeepAwakeCalls: Array<{ tabId: string; keepAwake: boolean }> = [];
  /** Every `browser.setDiscardMs` call, in order (Phase 84 Theme F) — pushed on mount and on Settings change. */
  const browserDiscardMsCalls: Array<{ ms: number }> = [];
  /** Every `apps.enable`/`disable`/`activate` call, in order (Phase 83 Theme C) — the apps-rail e2e spec's assertion surface. */
  const appsEnableCalls: string[] = [];
  const appsDisableCalls: string[] = [];
  const appsActivateCalls: (string | null)[] = [];

  /** Live install state for Theme E's stamp hook, seeded from the fixture and mutated by install/uninstall. */
  const hookInstalledRepos = new Set<string>(data.hookInstalledRepos ?? []);

  /** Every `settings.sync` push, in order (Phase 84 Theme B.4) — `use-settings-sync.ts` fires one on mount and on every change. */
  const settingsSyncCalls: Array<{
    autoFetchEnabled: boolean;
    autoFetchIntervalMs: number;
    appDiscardIdle?: Record<string, boolean>;
    browserDiscardMs?: number;
  }> = [];
  const syncStatusHandlers: ((e: unknown) => void)[] = [];

  const bridge = {
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
      list: async () => allRepos,
      close: async () => undefined,
      refs: async () => data.refs ?? [],
      worktrees: async () => allWorktrees,
      worktreeAdd: ok,
      worktreeRemove: ok,
      reorder: noop,
      // Configurable per spec (Phase 59's extra-root scan picker is the
      // first caller to need anything but the default "user cancelled").
      pickDirectory: async () => data.pickDirectoryResult ?? null,
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
        const requestId = req.requestId;
        const timeoutId = setTimeout(() => {
          searchPendingTimeouts.delete(requestId);
          if (req.mode === 'commits') {
            const commits = data.search?.commits ?? [];
            for (const handler of searchBatchHandlers) {
              handler({ requestId, mode: 'commits', commits });
            }
            for (const handler of searchDoneHandlers) {
              handler({
                requestId,
                mode: 'commits',
                total: commits.length,
                truncated: data.search?.truncated ?? false,
                ...(data.search?.error ? { error: data.search.error } : {}),
              });
            }
          } else {
            const hits = data.search?.contentHits ?? [];
            for (const handler of searchBatchHandlers) {
              handler({ requestId, mode: 'content', hits });
            }
            for (const handler of searchDoneHandlers) {
              handler({
                requestId,
                mode: 'content',
                total: hits.length,
                truncated: data.search?.truncated ?? false,
                ...(data.search?.error ? { error: data.search.error } : {}),
              });
            }
          }
        }, data.search?.delayMs ?? 0);
        searchPendingTimeouts.set(requestId, timeoutId);
        return { ok: true as const, value: { started: true as const } };
      },
      cancel: async (req: { requestId?: string }) => {
        if (req.requestId) {
          searchCancels.push(req.requestId);
          const pending = searchPendingTimeouts.get(req.requestId);
          if (pending) {
            clearTimeout(pending);
            searchPendingTimeouts.delete(req.requestId);
          }
        }
      },
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
      commitDetail: async (req: { sha: string }) => data.commitDetails?.[req.sha] ?? null,
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
      commitStats: async () => ({ stats: {} }),
      blobExists: async (req: { rev: string; path: string }) => ({
        exists: data.blobExists?.[`${req.rev}:${req.path}`] ?? true,
      }),
    },
    remotes: {
      list: async () => data.remotes ?? [],
    },
    hooks: {
      status: async (req: { repoId: string }) => ({
        ok: true as const,
        value: { installed: hookInstalledRepos.has(req.repoId) },
      }),
      install: async (req: { repoId: string }) => {
        const message = data.hookInstallError?.[req.repoId];
        if (message) return { ok: false as const, kind: 'error' as const, message };
        hookInstalledRepos.add(req.repoId);
        return { ok: true as const };
      },
      uninstall: async (req: { repoId: string }) => {
        hookInstalledRepos.delete(req.repoId);
        return { ok: true as const };
      },
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
      ...slowed({
        cliStatus: async () => forgeCli(),
        runs: async () => ({ cli: forgeCli(), runs: data.forge?.runs ?? [], error: forgeError() }),
        pulls: async (req: { repoId?: string; scope?: 'all' | 'mine' | 'review-requested' }) => ({
          cli: forgeCli(),
          pulls:
            (req.repoId ? data.forge?.pullsByRepo?.[req.repoId] : undefined) ??
            data.forge?.pullsByScope?.[req.scope ?? 'all'] ??
            data.forge?.pulls ??
            [],
          error: forgeError(),
        }),
        issues: async () => ({
          cli: forgeCli(),
          issues: data.forge?.issues ?? [],
          disabled: data.forge?.issuesDisabled === true,
          error: forgeError(),
        }),
        issueDetail: async (req: { number: number }) => {
          const seeded = data.forge?.issueDetail?.[String(req.number)];
          if (!seeded) return { cli: forgeCli(), issue: null, error: forgeError() };
          // The listing row fills the `issue` half, the same "listing first,
          // detail fills in" split `pullDetail` follows — a spec should not
          // have to restate an issue it already listed in `issues`.
          const listed = (data.forge?.issues ?? []).find(
            (row) => (row as { number?: number }).number === req.number,
          );
          return {
            cli: forgeCli(),
            issue: { issue: seeded.issue ?? listed, body: seeded.body ?? '' },
            error: null,
          };
        },
        issueComments: async (req: { number: number }) => ({
          cli: forgeCli(),
          comments: data.forge?.issueComments?.[String(req.number)] ?? [],
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
        // The graph's CI column: the seeded run list, matched per commit on its
        // head sha exactly as main's `commit-runs.ts` does.
        commitRuns: async (req: { shas: string[] }) => ({
          cli: forgeCli(),
          runs: Object.fromEntries(
            req.shas.map((sha) => [
              sha,
              (data.forge?.runs ?? []).filter(
                (row) => (row as { headSha?: string }).headSha === sha,
              ),
            ]),
          ),
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
              // Phase 26 Theme H — the base sha the image diff and "Fetch to
              // compare" (`use-base-blob-exists.ts`) both key off.
              baseSha: seeded['baseSha'] ?? null,
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
        /** Phase 54 Theme G — the two issue writes, and only two. */
        issueComment: async (req: Record<string, unknown>) => {
          recordWrite('issueComment', req);
          return writeResult(writeError() === null);
        },
        issueSetState: async (req: Record<string, unknown>) => {
          recordWrite('issueSetState', req);
          return writeResult(writeError() === null);
        },
      }),
      // Phase 84 Theme C — interest-based polling. One-way `send`s, not
      // `invoke`s, so left outside `slowed()`'s async-wrapping (which would
      // otherwise turn `onChanged`'s return value into a Promise, breaking a
      // caller that expects the plain `Unsubscribe` function back
      // synchronously — the same reason `watch.onEvent` below is `unsubscribe`
      // itself rather than `slowed`-wrapped).
      subscribe: noop,
      unsubscribe: noop,
      onChanged: unsubscribe,
    },
    /*
        The account registry's IPC surface (Phase 90 Theme B), repo-agnostic
        like the real `forge-account-handlers.ts`. `capabilities` answers
        with the same two rows the real `capabilitiesFor` matrix does
        (`'full'` for github, `'none'` for every other kind, until Themes
        E-G ship real adapters) rather than reading a fixture, so a spec
        never has to seed a capability record for a repo it already
        declared a `forge`/`remotes` fixture for. `reachableRepos` answers
        `unsupported` the same way, for the same reason — no spec needs a
        real reachable-repos listing yet, only the "no evidence either way"
        shape `isRepoVisibleForAccount` already treats as "stay visible".
        `switch` actually moves the pointer (echoing the requested id back
        as `ok: true`) rather than the earlier stub's unconditional
        failure — the account-switch toast (Phase 90's Decisions section)
        is the first caller that needs a switch to actually succeed here.
        Reimplemented rather than imported: `@midnite/studio-shared` is a
        CommonJS package, and this file's e2e specs run under Node's own
        ESM loader outside Vite's bundler, which cannot resolve a named
        export off a CJS module here the way `app.tsx`'s Vite-bundled
        import of the same function can.
      */
    forgeAccounts: {
      list: async () => data.forgeAccounts ?? [],
      add: async () => ({ ok: false as const, error: 'not implemented in the mock bridge' }),
      remove: async () => ({ ok: false }),
      switch: async (req: { id: string | null }) => ({ ok: true, activeAccountId: req.id }),
      capabilities: async (req: { kind: ForgeKind }): Promise<ForgeCapability> => {
        const level = req.kind === 'github' ? ('full' as const) : ('none' as const);
        // Phase 95 Theme D's per-operation matrix — mirrors `level`: every op
        // on for `github`, off otherwise, matching `FULL_OPS`/`NO_OPS` in
        // `forge-account.ts`.
        const on = level === 'full';
        return {
          pulls: level,
          issues: level,
          checks: level,
          projects: level,
          threadResolution: level,
          requestChanges: level,
          repoListing: level,
          ops: {
            createIssue: on,
            editIssue: on,
            deleteIssue: on,
            createProject: on,
            editProject: on,
            deleteProject: on,
            addProjectItem: on,
            removeProjectItem: on,
            linkBlockedBy: on,
            linkSubIssue: on,
          },
        };
      },
      reachableRepos: async () =>
        data.reachableRepos
          ? { ok: true as const, repos: data.reachableRepos }
          : { ok: false as const, reason: 'unsupported' as const },
    },
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
            ? {
                ok: false as const,
                kind: 'insufficient-scope' as const,
                hint: result.hint ?? 'gh auth refresh -s project',
              }
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
            ? {
                ok: false as const,
                kind: 'insufficient-scope' as const,
                hint: result.hint ?? 'gh auth refresh -s project',
              }
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
            ? {
                ok: false as const,
                kind: 'insufficient-scope' as const,
                hint: result.hint ?? 'gh auth refresh -s project',
              }
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
      // Phase 55: the mock has one window (main), which every pre-existing
      // handler above already broadcasts to unconditionally — subscribing
      // is a real no-op here, not just an unimplemented stub.
      subscribe: noop,
      unsubscribe: noop,
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
    /*
        Closed-session history (Phase 67). Empty unless a spec seeds it, so the
        Sessions view's own empty state is what every pre-existing spec sees.
        `purge` mutates the seeded array rather than no-op'ing, because the one
        thing worth asserting about a delete is that the row went.
      */
    sessions: {
      history: async () => ({ sessions: [...closedSessions] }),
      transcript: async (req: { sessionId: string }) => ({
        bytes: encode(data.sessionTranscripts?.[req.sessionId] ?? ''),
      }),
      purge: async (req: { sessionId: string | null }) => {
        closedSessions =
          req.sessionId === null ? [] : closedSessions.filter((r) => r.id !== req.sessionId);
      },
    },
    /**
     * Phase 87 Theme G — the Knowledge canvas's own bridge. `getGraph`
     * answers `ready` straight from `data.knowledge.graph` (already laid
     * out, exactly the shape a real `KnowledgeGraphPayload` response
     * carries) so a canvas spec drives real sigma/WebGL against a small,
     * hand-placed fixture rather than this repo's own 14,881-node graph.
     * No `data.knowledge` at all answers `absent` — Theme F's own state,
     * covered under vitest, not re-proven here.
     */
    knowledge: {
      getGraph: async () => {
        const graph = data.knowledge?.graph;
        if (!graph) return { ok: false, kind: 'absent' as const };
        return {
          ok: true as const,
          value: {
            nodes: graph.nodes,
            links: graph.links,
            positions: graph.positions,
            builtAtCommit: graph.builtAtCommit ?? 'deadbeef',
            cached: graph.cached ?? true,
            commitsBehind: graph.commitsBehind ?? 0,
          },
        };
      },
      getNodeDetail: async (req: { nodeId: string }) => {
        const detail = data.knowledge?.nodeDetails?.[req.nodeId];
        if (!detail) return { ok: false, kind: 'not-found' as const };
        return { ok: true as const, value: detail };
      },
      checkGraph: async () => ({ exists: data.knowledge?.graph !== undefined }),
      onLayoutProgress: () => () => {},
    },
    notes: {
      list: async (req?: { repoId?: string }) => {
        const filtered = req?.repoId ? notes.filter((n) => n.repoId === req.repoId) : notes;
        return { notes: [...filtered] };
      },
      save: (req: { note: Note }) => {
        const idx = notes.findIndex((n) => n.id === req.note.id);
        if (idx >= 0) {
          notes[idx] = req.note;
        } else {
          notes.push(req.note);
        }
        _persistMockNotes();
      },
      delete: (req: { id: string; repoId?: string }) => {
        notes = notes.filter((n) => n.id !== req.id);
        _persistMockNotes();
      },
      reorder: (req: { repoId: string; noteIds: string[] }) => {
        const namedSet = new Set(req.noteIds);
        const currentRepoNotes = notes.filter((n) => n.repoId === req.repoId);
        const otherNotes = notes.filter((n) => n.repoId !== req.repoId);
        const byId = new Map(currentRepoNotes.map((n) => [n.id, n]));
        const rest = currentRepoNotes
          .filter((n) => !namedSet.has(n.id))
          .sort(
            (a, b) => (a.order ?? 0) - (b.order ?? 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0),
          );
        const reordered: Note[] = [];
        [...req.noteIds, ...rest.map((n) => n.id)].forEach((id, index) => {
          const note = byId.get(id);
          if (note) reordered.push({ ...note, order: index });
        });
        notes = [...otherNotes, ...reordered];
        _persistMockNotes();
      },
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
        agents: graftSignatures(
          [
            {
              id: 'claude',
              label: 'Claude',
              command: 'claude',
              args: [],
              resume: ['--continue'],
              backends: ['ollama'],
              accent: '#D97757',
              install: 'curl -fsSL https://claude.ai/install.sh | bash',
              update: 'claude update',
              uninstall: 'npm rm -g @anthropic-ai/claude-code',
              docsUrl: 'https://docs.anthropic.com/en/docs/agents-and-tools/claude-code',
              apiKeyEnvVar: 'ANTHROPIC_API_KEY',
            },
            {
              id: 'cursor',
              label: 'Cursor',
              command: 'cursor-agent',
              args: [],
              resume: ['--continue'],
              accent: '#0066FF',
              icon: 'SiCursor',
              install: 'curl https://cursor.com/install -fsS | bash',
              update: 'curl https://cursor.com/install -fsS | bash',
              uninstall: 'rm -f ~/.local/bin/cursor-agent ~/.local/bin/agent',
              docsUrl: 'https://docs.cursor.com',
              apiKeyEnvVar: 'CURSOR_API_KEY',
            },
            {
              id: 'agy',
              label: 'Antigravity',
              command: 'agy',
              args: [],
              accent: '#4285F4',
              icon: 'antigravity',
              install: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
              update: 'agy update',
              uninstall: 'rm -f ~/.local/bin/agy',
              docsUrl: 'https://github.com/google-deepmind/antigravity',
              apiKeyEnvVar: 'GEMINI_API_KEY',
            },
            {
              id: 'codex',
              label: 'Codex',
              command: 'codex',
              args: [],
              resume: ['resume', '--last'],
              backends: ['ollama'],
              accent: '#10A37F',
              install: 'npm i -g @openai/codex',
              update: 'npm update -g @openai/codex',
              uninstall: 'npm rm -g @openai/codex',
              docsUrl: 'https://github.com/openai/codex',
              apiKeyEnvVar: 'OPENAI_API_KEY',
            },
            {
              id: 'copilot',
              label: 'Copilot',
              command: 'copilot',
              args: [],
              resume: ['--continue'],
              backends: ['ollama'],
              accent: '#6E40C9',
              icon: 'SiGithubcopilot',
              install: 'npm i -g @github/copilot',
              update: 'npm update -g @github/copilot',
              uninstall: 'npm rm -g @github/copilot',
              docsUrl: 'https://docs.github.com/en/copilot',
              apiKeyEnvVar: 'GITHUB_TOKEN',
            },
            {
              id: 'openclaude',
              label: 'OpenClaude',
              command: 'openclaude',
              args: [],
              accent: '#8B5CF6',
              install: 'npm i -g @gitlawb/openclaude',
              update: 'npm update -g @gitlawb/openclaude',
              uninstall: 'npm rm -g @gitlawb/openclaude',
              docsUrl: 'https://github.com/openclaude/openclaude',
              apiKeyEnvVar: 'ANTHROPIC_API_KEY',
            },
            {
              id: 'opencode',
              label: 'OpenCode',
              command: 'opencode',
              args: [],
              resume: ['--continue'],
              backends: ['ollama'],
              accent: '#03B000',
              install: 'npm i -g opencode-ai',
              update: 'npm update -g opencode-ai',
              uninstall: 'npm rm -g opencode-ai',
              docsUrl: 'https://github.com/opencode/opencode',
              apiKeyEnvVar: 'OPENAI_API_KEY',
            },
            {
              id: 'kilo',
              label: 'Kilo Code',
              command: 'kilo',
              args: [],
              resume: ['--continue'],
              accent: '#FF5500',
              install: 'npm i -g @kilocode/cli',
              update: 'npm update -g @kilocode/cli',
              uninstall: 'npm rm -g @kilocode/cli',
              docsUrl: 'https://github.com/kilo-code/kilo',
              apiKeyEnvVar: 'KILO_API_KEY',
            },
            {
              id: 'aider',
              label: 'Aider',
              command: 'aider',
              args: [],
              resume: ['--restore-chat-history'],
              accent: '#D93838',
              install: 'pip install aider-chat',
              update: 'pip install --upgrade aider-chat',
              uninstall: 'pip uninstall -y aider-chat',
              docsUrl: 'https://aider.chat/docs',
              apiKeyEnvVar: 'OPENAI_API_KEY',
            },
            {
              id: 'cline',
              label: 'Cline',
              command: 'cline',
              args: [],
              resume: ['--continue'],
              backends: ['ollama'],
              accent: '#5F52FF',
              icon: 'SiCline',
              install: 'npm i -g cline',
              update: 'npm update -g cline',
              uninstall: 'npm rm -g cline',
              docsUrl: 'https://github.com/cline/cline',
              apiKeyEnvVar: 'ANTHROPIC_API_KEY',
            },
          ],
          data.agentSignatures,
        ),
        status: AGENT_STATUS,
        probe: 'ready' as const,
      }),
      claudeInfo: async () => ({
        installed: true,
        version: '2.1.34',
        method: 'npm',
        binPath: '/Users/e2e/.nvm/versions/node/v22.12.0/bin/claude',
      }),
      claudeUpdate: async () => ({ ok: true as const, exitCode: 0 }),
      onClaudeUpdateData: unsubscribe,
      recheck: async () => ({ status: AGENT_STATUS, probe: 'ready' as const }),
      onStatus: unsubscribe,
      revealPath: async () => ({ ok: true }),
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
      get: async (req: { id: string }) => ({
        council: councils.find((c) => c.id === req.id) ?? null,
      }),
      create: async (req: { name: string; description?: string }) => {
        const now = Date.now();
        const council = {
          id: `council-${councils.length + 1}`,
          name: req.name,
          ...(req.description === undefined ? {} : { description: req.description }),
          members: [
            {
              id: 'm1',
              name: 'Optimist',
              provider: 'agy' as const,
              role: 'Argue the best case.',
            },
            {
              id: 'm2',
              name: 'Skeptic',
              provider: 'codex' as const,
              role: 'Find the strongest objection.',
            },
            {
              id: 'm3',
              name: 'Pragmatist',
              provider: 'opencode' as const,
              role: 'Focus on what is achievable.',
            },
            {
              id: 'm4',
              name: 'Visionary',
              provider: 'agy' as const,
              role: 'Ignore near-term constraints.',
            },
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
        const existing = councils[index];
        // `noUncheckedIndexedAccess` types `councils[index]` as possibly
        // `undefined` regardless of the `index === -1` check above (that
        // check narrows `index`, not a separate `councils[index]`
        // expression), so this is the real guard the spread below needs —
        // spreading a possibly-`undefined` value would otherwise make every
        // field of `updated` optional, `id` included.
        if (index === -1 || !existing)
          return { ok: false as const, kind: 'error' as const, message: 'Council not found.' };
        const updated: { id: string; [key: string]: unknown } = {
          ...existing,
          members: req.members,
          synthProvider: req.synthProvider,
          updatedAt: Date.now(),
        };
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
          if (!council)
            return { ok: false as const, kind: 'error' as const, message: 'Council not found.' };
          const now = Date.now();
          const run = {
            id: `run-${++councilRunCounter}`,
            councilId: req.councilId,
            prompt: req.prompt,
            format: 'brainstorm' as const,
            status: 'completed' as const,
            synthProvider: council.synthProvider,
            // `council.members` reads as `unknown` off the `{[key: string]:
            // unknown}` index signature `councils`' own element type
            // carries — cast once here rather than widen that whole type.
            members: (
              council.members as Array<{
                id: string;
                name: string;
                provider: string;
                role: string;
              }>
            ).map((m: { id: string; name: string; provider: string; role: string }) => ({
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
        get: async (req: { runId: string }) => ({
          run: councilRuns.find((r) => r.id === req.runId) ?? null,
        }),
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
        if (!workflow)
          return { ok: false as const, kind: 'error' as const, message: 'Workflow not found.' };
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
          // `workflow.nodes` is `unknown` off `workflows`' own index-signature
          // element type — cast once here, same reasoning as `council.members` above.
          nodes: (workflow.nodes as Array<{ id: string; kind: string; label: string }>).map(
            (node: { id: string; kind: string; label: string }) => ({
              nodeId: node.id,
              kind: node.kind,
              label: node.label,
              status: 'succeeded' as const,
              truncated: false,
              gatedDownstream: false,
              startedAt: now,
              endedAt: now + 120,
            }),
          ),
          edges: workflow.edges,
          startedAt: now,
          endedAt: now + 120,
        };
        workflowRuns = [...workflowRuns, run];
        return { ok: true as const, value: run };
      },
      cancel: async () => {},
      // Phase 97 Theme D — mutates the matching node in place, exactly like
      // the real engine's settle, so a fixture that seeds a `waiting` gate
      // node can assert the run panel's decide round trip end to end.
      gateDecide: async (req: {
        runId: string;
        nodeId: string;
        decision: 'approved' | 'rejected';
        note?: string;
      }) => {
        const run = workflowRuns.find((r) => r.id === req.runId);
        const node = (
          run?.nodes as
            | Array<{ nodeId: string; status: string; settledPort?: string; output?: unknown }>
            | undefined
        )?.find((n) => n.nodeId === req.nodeId);
        if (!run || !node)
          return { ok: false as const, kind: 'error' as const, message: 'Gate not found.' };
        node.status = 'succeeded';
        node.settledPort = req.decision;
        node.output = { decision: req.decision, note: req.note ?? null, decidedBy: 'panel' };
        return { ok: true as const };
      },
      runs: {
        list: async (req: { workflowId: string }) => ({
          runs: workflowRuns.filter((r) => r.workflowId === req.workflowId),
        }),
        get: async (req: { runId: string }) => ({
          run: workflowRuns.find((r) => r.id === req.runId) ?? null,
        }),
      },
      onRunChanged: () => () => {},
      // Phase 95 Theme J — no fixture seeds a real push here (the accordion
      // group's own shots seed `data.terminalSessions` directly with a
      // `workflowRunRef`, matching how `terminal.list` already fixtures a
      // restored session); this only needs to exist so `App`'s always-
      // mounted `useWorkflowNodeSessions()` has something to subscribe to.
      onNodeSessionStarted: () => () => {},
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
    secrets: {
      get: async () => ({ value: null }),
      set: async () => {},
      has: async () => ({ hasKey: false }),
    },
    finance: {
      search: async () => ({ ok: true as const, value: [] }),
      quote: async () => ({ ok: true as const, value: { price: 0, currency: 'USD' } }),
      history: async () => ({ ok: true as const, value: [] }),
    },
    markets: createMockMarkets(),
    chats: createMockChats(),
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
      stop: (req: { tabId: string }) => {
        browserStopCalls.push({ tabId: req.tabId });
      },
      setBounds: noop,
      setVisible: (req: { tabId: string; visible: boolean }) => {
        browserVisibleCalls.push({ tabId: req.tabId, visible: req.visible });
      },
      activate: noop,
      devtools: noop,
      find: noop,
      findStop: noop,
      clearData: ok,
      zoom: (req: { tabId: string; factor: number }) => {
        browserZoomCalls.push({ tabId: req.tabId, factor: req.factor });
      },
      setKeepAwake: (req: { tabId: string; keepAwake: boolean }) => {
        browserKeepAwakeCalls.push(req);
      },
      setDiscardMs: (req: { ms: number }) => {
        browserDiscardMsCalls.push(req);
      },
      onEvent: (handler: (e: unknown) => void) => {
        browserEventHandlers.push(handler);
        return () => {
          browserEventHandlers.splice(browserEventHandlers.indexOf(handler), 1);
        };
      },
    },
    /*
        The third-party apps rail (Phase 83). `enable`/`disable`/`activate`
        are all fire-and-forget as far as a spec is concerned — there is no
        real `WebContentsView` in a browser-driven e2e run for them to show or
        hide — so this only has to answer the shape the renderer expects and
        keep a log a spec CAN assert against, the same posture `browser`'s
        `setVisible` above takes for `browserVisibleCalls`.
      */
    apps: {
      enable: async (req: { id: string }) => {
        appsEnableCalls.push(req.id);
        return { ok: true as const };
      },
      disable: (req: { id: string }) => {
        appsDisableCalls.push(req.id);
      },
      setBounds: noop,
      activate: (req: { id: string | null }) => {
        appsActivateCalls.push(req.id);
      },
    },
    /*
        Video Studio (Phase 44). `studio.start`/`studio.stop` mutate
        `videoStudioStatus` directly and answer with the new value rather than
        pushing it through `onStudioChanged` — no spec here drives a live
        starting→running transition, so a real event stream would be an
        unused indirection; `onStudioChanged`/`onRenderProgress` stay inert
        subscriptions, same posture as `update.onState` below.
      */
    // Phase 96 Theme H — the Settings ▸ Agent backend/model picker's only
    // bridge dependency. Minimal by design: `status`/`show`/`pull`/etc. have
    // no spec that needs them yet (Theme C's own Models view is what would
    // add those), and this file's own convention (see the inferred-return-type
    // note above) is to grow a namespace when a real spec needs it, not ahead
    // of one.
    ollama: {
      list: async () => ({
        ok: true as const,
        value: {
          models: (data.ollamaModels ?? []).map((m) => ({
            name: m.name,
            model: m.name,
            modifiedAt: null,
            size: m.size ?? 0,
            digest: 'sha256:mock',
          })),
        },
      }),
      status: async () => ({ reachable: true, version: '0.1.0', host: 'http://127.0.0.1:11434' }),
      // Theme G's fit-for-agents check on the Settings ▸ Agent picker
      // (`agent-page.tsx`'s `OllamaBackendRow`) is the only caller in specs
      // today — defaults to a fit model per the fixture's own doc comment.
      show: async (req: { model: string }) => {
        const found = (data.ollamaModels ?? []).find((m) => m.name === req.model);
        return {
          ok: true as const,
          value: {
            capabilities: found?.capabilities ?? ['completion', 'tools'],
            contextLength: found?.contextLength ?? 131072,
            parameters: found?.numCtx ? `num_ctx ${found.numCtx}` : 'num_ctx 65536',
          },
        };
      },
      // Phase 96 Themes D, F — Discover/Cloud tabs and the sign-in/cloud-key
      // flow. Empty/false by default so an unrelated spec exercising a
      // cloud-model session (`use-terminal-ipc.ts`) sees "signed out, no
      // key" and falls back to the local daemon exactly as before.
      search: async () => ({
        ok: true as const,
        value: { items: [], stale: false, updatedAt: '' },
      }),
      cloudList: async () => ({ ok: true as const, value: { models: [] } }),
      signInStatus: async () => ({ signedIn: false }),
    },
    video: {
      project: {
        list: async () => ({ projects: videoProjects }),
        get: async (req: { id: string }) => ({
          project: videoProjects.find((p) => p.id === req.id) ?? null,
        }),
        create: async (req: { id: string; title: string }) => {
          const project = {
            id: req.id,
            title: req.title,
            valid: true,
            composition: 'Main',
            source: 'input/original.mp4',
            brief: 'input/BRIEF.md',
            script: 'EDITORIAL_SCRIPT.md',
          };
          videoProjects = [...videoProjects, project];
          return { ok: true as const, value: project };
        },
        remove: async (req: { id: string }) => {
          const before = videoProjects.length;
          videoProjects = videoProjects.filter((p) => p.id !== req.id);
          return before === videoProjects.length
            ? { ok: false as const, kind: 'error' as const, message: 'Project not found.' }
            : { ok: true as const };
        },
      },
      studio: {
        // Returns the fixture's pre-seeded outcome for this project if one
        // exists (letting a spec script "starting this studio fails"),
        // defaulting to 'running' otherwise — `useVideoStudioStatus`'s own
        // `initialData` + the app's global `staleTime: Infinity`
        // (`app.tsx`) mean the first real `status` fetch never runs on
        // mount, so `start`'s own response, written directly via
        // `setQueryData`, is the only path a fixture-seeded status can
        // actually reach the UI through — matching production exactly.
        start: async (req: { projectId: string }) => {
          const status = data.video?.studioStatus?.[req.projectId] ?? {
            state: 'running' as const,
            url: 'http://localhost:3000',
          };
          videoStudioStatus = { ...videoStudioStatus, [req.projectId]: status };
          return { ok: true as const, value: status };
        },
        stop: async (req: { projectId: string }) => {
          videoStudioStatus = { ...videoStudioStatus, [req.projectId]: { state: 'stopped' } };
          return { ok: true as const };
        },
        status: async (req: { projectId: string }) => ({
          status: videoStudioStatus[req.projectId] ?? { state: 'stopped' },
        }),
      },
      render: {
        start: async (req: { projectId: string; compositionId: string }) => {
          const render = {
            id: `render-${(videoRenders[req.projectId]?.length ?? 0) + 1}`,
            projectId: req.projectId,
            compositionId: req.compositionId,
            status: 'queued' as const,
            startedAt: Date.now(),
          };
          videoRenders = {
            ...videoRenders,
            [req.projectId]: [...(videoRenders[req.projectId] ?? []), render],
          };
          return { ok: true as const, value: render };
        },
        cancel: async () => ({ ok: true as const }),
        list: async (req: { projectId: string }) => ({
          renders: videoRenders[req.projectId] ?? [],
        }),
      },
      toolchain: async (req: { projectId: string }) => ({
        toolchain: data.video?.toolchain?.[req.projectId] ?? {
          node: { found: true, path: '/usr/local/bin/node' },
          npx: { found: true, path: '/usr/local/bin/npx' },
          skills: {
            videoWriteScript: {
              found: true,
              path: '/videos/.claude/skills/midnite-media-video-write-editorial-script/SKILL.md',
            },
            videoExecuteScript: {
              found: true,
              path: '/videos/.claude/skills/midnite-media-video-execute-editorial-script/SKILL.md',
            },
          },
        },
      }),
      files: async (req: { projectId: string; area: string }) => ({
        entries: data.video?.files?.[`${req.projectId}:${req.area}`] ?? [],
      }),
      readFile: async (req: { projectId: string; relPath: string }) => ({
        content: data.video?.fileContent?.[`${req.projectId}:${req.relPath}`] ?? null,
      }),
      revealFile: async () => ({ ok: true as const }),
      openFile: async () => ({ ok: true as const }),
      root: {
        get: async () => ({ root: data.video?.root ?? null }),
        set: async (req: { root: string | null }) => ({ root: req.root }),
        resolve: async () => videoResolution,
      },
      setup: async (req: { engine?: string }) => {
        videoResolution = {
          root: '/repo/.midnite/media/video',
          source: 'repo-media',
          setupTarget: '/repo/.midnite/media/video',
          engine: req.engine ?? 'remotion',
        };
        return { ok: true as const, value: videoResolution };
      },
      // Phase 99 Theme H — the engine switch; HyperFrames reports a pending install, like a first visit.
      engine: {
        get: async () => ({
          root: videoResolution.root,
          engine: videoResolution.engine ?? 'remotion',
          needsInstall: false,
          appDir: videoResolution.root ? `${videoResolution.root}/video-editor` : null,
        }),
        set: async (req: { engine: string }) => {
          videoResolution = { ...videoResolution, engine: req.engine };
          return {
            ok: true as const,
            value: {
              root: videoResolution.root,
              engine: req.engine,
              needsInstall: req.engine === 'hyperframes',
              appDir: videoResolution.root
                ? `${videoResolution.root}/${req.engine === 'hyperframes' ? 'hyperframes-editor' : 'video-editor'}`
                : null,
            },
          };
        },
      },
      onStudioChanged: unsubscribe,
      onRenderProgress: unsubscribe,
    },
    games: {
      settings: {
        get: async () => ({
          settings: gamesSettings,
          resolvedRoot:
            data.games?.resolvedRoot ?? (gamesSettings.gamesRoot as string | null) ?? '/Users/test/Midnite Games',
          rootProblem: data.games?.rootProblem ?? null,
        }),
        set: async (patch: Record<string, unknown>) => {
          gamesSettings = { ...gamesSettings, ...patch };
          return {
            ok: true as const,
            value: {
              settings: gamesSettings,
              resolvedRoot:
                data.games?.resolvedRoot ?? (gamesSettings.gamesRoot as string | null) ?? '/Users/test/Midnite Games',
              rootProblem: null,
            },
          };
        },
      },
      list: async () => ({ games: gamesList }),
      create: async (req: { name: string; engine: string; perspective: string }) => {
        const slug = req.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
        const gameId = `g${String(gamesList.length + 1).padStart(12, '0')}`;
        const path = `${data.games?.resolvedRoot ?? '/Users/test/Midnite Games'}/${slug}`;
        gamesList = [
          ...gamesList,
          {
            gameId,
            name: req.name,
            path,
            engine: req.engine,
            dimension: req.engine === 'phaser' ? '2d' : '3d',
            starter: 'blank',
            dirty: false,
            valid: true,
            issue: null,
          },
        ];
        gamesChangedHandlers.forEach((h) => h({ reason: 'created' }));
        return { ok: true as const, value: { path, gameId } };
      },
      manifest: {
        get: async () => ({ manifest: null, issues: [] }),
        set: async () => ({ ok: true as const }),
      },
      run: async (req: { gameId: string }) => {
        gamesCalls.push({ call: 'run', ...req });
        const runId = `r${gamesCalls.length}`;
        gamesRunStateHandlers.forEach((h) => h({ gameId: req.gameId, runId, state: 'starting' }));
        gamesRunStateHandlers.forEach((h) => h({ gameId: req.gameId, runId, state: 'running' }));
        return { ok: true as const, value: { runId } };
      },
      stop: async (req: { gameId: string }) => {
        gamesCalls.push({ call: 'stop', ...req });
        gamesRunStateHandlers.forEach((h) => h({ gameId: req.gameId, runId: 'r0', state: 'stopped' }));
        return { ok: true as const };
      },
      reload: async () => ({ ok: true as const }),
      setBounds: (req: Record<string, unknown>) => {
        gamesCalls.push({ call: 'setBounds', ...req });
      },
      setVisible: (req: Record<string, unknown>) => {
        gamesCalls.push({ call: 'setVisible', ...req });
      },
      toolbar: async (req: Record<string, unknown>) => {
        gamesCalls.push({ call: 'toolbar', ...req });
        return { ok: true as const };
      },
      logs: async () => ({ runId: null, entries: [] }),
      kitUpgrade: async () => ({ ok: true as const, value: { branch: 'kit-upgrade/0.1.0' } }),
      popOut: async (req: { gameId: string }) => {
        gamesCalls.push({ call: 'popOut', ...req });
        gamesPopped = req.gameId;
        gamesPopStateHandlers.forEach((h) => h({ gameId: req.gameId }));
        return { ok: true as const };
      },
      popped: async () => ({ gameId: gamesPopped, run: null }),
      onPopState: (handler: (event: unknown) => void) => {
        gamesPopStateHandlers.push(handler);
        return () => {
          gamesPopStateHandlers = gamesPopStateHandlers.filter((h) => h !== handler);
        };
      },
      onChanged: (handler: (event: unknown) => void) => {
        gamesChangedHandlers.push(handler);
        return () => {
          gamesChangedHandlers = gamesChangedHandlers.filter((h) => h !== handler);
        };
      },
      onOpen: (handler: (event: unknown) => void) => {
        gamesOpenHandlers.push(handler);
        return () => {
          gamesOpenHandlers = gamesOpenHandlers.filter((h) => h !== handler);
        };
      },
      onRunState: (handler: (event: unknown) => void) => {
        gamesRunStateHandlers.push(handler);
        return () => {
          gamesRunStateHandlers = gamesRunStateHandlers.filter((h) => h !== handler);
        };
      },
      onConsole: (handler: (event: unknown) => void) => {
        gamesConsoleHandlers.push(handler);
        return () => {
          gamesConsoleHandlers = gamesConsoleHandlers.filter((h) => h !== handler);
        };
      },
      // Theme M: runs are recorded; a spec drives progress through `__mstudioMockGames.agentProgress(...)`.
      agent: {
        // Warnings stay empty: the panel's own banner is what shows the Ollama warning.
        run: async (req: { gameId: string }) => {
          const runId = `ar${gamesCalls.length + 1}`;
          gamesCalls.push({ call: 'agentRun', runId, ...req });
          return { ok: true as const, value: { runId, warnings: [] as string[] } };
        },
        cancel: async (req: { gameId: string }) => {
          gamesCalls.push({ call: 'agentCancel', ...req });
          return { ok: true as const };
        },
        undo: async (req: { gameId: string; sha: string }) => {
          gamesCalls.push({ call: 'agentUndo', ...req });
          return { ok: true as const };
        },
        onProgress: (handler: (event: unknown) => void) => {
          gamesAgentHandlers.push(handler);
          return () => {
            gamesAgentHandlers = gamesAgentHandlers.filter((h) => h !== handler);
          };
        },
      },
      // Theme O: play-tests. Listing answers the fixture; a run is recorded and updates each entry's `last`.
      playtests: {
        list: async () => ({ ok: true as const, value: { playtests: gamesPlaytests } }),
        run: async (req: { gameId: string; names?: string[] }) => {
          gamesCalls.push({ call: 'playtestRun', ...req });
          const wanted = gamesPlaytests.filter((p) => p.valid && (!req.names || req.names.length === 0 || req.names.includes(p.name)));
          const answer = data.games?.playtestRun ?? {
            passed: true,
            runs: wanted.map((p) => ({ name: p.name, passed: true, ranAt: '2026-10-07T10:00:00.000Z', frames: 180, ms: 900, results: [] })),
          };
          gamesPlaytests = gamesPlaytests.map((p) => ({ ...p, last: answer.runs.find((r) => r.name === p.name) ?? p.last }));
          return { ok: true as const, value: answer };
        },
      },
      // Theme P: web export. Recorded; answers `exportResult` or a success at the chosen (or a dialog) path.
      export: async (req: { gameId: string; format: string; dest?: string; overwrite?: boolean }) => {
        gamesCalls.push({ call: 'export', ...req });
        const answer = data.games?.exportResult;
        if (answer && !answer.ok) return { ok: false as const, kind: 'error' as const, message: answer.message };
        const ext = req.format === 'game-html' ? 'html' : req.format === 'game-zip' ? 'zip' : 'web';
        const path = req.format === 'game-folder' ? `${req.dest ?? '/exports'}/game-web` : (req.dest ?? `/exports/game.${ext}`);
        return { ok: true as const, value: { path, bytes: 2_048_000, files: 42, warnings: answer?.warnings ?? [] } };
      },
      // Theme N: the asset bridge. Sources and re-sync answer from fixtures; imports are recorded.
      assets: {
        sources: async (req: { tab: string }) => ({ ok: true as const, value: { repos: data.games?.assetSources?.[req.tab] ?? [] } }),
        import: async (req: { gameId: string; source: unknown; name?: string }) => {
          gamesCalls.push({ call: 'assetImport', ...req });
          const name = req.name ?? 'asset';
          return { ok: true as const, value: { name, kind: 'sprite' as const, path: `assets/sprite/${name}`, sha256: 'abc', commit: 'a1b2c3d' } };
        },
        resync: async (req: { gameId: string; check?: boolean; names?: string[] }) => {
          gamesCalls.push({ call: 'assetResync', ...req });
          const assets = data.games?.assetSync ?? [];
          const changed = assets.filter((a: { state: string }) => a.state === 'changed');
          const reimported = req.check ? [] : changed.map((a: { name: string }) => a.name);
          return { ok: true as const, value: { assets, changed: req.check ? changed.length : 0, reimported, commit: req.check || reimported.length === 0 ? null : 'd4e5f6a' } };
        },
      },
    },
    media: {
      project: {
        list: async (req: { tab: string }) => ({
          ok: true as const,
          value: Object.keys(mediaFiles)
            .filter((key) => key.startsWith(`${req.tab}:`))
            .map((key) => ({
              name: key.slice(req.tab.length + 1),
              fileCount: Object.keys(mediaFiles[key] ?? {}).length,
              mtimeMs: 1,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        }),
        create: async (req: { tab: string; project: string }) => {
          const key = `${req.tab}:${req.project}`;
          if (mediaFiles[key])
            return { ok: false as const, kind: 'error' as const, message: 'exists' };
          mediaFiles = { ...mediaFiles, [key]: {} };
          return { ok: true as const, value: { name: req.project, fileCount: 0, mtimeMs: 1 } };
        },
        rename: async (req: { tab: string; project: string; to: string }) => {
          const { [`${req.tab}:${req.project}`]: moved, ...rest } = mediaFiles;
          mediaFiles = { ...rest, [`${req.tab}:${req.to}`]: moved ?? {} };
          return { ok: true as const };
        },
        remove: async (req: { tab: string; project: string }) => {
          const { [`${req.tab}:${req.project}`]: _gone, ...rest } = mediaFiles;
          mediaFiles = rest;
          return { ok: true as const };
        },
      },
      file: {
        list: async (req: { tab: string; project: string }) => ({
          ok: true as const,
          value: Object.entries(mediaFiles[`${req.tab}:${req.project}`] ?? {}).map(
            ([path, content]) => ({
              path,
              size: content.length,
              mtimeMs: 1,
            }),
          ),
        }),
        read: async (req: { tab: string; project: string; path: string }) => {
          const content = mediaFiles[`${req.tab}:${req.project}`]?.[req.path];
          return content === undefined
            ? { ok: false as const, kind: 'error' as const, message: 'File not found.' }
            : { ok: true as const, value: content };
        },
        write: async (req: { tab: string; project: string; path: string; content: string }) => {
          const key = `${req.tab}:${req.project}`;
          mediaFiles = {
            ...mediaFiles,
            [key]: { ...(mediaFiles[key] ?? {}), [req.path]: req.content },
          };
          return { ok: true as const, value: { size: req.content.length, largeFile: false } };
        },
        rename: async (req: { tab: string; project: string; path: string; to: string }) => {
          const key = `${req.tab}:${req.project}`;
          const { [req.path]: content, ...rest } = mediaFiles[key] ?? {};
          mediaFiles = { ...mediaFiles, [key]: { ...rest, [req.to]: content ?? '' } };
          return { ok: true as const };
        },
        remove: async (req: { tab: string; project: string; path: string }) => {
          const key = `${req.tab}:${req.project}`;
          const { [req.path]: _gone, ...rest } = mediaFiles[key] ?? {};
          mediaFiles = { ...mediaFiles, [key]: rest };
          return { ok: true as const };
        },
      },
      image: {
        providers: async () => ({
          providers: data.media?.imageProviders ?? [
            { id: 'gemini' as const, available: true, missingKey: false, models: [] },
            {
              id: 'openai' as const,
              available: false,
              reason: 'Add a OpenAI API key in Settings ▸ Media.',
              missingKey: true,
              models: [],
            },
            {
              id: 'agy' as const,
              available: false,
              reason: 'disabled',
              missingKey: false,
              models: [],
            },
            { id: 'ollama' as const, available: false, missingKey: false, models: [] },
          ],
        }),
        generate: async (req: { project: string; count: number; generationId: string }) => {
          const key = `image:${req.project}`;
          const files = Array.from(
            { length: req.count },
            (_, i) => `${req.generationId}-${i + 1}.png`,
          );
          const added = Object.fromEntries(files.map((file) => [file, 'png']));
          mediaFiles = { ...mediaFiles, [key]: { ...(mediaFiles[key] ?? {}), ...added } };
          return { ok: true as const, value: { files } };
        },
        cancel: async () => ({ ok: true as const }),
        onProgress: unsubscribe,
      },
      // Phase 99 Theme E — Import "picks" two files, lands them as variants
      // with sidecars, and appends one session to project.json.
      audio: {
        providers: async () => ({
          providers: [
            { id: 'musicgen' as const, available: true, generates: true },
            { id: 'import' as const, available: true, generates: false },
          ],
        }),
        // Local generation: lands `count` placeholder wavs as one `create` session.
        generate: async (req: {
          project: string;
          importId: string;
          prompt: { title: string; count: number };
        }) => {
          const key = `audio:${req.project}`;
          const sessionId = `sess-${req.importId}`;
          const files = Array.from(
            { length: req.prompt.count },
            (_, i) => `${req.importId}-${i + 1}.wav`,
          );
          const current = { ...(mediaFiles[key] ?? {}) };
          const history = (() => {
            try {
              return JSON.parse(current['project.json'] ?? '') as {
                version: 1;
                sessions: unknown[];
              };
            } catch {
              return { version: 1 as const, sessions: [] as unknown[] };
            }
          })();
          for (const file of files) {
            current[file] = 'wav';
            current[file.replace(/\.wav$/, '.json')] = JSON.stringify({
              version: 1,
              file,
              sessionId,
              provider: 'musicgen',
              title: req.prompt.title || file,
              createdAt: '2026-09-30T12:00:00.000Z',
            });
          }
          current['project.json'] = JSON.stringify({
            version: 1,
            sessions: [
              ...history.sessions,
              {
                id: sessionId,
                kind: 'create',
                provider: 'musicgen',
                prompt: req.prompt,
                variants: files,
                createdAt: '2026-09-30T12:00:00.000Z',
              },
            ],
          });
          mediaFiles = { ...mediaFiles, [key]: current };
          return { ok: true as const, value: { sessionId, files } };
        },
        cancel: async () => ({ ok: true as const }),
        engine: async () => ({
          engine: data.media?.audioEngine ?? {
            musicgen: { state: 'ready' as const, downloadBytes: 0 },
            ollama: {
              running: true,
              models: ['llama3.2:3b'],
              model: 'llama3.2:3b',
              recommended: 'llama3.2:3b',
            },
          },
        }),
        installEngine: async () => ({ ok: true as const }),
        onEngineProgress: unsubscribe,
        expand: async (req: { title: string; style: string[] }) => ({
          ok: true as const,
          value: {
            musicPrompt: `${req.style.join(', ') || 'ambient'}, warm analog synths, 90 bpm`,
            sections: ['soft intro', 'full groove'],
            model: 'llama3.2:3b',
          },
        }),
        import: async (req: { project: string; importId: string; prompt: { title: string } }) => {
          const key = `audio:${req.project}`;
          const sessionId = `sess-${req.importId}`;
          const files = [1, 2].map((i) => `${req.importId}-${i}.mp3`);
          const current = { ...(mediaFiles[key] ?? {}) };
          const history = (() => {
            try {
              return JSON.parse(current['project.json'] ?? '') as {
                version: 1;
                sessions: unknown[];
              };
            } catch {
              return { version: 1 as const, sessions: [] as unknown[] };
            }
          })();
          for (const file of files) {
            current[file] = 'mp3';
            current[file.replace(/\.mp3$/, '.json')] = JSON.stringify({
              version: 1,
              file,
              sessionId,
              provider: 'import',
              title: req.prompt.title || file,
              createdAt: '2026-09-30T12:00:00.000Z',
            });
          }
          current['project.json'] = JSON.stringify({
            version: 1,
            sessions: [
              ...history.sessions,
              {
                id: sessionId,
                kind: 'import',
                provider: 'import',
                prompt: req.prompt,
                variants: files,
                createdAt: '2026-09-30T12:00:00.000Z',
              },
            ],
          });
          mediaFiles = { ...mediaFiles, [key]: current };
          return { ok: true as const, value: { sessionId, files } };
        },
        onProgress: unsubscribe,
      },
      model: {
        providers: async () => ({
          providers: data.media?.modelProviders ?? {
            ollama: {
              available: true,
              models: [
                { id: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b', vision: false },
                { id: 'qwen2.5vl:7b', label: 'qwen2.5vl:7b', vision: true },
              ],
            },
          },
        }),
        generate: async (req: { project: string; generationId: string; prompt: string }) => {
          const key = `model:${req.project}`;
          const stem = `${req.generationId}`;
          const files = [`${stem}/${stem}.json`, `${stem}/${stem}.mtl`, `${stem}/${stem}.obj`, `${stem}/${stem}.fbx`, `${stem}/model.json`];
          mediaFiles = {
            ...mediaFiles,
            [key]: {
              ...(mediaFiles[key] ?? {}),
              ...Object.fromEntries(
                files.map((file) => [file, file.endsWith('.json') ? '{}' : 'x']),
              ),
            },
          };
          return { ok: true as const, value: { files, primary: `${stem}/${stem}.obj` } };
        },
        library: {
          list: async () => ({ ok: true as const, value: { tree: mockModelTree(mediaFiles) } }),
          migrate: async () => ({ ok: true as const, value: { migrated: 0, skipped: 0 } }),
          newGroup: async (req: { parent: string; name: string }) => {
            if (req.parent === '') mediaFiles = { ...mediaFiles, [`model:${req.name}`]: {} };
            return { ok: true as const, value: { path: req.parent ? `${req.parent}/${req.name}` : req.name } };
          },
          rename: async (req: { path: string; to: string }) => {
            const parent = req.path.split('/').slice(0, -1).join('/');
            const to = parent ? `${parent}/${req.to}` : req.to;
            mediaFiles = mockMoveModelPath(mediaFiles, req.path, to);
            return { ok: true as const, value: { path: to } };
          },
          move: async (req: { path: string; toGroup: string }) => {
            const base = req.path.split('/').pop() ?? req.path;
            const to = req.toGroup ? `${req.toGroup}/${base}` : base;
            mediaFiles = mockMoveModelPath(mediaFiles, req.path, to);
            return { ok: true as const, value: { path: to } };
          },
          delete: async (req: { path: string }) => {
            mediaFiles = mockMoveModelPath(mediaFiles, req.path, null);
            return { ok: true as const };
          },
          duplicate: async (req: { path: string }) => {
            const to = `${req.path} copy`;
            mediaFiles = mockMoveModelPath(mediaFiles, req.path, to, true);
            return { ok: true as const, value: { path: to } };
          },
        },
        cancel: async () => ({ ok: true as const }),
        export: async (req: { path: string; format: string }) => ({
          ok: true as const,
          value: { dest: `/tmp/${req.path.replace(/\.[^.]+$/, '')}.${req.format}` },
        }),
        saveEdit: async (req: { project: string; path: string; spec: unknown }) => {
          const key = `model:${req.project}`;
          const sidecarPath = req.path.replace(/\.[^.]+$/, '.json');
          let previous: Record<string, unknown> = {};
          try {
            previous = JSON.parse(mediaFiles[key]?.[sidecarPath] ?? '{}') as Record<
              string,
              unknown
            >;
          } catch {
            previous = {};
          }
          mediaFiles = {
            ...mediaFiles,
            [key]: {
              ...(mediaFiles[key] ?? {}),
              [sidecarPath]: JSON.stringify({ ...previous, spec: req.spec }),
            },
          };
          return { ok: true as const, value: { files: [sidecarPath] } };
        },
        sf3d: {
          status: async () => ({ ok: true as const, value: { ...sf3dState } }),
          consent: async (req: { licenceSha256: string }) => {
            sf3dState = { ...sf3dState, consent: { licenceSha256: req.licenceSha256, acceptedAt: '2026-10-04T12:00:00.000Z', revenueAcknowledged: true } };
            return { ok: true as const, value: { ...sf3dState } };
          },
          revokeConsent: async () => {
            sf3dState = { ...sf3dState, consent: null };
            return { ok: true as const, value: { ...sf3dState } };
          },
          install: async () => {
            const emit = (progress: Record<string, unknown>) => sf3dListeners.forEach((handler) => handler({ kind: 'install', progress }));
            const total = sf3dState.totalBytes;
            if (data.media?.sf3d?.hold) {
              sf3dState = { ...sf3dState, state: 'installing' };
              const fraction = data.media.sf3d.holdFraction ?? 0.42;
              emit({ phase: 'download', file: 'onnx/backbone_fp16.onnx', receivedBytes: Math.round(total * fraction), totalBytes: total, fraction });
              return new Promise((resolve) => {
                sf3dCancelHeld = () => {
                  sf3dState = { ...sf3dState, state: 'not-installed', bytesOnDisk: Math.round(total * fraction) };
                  emit({ phase: 'cancelled', receivedBytes: Math.round(total * fraction), totalBytes: total, fraction });
                  resolve({ ok: false as const, kind: 'error' as const, message: 'cancelled' });
                };
              });
            }
            emit({ phase: 'download', file: 'onnx/backbone_fp16.onnx', receivedBytes: total / 2, totalBytes: total, fraction: 0.5 });
            sf3dState = { ...sf3dState, state: 'installed', bytesOnDisk: total };
            emit({ phase: 'ready', receivedBytes: total, totalBytes: total, fraction: 1 });
            return { ok: true as const, value: { ...sf3dState } };
          },
          cancelInstall: async () => {
            sf3dCancelHeld?.();
            sf3dCancelHeld = null;
            return { ok: true as const };
          },
          uninstall: async () => {
            sf3dState = { ...sf3dState, state: 'not-installed', consent: null, bytesOnDisk: 0 };
            return { ok: true as const, value: { ...sf3dState } };
          },
          generate: async (req: { project: string; generationId: string; image: { name: string } }) => {
            const stem = req.image.name.replace(/\.[^.]+$/, '');
            const files = [`${stem}/${stem}.glb`, `${stem}/${stem}.ref.png`, `${stem}/model.json`];
            const key = `model:${req.project}`;
            mediaFiles = { ...mediaFiles, [key]: { ...(mediaFiles[key] ?? {}), ...Object.fromEntries(files.map((f) => [f, f.endsWith('.json') ? '{}' : 'x'])) } };
            return { ok: true as const, value: { files, primary: files[0]!, vertices: 3000, triangles: 1000 } };
          },
          cancelGenerate: async () => ({ ok: true as const }),
          onProgress: (handler: (event: unknown) => void) => {
            sf3dListeners.add(handler);
            return () => sf3dListeners.delete(handler);
          },
        },
        onProgress: (handler: (event: unknown) => void) => {
          modelEvents.progress.add(handler);
          return () => modelEvents.progress.delete(handler);
        },
        // Specs fire these through `window.__mockModelEvents` to stand in for an agent editing a model.
        onChanged: (handler: (event: unknown) => void) => {
          modelEvents.changed.add(handler);
          return () => modelEvents.changed.delete(handler);
        },
        onOpen: (handler: (event: unknown) => void) => {
          modelEvents.open.add(handler);
          return () => modelEvents.open.delete(handler);
        },
      },
      terrain: (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a loose stand-in for the spec JSON
        type Spec = Record<string, any>;
        const readSpec = (group: string, terrain: string): Spec | null => {
          const raw = mediaFiles[`terrain:${group}`]?.[`${terrain}/terrain.json`];
          return raw ? (JSON.parse(raw) as Spec) : null;
        };
        const writeSpec = (group: string, terrain: string, spec: Spec) => {
          const key = `terrain:${group}`;
          mediaFiles = { ...mediaFiles, [key]: { ...(mediaFiles[key] ?? {}), [`${terrain}/terrain.json`]: JSON.stringify(spec) } };
        };
        const missing = { ok: false as const, kind: 'error' as const, message: 'Terrain not found.' };
        const defaults = {
          version: 1, name: 'Terrain', inputs: {}, resolution: 513, worldSize: 1024, heightRange: [0, 200], preSmooth: 0,
          alignment: { roads: 'satellite' }, textureSize: 2048,
          // Phase 105 G + H: the schema's own defaults, inlined (this file is serialised into the page).
          foliage: { seed: 1, treeDensity: 4, grassDensity: 30, slopeLimitDeg: 35, scale: [0.8, 1.3], margin: 2 },
          buildings: { seed: 1, height: [4, 18], scaleByArea: true, minAreaM2: 20, snapToleranceDeg: 12, flattenBlendM: 3 },
          roads: { tolerance: 0.25, widthScale: 1, widthClampM: [2, 30], blendM: 6, maxCutFillM: 4, spurMinM: 8 },
        };
        const stats = data.media?.terrain?.stats ?? {
          resolution: 513, worldSize: 1024, vertexCount: 263169, triangleCount: 524288, chunkCount: 64, lodCount: 4,
          buildMs: 420, minHeight: 0, maxHeight: 200, histogram: new Array(16).fill(100), warnings: [],
        };
        const listeners = { progress: new Set<(e: unknown) => void>(), changed: new Set<(e: unknown) => void>(), open: new Set<(e: unknown) => void>() };
        return {
          library: async (req: Spec) => {
            if (req.op === 'create') {
              const project = req.project ?? 'terrains';
              const terrain = `${String(req.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-20261004-120000`;
              writeSpec(project, terrain, { ...defaults, name: req.name });
              return { ok: true as const, value: { project, terrain } };
            }
            const spec = readSpec(req.project, req.terrain);
            if (!spec) return missing;
            if (req.op === 'delete') {
              const key = `terrain:${req.project}`;
              const { [`${req.terrain}/terrain.json`]: _gone, ...rest } = mediaFiles[key] ?? {};
              mediaFiles = { ...mediaFiles, [key]: rest };
              return { ok: true as const, value: {} };
            }
            const terrain = req.op === 'rename' ? `${String(req.to).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-20261004-120000` : `${req.terrain}-copy`;
            writeSpec(req.project, terrain, { ...spec, name: req.op === 'rename' ? req.to : `${spec.name} copy` });
            if (req.op === 'rename') {
              const key = `terrain:${req.project}`;
              const { [`${req.terrain}/terrain.json`]: _gone, ...rest } = mediaFiles[key] ?? {};
              mediaFiles = { ...mediaFiles, [key]: rest };
            }
            return { ok: true as const, value: { project: req.project, terrain } };
          },
          get: async (req: Spec) => {
            const spec = readSpec(req.project, req.terrain);
            return spec ? { ok: true as const, value: { spec: { ...defaults, ...spec }, built: Boolean(spec.lastBuild) } } : missing;
          },
          setSpec: async (req: Spec) => {
            const spec = readSpec(req.project, req.terrain);
            if (!spec) return missing;
            const next = { ...defaults, ...spec, ...req.patch };
            writeSpec(req.project, req.terrain, next);
            return { ok: true as const, value: { spec: next } };
          },
          setInput: async (req: Spec) => {
            const spec = readSpec(req.project, req.terrain);
            if (!spec) return missing;
            if (req.remove) {
              const { [req.slot]: _gone, ...inputs } = spec.inputs ?? {};
              writeSpec(req.project, req.terrain, { ...spec, inputs });
              return { ok: true as const, value: { warnings: [] } };
            }
            const input = { file: `inputs/${req.slot}.png`, sourceName: req.name ?? 'generated.png', width: 512, height: 512, bitDepth: 16 };
            writeSpec(req.project, req.terrain, { ...spec, inputs: { ...(spec.inputs ?? {}), [req.slot]: input } });
            return { ok: true as const, value: { input, warnings: [] } };
          },
          build: async (req: Spec) => {
            const spec = readSpec(req.project, req.terrain);
            if (!spec) return missing;
            if (!spec.inputs?.heightmap && !spec.noise) return { ok: true as const, value: { status: 'needs-height-source' as const } };
            writeSpec(req.project, req.terrain, { ...spec, lastBuild: { at: '2026-10-04T12:00:00.000Z', buildMs: 420, stats } });
            return { ok: true as const, value: { status: 'built' as const, stats } };
          },
          cancel: async () => ({ ok: true as const }),
          paint: async () => ({ ok: false as const, kind: 'error' as const, message: 'Terrain building is not available yet.' }),
          // A 1×1 black PNG: enough for the panel's preview <img> and the eyedropper round trip.
          roadKey: async (req: { pick?: [number, number]; colour?: string }) => ({
            ok: true as const,
            value: {
              pngBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==',
              colour: req.pick ? '#00fefe' : (req.colour ?? '#00ffff'),
              detected: '#00ffff',
            },
          }),
          export: async (req: { terrain: string; format: string; dest: string }) => ({ ok: true as const, value: { path: `${req.dest}/${req.terrain}.${req.format === 'glb' ? 'glb' : 'terrain'}`, bytes: 1024 } }),
          onProgress: (handler: (event: unknown) => void) => {
            listeners.progress.add(handler);
            return () => listeners.progress.delete(handler);
          },
          onChanged: (handler: (event: unknown) => void) => {
            listeners.changed.add(handler);
            return () => listeners.changed.delete(handler);
          },
          onOpen: (handler: (event: unknown) => void) => {
            listeners.open.add(handler);
            return () => listeners.open.delete(handler);
          },
        };
      })(),
      /** Maps (Phase 108): `map.json` per project under `files['map:<project>']`; tiles never load in the mock. */
      map: (() => {
        const defaults = { version: 1, view: { center: [18.4241, -33.9249], zoom: 10, bearing: 0, pitch: 0 }, basemap: 'streets', terrain3d: { on: false, exaggeration: 1.5 }, layerOrder: [], layerStyle: {} };
        let cacheCapMB = data.media?.map?.cacheCapMB ?? 1024;
        let cacheBytes = data.media?.map?.cacheBytes ?? 312 * 1024 * 1024;
        return {
          get: async (req: { project: string }) => {
            const raw = mediaFiles[`map:${req.project}`]?.['map.json'];
            return { ok: true as const, value: { map: raw ? { ...defaults, ...JSON.parse(raw) } : defaults } };
          },
          setView: async (req: { project: string; patch: Record<string, unknown> }) => {
            const key = `map:${req.project}`;
            const current = mediaFiles[key]?.['map.json'] ? JSON.parse(mediaFiles[key]!['map.json']!) : defaults;
            const next = { ...current, ...req.patch };
            mediaFiles = { ...mediaFiles, [key]: { ...(mediaFiles[key] ?? {}), 'map.json': JSON.stringify(next) } };
            return { ok: true as const, value: { map: next } };
          },
          sources: async () => ({
            sources: ['aws-terrarium', 'openfreemap', 'openfreemap-relief', 'eox-s2cloudless-2016', 'maptiler-satellite', 'maptiler-terrain-rgb', 'maptiler-streets'].map((id) =>
              id.startsWith('maptiler') && !data.media?.map?.keySet ? { id, available: false, reason: 'Add a MapTiler key in Settings ▸ Media.' } : { id, available: true },
            ),
          }),
          cache: async (req: { op: string; capMB?: number }) => {
            if (req.op === 'clear') cacheBytes = 0;
            if (req.op === 'set-cap' && req.capMB) cacheCapMB = req.capMB;
            return { ok: true as const, value: { bytes: cacheBytes, tiles: Math.round(cacheBytes / 20_000), capMB: cacheCapMB } };
          },
        };
      })(),
      sprite: (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a loose stand-in for the spec JSON
        type Spec = Record<string, any>;
        const slug = (text: string) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sprite';
        const groupOf = (spec: Spec) =>
          spec.kind === 'sheet' ? (spec.category === 'object' ? 'objects' : 'characters') : spec.kind === 'prop-sheet' ? 'objects' : ({ tileset: 'tilesets', background: 'backgrounds', map: 'maps' } as Record<string, string>)[spec.kind as string];
        const read = (group: string, asset: string): Spec | null => {
          const raw = mediaFiles[`sprite:${group}`]?.[`${asset}/sprite.json`];
          return raw ? (JSON.parse(raw) as Spec) : null;
        };
        const write = (group: string, asset: string, spec: Spec) => {
          const key = `sprite:${group}`;
          mediaFiles = { ...mediaFiles, [key]: { ...(mediaFiles[key] ?? {}), [`${asset}/sprite.json`]: JSON.stringify(spec) } };
        };
        const missing = { ok: false as const, kind: 'error' as const, message: 'Sprite not found.' };
        const listeners = { progress: new Set<(e: unknown) => void>(), changed: new Set<(e: unknown) => void>(), open: new Set<(e: unknown) => void>() };
        return {
          library: async (req: Spec) => {
            if (req.op === 'create') {
              const group = groupOf(req.spec);
              const asset = `${slug(req.spec.name)}-20261004-120000`;
              write(group as string, asset, { version: 1, ...req.spec });
              return { ok: true as const, value: { group, asset } };
            }
            const spec = read(req.group, req.asset);
            if (!spec) return missing;
            if (req.op === 'delete') {
              const key = `sprite:${req.group}`;
              const { [`${req.asset}/sprite.json`]: _gone, ...rest } = mediaFiles[key] ?? {};
              mediaFiles = { ...mediaFiles, [key]: rest };
              return { ok: true as const, value: {} };
            }
            const asset = req.op === 'rename' ? `${slug(req.to)}-20261004-120000` : `${req.asset}-copy`;
            write(req.group, asset, { ...spec, name: req.op === 'rename' ? req.to : `${spec.name} copy` });
            return { ok: true as const, value: { group: req.group, asset } };
          },
          get: async (req: Spec) => {
            const spec = read(req.group, req.asset);
            if (!spec) return missing;
            // The real service parses through the zod schema; the mock fills the defaults the UI reads.
            const filled: Spec = { prompt: '', style: 'pixel', ...(spec.kind === 'sheet' ? { category: 'character', targetPerspective: 'side', frameSize: [64, 64], directions: 1, anchor: { x: 0.5, y: 1 }, mirror: true, method: 'hand-drawn', clips: [] } : {}), ...(spec.kind === 'tileset' ? { projection: 'orthogonal', tileSize: 32, scheme: 'blob47', terrains: [{ id: 'grass', label: 'Grass', prompt: '', collision: 'walkable' }, { id: 'dirt', label: 'Dirt', prompt: '', collision: 'walkable' }], transitions: [{ a: 'grass', b: 'dirt' }], seed: 1 } : {}), ...(spec.kind === 'background' ? { size: [1920, 1080], layers: [{ name: 'sky', prompt: '', scrollFactor: 0 }, { name: 'far', prompt: '', scrollFactor: 0.2 }, { name: 'mid', prompt: '', scrollFactor: 0.5 }, { name: 'near', prompt: '', scrollFactor: 0.8 }] } : {}), ...(spec.kind === 'prop-sheet' ? { cell: [64, 64], props: [] } : {}), ...(spec.kind === 'map' ? { size: [40, 24], tileSize: 32 } : {}), ...spec };
            // A map's asset refs: the form sends bare folder names, which the schema's preprocess turns into refs.
            if (filled.kind === 'map' && typeof filled.tileset === 'string') filled.tileset = { group: 'tilesets', asset: filled.tileset };
            if (filled.kind === 'map' && filled.decorations && typeof filled.decorations.props === 'string') filled.decorations = { ...filled.decorations, props: { group: 'objects', asset: filled.decorations.props } };
            const framesRaw = mediaFiles[`sprite:${req.group}`]?.[`${req.asset}/frames/frames.json`];
            const frames = framesRaw ? { version: 1, referenceHeights: {}, ...(JSON.parse(framesRaw) as Spec) } : { version: 1, frames: {}, referenceHeights: {} };
            return { ok: true as const, value: { spec: filled, frames, report: filled.lastReport ?? null } };
          },
          setSpec: async (req: Spec) => {
            const spec = read(req.group, req.asset);
            if (!spec) return missing;
            const next = { ...spec, ...req.patch, kind: spec.kind };
            write(req.group, req.asset, next);
            return { ok: true as const, value: { spec: next } };
          },
          // Hand-drawn (Phase 106 Theme D): an attached image is unapproved until `approve` locks it.
          setReference: async (req: Spec) => {
            const spec = read(req.group, req.asset);
            if (!spec) return missing;
            if ('approve' in req) {
              if (spec.reference?.kind !== 'image') return { ok: false as const, kind: 'error' as const, message: 'Generate or attach a reference first.' };
              write(req.group, req.asset, { ...spec, reference: { ...spec.reference, approved: true } });
            } else if ('remove' in req) {
              const { reference: _gone, ...rest } = spec;
              write(req.group, req.asset, rest);
            } else if ('model' in req) {
              write(req.group, req.asset, { ...spec, reference: { kind: 'model', ...req.model } });
            } else if ('fromFrame' in req) {
              // One-shot's hand-off (Theme F): a frame becomes the approved reference.
              write(req.group, req.asset, { ...spec, reference: { kind: 'image', file: 'reference/reference.png', approved: true } });
            } else {
              write(req.group, req.asset, { ...spec, reference: { kind: 'image', file: 'reference/reference.png', approved: false } });
            }
            listeners.changed.forEach((h) => h({ repoId: req.repoId, group: req.group, asset: req.asset, revision: Date.now() }));
            return { ok: true as const };
          },
          generate: async (req: Spec) => {
            const current = read(req.group, req.asset);
            if (!current) return missing;
            if (req.turnaround) write(req.group, req.asset, { ...current, reference: { kind: 'image', file: 'reference/reference.png', approved: false } });
            // An environment job reports what it built (Themes H and I).
            if (current.kind === 'tileset' || current.kind === 'background' || current.kind === 'prop-sheet' || current.kind === 'map') {
              const size = (current.size as [number, number] | undefined) ?? [40, 24];
              const count = current.kind === 'tileset' ? 49 : current.kind === 'background' ? (current.layers as unknown[]).length : current.kind === 'map' ? size[0] * size[1] : (current.props as unknown[]).length;
              write(req.group, req.asset, { ...current, lastReport: { frames: count, failing: 0, at: '2026-10-07T10:00:00.000Z' } });
            }
            const jobId = `job-${Date.now()}`;
            for (const [step, done] of [[0, 1], [10, 2]] as const) {
              setTimeout(() => listeners.progress.forEach((h) => h({ jobId, done, total: 2, stage: 'generating' })), step);
            }
            return { ok: true as const, value: { jobId } };
          },
          cancel: async () => ({ ok: true as const }),
          // Frame-strip edits (Theme G): accepted as-is; a spec spies on the call to see the ops.
          patchFrames: async (req: Spec) => {
            const rerolls = (req.ops as Spec[]).some((op) => op.op === 'reroll');
            return { ok: true as const, value: rerolls ? { jobId: `job-${Date.now()}` } : {} };
          },
          export: async (req: Spec) => {
            const spec = read(req.group, req.asset);
            if (!spec) return missing;
            const suffix = ({ tileset: 'tileset', background: 'background', map: 'map' } as Record<string, string>)[spec.kind as string] ?? 'sprite';
            const path = req.dest ? `${req.dest}/${slug(spec.name)}.${suffix}` : `${req.asset}/export`;
            return { ok: true as const, value: { path, bytes: 2048, frames: 8, pages: 1, warnings: [] } };
          },
          onProgress: (handler: (event: unknown) => void) => {
            listeners.progress.add(handler);
            return () => listeners.progress.delete(handler);
          },
          onChanged: (handler: (event: unknown) => void) => {
            listeners.changed.add(handler);
            return () => listeners.changed.delete(handler);
          },
          onOpen: (handler: (event: unknown) => void) => {
            listeners.open.add(handler);
            return () => listeners.open.delete(handler);
          },
          // Theme J: the dialog is never shown; the import lands a map asset named `imported`.
          importMap: async (req: Spec) => {
            const asset = 'imported-20261004-120000';
            write('maps', asset, { version: 1, kind: 'map', name: 'imported', imported: true, lastReport: { frames: 4, failing: 0, at: '2026-10-07T10:00:00.000Z' } });
            listeners.changed.forEach((h) => h({ repoId: req.repoId, group: 'maps', asset, revision: Date.now() }));
            return { ok: true as const, value: { group: 'maps', asset } };
          },
          // Rendered from 3D (Theme E): main never asks the mock window to render.
          onRenderRequest: () => () => undefined,
          renderReady: async () => ({ ok: true as const }),
          renderFrames: async () => ({ ok: true as const }),
        };
      })(),
      reveal: async () => ({ ok: true as const }),
      ffmpegStatus: async () => ({
        ffmpeg: data.media?.ffmpeg ?? {
          found: true as const,
          path: '/opt/homebrew/bin/ffmpeg',
          version: '7.1',
        },
      }),
      export: async () => ({ ok: true as const, value: { dest: '/tmp/export.out' } }),
      cancelExport: async () => ({ ok: true as const }),
      onChanged: unsubscribe,
      onExportProgress: unsubscribe,
      doc: {
        edit: async (req: { selection?: string; markdown: string; prompt: string }) => ({
          ok: true as const,
          value: {
            replacement: `${(req.selection ?? req.markdown).trim()}\n\n_Edited: ${req.prompt}_\n`,
          },
        }),
        export: async (req: { name: string; format: string }) => ({
          ok: true as const,
          value: { dest: `/tmp/${req.name}.${req.format}` },
        }),
      },
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
        dir.push({
          name,
          kind: req.kind === 'directory' ? 'dir' : 'file',
          size: 0,
          isIgnored: false,
        });
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
        // `entry` is provably present — `index` just matched a real element —
        // but `noUncheckedIndexedAccess` types a `.splice()` destructure as
        // possibly-`undefined` anyway, and spreading that union would make
        // every field of the pushed entry silently optional. Narrow first.
        if (!entry) return { ok: false, message: 'not found' };
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
      search: async () =>
        data.fsSearchResult ?? { ok: true as const, matches: [], truncated: false },
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
      listRepoSkills: async () => ({ ok: true, value: { skills: data.repoSkills ?? [] } }),
      installUserSkills: async () =>
        data.scaffoldInstallUserSkillsResult ?? {
          ok: true,
          value: {
            copied: [
              'midnite-address-issue',
              'midnite-ideate',
              'midnite-create',
              'midnite-create-adhoc',
              'midnite-swarm',
              'midnite-git-cleanup',
              'midnite-git-report',
              'midnite-refine',
              'midnite-triage',
            ],
            targetDir: '~/.claude/skills',
          },
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
    // Present but off: the renderer only marks when the preload says the
    // MSTUDIO_PERF flag was set, and an e2e run never sets it.
    perf: { enabled: false, mark: () => {} },
    // Crash reporting (Phase 65) — `error` is fire-and-forget per the
    // bridge contract, the other three are invokes the Monitor & Diagnostics
    // settings page reads on mount. No fixture drives these: a spec that
    // needs a real log path/bundle should seed `data` and read it here.
    report: {
      error: noop,
      logPath: async () => ({ path: null }),
      bundle: async () => ({ text: '' }),
      reveal: async () => ({ ok: true as const }),
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
    settings: {
      sync: (req: {
        autoFetchEnabled: boolean;
        autoFetchIntervalMs: number;
        appDiscardIdle?: Record<string, boolean>;
        browserDiscardMs?: number;
      }) => {
        settingsSyncCalls.push(req);
      },
    },
    sync: {
      onStatus: (handler: (e: SyncStatusEvent) => void) => {
        syncStatusHandlers.push(handler as (e: unknown) => void);
        return () =>
          syncStatusHandlers.splice(syncStatusHandlers.indexOf(handler as (e: unknown) => void), 1);
      },
    },
    window: {
      minimize: noop,
      toggleMaximize: noop,
      close: noop,
      getState: async () => ({ maximized: false, fullScreen: false, focused: true }),
      onStateChange: unsubscribe,
      reload: noop,
      // Phase 55: no spec here exercises multi-window detach/dock, so the
      // mock reports a single always-docked main window — the pre-Phase-55
      // shape every existing spec already assumes.
      detach: noop,
      dock: noop,
      focusRole: (req: { role: string }) => {
        focusRoleCalls.push(req);
      },
      list: async () => [
        { id: 1, role: 'main' as const, repoId: null },
        ...(data.openPopoutRoles ?? []).map((role, index) => ({
          id: index + 2,
          role,
          repoId: null,
        })),
      ],
      onWindowsChanged: unsubscribe,
      // Theme E: no spec here exercises a second real window either, so a
      // relay send is a no-op and nothing ever answers `onRelayed`.
      relay: noop,
      onRelayed: unsubscribe,
      // Phase 84 Theme D.1: no spec here asserts on main's window registry
      // learning a repoId, so reporting one is a no-op — same shape as
      // `relay` above.
      reportRepo: noop,
    },
    cli: {
      status: async () => ({ installed: false, path: null, target: null, managed: false }),
      install: async () => ({
        ok: true,
        value: {
          installed: true,
          path: '/usr/local/bin/midnite',
          target: '/usr/local/bin/midnite',
          managed: true,
        },
      }),
      uninstall: async () => ({
        ok: true,
        value: { installed: false, path: null, target: null, managed: false },
      }),
    },
    update: {
      check: noop,
      download: noop,
      restart: noop,
      setChannel: noop,
      onState: unsubscribe,
      releaseNotes: async (req: { version: string }) => ({
        version: req.version,
        notes: data.releaseNotesOverride ?? '### Added\n\n- A version pill in the rail.',
        error: null,
      }),
    },
    // Phase 98 Theme D: every catalogue id the fixture profile has — brew and git.
    setup: {
      probe: async (req: { ids: string[] }) => ({
        results: req.ids.map((id) => ({
          id,
          installed: id === 'homebrew' || id === 'git',
          version:
            id === 'git' ? 'git version 2.45.0' : id === 'homebrew' ? 'Homebrew 4.4.18' : null,
          path: id === 'git' ? '/usr/bin/git' : id === 'homebrew' ? '/opt/homebrew/bin/brew' : null,
        })),
      }),
    },
    // Phase 98 Themes F, I: the global git identity and installed RAM.
    gitIdentity: {
      get: async () => ({ ok: true, value: { name: 'Ada Lovelace', email: 'ada@example.com' } }),
      set: async (req: { name: string; email: string }) => ({ ok: true, value: req }),
    },
    systemMemory: async () => ({ totalBytes: 16 * 1024 ** 3 }),
    systemHealth: async () => ({
      git: { path: '/usr/bin/git', version: 'git version 2.45.0' },
      shell: '/bin/zsh',
      sshAgent: { running: true, keys: 1 },
      cli: { installed: false, path: null, target: null, managed: false },
      homebrew: { path: '/opt/homebrew/bin/brew', version: 'Homebrew 4.4.18' },
      node: { path: '/Users/bilo-ekko/.proto/bin/node', version: 'v22.12.0' },
      pnpm: { path: '/Users/bilo-ekko/.proto/shims/pnpm', version: '9.15.0' },
      moon: { path: '/Users/bilo-ekko/.proto/bin/moon', version: 'moon 2.3.4' },
    }),
    optimizer: {
      scan: async () => {
        const fixture = data.optimizer?.scanResult;
        const result = {
          totalBytes: 0,
          byCategory: {},
          byEcosystem: {},
          detectors: {},
          items: [],
          truncated: false,
          truncatedRoots: [],
          ...fixture,
        };
        // Real progress is the walker's own job in main; the mock fires
        // every registered handler once at 100% so the store's
        // scanning -> done transition (and its progress bar) still exercises
        // real code rather than a value nobody ever set.
        scanProgressHandlers.forEach((handler) => handler({ done: 1, total: 1 }));
        return { ok: true as const, value: result };
      },
      onScanProgress: (handler: (e: { done: number; total: number }) => void) => {
        scanProgressHandlers.push(handler);
        return () => {
          scanProgressHandlers = scanProgressHandlers.filter((h) => h !== handler);
        };
      },
      clean: async (req: { paths: string[] }) => {
        const items = data.optimizer?.scanResult?.items ?? [];
        const freedBytes = items
          .filter((item) => req.paths.includes(item.path))
          .reduce((sum, item) => sum + item.bytes, 0);
        return { ok: true as const, value: { freedBytes, skipped: [] } };
      },
      processes: async () => {
        const defaultMemory = {
          totalBytes: 16 * 1024 * 1024 * 1024,
          usedBytes: 12 * 1024 * 1024 * 1024,
          wiredBytes: 3 * 1024 * 1024 * 1024,
          activeBytes: 5 * 1024 * 1024 * 1024,
          compressedBytes: 2 * 1024 * 1024 * 1024,
          cachedBytes: 2 * 1024 * 1024 * 1024,
          freeBytes: 4 * 1024 * 1024 * 1024,
        };
        const mem = data.optimizer?.memory
          ? {
              ...defaultMemory,
              ...data.optimizer.memory,
              usedBytes:
                data.optimizer.memory.usedBytes ??
                data.optimizer.memory.totalBytes - data.optimizer.memory.freeBytes,
            }
          : defaultMemory;

        return {
          ok: true as const,
          value: {
            processes: optimizerProcesses,
            memory: mem,
            error: data.optimizer?.processesError ?? null,
          },
        };
      },
      kill: async (req: { pid: number; expectArgv?: string; force?: boolean }) => {
        const target = optimizerProcesses.find((p) => p.pid === req.pid);
        if (!target) {
          return { ok: false as const, message: `Process ${req.pid} not found` };
        }
        if (!target.ours) {
          return { ok: false as const, message: `Refusing to kill foreign process ${req.pid}` };
        }
        if (req.expectArgv && target.argv && req.expectArgv !== target.argv) {
          return { ok: false as const, message: `Process ${req.pid} has changed command` };
        }
        optimizerProcesses = optimizerProcesses.filter((p) => p.pid !== req.pid);
        return { ok: true as const };
      },
      gpu: async () => ({
        ok: true as const,
        value: data.optimizer?.gpu ?? { model: null, vramBytes: null, loadPercent: null },
      }),
      // Phase 73 — the system-wide cache registry's own methods, never
      // sharing a fixture or a handler with the repo-scoped ones above.
      systemCatalogue: async () => ({
        ok: true as const,
        value: data.optimizer?.systemCatalogue ?? [],
      }),
      systemScan: async () => {
        const fixture = data.optimizer?.systemScanResult;
        const result = {
          totalBytes: 0,
          approximate: false,
          byEcosystem: {},
          items: [],
          ...fixture,
        };
        // Real progress is the walker's own job in main; the mock fires
        // every registered handler once at 100%, mirroring `scan()` above.
        systemScanProgressHandlers.forEach((handler) => handler({ done: 1, total: 1 }));
        return { ok: true as const, value: result };
      },
      onSystemScanProgress: (handler: (e: { done: number; total: number }) => void) => {
        systemScanProgressHandlers.push(handler);
        return () => {
          systemScanProgressHandlers = systemScanProgressHandlers.filter((h) => h !== handler);
        };
      },
      systemClean: async (req: { entryIds: string[] }) => {
        const items = data.optimizer?.systemScanResult?.items ?? [];
        const freedBytes = items
          .filter((item) => req.entryIds.includes(item.entryId))
          .reduce((sum, item) => sum + item.bytes, 0);
        return { ok: true as const, value: { freedBytes, skipped: [] } };
      },
      systemReclaim: async (_req: { entryId: string }) => ({
        ok: true as const,
        value: { stdout: 'done', stderr: '', exitCode: 0 },
      }),
      // Phase 74 Theme D/E — mutable so a spec's "empty" click can zero the
      // count the very next "Check Trash" without re-seeding the fixture.
      trashSummary: async () => ({
        ok: true as const,
        value: trashFixture ?? {
          itemCount: 0,
          totalBytes: 0,
          oldestModifiedAt: null,
          volumeCount: 1,
          truncated: false,
        },
      }),
      emptyTrash: async () => {
        trashFixture = {
          itemCount: 0,
          totalBytes: 0,
          oldestModifiedAt: null,
          volumeCount: 1,
          truncated: false,
        };
        return { ok: true as const };
      },
    },
    protocol: {
      onDeepLink: unsubscribe,
    },
    /**
     * Phase 66 Theme H — the API Client's bridge namespace. Extended in
     * Phase 70 Theme E with environments (A), scripts (B) and the
     * collection runner (C) — every addition below follows the same rule
     * the Theme H header states: every method answers rather than being
     * absent.
     *
     * `apiCollections` seeds the tree; `apiCollectionsById` seeds what
     * `readCollection` hands back. A spec that only needs navigation can
     * leave both unset and get the "no collections" copy.
     *
     * `apiEnvironmentsState` is a mutable copy of `data.apiEnvironments` —
     * `saveEnvironment`/`deleteEnvironment` mutate it so a later
     * `listEnvironments` sees the change, mirroring `environment-io.ts`'s
     * own read-your-writes shape without a real file underneath it.
     * `apiEnvGitignoreWritten` mirrors `environment-io.ts`'s own
     * once-per-repo confirm gate (Theme A): the first secret-carrying save
     * in an unprotected fixture answers `needs-confirm`, exactly as the
     * real handler does, and only a `confirmed: true` resend (or a fixture
     * pre-seeded via `apiEnvGitignoreProtected`) writes anything.
     */
    apiClient: (() => {
      const apiEnvironmentsState: {
        id: string;
        fileName: string;
        environment: {
          id: string;
          name: string;
          values: { key: string; value?: string; type?: string; enabled?: boolean }[];
        };
      }[] = (data.apiEnvironments ?? []).map((entry) => ({
        ...entry,
        environment: {
          ...entry.environment,
          values: entry.environment.values.map((row) => ({ ...row })),
        },
      }));
      let apiEnvGitignoreWritten = data.apiEnvGitignoreProtected ?? false;

      const slugify = (name: string): string =>
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'environment';

      const uniqueSlug = (base: string, excludingId: string | null): string => {
        let candidate = base;
        let suffix = 2;
        while (
          apiEnvironmentsState.some(
            (entry) =>
              entry.id === `${candidate}.postman_environment.json` && entry.id !== excludingId,
          )
        ) {
          candidate = `${base}-${suffix}`;
          suffix += 1;
        }
        return candidate;
      };

      /** Collections whose scripts are already trusted on this machine —
       *  seeded from `data.apiTrustedCollections`, mutated by
       *  `setScriptTrust` exactly as `collection-trust.ts`'s marker file
       *  would be, and reset to the seed on every reload since this whole
       *  closure is rebuilt by `addInitScript` on each navigation (there is
       *  no real `.local.json` underneath a mocked bridge — see the
       *  consent-bar spec's own note on why that is the honest substitute). */
      const apiScriptTrust = new Set<string>(data.apiTrustedCollections ?? []);

      type ApiRunProgressHandler = (event: {
        runId: string;
        index: number;
        total: number;
        item: unknown;
      }) => void;
      type ApiRunDoneHandler = (event: { runId: string; summary: unknown }) => void;
      let apiRunProgressHandlers: ApiRunProgressHandler[] = [];
      let apiRunDoneHandlers: ApiRunDoneHandler[] = [];
      const apiRunCancelled = new Map<string, boolean>();

      return {
        listCollections: async () => ({
          ok: true as const,
          value: (data.apiCollections ?? []).slice(),
        }),
        readCollection: async (req: { collectionId: string }) => {
          const found = (data.apiCollections ?? []).find((c) => c.id === req.collectionId);
          return found
            ? { ok: true as const, value: found.collection }
            : {
                ok: false as const,
                kind: 'error' as const,
                message: `No collection ${req.collectionId}`,
              };
        },
        saveCollection: async () => ({ ok: true as const }),
        importCollection: async () => ({ ok: true as const, value: null }),
        deleteCollection: async () => ({ ok: true as const }),
        exportCollection: async () => ({ ok: true as const }),
        sendRequest: async () => ({
          ok: true as const,
          value: data.apiResponse ?? {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: '{"ok":true}',
            bodyIsJson: true,
            durationMs: 12,
            sizeBytes: 11,
            truncated: false,
            warnings: [],
          },
        }),
        cancelRequest: async () => ({ ok: true as const }),
        pickBinaryFile: async () => ({ ok: true as const, value: null }),

        // --- environments (Phase 70 Theme A) --------------------------------
        listEnvironments: async () => ({
          ok: true as const,
          value: apiEnvironmentsState.map((entry) => ({ ...entry })),
        }),
        readEnvironment: async (req: { environmentId: string }) => {
          const found = apiEnvironmentsState.find((entry) => entry.id === req.environmentId);
          return found
            ? { ok: true as const, value: found.environment }
            : {
                ok: false as const,
                kind: 'error' as const,
                message: `No environment ${req.environmentId}`,
              };
        },
        saveEnvironment: async (req: {
          repoId: string;
          environmentId: string | null;
          environment: {
            id: string;
            name: string;
            values: { key: string; value?: string; type?: string; enabled?: boolean }[];
          };
          confirmed?: boolean;
        }) => {
          const secretCount = req.environment.values.filter((row) => row.type === 'secret').length;
          if (secretCount > 0 && !apiEnvGitignoreWritten && !req.confirmed) {
            return {
              ok: true as const,
              value: {
                status: 'needs-confirm' as const,
                secretCount,
                gitignorePath: '.midnite/api/.gitignore',
              },
            };
          }
          if (secretCount > 0) apiEnvGitignoreWritten = true;

          const existing = req.environmentId
            ? apiEnvironmentsState.find((entry) => entry.id === req.environmentId)
            : undefined;
          const fileName = existing
            ? existing.id
            : `${uniqueSlug(slugify(req.environment.name), null)}.postman_environment.json`;
          const entry = {
            id: fileName,
            fileName,
            environment: {
              ...req.environment,
              values: req.environment.values.map((row) => ({ ...row })),
            },
          };
          if (existing) {
            const index = apiEnvironmentsState.indexOf(existing);
            apiEnvironmentsState[index] = entry;
          } else {
            apiEnvironmentsState.push(entry);
          }
          return { ok: true as const, value: { status: 'saved' as const, fileName } };
        },
        deleteEnvironment: async (req: { environmentId: string }) => {
          const index = apiEnvironmentsState.findIndex((entry) => entry.id === req.environmentId);
          if (index >= 0) apiEnvironmentsState.splice(index, 1);
          return { ok: true as const };
        },

        // --- scripts (Phase 70 Theme B) --------------------------------------
        //
        // A canned `ScriptRun` (`data.apiScriptRun`) rather than an actual
        // `node:vm` sandbox — the sandbox itself (every pinned `pm.*` method,
        // the five escape attempts, the timeout) is proven by
        // `script-runner.test.ts` under bare vitest, which is the honest
        // place for it: a mocked bridge cannot run real untrusted JS, and
        // faking that it does would prove nothing. What this DOES prove is
        // the UI's own reaction to each outcome — the pass/fail rows, the
        // error row, and the consent bar's three buttons — which is exactly
        // what a Playwright spec can check that a main-process vitest can't.
        runScript: async (req: { collectionId: string; runAnyway?: boolean }) => {
          const trusted = apiScriptTrust.has(req.collectionId);
          if (!trusted && !req.runAnyway) {
            return { ok: true as const, value: { status: 'needs-consent' as const } };
          }
          // `mutations` always present — even when a fixture's own
          // `apiScriptRun` omits it — because the store reads
          // `run.mutations.environment` unconditionally right after a
          // 'ran' outcome (Theme B's own environment-mutation refresh).
          const run = {
            results: [],
            logs: [],
            error: null,
            mutations: { environment: {}, collectionVariables: {} },
            ...data.apiScriptRun,
          };
          return { ok: true as const, value: { status: 'ran' as const, run } };
        },
        setScriptTrust: async (req: { collectionId: string; trusted: boolean }) => {
          if (req.trusted) apiScriptTrust.add(req.collectionId);
          else apiScriptTrust.delete(req.collectionId);
          return { ok: true as const };
        },

        // --- the collection runner (Phase 70 Theme C) ------------------------
        //
        // `data.apiRunItems` replays as a real `onRunProgress`/`onRunDone`
        // stream — one event per item, `data.apiRunItemDelayMs` apart — so a
        // spec can click Stop between two events exactly as it would against
        // the real IPC. Everything from `cancelledAtIndex` on is answered
        // `skipped`, which is the UI-level claim this item makes; the
        // finer in-flight-vs-skipped distinction `runner.test.ts` proves is
        // main-process behaviour this mock does not re-implement.
        runCollection: async (req: {
          runId: string;
          collectionId: string;
          runAnyway?: boolean;
        }) => {
          const trusted = apiScriptTrust.has(req.collectionId);
          if (!trusted && !req.runAnyway) {
            return { ok: true as const, value: { status: 'needs-consent' as const } };
          }
          const items = (data.apiRunItems ?? []).slice();
          const delayMs = data.apiRunItemDelayMs ?? 30;
          apiRunCancelled.set(req.runId, false);
          void (async () => {
            let cancelledAtIndex: number | null = null;
            for (let index = 0; index < items.length; index += 1) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              if (apiRunCancelled.get(req.runId) && cancelledAtIndex === null)
                cancelledAtIndex = index;
              const base = items[index]!;
              const item =
                cancelledAtIndex !== null
                  ? {
                      ...base,
                      status: 'skipped' as const,
                      response: null,
                      assertions: [],
                      error: null,
                      durationMs: 0,
                    }
                  : base;
              for (const handler of apiRunProgressHandlers) {
                handler({ runId: req.runId, index, total: items.length, item });
              }
            }
            const total = items.length;
            const skipped = cancelledAtIndex === null ? 0 : total - cancelledAtIndex;
            const completed = total - skipped;
            const settled = items.slice(0, completed);
            const passed = settled.filter((item) => item.status === 'passed').length;
            const failed = settled.filter(
              (item) => item.status === 'failed' || item.status === 'error',
            ).length;
            const summary = {
              runId: req.runId,
              total,
              completed,
              skipped,
              passed,
              failed,
              durationMs: total * delayMs,
              aborted: cancelledAtIndex !== null,
            };
            for (const handler of apiRunDoneHandlers) handler({ runId: req.runId, summary });
            apiRunCancelled.delete(req.runId);
          })();
          return { ok: true as const, value: { status: 'started' as const } };
        },
        cancelRun: async (req: { runId: string }) => {
          apiRunCancelled.set(req.runId, true);
          return { ok: true as const };
        },
        onRunProgress: (handler: ApiRunProgressHandler) => {
          apiRunProgressHandlers.push(handler);
          return () => {
            apiRunProgressHandlers = apiRunProgressHandlers.filter((h) => h !== handler);
          };
        },
        onRunDone: (handler: ApiRunDoneHandler) => {
          apiRunDoneHandlers.push(handler);
          return () => {
            apiRunDoneHandlers = apiRunDoneHandlers.filter((h) => h !== handler);
          };
        },

        // --- history (Phase 70 Theme D) ---------------------------------------
        listHistory: async () => ({ ok: true as const, value: (data.apiHistory ?? []).slice() }),
        clearHistory: async () => ({ ok: true as const }),
      };
    })(),
    db: {
      listConnections: async () => (data.dbConnections ?? []).slice(),
      saveConnection: async (req: { connection: { id: string; [key: string]: unknown } }) => ({
        ok: true,
        data: req.connection,
      }),
      deleteConnection: async () => ({ ok: true }),
      testConnection: async () => ({ ok: true }),
      getSchema: async (req: { connectionId: string }) => ({
        ok: true,
        data: {
          connectionId: req.connectionId,
          tables:
            data.dbSchemaByConnection?.[req.connectionId]?.tables ??
            data.dbSchemaByConnection?.['*']?.tables ??
            [],
        },
      }),
      // Phase 61 Theme J — a tiny in-memory SQL "engine" (`runMockDbSql`,
      // declared with the other stream plumbing below) rather than a dumb
      // echo: Theme H's inline-editing flow round-trips a staleness
      // re-`SELECT` and a real `UPDATE` through this exact channel
      // (`run-statement.ts`), and only a mock that actually reads and
      // mutates `dbTables` can answer either one correctly.
      queryStart: async (req: {
        connectionId: string;
        requestId: string;
        sql: string;
        params?: unknown[];
      }) => {
        dbCancelledRequestIds.delete(req.requestId);
        setTimeout(() => {
          if (dbCancelledRequestIds.has(req.requestId)) return;
          const startedAt = Date.now();
          const result = runMockDbSql(req.sql, req.params);
          if (result.columns.length > 0 || result.rows.length > 0) {
            for (const handler of dbQueryBatchHandlers) {
              handler({ requestId: req.requestId, columns: result.columns, rows: result.rows });
            }
          }
          for (const handler of dbQueryDoneHandlers) {
            handler({
              requestId: req.requestId,
              rowCount: result.rowCount,
              truncated: false,
              durationMs: Math.max(1, Date.now() - startedAt),
              ...(result.error === undefined ? {} : { error: result.error }),
            });
          }
        }, 0);
      },
      queryCancel: async (req: { requestId: string }) => {
        dbCancelledRequestIds.add(req.requestId);
      },
      onQueryBatch: (
        handler: (e: { requestId: string; columns: string[]; rows: unknown[][] }) => void,
      ) => {
        dbQueryBatchHandlers.push(handler);
        return () => dbQueryBatchHandlers.splice(dbQueryBatchHandlers.indexOf(handler), 1);
      },
      onQueryDone: (
        handler: (e: {
          requestId: string;
          rowCount: number;
          truncated: boolean;
          durationMs: number;
          error?: string;
        }) => void,
      ) => {
        dbQueryDoneHandlers.push(handler);
        return () => dbQueryDoneHandlers.splice(dbQueryDoneHandlers.indexOf(handler), 1);
      },
    },
    /*
        The companion's three channels (Phase 79 Themes B, E).

        Present at all, which is the point: `features/companion/runtime.ts`
        reads `api.companion.snapshot(...)` on the first await of the greeting,
        so a mock without this namespace made that a TypeError — the greeting
        posted its first line and the machine stayed in `greeting` forever with
        the header reading "Saying hello…". The flow now guards itself against
        exactly that, but a harness that cannot answer a channel the real
        preload has is testing the guard rather than the feature.

        The digest is deliberately non-empty: `summariseDigest` says "nothing
        has landed" for an empty one, which is a true sentence about a fixture
        repo but tests none of the phrasing.
      */
    companion: {
      snapshot: async (req: { repoPath: string | null }) => ({
        repo:
          req.repoPath === null
            ? null
            : {
                id: 'repo-1',
                path: '/tmp/midnite-studio',
                name: 'midnite-studio',
                headRef: 'main',
                worktrees: [],
              },
        repos: 1,
        branch: req.repoPath === null ? null : 'main',
        ahead: 2,
        behind: 0,
        dirty: { staged: 1, unstaged: 3, untracked: 0 },
        sessions: { live: 0, thinking: 0, waiting: 0 },
        openPulls: 1,
        failingChecks: 0,
        passingChecks: 2,
      }),
      digest: async () => ({
        landed: [
          {
            kind: 'pr' as const,
            title: 'the browser occlusion fix',
            ref: '#265',
            // A `url`, because the overview turn hyperlinks the titles that
            // have one and a fixture with none tests only the plain branch.
            url: 'https://github.com/bilo-io/midnite-studio/pull/265',
            at: Date.now() - 86_400_000,
          },
        ],
        inProgress: [
          {
            kind: 'pr' as const,
            title: 'the companion panel',
            ref: '#270',
            url: 'https://github.com/bilo-io/midnite-studio/pull/270',
            at: Date.now() - 3_600_000,
          },
        ],
        since: Date.now() - 7 * 86_400_000,
      }),
      // No agent CLI in the harness, and the envelope is how that is said —
      // the companion falls back to typing the text verbatim into a session.
      ask: async () => ({
        ok: false as const,
        kind: 'error' as const,
        message: 'No agent CLI with a headless mode is installed.',
      }),
      // Phase 80 Theme C — no native voice engine in this harness either, so
      // `speaker.ts`'s `createCompanionSpeaker` falls back to the stubbed
      // `speechSynthesis` above on every utterance, same as a real machine
      // without the local engine. Present at all is what matters (same
      // reasoning as `snapshot`/`digest`/`ask` above): a mock missing this
      // namespace makes `createLocalSpeaker` throw calling it rather than
      // fall back, and the greeting hangs at "Saying hello…" forever.
      ttsSynthesize: async () => ({
        ok: false as const,
        kind: 'error' as const,
        message: 'No local voice engine in this harness.',
      }),
      // The cancel half of the same channel pair (Ad Hoc "TTS synthesis
      // blocks the UI"). Present for the reason the comment above gives, and
      // this one is load-bearing for *every* spec rather than only the voice
      // ones: `register-flow-ports.ts` calls the speaker's `cancel()` from a
      // mount effect, so a mock missing this method throws in React's passive
      // mount phase and the app never renders at all.
      ttsCancel: () => {},
      /*
          Theme F's speech-in half, backed by `sttConfigured` above so the
          real Settings ▸ Companion save flow (`sttSet` then `sttStatus`)
          behaves like the real vault instead of a fixed answer. `configured`
          starts empty — no *cloud* provider configured, matching a fresh
          install — but `whisper-local` needs none: it's `implemented` with
          its model already `'ready'`, so `micAvailable()` resolves `true` out
          of the box (Ad Hoc: the microphone must work with no API key) rather
          than the pre-Ad-Hoc "no-key" reason this harness used to hand back.
          A spec wanting the *disabled* mic photographs the one real way that
          still happens now — the local engine's own native module missing,
          with nothing else configured — by monkeypatching this method after
          `goto`, the same way the TTS status shots do for `ttsStatus`.
        */
      sttStatus: async () => ({
        configured: [...sttConfigured],
        encryptionAvailable: true,
        implemented: ['whisper-local', 'openai-whisper'],
        localModel: { state: 'ready' as const, reason: null, message: null },
      }),
      sttSet: async (req: { providerId: string; key: string }) => {
        if (req.key.trim().length === 0) {
          sttConfigured.delete(req.providerId);
        } else {
          sttConfigured.add(req.providerId);
        }
        return { ok: true as const };
      },
      sttTest: async () => ({ ok: true as const, value: { ms: 120, text: '' } }),
      transcribe: async () => ({ ok: true as const, value: { text: '' } }),
      // The status sibling (Phase 80 Theme C follow-up): a harness has no
      // native module at all, which is exactly the `'native-module-missing'`
      // arm — matching `ttsSynthesize` above rather than inventing a fourth
      // state this bridge never actually reaches. A spec that wants to
      // photograph the other states (`downloading`, `ready`, a download
      // failure) monkeypatches this method with `page.evaluate` after
      // `goto`, the same way `companion-shots.spec.ts` patches
      // `window.speechSynthesis`.
      ttsStatus: async () => ({
        ok: true as const,
        value: {
          engine: 'system' as const,
          voice: 'failed' as const,
          reason: 'native-module-missing' as const,
          message: 'No local voice engine in this harness.',
        },
      }),
      // Ad Hoc "the local voice engine crashed" — Settings' "Reload local
      // engine" control. Same reasoning as `ttsStatus` above: no native
      // module in this harness, so a reload cannot leave it any more
      // ready than it started — answers with the same `'failed'` shape
      // rather than pretending the reload fixed anything. A spec wanting
      // to photograph a *successful* reload monkeypatches this the same
      // way `companion-shots.spec.ts` patches `ttsStatus`.
      ttsReload: async () => ({
        ok: true as const,
        value: {
          engine: 'system' as const,
          voice: 'failed' as const,
          reason: 'native-module-missing' as const,
          message: 'No local voice engine in this harness.',
        },
      }),
      // Phase 81 Theme F's one new pair. No spec here drives a real
      // main→renderer request (that round trip is main-only — this harness
      // has no main process behind it at all), so `onUiRequest` follows
      // `menu.onCommand`/`window.onWindowsChanged`'s own precedent: register
      // nothing, subscribe to nothing, never fire. Present at all is what
      // matters — `app.tsx`'s `useCompanionUiRequests()` calls this
      // unconditionally on mount, and a bridge missing the method entirely
      // would throw there rather than merely doing nothing.
      onUiRequest: unsubscribe,
      uiReply: noop,
    },
    mcp: {
      get: async () => ({
        enabled: mcpEnabled,
        running: mcpEnabled,
        socketPath: mcpEnabled
          ? '/Users/demo/Library/Application Support/Midnite Studio/mcp/1.0.0-abc12345.sock'
          : null,
        shimPath:
          '/Applications/Midnite Studio.app/Contents/Resources/app.asar.unpacked/mcp-shim.js',
        allowUi: mcpAllowUi,
        allowGateDecide: mcpAllowGateDecide,
        allowModels: mcpAllowModels,
        allowGames: mcpAllowGames,
        allowTerrains: mcpAllowTerrains,
        allowSprites: mcpAllowSprites,
      }),
      set: async (req: {
        enabled?: boolean;
        allowUi?: boolean;
        allowGateDecide?: boolean;
        allowModels?: boolean;
        allowGames?: boolean;
        allowTerrains?: boolean;
        allowSprites?: boolean;
      }) => {
        if (req.enabled !== undefined) mcpEnabled = req.enabled;
        if (req.allowUi !== undefined) mcpAllowUi = req.allowUi;
        if (req.allowGateDecide !== undefined) mcpAllowGateDecide = req.allowGateDecide;
        if (req.allowModels !== undefined) mcpAllowModels = req.allowModels;
        if (req.allowGames !== undefined) mcpAllowGames = req.allowGames;
        if (req.allowTerrains !== undefined) mcpAllowTerrains = req.allowTerrains;
        if (req.allowSprites !== undefined) mcpAllowSprites = req.allowSprites;
        return {
          enabled: mcpEnabled,
          running: mcpEnabled,
          socketPath: mcpEnabled
            ? '/Users/demo/Library/Application Support/Midnite Studio/mcp/1.0.0-abc12345.sock'
            : null,
          shimPath:
            '/Applications/Midnite Studio.app/Contents/Resources/app.asar.unpacked/mcp-shim.js',
          allowUi: mcpAllowUi,
          allowGateDecide: mcpAllowGateDecide,
          allowModels: mcpAllowModels,
          allowGames: mcpAllowGames,
          allowTerrains: mcpAllowTerrains,
          allowSprites: mcpAllowSprites,
        };
      },
      calls: async () => ({
        calls: mcpEnabled
          ? [
              {
                at: Date.now() - 2_000,
                tool: 'status.get',
                repoPath: '/tmp/midnite-studio',
                ok: true,
                ms: 8,
              },
              {
                at: Date.now() - 9_000,
                tool: 'graph.log',
                repoPath: '/tmp/midnite-studio',
                ok: true,
                ms: 42,
              },
            ]
          : [],
      }),
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
    // Phase 55: every spec but `detached-panels-shots.spec.ts` leaves this
    // unset and runs as the main window.
    windowRole: data.windowRole ?? 'main',
  };

  (window as unknown as { midniteStudio: unknown }).midniteStudio = bridge;

  // Declared after use above because `var` hoisting is what makes the closure
  // in `log.start` legal; keeping them here groups the stream plumbing.
  // eslint-disable-next-line no-var
  var scanProgressHandlers: Array<(e: { done: number; total: number }) => void> = [];
  // eslint-disable-next-line no-var
  var systemScanProgressHandlers: Array<(e: { done: number; total: number }) => void> = [];
  // eslint-disable-next-line no-var
  var batchHandlers: Array<(e: unknown) => void> = [];
  // eslint-disable-next-line no-var
  var doneHandlers: Array<(e: unknown) => void> = [];
  // eslint-disable-next-line no-var
  var searchBatchHandlers: Array<(e: unknown) => void> = [];
  // eslint-disable-next-line no-var
  var searchDoneHandlers: Array<(e: unknown) => void> = [];
  // requestIds passed to `search.cancel`, in call order — read back via
  // `__mstudioSearchCancels` so a spec can assert a second query cancelled
  // the first (`e2e/search-view.spec.ts`).
  // eslint-disable-next-line no-var
  var searchCancels: string[] = [];
  // `search.start`'s pending `setTimeout`s, keyed by requestId, so `cancel`
  // can actually stop a still-running one from ever firing its batch/done
  // handlers — not just record that it was asked to.
  // eslint-disable-next-line no-var
  var searchPendingTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  // --- Database query stream (Phase 61 Theme J) ---------------------------
  // eslint-disable-next-line no-var
  var dbQueryBatchHandlers: Array<
    (e: { requestId: string; columns: string[]; rows: unknown[][] }) => void
  > = [];
  // eslint-disable-next-line no-var
  var dbQueryDoneHandlers: Array<
    (e: {
      requestId: string;
      rowCount: number;
      truncated: boolean;
      durationMs: number;
      error?: string;
    }) => void
  > = [];
  // A `queryCancel` marks a requestId here; `queryStart`'s own `setTimeout`
  // checks it before emitting anything, mirroring the real
  // `stream-registry.ts` behaviour of a cancelled run producing no further
  // batches.
  // eslint-disable-next-line no-var
  var dbCancelledRequestIds = new Set<string>();
  // The mock's tiny in-memory "database" — one row-array per table name,
  // deep-copied from the fixture so mutating a row here (an `UPDATE`, or the
  // test's own `__mstudioDbWrite`) never rewrites `data.dbTableRows` itself.
  // eslint-disable-next-line no-var
  var dbTables = new Map<string, { columns: string[]; rows: Array<Record<string, unknown>> }>(
    Object.entries(data.dbTableRows ?? {}).map(([name, table]) => [
      name,
      { columns: [...table.columns], rows: table.rows.map((row) => ({ ...row })) },
    ]),
  );
  /**
   * A deliberately unsophisticated SQL "engine" — a shape-sniff, not a
   * parser, exactly like the real app's own `detectEditableTable` and
   * `sniffStatementKind` — that only has to answer the handful of statement
   * shapes this suite's own query tabs and `run-statement.ts` ever generate:
   * `SELECT * FROM <table>`, `SELECT <cols> FROM <table> WHERE <col> = ?`
   * (the staleness re-check), `UPDATE <table> SET <col> = ? WHERE <col> = ?`
   * (Theme H's generated, parameterised edit), and a bare `DELETE FROM
   * <table>` (the destructive-statement gate spec). Anything else against an
   * unknown table answers zero rows rather than throwing.
   */
  // eslint-disable-next-line no-var
  var runMockDbSql = (
    sql: string,
    params?: unknown[],
  ): { columns: string[]; rows: unknown[][]; rowCount: number; error?: string } => {
    const trimmed = sql.trim();
    const unquote = (raw: string) => raw.replace(/["`[\]]/g, '');

    if (/^UPDATE\b/i.test(trimmed)) {
      const tableName = unquote(/^UPDATE\s+"?`?\[?(\w+)/i.exec(trimmed)?.[1] ?? '');
      const table = dbTables.get(tableName);
      const setPart = /SET\s+(.+?)\s+WHERE/is.exec(trimmed)?.[1] ?? '';
      const setColumns = [
        ...setPart.matchAll(/"?`?\[?(\w+)\]?`?"?\s*=\s*(?:\$\d+|\?|@p\d+)/gi),
      ].map((m) => m[1] ?? '');
      const whereColumn = unquote(
        /WHERE\s+"?`?\[?(\w+)\]?`?"?\s*=\s*(?:\$\d+|\?|@p\d+)/i.exec(trimmed)?.[1] ?? '',
      );
      if (!table || !whereColumn || !params || params.length === 0) {
        return { columns: [], rows: [], rowCount: 0 };
      }
      const whereValue = params[params.length - 1];
      const row = table.rows.find((r) => String(r[whereColumn]) === String(whereValue));
      if (!row) return { columns: [], rows: [], rowCount: 0 };
      setColumns.forEach((column, index) => {
        row[column] = params[index];
      });
      return { columns: [], rows: [], rowCount: 1 };
    }

    if (/^DELETE\b/i.test(trimmed)) {
      const tableName = unquote(/FROM\s+"?`?\[?(\w+)/i.exec(trimmed)?.[1] ?? '');
      const table = dbTables.get(tableName);
      if (!table) return { columns: [], rows: [], rowCount: 0 };
      const deleted = table.rows.length;
      table.rows = [];
      return { columns: [], rows: [], rowCount: deleted };
    }

    // SELECT
    const tableName = unquote(/FROM\s+"?`?\[?(\w+)/i.exec(trimmed)?.[1] ?? '');
    const table = dbTables.get(tableName);
    if (!table) return { columns: [], rows: [], rowCount: 0 };

    let selected = table.rows;
    const whereMatch = /WHERE\s+"?`?\[?(\w+)\]?`?"?\s*=\s*(?:\$\d+|\?|@p\d+)/i.exec(trimmed);
    if (whereMatch && params && params.length > 0) {
      const whereColumn = unquote(whereMatch[1] ?? '');
      const whereValue = params[0];
      selected = table.rows.filter((r) => String(r[whereColumn]) === String(whereValue));
    }

    const selectListMatch = /^SELECT\s+(.+?)\s+FROM/is.exec(trimmed);
    const selectList = selectListMatch?.[1]?.trim();
    const columns =
      !selectList || selectList === '*'
        ? table.columns
        : selectList.split(',').map((c) => unquote(c.trim()).split('.').pop() ?? '');

    const rows = selected.map((r) => columns.map((c) => r[c] ?? null));
    return { columns, rows, rowCount: rows.length };
  };
  // eslint-disable-next-line no-var
  var optimizerProcesses = (data.optimizer?.processes ?? []).map((p) => ({
    ppid: p.ppid ?? 1,
    argv: p.argv ?? p.name,
    ...p,
  }));
  // Mutable so `emptyTrash()` can zero it for the next `trashSummary()`
  // call without a spec re-seeding the fixture (Phase 74 Theme D/E).
  // eslint-disable-next-line no-var
  var trashFixture = data.optimizer?.trash;
  // Off by default, matching the real app's own default (Decision 8) and
  // keeping the status-bar `McpIndicator` out of every spec but the one that
  // asks for it — see `MockFixtures.mcp`'s own doc comment for why an
  // always-on default broke two unrelated specs.
  // eslint-disable-next-line no-var
  var mcpEnabled = data.mcp?.enabled ?? false;
  // Phase 81 Theme F's second switch — off by default like the master one,
  // and independent of it (a spec that wants both on passes both fixture
  // fields).
  // eslint-disable-next-line no-var
  var mcpAllowUi = data.mcp?.allowUi ?? false;
  // Phase 97 Theme D's third switch — same off-by-default, independent posture.
  // eslint-disable-next-line no-var
  var mcpAllowGateDecide = data.mcp?.allowGateDecide ?? false;
  // Phase 99 Theme G's fourth switch — same off-by-default posture.
  // eslint-disable-next-line no-var
  var mcpAllowModels = data.mcp?.allowModels ?? false;
  // Phase 107 Theme D's fifth switch — same off-by-default posture.
  // eslint-disable-next-line no-var
  var mcpAllowGames = data.mcp?.allowGames ?? false;
  // Phase 105 Theme J's sixth switch — same off-by-default posture.
  // eslint-disable-next-line no-var
  var mcpAllowTerrains = data.mcp?.allowTerrains ?? false;
  // eslint-disable-next-line no-var
  var mcpAllowSprites =data.mcp?.allowSprites ?? false;
  // Models tab agent events: handlers the bridge registered, fired by specs through `window.__mockModelEvents`.
  // eslint-disable-next-line no-var
  var modelEvents = {
    progress: new Set<(event: unknown) => void>(),
    changed: new Set<(event: unknown) => void>(),
    open: new Set<(event: unknown) => void>(),
  };
  (window as unknown as { __mockModelEvents: unknown }).__mockModelEvents = {
    progress: (event: unknown) => modelEvents.progress.forEach((handler) => handler(event)),
    changed: (event: unknown) => modelEvents.changed.forEach((handler) => handler(event)),
    open: (event: unknown) => modelEvents.open.forEach((handler) => handler(event)),
  };
  // Phase 103 Theme J: SF3D's install state machine, in memory. `hold` keeps an install running at
  // `holdFraction` until `cancelInstall` (what a screenshot of the progress needs).
  // eslint-disable-next-line no-var
  var sf3dState = {
    state: data.media?.sf3d?.state ?? 'not-installed',
    consent: data.media?.sf3d?.licenceSha256
      ? { licenceSha256: data.media.sf3d.licenceSha256, acceptedAt: '2026-10-04T12:00:00.000Z', revenueAcknowledged: true as const }
      : null,
    bytesOnDisk: data.media?.sf3d?.state === 'installed' ? 1_730_000_000 : 0,
    totalBytes: 1_730_000_000,
  } as { state: string; consent: { licenceSha256: string; acceptedAt: string; revenueAcknowledged: true } | null; bytesOnDisk: number; totalBytes: number };
  // eslint-disable-next-line no-var
  var sf3dListeners = new Set<(event: unknown) => void>();
  // eslint-disable-next-line no-var
  var sf3dCancelHeld: (() => void) | null = null;

  // Which STT providers a key has been "saved" for in this page's lifetime
  // (Theme F) — mutated by `sttSet`, read by `sttStatus`, so a spec can
  // drive the real Settings ▸ Companion save flow and see the mic button
  // react, exactly as `refreshMicAvailability` does against a real vault.
  // eslint-disable-next-line no-var
  var sttConfigured = new Set<string>();

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
  /** Read once from the fixture, then mutated by `create`/`updateMembers`/`remove` like `workflows`. */
  // eslint-disable-next-line no-var
  var councils: Array<{ id: string; [key: string]: unknown }> = data.councils ?? [];
  // eslint-disable-next-line no-var
  var councilRuns: Array<{ id: string; councilId: string; [key: string]: unknown }> = [];
  // eslint-disable-next-line no-var
  var councilRunCounter = 0;
  // --- games (Phase 107) ------------------------------------------------------
  // eslint-disable-next-line no-var
  var gamesPlaytests: GamePlaytestEntry[] = data.games?.playtests ?? [];
  // eslint-disable-next-line no-var
  var gamesList: Array<Record<string, unknown>> = (data.games?.list ?? []).map((g) => ({
    engine: 'phaser',
    dimension: '2d',
    starter: 'blank',
    dirty: false,
    valid: true,
    issue: null,
    ...g,
  }));
  // eslint-disable-next-line no-var
  var gamesSettings: Record<string, unknown> = {
    version: 1,
    gamesRoot: null,
    defaultEngine: 'phaser',
    defaultNetwork: 'off',
    squashRunCommits: false,
    ...(data.games?.settings ?? {}),
  };
  /** Every `games.run`/`stop`/`toolbar`/`setBounds`/`setVisible` call — the spec's assertion surface. */
  // eslint-disable-next-line no-var
  var gamesCalls: Array<Record<string, unknown>> = [];
  // eslint-disable-next-line no-var
  var gamesRunStateHandlers: Array<(event: unknown) => void> = [];
  // eslint-disable-next-line no-var
  var gamesConsoleHandlers: Array<(event: unknown) => void> = [];
  // eslint-disable-next-line no-var
  var gamesChangedHandlers: Array<(event: unknown) => void> = [];
  // eslint-disable-next-line no-var
  var gamesOpenHandlers: Array<(event: unknown) => void> = [];
  // eslint-disable-next-line no-var
  var gamesPopStateHandlers: Array<(event: unknown) => void> = [];
  // eslint-disable-next-line no-var
  var gamesAgentHandlers: Array<(event: unknown) => void> = [];
  /** The popped-out game (Theme B Pop out), seeded by `games.popped` and moved by `popOut`. */
  // eslint-disable-next-line no-var
  var gamesPopped: string | null = data.games?.popped ?? null;
  (window as unknown as { __mstudioMockGames: unknown }).__mstudioMockGames = {
    calls: gamesCalls,
    popState: (event: { gameId: string | null }) => {
      gamesPopped = event.gameId;
      gamesPopStateHandlers.forEach((h) => h(event));
    },
    runState: (event: unknown) => gamesRunStateHandlers.forEach((h) => h(event)),
    console: (event: unknown) => gamesConsoleHandlers.forEach((h) => h(event)),
    open: (event: unknown) => gamesOpenHandlers.forEach((h) => h(event)),
    agentProgress: (event: unknown) => gamesAgentHandlers.forEach((h) => h(event)),
  };
  // --- media (Phase 99 Theme A) ----------------------------------------------
  // eslint-disable-next-line no-var
  var mediaFiles: Record<string, Record<string, string>> = { ...(data.media?.files ?? {}) };
  // --- video (Phase 44) -----------------------------------------------------
  /** Read once from the fixture, then mutated by `project.create`/`project.remove` like `councils`. */
  // eslint-disable-next-line no-var
  var videoProjects: Array<{ id: string; [key: string]: unknown }> = data.video?.projects
    ? [...data.video.projects]
    : [];
  /** Keyed by project id, mutated by `studio.start`/`studio.stop`. */
  // eslint-disable-next-line no-var
  var videoStudioStatus: Record<string, { state: string; [key: string]: unknown }> = {
    ...(data.video?.studioStatus ?? {}),
  };
  // eslint-disable-next-line no-var
  var videoResolution: {
    root: string | null;
    source: string | null;
    setupTarget: string | null;
    engine?: string;
  } = data.video?.resolution ?? {
    root: data.video?.root ?? '/videos',
    source: 'global',
    setupTarget: '/repo/.midnite/media/video',
  };
  // eslint-disable-next-line no-var
  var videoRenders: Record<string, Array<{ id: string; [key: string]: unknown }>> = {
    ...(data.video?.renders ?? {}),
  };
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
  /** Phase 81 Theme B: every `window.focusRole` call, so a spec can assert
   *  a detached page/panel was brought forward rather than re-opened. */
  // eslint-disable-next-line no-var
  var focusRoleCalls: Array<{ role: string }> = [];

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
  var diagTrust: { state: string; command: unknown; trustedAt: number | null } = data.diagnostics
    ?.trust ?? { state: 'no-command', command: null, trustedAt: null };

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
  /*
      Closed-session history, newest last on the way in and reversed on read —
      the order `session-history-store.ts` actually keeps. Mutable because
      `sessions.purge` is only worth mocking if the row it deletes goes.
    */
  // eslint-disable-next-line no-var
  var closedSessions = [...(data.closedSessions ?? [])]
    .reverse()
    .map((r) => r as { id: string } & Record<string, unknown>);
  // Persist notes across page.reload() within one test context using sessionStorage.
  // On first load the fixture data is used; after a reload the saved array is
  // restored so that notes created during a test survive the reload.
  const MOCK_NOTES_KEY = 'mstudio-mock-notes';
  const _savedNotes = sessionStorage.getItem(MOCK_NOTES_KEY);
  // eslint-disable-next-line no-var
  var notes: Note[] = _savedNotes
    ? (JSON.parse(_savedNotes) as Note[])
    : [...((data.notes ?? []) as Note[])];
  const _persistMockNotes = () => sessionStorage.setItem(MOCK_NOTES_KEY, JSON.stringify(notes));
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
    data.fsFiles![key] = {
      ...entry,
      version: { mtimeMs: version.mtimeMs + 100, size: version.size },
    };
  };

  (window as unknown as { __mstudioOps: unknown }).__mstudioOps = opCalls;
  (window as unknown as { __mstudioSearchCancels: unknown }).__mstudioSearchCancels = searchCancels;
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
  (window as unknown as { __mstudioBrowserEvent: unknown }).__mstudioBrowserEvent = (
    event: unknown,
  ) => {
    for (const handler of [...browserEventHandlers]) handler(event);
  };
  (window as unknown as { __mstudioBrowserTabs: unknown }).__mstudioBrowserTabs = () => [
    ...browserTabIds,
  ];
  (window as unknown as { __mstudioBrowserVisibleCalls: unknown }).__mstudioBrowserVisibleCalls =
    () => [...browserVisibleCalls];
  (window as unknown as { __mstudioBrowserZoomCalls: unknown }).__mstudioBrowserZoomCalls = () => [
    ...browserZoomCalls,
  ];
  (window as unknown as { __mstudioBrowserStopCalls: unknown }).__mstudioBrowserStopCalls = () => [
    ...browserStopCalls,
  ];
  (
    window as unknown as { __mstudioBrowserKeepAwakeCalls: unknown }
  ).__mstudioBrowserKeepAwakeCalls = () => [...browserKeepAwakeCalls];
  (
    window as unknown as { __mstudioBrowserDiscardMsCalls: unknown }
  ).__mstudioBrowserDiscardMsCalls = () => [...browserDiscardMsCalls];
  (window as unknown as { __mstudioAppsEnableCalls: unknown }).__mstudioAppsEnableCalls = () => [
    ...appsEnableCalls,
  ];
  (window as unknown as { __mstudioAppsDisableCalls: unknown }).__mstudioAppsDisableCalls = () => [
    ...appsDisableCalls,
  ];
  (window as unknown as { __mstudioAppsActivateCalls: unknown }).__mstudioAppsActivateCalls =
    () => [...appsActivateCalls];
  (window as unknown as { __mstudioSettingsSyncCalls: unknown }).__mstudioSettingsSyncCalls =
    () => [...settingsSyncCalls];
  (window as unknown as { __mstudioEmitSyncStatus: unknown }).__mstudioEmitSyncStatus = (
    event: SyncStatusEvent,
  ) => {
    for (const handler of [...syncStatusHandlers]) handler(event);
  };
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
  (window as unknown as { __mstudioFocusRoleCalls: unknown }).__mstudioFocusRoleCalls =
    focusRoleCalls;
  (window as unknown as { __mstudioDiagRuns: unknown }).__mstudioDiagRuns = () => diagRuns;
  /*
      A hook for the scripted cadence change.

      The dashed gridline only appears once the sampling interval has actually
      changed mid-series, which no fixture written up front can produce: the
      store needs points that arrived BEFORE and AFTER the change. So the spec
      pushes the second half itself, at the wider spacing, through the same
      handler array the real stream uses.
    */
  (window as unknown as { __mstudioPushMetric: unknown }).__mstudioPushMetric = (
    sample: unknown,
  ) => {
    for (const handler of metricsHandlers) handler(sample);
  };
  /**
   * Manufactures a concurrent write against the mock's in-memory database —
   * Phase 61 Theme J's "staleness conflict" spec has no real second
   * connection to race, so it calls this directly (`page.evaluate`) between
   * a query tab's initial `SELECT` and its own edit's submit, mutating the
   * exact row Theme H's staleness re-`SELECT` will re-read. `match` finds
   * the row by an exact column/value pair (typically the primary key);
   * every key in `patch` is then written onto it.
   */
  (window as unknown as { __mstudioDbWrite: unknown }).__mstudioDbWrite = (
    table: string,
    match: Record<string, unknown>,
    patch: Record<string, unknown>,
  ) => {
    const rows = dbTables.get(table)?.rows;
    if (!rows) return;
    for (const row of rows) {
      if (Object.entries(match).every(([key, value]) => row[key] === value)) {
        Object.assign(row, patch);
      }
    }
  };

  /**
   * The `chats` namespace — an in-memory stand-in for `main/chats/`. Self-contained
   * for the same reason as `createMockMarkets` below: the whole function is
   * serialised into the page. It keeps the observable contract (a send answers at
   * once and the reply streams on `onEvent`; a decision updates hunk/file status
   * and the derived card status; cancel settles the message as cancelled) and
   * nothing of the real engine.
   */
  function createMockChats() {
    // Loosely typed on purpose: this is a stand-in for main, not the contract.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type MockMessage = Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type MockChat = Record<string, any>;
    const cfg = data.chats ?? {};
    const store = new Map<string, MockChat>(
      (cfg.seed ?? []).map((chat) => [chat['id'] as string, JSON.parse(JSON.stringify(chat)) as MockChat]),
    );
    const handlers: Array<(event: Record<string, unknown>) => void> = [];
    const emit = (event: Record<string, unknown>) => {
      for (const handler of [...handlers]) handler(event);
    };
    const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
    let seq = 0;
    const id = (prefix: string) => `${prefix}-${++seq}`;
    const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

    const fileStatus = (file: MockMessage): string => {
      if (file['conflict'] !== undefined) return 'conflict';
      const states: string[] = file['hunks'].length > 0 ? file['hunks'].map((h: MockMessage) => h['status']) : [file['fileStatus']];
      if (states.every((s) => s === 'pending')) return 'pending';
      if (states.every((s) => s === 'accepted')) return 'accepted';
      if (states.every((s) => s === 'rejected')) return 'rejected';
      return 'partial';
    };
    const setStatus = (set: MockMessage): void => {
      const files: MockMessage[] = set['files'];
      for (const file of files) file['status'] = fileStatus(file);
      set['status'] = files.some((f) => f['status'] === 'conflict')
        ? 'conflict'
        : files.every((f) => f['status'] === 'pending')
          ? 'pending'
          : files.every((f) => f['status'] === 'accepted')
            ? 'accepted'
            : files.every((f) => f['status'] === 'rejected')
              ? 'rejected'
              : 'partial';
    };
    const needsReview = (set: MockMessage): boolean =>
      set['files'].some(
        (f: MockMessage) =>
          f['status'] === 'conflict' ||
          (f['hunks'].length > 0 ? f['hunks'].some((h: MockMessage) => h['status'] === 'pending') : f['fileStatus'] === 'pending'),
      );

    const summary = (chat: MockChat) => {
      const messages: MockMessage[] = chat['messages'];
      const last = [...messages].reverse().find((m) => String(m['text']).trim().length > 0);
      return {
        id: chat['id'],
        title: chat['title'],
        engine: chat['engine'],
        model: chat['model'] ?? null,
        mode: chat['mode'],
        repoId: chat['repoId'] ?? null,
        repoName: chat['repoName'] ?? null,
        pinned: chat['pinned'] === true,
        createdAt: chat['createdAt'],
        updatedAt: chat['updatedAt'],
        messageCount: messages.length,
        preview: last ? String(last['text']).replace(/\s+/g, ' ').slice(0, 90) : '',
        running: messages.some((m) => m['status'] === 'streaming'),
        pendingChanges: messages.some((m) => m['changeSet'] && needsReview(m['changeSet'])),
        worktree: chat['worktree'] ?? null,
      };
    };

    const mockDiff = (path: string) => ({
      path,
      oldPath: null,
      change: 'modified',
      binary: false,
      oldMode: null,
      newMode: null,
      insertions: 3,
      deletions: 2,
      contextLines: 3,
      combined: false,
      truncated: false,
      droppedLines: 0,
      hunks: [
        {
          oldStart: 1,
          oldLines: 4,
          newStart: 1,
          newLines: 4,
          heading: '',
          lines: [
            { kind: 'ctx', oldNo: 1, newNo: 1, text: 'export function greet(name: string) {', ranges: [], noNewline: false },
            { kind: 'del', oldNo: 2, newNo: null, text: "  return 'Hello ' + name;", ranges: [], noNewline: false },
            { kind: 'add', oldNo: null, newNo: 2, text: '  return `Hello, ${name}!`;', ranges: [], noNewline: false },
            { kind: 'ctx', oldNo: 3, newNo: 3, text: '}', ranges: [], noNewline: false },
          ],
        },
        {
          oldStart: 20,
          oldLines: 4,
          newStart: 20,
          newLines: 5,
          heading: 'export function shout(name: string) {',
          lines: [
            { kind: 'ctx', oldNo: 20, newNo: 20, text: '  const text = greet(name);', ranges: [], noNewline: false },
            { kind: 'del', oldNo: 21, newNo: null, text: '  return text.toUpperCase();', ranges: [], noNewline: false },
            { kind: 'add', oldNo: null, newNo: 21, text: "  return text.toUpperCase() + '!';", ranges: [], noNewline: false },
            { kind: 'ctx', oldNo: 22, newNo: 22, text: '}', ranges: [], noNewline: false },
            { kind: 'add', oldNo: null, newNo: 23, text: "export const DEFAULT_NAME = 'world';", ranges: [], noNewline: false },
          ],
        },
      ],
    });

    const buildChangeSet = () => {
      const set: MockMessage = {
        id: id('cs'),
        createdAt: Date.now(),
        status: 'pending',
        files: [
          {
            path: 'src/greeting.ts',
            oldPath: null,
            change: 'modified',
            binary: false,
            insertions: 3,
            deletions: 2,
            preview: ["-  return 'Hello ' + name;", '+  return `Hello, ${name}!`;', '-  return text.toUpperCase();'],
            hunks: [
              { header: '@@ -1,4 +1,4 @@', insertions: 1, deletions: 1, status: 'pending' },
              { header: '@@ -20,4 +20,5 @@', insertions: 2, deletions: 1, status: 'pending' },
            ],
            fileStatus: 'pending',
            status: 'pending',
          },
          {
            path: 'src/config.ts',
            oldPath: null,
            change: 'added',
            binary: false,
            insertions: 2,
            deletions: 0,
            preview: ['+export const GREETING = true;', '+export const LOUD = false;'],
            hunks: [{ header: '@@ -0,0 +1,2 @@', insertions: 2, deletions: 0, status: 'pending' }],
            fileStatus: 'pending',
            status: 'pending',
          },
        ],
      };
      return set;
    };

    const err = (message: string) => ({ ok: false as const, kind: 'error' as const, message });

    return {
      list: async () => ({ chats: [...store.values()].map(summary).sort((a, b) => b.updatedAt - a.updatedAt) }),
      get: async (req: { id: string }) => {
        const chat = store.get(req.id);
        return chat ? { ok: true as const, value: { chat: clone(chat) } } : err('That chat no longer exists.');
      },
      create: async (req: { engine: string; model?: string | null; mode?: string; repoId?: string | null }) => {
        const at = Date.now();
        const chat: MockChat = {
          id: id('chat'),
          title: 'New chat',
          engine: req.engine,
          model: req.model ?? null,
          mode: req.mode ?? 'edit',
          repoId: req.repoId ?? null,
          repoName: req.repoId ? String(req.repoId).split('/').pop() : null,
          repoPath: req.repoId ? String(req.repoId).replace(/^repo:/, '') : null,
          pinned: false,
          createdAt: at,
          updatedAt: at,
          messages: [],
          session: null,
        };
        store.set(chat['id'], chat);
        emit({ kind: 'chat', chatId: chat['id'] });
        return { ok: true as const, value: { chat: clone(chat) } };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async (req: Record<string, any>) => {
        const chat = store.get(req['id']);
        if (!chat) return err('That chat no longer exists.');
        for (const key of ['title', 'pinned', 'engine', 'model', 'mode', 'repoId']) {
          if (req[key] !== undefined) chat[key] = req[key];
        }
        if (req['repoId'] !== undefined) {
          chat['repoName'] = req['repoId'] ? String(req['repoId']).split('/').pop() : null;
          chat['repoPath'] = req['repoId'] ? String(req['repoId']).replace(/^repo:/, '') : null;
        }
        emit({ kind: 'chat', chatId: chat['id'] });
        return { ok: true as const, value: { chat: clone(chat) } };
      },
      delete: async (req: { ids: string[] }) => {
        for (const chatId of req.ids) {
          for (const t of timers.get(chatId) ?? []) clearTimeout(t);
          store.delete(chatId);
          emit({ kind: 'removed', chatId });
        }
        return { ok: true as const };
      },
      send: async (req: { chatId: string; text?: string; attachments?: unknown[]; fromMessageId?: string }) => {
        if (cfg.sendError) return err(cfg.sendError);
        const chat = store.get(req.chatId);
        if (!chat) return err('That chat no longer exists.');
        let text = req.text;
        if (req.fromMessageId !== undefined) {
          const index = chat['messages'].findIndex((m: MockMessage) => m['id'] === req.fromMessageId);
          if (index < 0) return err('That message cannot be re-sent.');
          text = text ?? chat['messages'][index]['text'];
          chat['messages'].splice(index);
        }
        const body = (text ?? '').trim();
        if (!body) return err('Write a message first.');
        const at = Date.now();
        const user: MockMessage = { id: id('u'), role: 'user', text: body, createdAt: at, status: 'done', ...(req.attachments?.length ? { attachments: req.attachments } : {}) };
        const assistant: MockMessage = { id: id('a'), role: 'assistant', text: '', createdAt: at + 1, status: 'streaming', engine: chat['engine'], model: chat['model'] ?? null };
        if (chat['title'] === 'New chat') chat['title'] = (body.split('\n')[0] ?? '').slice(0, 48);
        chat['messages'].push(user, assistant);
        chat['updatedAt'] = at;
        emit({ kind: 'message', chatId: chat['id'], message: clone(user) });
        emit({ kind: 'message', chatId: chat['id'], message: clone(assistant) });
        emit({ kind: 'chat', chatId: chat['id'] });

        const reply = cfg.reply ?? 'Here is the answer.';
        const third = Math.ceil(reply.length / 3);
        const chunks = [reply.slice(0, third), reply.slice(third, third * 2), reply.slice(third * 2)].filter((c) => c.length > 0);
        const mine: ReturnType<typeof setTimeout>[] = [];
        timers.set(chat['id'], mine);
        chunks.forEach((chunk, i) => {
          mine.push(
            setTimeout(() => {
              assistant['text'] += chunk;
              emit({ kind: 'delta', chatId: chat['id'], messageId: assistant['id'], text: chunk });
            }, (cfg.chunkMs ?? 20) * (i + 1)),
          );
        });
        mine.push(
          setTimeout(() => {
            assistant['status'] = 'done';
            if (cfg.changes && chat['mode'] === 'edit') assistant['changeSet'] = buildChangeSet();
            chat['updatedAt'] = Date.now();
            emit({ kind: 'message', chatId: chat['id'], message: clone(assistant) });
            emit({ kind: 'chat', chatId: chat['id'] });
          }, (cfg.chunkMs ?? 20) * (chunks.length + 2)),
        );
        return { ok: true as const, value: { messageId: assistant['id'] } };
      },
      cancel: async (req: { chatId: string }) => {
        const chat = store.get(req.chatId);
        if (!chat) return { ok: true as const };
        for (const t of timers.get(req.chatId) ?? []) clearTimeout(t);
        const streaming = chat['messages'].find((m: MockMessage) => m['status'] === 'streaming');
        if (streaming) {
          streaming['status'] = 'cancelled';
          emit({ kind: 'message', chatId: chat['id'], message: clone(streaming) });
          emit({ kind: 'chat', chatId: chat['id'] });
        }
        return { ok: true as const };
      },
      changeDiffs: async (req: { chatId: string; changeSetId: string }) => {
        const chat = store.get(req.chatId);
        const set = chat?.['messages'].map((m: MockMessage) => m['changeSet']).find((s: MockMessage | undefined) => s?.['id'] === req.changeSetId);
        if (!set) return err('Those changes are no longer in the chat.');
        return {
          ok: true as const,
          value: {
            files: set['files'].map((f: MockMessage) => ({
              path: f['path'],
              diff: f['path'] === 'src/config.ts'
                ? {
                    ...mockDiff(f['path']),
                    change: 'added',
                    insertions: 2,
                    deletions: 0,
                    hunks: [
                      {
                        oldStart: 0,
                        oldLines: 0,
                        newStart: 1,
                        newLines: 2,
                        heading: '',
                        lines: [
                          { kind: 'add', oldNo: null, newNo: 1, text: 'export const GREETING = true;', ranges: [], noNewline: false },
                          { kind: 'add', oldNo: null, newNo: 2, text: 'export const LOUD = false;', ranges: [], noNewline: false },
                        ],
                      },
                    ],
                  }
                : mockDiff(f['path']),
            })),
          },
        };
      },
      resolveChanges: async (req: { chatId: string; changeSetId: string; decisions: Array<{ path: string; action: string; hunks?: number[] }> }) => {
        const chat = store.get(req.chatId);
        const message = chat?.['messages'].find((m: MockMessage) => m['changeSet']?.['id'] === req.changeSetId);
        if (!chat || !message) return err('Those changes are no longer in the chat.');
        const set: MockMessage = message['changeSet'];
        const conflicts: string[] = [];
        for (const decision of req.decisions) {
          const file = set['files'].find((f: MockMessage) => f['path'] === decision.path);
          if (!file) continue;
          if (decision.action === 'accept' && cfg.conflictOn === decision.path) {
            file['conflict'] = 'Your working tree changed since this edit was made, so it no longer applies.';
            conflicts.push(decision.path);
            continue;
          }
          delete file['conflict'];
          const target = decision.action === 'accept' ? 'accepted' : 'rejected';
          if (file['hunks'].length === 0) {
            if (file['fileStatus'] === 'pending') file['fileStatus'] = target;
          } else {
            file['hunks'].forEach((hunk: MockMessage, index: number) => {
              if (hunk['status'] === 'pending' && (!decision.hunks || decision.hunks.includes(index))) hunk['status'] = target;
            });
          }
        }
        setStatus(set);
        emit({ kind: 'message', chatId: chat['id'], message: clone(message) });
        if (conflicts.length > 0) return { ok: false as const, kind: 'conflict' as const, files: conflicts, op: 'change-apply' as const };
        return { ok: true as const, value: { changeSet: clone(set) } };
      },
      skills: async (_req: { engine: string; repoId?: string | null }) => ({
        ok: true as const,
        value: {
          skills: clone(
            cfg.skills ?? [
              { name: 'midnite-create', description: 'Pick unblocked themes, build them in a worktree, open a PR, drive CI green, merge.', scope: 'project' as const },
              { name: 'midnite-sitrep', description: 'Post the standing sitrep table for whatever is in flight.', scope: 'project' as const },
              { name: 'code-review', description: 'Review the current diff for correctness bugs.', scope: 'user' as const },
              { name: 'vercel:deploy', description: 'Deploy the current project to Vercel.', scope: 'plugin' as const },
            ],
          ),
        },
      }),
      files: async (_req: { repoId?: string | null; chatId?: string | null }) => ({
        ok: true as const,
        value: {
          files: clone(
            cfg.files ?? ['README.md', 'package.json', 'src/app.tsx', 'src/features/chats/chat-composer.tsx', 'src/features/chats/chat-pane.tsx'],
          ),
          truncated: false,
        },
      }),
      onEvent: (handler: (event: Record<string, unknown>) => void) => {
        handlers.push(handler);
        return () => {
          handlers.splice(handlers.indexOf(handler), 1);
        };
      },
    };
  }

  /**
   * The `markets` namespace. Self-contained on purpose — this whole function is
   * serialised into the page, so it can import nothing at runtime, and the
   * portfolio rules below are a deliberately small copy of the real ones (main
   * enforces those; the specs only need the same observable behaviour).
   */
  function createMockMarkets() {
    const cfg = data.markets ?? {};
    const rates: Record<string, number> = { USD: 1, EUR: 0.9, ZAR: 20, GBP: 0.8, JPY: 150 };
    const basePrice: Record<string, number> = {
      BTC: 60000,
      ETH: 3000,
      SOL: 150,
      AAPL: 200,
      MSFT: 400,
      NVDA: 120,
      TSLA: 250,
      SPY: 550,
    };
    const catalogue = [
      ['BTC', 'Bitcoin', 'crypto'],
      ['ETH', 'Ethereum', 'crypto'],
      ['SOL', 'Solana', 'crypto'],
      ['AAPL', 'Apple', 'stock'],
      ['MSFT', 'Microsoft', 'stock'],
      ['NVDA', 'NVIDIA', 'stock'],
      ['TSLA', 'Tesla', 'stock'],
      ['SPY', 'SPDR S&P 500 ETF', 'etf'],
    ] as const;
    let txCounter = 0;
    const portfolio = {
      version: 1 as const,
      balances: { ...(cfg.balances ?? { USD: 1000, EUR: 500, ZAR: 10000 }) } as Record<
        string,
        number
      >,
      holdings: (
        cfg.holdings ?? [
          { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto' as const, quantity: 0.5 },
          { symbol: 'AAPL', name: 'Apple', kind: 'stock' as const, quantity: 10 },
        ]
      ).map((h) => ({ ...h })),
      transactions: [] as Record<string, unknown>[],
      watchlist: [...(cfg.watchlist ?? ['BTC', 'ETH', 'AAPL'])],
      extraAssets: [] as { symbol: string; name: string; kind: 'crypto' | 'stock' | 'etf' }[],
    };

    const rng = (seed: number) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const hash = (text: string) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
    const spans: Record<string, number> = {
      '1D': 86400000,
      '1W': 7 * 86400000,
      '1M': 30 * 86400000,
      '3M': 90 * 86400000,
      '1Y': 365 * 86400000,
      '5Y': 5 * 365 * 86400000,
      ALL: 10 * 365 * 86400000,
    };
    const NOW = 1_800_000_000_000;
    const candles = (symbol: string, timescale: string) => {
      const next = rng(hash(symbol));
      const count = 60;
      const step = (spans[timescale] ?? spans['1M']!) / count;
      let price = (basePrice[symbol] ?? 100) * 0.9;
      return Array.from({ length: count }, (_, i) => {
        const open = price;
        price = Math.max(1, price * (1 + (next() - 0.45) * 0.03));
        return {
          t: NOW - (count - i) * step,
          o: open,
          h: Math.max(open, price) * 1.005,
          l: Math.min(open, price) * 0.995,
          c: price,
        };
      });
    };
    const priceOf = (symbol: string) => candles(symbol, '1D').at(-1)!.c;
    const fail = (message: string) => ({ ok: false as const, kind: 'error' as const, message });
    const cash = (usd: number, currency: string) => usd * (rates[currency] ?? 1);

    return {
      series: async (req: { assets: { symbol: string }[]; timescale: string }) => ({
        ok: true as const,
        value: {
          series: Object.fromEntries(
            req.assets.map((a) => [
              a.symbol,
              cfg.down
                ? {
                    candles: [],
                    fetchedAt: null,
                    stale: false,
                    source: null,
                    error: 'Provider down',
                  }
                : {
                    candles: candles(a.symbol, req.timescale),
                    fetchedAt: NOW,
                    stale: false,
                    source: 'Mock',
                  },
            ]),
          ),
        },
      }),
      quotes: async (req: { assets: { symbol: string }[] }) => ({
        ok: true as const,
        value: {
          quotes: Object.fromEntries(
            req.assets.map((a) => [
              a.symbol,
              cfg.down
                ? { price: null, t: null, stale: false, error: 'Provider down' }
                : { price: priceOf(a.symbol), t: NOW, stale: false },
            ]),
          ),
        },
      }),
      search: async (req: { query: string }) => ({
        ok: true as const,
        value: catalogue
          .filter(([symbol, name]) =>
            `${symbol} ${name}`.toLowerCase().includes(req.query.toLowerCase()),
          )
          .map(([symbol, name, kind]) => ({ symbol, name, kind })),
      }),
      rates: async () => ({
        ok: true as const,
        value: { base: 'USD' as const, rates, fetchedAt: NOW, stale: false },
      }),
      portfolio: async () => ({ ok: true as const, value: structuredClone(portfolio) }),
      apply: async (op: Record<string, unknown>) => {
        const currency = String(op.currency ?? 'USD');
        const kind = op.op as string;
        if (kind === 'addCard') {
          portfolio.balances[currency] ??= 0;
        } else if (kind === 'watch') {
          const asset = op.asset as {
            symbol: string;
            name: string;
            kind: 'crypto' | 'stock' | 'etf';
          };
          const has = portfolio.watchlist.includes(asset.symbol);
          if (op.watched && !has) portfolio.watchlist.push(asset.symbol);
          if (!op.watched && has)
            portfolio.watchlist = portfolio.watchlist.filter((s) => s !== asset.symbol);
        } else if (kind === 'deposit' || kind === 'withdraw') {
          const amount = Number(op.amount);
          const balance = portfolio.balances[currency] ?? 0;
          if (kind === 'withdraw' && amount > balance) return fail('Insufficient balance');
          portfolio.balances[currency] =
            Math.round((balance + (kind === 'deposit' ? amount : -amount)) * 100) / 100;
          portfolio.transactions.push({
            id: `mock-${++txCounter}`,
            ts: NOW,
            type: kind,
            currency,
            fiatAmount: amount,
            valueUsd: amount / (rates[currency] ?? 1),
          });
        } else if (kind === 'buy' || kind === 'sell') {
          const asset = op.asset as {
            symbol: string;
            name: string;
            kind: 'crypto' | 'stock' | 'etf';
          };
          const quantity = Number(op.quantity);
          const price = priceOf(asset.symbol);
          const fiat = cash(quantity * price, currency);
          const balance = portfolio.balances[currency] ?? 0;
          const held = portfolio.holdings.find((h) => h.symbol === asset.symbol);
          if (kind === 'buy') {
            if (fiat > balance) return fail(`Insufficient ${currency}`);
            portfolio.balances[currency] = balance - fiat;
            if (held) held.quantity += quantity;
            else portfolio.holdings.push({ ...asset, quantity });
          } else {
            if (!held || held.quantity < quantity) return fail('Not enough held');
            held.quantity -= quantity;
            portfolio.holdings = portfolio.holdings.filter((h) => h.quantity > 0);
            portfolio.balances[currency] = balance + fiat;
          }
          portfolio.transactions.push({
            id: `mock-${++txCounter}`,
            ts: NOW,
            type: kind,
            currency,
            fiatAmount: fiat,
            symbol: asset.symbol,
            assetName: asset.name,
            assetKind: asset.kind,
            quantity,
            priceUsd: price,
            valueUsd: quantity * price,
          });
        }
        return { ok: true as const, value: structuredClone(portfolio) };
      },
      news: async () => ({
        ok: true as const,
        value: {
          items: (cfg.news ?? []).map((item, i) => ({ id: `n${i}`, ...item })),
          stale: false,
          failed: [] as string[],
        },
      }),
    };
  }

  return bridge;
}

/**
 * Runs the same side effects as `installMockBridge`, in-process, for a jsdom
 * test that mounts a view directly rather than driving a real Chromium page.
 *
 * There is no page to serialise a script into under jsdom, so this calls
 * `pinPlatform`, `seedOnboardedProfile` and `buildMockBridge` exactly as
 * Playwright's three `addInitScript` calls do, in the same order — a jsdom
 * spec gets the identical starting state a Playwright spec gets.
 */
export function installMockBridgeJsdom(fixtures: MockFixtures): void {
  pinPlatform();

  if (!fixtures.firstRun) {
    seedOnboardedProfile();
  }

  (window as unknown as { midniteStudio: unknown }).midniteStudio = buildMockBridge(fixtures);
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
