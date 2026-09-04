# Phase 25 — Search everywhere, and the blame that explains it

**Refined: x1** · 2026-08-28 · UI/UX, visual design, accessibility, empty/loading/error states, data model & IPC, concurrency, edge cases, persistence, performance, testing, observability, security, sequencing, file-map, acceptance criteria, out-of-scope

Twenty-four phases in, Midnite Studio can stream a hundred thousand commits, highlight every diff in
the app with shiki, browse a repo's files in a preview pane and review a pull request without
leaving the window — and it cannot answer *when did this line get here*, or *which commit deleted
that function*. A grep across all four packages for `blame`, `pickaxe`, `log -S`, `--pickaxe` and
`--follow` returns **zero matches**. Not one. `buildLogArgs(options)` in
[`commands/log.ts`](../packages/git-engine/src/commands/log.ts) accepts exactly three keys —
`limit`, `all`, `revisions` — so the log stream that feeds the graph cannot be narrowed by author,
by message, by path, or by content, and there is no `commands/grep.ts` or `commands/blame.ts` for it
to fall back to. The two things the app calls "filters" today are not search: the ref filter in
[`ref-filter.tsx`](../packages/app/src/features/graph/ref-filter.tsx) becomes `revisions` on
`logStart` and re-streams, and the author filter in
[`author-filter.tsx`](../packages/app/src/features/graph/author-filter.tsx) is *dimming only*,
computed client-side from rows already loaded, because removing rows would break lane topology.
Neither can find anything that is not already on screen.

This phase gives the app the three searches git actually has — the pickaxe over history, `git grep`
over content at any revision, and `git blame` over a file — and one place to type them into. It is
the largest **read-only** phase in the repo: nothing here writes to a repository, nothing goes
through the write queue, and the destructive-op confirms of Phase 7 are not involved at any point.
What it does have to build is the thing three phases have worked around — a **cancellable, batched
read**. [`log-service.ts`](../packages/desktop/src/main/log-service.ts) holds a single
module-level `let active: ActiveStream | null` per window, and `execGit` has no cancellation
mechanism at all. A `git grep` over a large repository can emit millions of lines and the user must
be able to stop it, so the log service's private machinery gets lifted into something a second
consumer can use without stealing the graph's stream out from under it.

**Neither neighbour has landed, and this phase is written for that.** As of this refinement,
`services/palette/fuzzy-match.ts`, `commands/grep.ts`, `parsers/grep-parser.ts` and an
`mstudio:fs:search` channel **do not exist** — [Phase 23](phase-23-command-palette.md) and
[Phase 24](phase-24-writable-explorer.md) are both `◻ TODO` at 0%. So the **standalone path is the
primary reading of every item below**, not a fallback clause at the end of one: this phase writes
`commands/grep.ts` and `parsers/grep-parser.ts` whole, ships a Files mode that lists paths from its
own `git ls-files` call, and adds no palette source. Where an item would have been additive had a
neighbour landed first, it says so in a nested bullet marked *If Phase 23/24 has landed* — one
bullet, at the end of the item, and the executor takes it only if the file is actually on disk. Two
items are gated entirely and are marked `⏳ only if Phase 23 has landed`; they are excluded from
the phase's in-scope count.

That inverts what the doc said before refinement. The reason to say it this way round is that a
plan whose primary path is conditional makes an executor stop and check a dependency on every
second item, and the check has one answer today.

**Builds on.** Phase 1 (`LOG_FORMAT`, `parseLogRecord` and the NUL-delimited parsing rule),
Phase 5 (`spawnGit`, `chunkRecords` and the batched log stream this phase generalises), Phase 12
(the commit inspector a result row opens into), Phase 13 (`useResizable` and the persisted panel
widths a results/preview split needs), Phase 16 (the read-only `fs` contract, its path jail, the
preview pane, `getHighlighter()` and `languageForFile`), Phase 17 and 20 (the two copy-pasted text
filters this phase finally extracts), Phase 18 (`FooterCluster`, which the in-flight-search readout
mounts into), Phase 19 (the view-scoped nav shell a new rail view costs almost nothing in).
Optionally Phase 23 and Phase 24, as above — nothing blocks on either.

**Scope guardrails.** Every search is a **read**. No `write: true`, no `writeQueue`, no ref moves —
the most a result row may do is navigate. Long reads go through `spawnGit` with a real `cancel()`,
never through buffered `execGit`, because a search you cannot stop is a search that hangs the app;
the one exception is blame on a single file, which is bounded by the file. Results are **capped and
say so** — a truncated result set renders an explicit marker, never a silent cut, because a search
that quietly stops at 5000 hits teaches the user to trust an answer that is wrong. Parsers own their
format strings, as [`log-parser.ts`](../packages/git-engine/src/parsers/log-parser.ts) established,
and every one of them splits on `\x00`. And **user text never reaches git as a bare argv element**:
patterns go through `-e`, revisions sit immediately before `--`, pathspecs sit after it, and the
zod schema refuses a leading `-` on all three.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Landing order.** A → B → **D's first two items** → C → E → F. D is out of alphabetical order on
purpose: its `CodePreview` rework is the line structure that Theme C's *scroll to the hit's line* and
Theme E's find bar both consume, and building either against today's single-blob preview would be
work thrown away. Everything else in D can follow C.

## Deliverables

### A — Search in the engine (L)

The spine. B–F all read off these three commands, so it lands first, and it lands with integration
tests against `TempRepo` because the only honest way to pin a git output format is to make git emit
it.

- [x] Widen `buildLogArgs` in [`commands/log.ts`](../packages/git-engine/src/commands/log.ts) from
      `{ limit, all, revisions }` to also carry `grep`, `author`, `since`, `until`, `paths`,
      `pickaxeString` (`-S`), `pickaxeRegex` (`-G`), `regexp` and `ignoreCase`. Every new key is
      optional and the existing three-key call sites must produce byte-identical argv — assert that
      in a unit test before touching anything downstream, because this function feeds the graph.
  - **The order that makes byte-identity true**, since the function appends rather than sorts:
    the five base elements, then `--all`, then `-n<limit>` — both exactly where they are today —
    then the new flags, then `...revisions`, then `'--', ...paths` last. With none of the new keys
    set, nothing is inserted between the existing pushes and the output is unchanged.
  - Flag mapping, one per key, so there is nothing to infer: `grep` → `--grep=<v>`;
    `author` → `--author=<v>`; `since` → `--since=<v>`; `until` → `--until=<v>`;
    `pickaxeString` → `-S<v>`; `pickaxeRegex` → `-G<v>`; `regexp` → `--extended-regexp`;
    `ignoreCase` → `--regexp-ignore-case`.
  - `grep` and `author` are **repeatable**: type both as `readonly string[]`, emit one flag per
    element, and emit `--all-match` alongside when `grep.length > 1` — git ORs multiple `--grep`
    by default, and a two-term query the user typed as two terms means AND.
- [x] `--follow` support for path-scoped history, with its two real constraints written into the
      type rather than discovered later: git accepts `--follow` for **exactly one** pathspec, and it
      does not combine dependably with `--all`. Model it as `follow: true` being legal only when
      `paths.length === 1`, and have the arg builder drop `--all` when it is set.
  - The illegal combination throws — `buildLogArgs` raises
    `RangeError('--follow requires exactly one pathspec')` rather than silently emitting something
    git will misread. It is a pure function in git-engine, so throwing is testable and never
    crosses IPC; the boundary that stops it ever being reached is
    `SearchStartRequest`'s refine in Theme B.
- [x] `streamCommitSearch(repoPath, options, onBatch, batchSize)` in a new
      `packages/git-engine/src/commands/search.ts`, returning the existing `LogStream` shape
      (`{ done: Promise<{total, error?}>, cancel(): void }`) so B has one contract to serve. It is
      `streamLog` with a wider arg builder and a cap, and it reuses `LOG_FORMAT`, `chunkRecords`
      and `parseLogRecord` unchanged — a commit search result **is** a `GraphRow`'s commit half,
      and inventing a second commit shape here would fork the inspector.
  - The signature mirrors `streamLog`'s exactly, because B calls both through one code path:
    `streamCommitSearch(repoPath: string, options: CommitSearchOptions, onBatch: (commits: Commit[]) => void, batchSize = 500): LogStream`.
  - `export type CommitSearchOptions = LogOptions` — a type alias, not a second type. The widened
    `LogOptions` above already *is* the commit-search option set; a parallel type would be one more
    thing to keep in sync for no field of its own.
  - No cap logic lives here. The stream emits until git exits or `cancel()` is called; **the cap is
    Theme B's** (see the resolved decision). This is what keeps the engine free of a policy the
    renderer configures.
- [x] Write `packages/git-engine/src/parsers/grep-parser.ts` with **context lines** from the start.
      `parseGrep(payload)` handles `git grep -z -n -I --no-color` match lines; `-C<n>` adds
      context lines, which git separates differently from matches, so the parsed shape is
      `{ path, line, kind: 'match' | 'context', text }` with `kind` defaulting to `'match'`.
  - `export function parseGrep(payload: string): { hits: GrepHit[]; remainder: string }` — the
    same records-plus-remainder contract `chunkRecords` established, because `streamGrep` feeds it
    pipe chunks that end mid-record.
  - **The fixture is recorded, not invented.** Under `-z` the separator that distinguishes a match
    line from a context line is the one detail nobody remembers correctly. Generate
    `packages/git-engine/src/parsers/__fixtures__/grep-z-context.txt` by running
    `git grep -z -n -I --no-color -C1 -e <term>` against a `TempRepo` once, commit the bytes, and
    write the unit test against the file. A hand-typed fixture here pins the parser to a format
    guess.
  - *If Phase 24 has landed:* the file exists with a `{path, line, text}` shape and buffered call
    sites. Add `kind` with a `'match'` default and leave every call site untouched.
- [x] `streamGrep(repoPath, options, onBatch, batchSize)` alongside a buffered `readGrep` in a new
      `commands/grep.ts` — same argv builder, on
      `spawnGit` with a `cancel()`, emitting parsed hits in batches. The buffered version ships too,
      because an explorer panel does not need a stream and should not pay for one.
  - `export function buildGrepArgs(options: GrepOptions): string[]` is the single argv builder both
    callers use, and it emits, in this order:
    `['grep', '-z', '-n', '-I', '--no-color']`, then `-i` when `ignoreCase`, then `-E` when
    `regexp` (else `-F`), then `-w` when `wordMatch`, then `-C<n>` when `contextLines > 0`, then
    `'-e', pattern`, then `rev` when set, then `'--', ...paths`.
  - `-I` is not optional: without it a grep over a repo with binaries emits
    `Binary file … matches` lines the parser has no shape for, and the user cannot act on them.
  - `export type GrepOptions = { pattern: string; rev?: string; paths?: readonly string[]; ignoreCase: boolean; regexp: boolean; wordMatch: boolean; contextLines: number }`
    — every flag required rather than optional-with-a-default, so a call site cannot silently
    inherit a different default from the one the Settings page shows.
  - `batchSize` defaults to `BATCH_SIZE` (500) exported from Theme B's registry, so grep batches and
    log batches are the same size and there is one number to tune.
- [x] **Grep at any revision**, which is the one genuinely new git capability in this theme: `rev` is
      placed before the `--` pathspec separator. It is a change to argv order, not a new command —
      and it is what lets a content search answer a question about code that no longer exists.
  - Position is load-bearing and is asserted directly:
    `expect(buildGrepArgs({...opts, rev: 'v1.2.0', paths: ['src']}).slice(-4)).toEqual(['-e', 'foo', 'v1.2.0', '--'])`
    — a `rev` after `--` is read as a pathspec and returns nothing, silently.
- [x] `packages/git-engine/src/parsers/blame-parser.ts` for `git blame --porcelain`: the
      `<sha> <origLine> <finalLine> [<numLines>]` header, the key/value block that follows it, and
      the `\t`-prefixed content line. The format's defining trick is that a commit's metadata block
      appears **once** and later hunks from the same commit carry the header alone — so the parser
      keeps a commit table and the test that matters is a three-hunk file where the second and third
      hunks share a commit with the first.
  - `export function parseBlame(payload: string, relPath: string): BlameResult`. Porcelain is
    newline-oriented, not NUL-oriented — it is the one parser in this phase that does **not** split
    on `\x00`, and the exception is git's, not ours. Say so in the file's doc comment so the next
    reader does not "fix" it.
  - The uncommitted case is git's own and passes through untouched: a working-tree line blames to
    sha `0000000000000000000000000000000000000000` with summary `Not Committed Yet`. The parser
    does not special-case it; the gutter renders it as *Uncommitted* in Theme D.
- [x] `readBlame(worktreePath, { relPath, rev?, followRenames })` in a new
      `packages/git-engine/src/commands/blame.ts`. `followRenames` emits `-C -M`; it is off by
      default because it is materially slower on large files, and the setting in Theme F is what
      turns it on. Buffered `execGit` is correct here — blame is bounded by one file — and that is
      the deliberate exception to this phase's streaming rule.
  - Argv: `['blame', '--porcelain']`, then `-C -M` when `followRenames`, then `rev` when set,
    then `'--', relPath`. Same rev-before-`--` rule as grep, for the same reason.
  - A non-zero exit is a normal outcome, not a throw: a path git has never tracked exits 128 with
    `no such path … in HEAD`. Return `{ ok: false, message }` and let Theme B turn it into the
    `GitOpResult` the gutter renders as an error strip.
- [x] The porcelain `previous <sha> <filename>` field is parsed and kept, not dropped. It is the
      only thing that makes **reblame** possible in Theme D, and it also carries the pre-rename path,
      which is the answer whenever `-C -M` has actually done something.
  - It lands on the **line**, not on the commit table: `previous` differs per hunk when a file has
    been renamed more than once in its history, so hanging it off the commit would lose the second
    rename. `BlameLine.previous` is `{ sha: string; path: string } | null`.
- [x] `GrepHitSchema`, `BlameLineSchema`, `BlameCommitSchema` and `BlameResultSchema` in a new
      `shared/src/domain/search.ts` and
      `shared/src/domain/blame.ts`, exported through
      [`domain/index.ts`](../packages/shared/src/domain/index.ts). `BlameResult` carries the commit
      table once and lines reference it by sha — mirroring the porcelain format rather than
      flattening it, because a 5000-line file blamed to 40 commits should not send 5000 copies of an
      author name across the IPC boundary.
  - The fields, so there is nothing to invent:
    - `GrepHitSchema = z.object({ path: z.string(), line: z.number().int().positive(), kind: z.enum(['match', 'context']), text: z.string() })`
    - `BlameCommitSchema = z.object({ sha: z.string().length(40), authorName: z.string(), authorEmail: z.string(), authorTime: z.number().int(), summary: z.string() })`
    - `BlameLineSchema = z.object({ sha: z.string().length(40), finalLine: z.number().int().positive(), origLine: z.number().int().positive(), text: z.string(), previous: z.object({ sha: z.string().length(40), path: z.string() }).nullable() })`
    - `BlameResultSchema = z.object({ relPath: z.string(), rev: z.string().nullable(), commits: z.record(z.string(), BlameCommitSchema), lines: z.array(BlameLineSchema) })`
  - **There is no `SearchHitSchema`.** A commit hit is a `Commit` — the schema the graph, the
    inspector and the dashboard already share. The mode lives on the *batch*, not on each hit
    (Theme B), so a per-hit discriminator would be a tag repeated five thousand times to say
    something the envelope already said once.
- [x] Export the new commands and parsers from
      [`commands/index.ts`](../packages/git-engine/src/commands/index.ts) and
      [`parsers/index.ts`](../packages/git-engine/src/parsers/index.ts).
- [x] `grep-parser.test.ts` and `blame-parser.test.ts`, in the house style of
      [`status-parser.test.ts`](../packages/git-engine/src/parsers/status-parser.test.ts) with a
      local NUL-joining helper; plus `search.integration.test.ts`, `grep.integration.test.ts` and
      `blame.integration.test.ts` driving real git through
      [`TempRepo`](../packages/git-engine/src/testing/temp-repo.ts).
  - The edge cases the integration tests must actually contain, because each one is a real repo
    state a user will hit in week one: an **empty repo** (`log -S` exits 128, `readGrep` returns
    `[]` — neither is an error); **detached HEAD** (grep with no rev still reads the worktree);
    a **CRLF** file (hit `text` keeps the line without `\r`, so the renderer does not draw a
    control glyph); a path with **unicode and a space** (`src/café notes.md` survives `-z`
    round-trip); a **binary** file present in the tree (excluded by `-I`, and the run does not
    fail); and a **pattern beginning with `-`** (`-Wall`, which `-e` must make searchable).


### B — The stream registry, and the search contract (M)

The refactor half of this theme touches the working graph stream, so it lands as its own commit with
its own green gate before the search channels arrive on top of it.

- [x] Lift the private machinery of [`log-service.ts`](../packages/desktop/src/main/log-service.ts)
      into a new `packages/desktop/src/main/stream-registry.ts` — a `requestId`-keyed
      `Map<string, RegisteredStream>` scoped per `BrowserWindow`, with window-teardown cleanup.
      `BATCH_SIZE = 500` and the `requestId` tagging that lets the renderer drop late batches from a
      superseded stream both move with it.
  - The exported surface, in full:
    ```ts
    export const BATCH_SIZE = 500;
    export type StreamKind = 'log' | 'search';
    export type RegisteredStream = { requestId: string; kind: StreamKind; cancel(): void };
    export function register(win: BrowserWindow, stream: RegisteredStream): void;
    export function cancel(win: BrowserWindow, requestId: string): void;
    export function cancelKind(win: BrowserWindow, kind: StreamKind): void;
    export function cancelAll(win: BrowserWindow): void;
    export function countOf(win: BrowserWindow, kind: StreamKind): number;
    export function release(win: BrowserWindow, requestId: string): void;
    ```
  - Per-window scoping is a `WeakMap<BrowserWindow, Map<string, RegisteredStream>>`, so a closed
    window's map is collectable even if a `closed` handler is missed. `register` attaches a
    one-shot `win.once('closed', () => cancelAll(win))`.
  - `release` is how a *naturally finished* stream leaves the map without being cancelled. Without
    it the map grows for the life of the window and `countOf` climbs until every search is refused
    by the ceiling — the bug this API shape exists to make impossible to write.
- [x] The supersede policy is **a table in the registry module**, not a rule each caller re-states:
      ```ts
      export const POLICY: Record<StreamKind, 'supersede' | 'concurrent'> = {
        log: 'supersede',
        search: 'concurrent',
      };
      ```
      `register` reads it: on `'supersede'` it calls `cancelKind(win, stream.kind)` before inserting,
      on `'concurrent'` it inserts. A search must never cancel the graph's stream and vice versa, and
      that sentence is now one line of data a test can assert directly.
- [x] `log-service.ts` becomes a consumer and keeps its **single-active-log** semantics unchanged:
      `startLog` registers with `kind: 'log'`, and `POLICY.log === 'supersede'` is what supersedes the
      previous log. The module-level `let active` goes; `cancelLog(requestId?)` becomes
      `cancel(win, requestId)` / `cancelKind(win, 'log')`.
  - `logOptionsFor` **stays exported from `log-service.ts` and is not moved** — it is log-specific
    ref-filter logic with its own test, and commit search does not use it.
  - `startLog` still needs its own `active`-equivalent to hold the `LaneLayoutSession` and the
    running `total` across batches. Keep those in the closure the registry entry's `cancel` already
    captures rather than reintroducing a module-level variable.
- [x] `packages/desktop/src/main/search-service.ts` on the registry — `startCommitSearch`,
      `startGrep`, `cancelSearch(win, requestId?)`. Unlike log, **concurrent searches are allowed**
      (the Search view can run a commits query and a content query from one submit), so its policy is
      cancel-by-id — `cancelSearch` with no id calls `cancelKind(win, 'search')`.
- [x] **The result cap is enforced here**, in `search-service.ts`, and nowhere else. The service
      counts hits as it forwards them; on reaching `cap` it calls the stream's `cancel()`, sends
      `searchDone` with `truncated: true`, and forwards nothing further.
  - `cap` rides on the request (`SearchStartRequest.cap`, default 5000) rather than being a
    constant, because Theme F's Settings page configures it. `const CAP_DEFAULT = 5000` lives here
    and is the schema's `.default()`.
  - The count is of **forwarded hits**, not of hits parsed: a final batch that crosses the cap is
    truncated to the remaining allowance before being sent, so the renderer never has to decide
    which of the last 500 to draw.
  - This is deliberately *not* in git-engine (which stays policy-free) and *not* in the renderer
    (which cannot stop the child process). The service is the only layer that both knows the cap
    and holds the `cancel()`.
- [x] A **per-window ceiling of 4 concurrent searches**, so a held-down key cannot spawn processes
      without bound. `startCommitSearch` / `startGrep` check `countOf(win, 'search') >= SEARCH_CEILING`
      and refuse with `failure('Too many searches running — cancel one first.')` rather than queueing.
  - Four, because one submit can legitimately start two (commits + content) and a user who submits
    twice quickly should not be refused; a fifth means something is not cancelling and the refusal
    is the signal.
  - Refusing rather than queueing: a queued search runs against a query the user has already
    replaced, which is the exact confidently-wrong answer this phase is built to avoid.
- [x] **Repo switch and window teardown both cancel everything.** The renderer calls
      `search.cancel({ repoId })` with no `requestId` when `selectedRepoId` changes; main's
      `win.once('closed')` calls `cancelAll(win)`. A half-consumed grep of the repo you just left is
      the leak this phase is most likely to ship.
- [x] New channels in [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts) under the
      `mstudio:` namespace: `searchStart` (`mstudio:search:start`), `searchCancel` (`mstudio:search:cancel`),
      `blameRead` (`mstudio:blame:read`) as invokes, and `searchBatch` (`mstudio:search:batch`),
      `searchDone` (`mstudio:search:done`) in `EVENT_CHANNELS`. One `searchStart` carrying a
      discriminated `mode` rather than two near-identical channels, and the renderer routes on
      `requestId` exactly as [`graph-store.ts`](../packages/app/src/features/graph/graph-store.ts)
      already does.
- [x] The request/response schemas in [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts),
      extending the shared `RepoId` base like every other request:
  - `SearchStartRequest` is a discriminated union on `mode`, so a commits query cannot carry
    `contextLines` and a content query cannot carry `since`:
    - `{ mode: 'commits', repoId, requestId, cap, query: { grep?, author?, since?, until?, paths?, pickaxeString?, pickaxeRegex?, regexp, ignoreCase } }`
    - `{ mode: 'content', repoId, requestId, cap, query: { pattern, rev?, paths?, regexp, ignoreCase, wordMatch, contextLines } }`
  - **The argv-safety refine lives here**, and it is the boundary that makes Theme A's builders
    safe by construction: `pattern`, `rev`, every `paths` element, `grep`, `author`, `since` and
    `until` each carry
    `.refine((v) => !v.startsWith('-'), 'must not begin with "-"')`. A user who genuinely wants to
    find `-Wall` types it and the `-e` form in `buildGrepArgs` handles it — the refine exists to
    stop a *flag* being smuggled in, and `-e` is what makes the refine non-lossy.
  - `paths` additionally refines each element to reject `..` segments and absolute paths, matching
    the Phase 16 fs jail's posture: a pathspec is repo-relative or it is rejected.
  - `SearchStartResponse` is the house `GitOpResult` envelope — the ceiling refusal and an
    unparseable payload are the same kind of thing to the UI, and `handleOp` already produces it.
  - `SearchCancelRequest = RepoId.extend({ requestId: z.string().optional() })`.
  - `BlameReadRequest = RepoId.extend({ relPath, rev: z.string().optional(), followRenames: z.boolean(), worktreePath: z.string().optional() })`;
    `BlameReadResponse = z.union([z.object({ ok: z.literal(true), result: BlameResultSchema }), FailureSchema])`.
  - `SearchBatchEvent` is discriminated on `mode` and carries **homogeneous** hits:
    `{ requestId, mode: 'commits', commits: Commit[] }` | `{ requestId, mode: 'content', hits: GrepHit[] }`.
  - `SearchDoneEvent = { requestId, mode, total: number, truncated: boolean, error?: string }` —
    the same shape `LogDoneEvent` has, so the renderer's done-handling is one pattern.
- [x] `search` and `blame` groups on `MidniteStudioBridge` in
      [`ipc/bridge.ts`](../packages/shared/src/ipc/bridge.ts), with
      `search: { start, cancel, onBatch, onDone }` mirroring the `log` group exactly and
      `blame: { read }`.
- [x] `packages/desktop/src/main/ipc/search-handlers.ts` with `registerSearchHandlers(win)`, using
      `handleOp()` / `handle()` from [`ipc/handle.ts`](../packages/desktop/src/main/ipc/handle.ts) so
      an invalid payload resolves with a fallback rather than rejecting; registered in the
      `registerFooHandlers()` block in [`main/index.ts`](../packages/desktop/src/main/index.ts).
- [x] Wire both groups into the preload `Pick<MidniteStudioBridge, …>` in
      [`preload/index.ts`](../packages/desktop/src/preload/index.ts) — naming the groups there is
      what makes an unimplemented method a compile error rather than a runtime `undefined`.
- [x] A `search*` / `blame*` block in [`ipc.test.ts`](../packages/shared/src/ipc/ipc.test.ts). The
      existing coverage tests are exhaustive per channel-name prefix
      (`expect(channelKeys.sort()).toEqual(Object.keys(expected).sort())`, e.g. `ipc.test.ts:556`)
      and a new prefix is not covered by any of them, so this is a new block, not an added line. It
      must filter across **both** `CHANNELS` and `EVENT_CHANNELS`, as the metrics block at
      `ipc.test.ts:620` does, because two of the five channels are events.
- [x] `search` and `blame` on [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts), with
      `MockFixtures` gaining seedable hit lists and a blame table — every e2e spec breaks without it,
      and Theme C's spec is written against it.
  - The fixture keys, matching the `fsDirs` / `fsFiles` convention already in the file:
    `searchCommits: Record<string, Commit[]>` and `searchContent: Record<string, GrepHit[]>` keyed
    by the query string, and `blames: Record<string, BlameResult>` keyed by `relPath`.
  - `search.start` must **emit batches asynchronously** (a `queueMicrotask` per batch, and more than
    one batch when the seeded list exceeds `BATCH_SIZE`), or the spec that asserts "a second query
    cancels the first" passes vacuously against a bridge that resolves everything synchronously.
- [x] `stream-registry.test.ts`: two concurrent `'search'` registrations cancel independently,
      registering a second `'log'` cancels the first, registering a `'search'` does **not** cancel a
      live `'log'`, `cancelAll` empties the map on window teardown, `release` decrements `countOf`,
      and a cancelled stream's late batch is not forwarded.

### C — The Search view (L)

Depends on **D's first two items** for the *scroll to the hit's line* behaviour; everything else here
is independent of D.

- [x] `'search'` added to the `ViewId` union, `VIEW_IDS`, `pathForView` and `viewForPath` in
      [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts), plus every per-view `Record`
      keyed by `ViewId` in that file — the type errors are the checklist.
  - Position: immediately after `'files'` in **both** the union and `VIEW_IDS`, because `VIEW_IDS`
    is rail order and the two must agree.
  - `pathForView` is `` `/${view}` `` and `viewForPath` searches `VIEW_IDS`, so both are satisfied by
    the array edit alone — no third place to change.
- [x] `SEARCH` in `VIEW_ICON` in [`components/nav-icons.ts`](../packages/app/src/components/nav-icons.ts)
      (`LuSearch`, matching the file's `react-icons/lu` family) and an entry in `NAV_ITEMS` in
      [`app.tsx`](../packages/app/src/app.tsx):164, placed directly under Files since content search
      and the explorer answer adjacent questions. It is **not** added to `FORGE_GATED_VIEWS`
      ([`app.tsx`](../packages/app/src/app.tsx):185): search needs no `gh` and must stay reachable
      when the forge is absent.
- [x] `packages/app/src/features/search/search-view.tsx` rendered from the `activeView === …` chain
      in [`app.tsx`](../packages/app/src/app.tsx):690, replacing the `<Placeholder>` fallthrough for
      the new id.
- [x] `packages/app/src/features/search/search-store.ts` — **one** zustand store on the house
      `create<T>()(persist(…))` shape, with `partialize` keeping only the query shape and leaving
      results behind. Results are stream state and must not be rehydrated from disk on relaunch as
      though they were still true.
  - ```ts
    persist(…, {
      name: 'midnite-search',
      version: 1,
      partialize: (s): PersistedSearch => ({ mode: s.mode, flags: s.flags, lastQuery: s.lastQuery, rev: s.rev }),
    })
    ```
    with `PersistedSearch` declared as its own exported type and used as `partialize`'s return
    annotation — the same trick `ui-store.ts` uses so the persisted slice and its migration cannot
    drift.
  - One store rather than two: the query bar and the result list both need the mode and the
    in-flight `requestId`, and a split would make every consumer take two hooks to avoid a
    `partialize` the reader has to trust once.
  - `results`, `requestId`, `status` and `truncated` are plain fields outside `partialize`. A test
    asserts a rehydrate leaves `results` empty.
- [x] A query bar with mode tabs — **Commits · Content · Files** — where Files lists paths from a
      `git ls-files -z --exclude-standard` read of its own. Modifier toggles (regex, case, whole
      word) live beside the input; the commits mode adds author, path and date-range fields drawn
      with the existing `MultiSelectMenu` from
      [`components/multi-select-menu.tsx`](../packages/app/src/components/multi-select-menu.tsx),
      which already has a search box, an outside-click dismiss and the empty-means-everything
      convention.
  - Files mode is a substring match over the path list, **not** a fuzzy match, because the fuzzy
    matcher is Phase 23's and this phase does not build a second one. It reuses Theme E's exported
    `matchesTerms` so the Files tab and the repos panel agree on what a two-term query means.
  - *If Phase 23 has landed:* delete the local list and delegate to its file source, and swap
    `matchesTerms` for its `fuzzyMatch` in this mode only.
- [x] Debounced submit with **explicit cancellation of the in-flight `requestId`** on every new
      query. This is the single place this phase can leak processes, and it is worth writing the
      cancel first and the query second.
  - **250 ms**, matching nothing else in the app because nothing else in the app debounces a
    subprocess; the number is chosen so a fast typist starts one search per word, not one per
    letter, and it is a module constant `DEBOUNCE_MS` so the e2e spec can reason about it.
  - The order is not negotiable and is what the spec asserts: `cancel(previousRequestId)` →
    `crypto.randomUUID()` → `start(...)`. Cancelling after starting is how you reach the ceiling.
- [x] A **measured** virtualised results list on `useVirtualizer` from `@tanstack/react-virtual`,
      the house virtualiser, grouped by file for content hits and flat for commit hits. Content hit
      lines are highlighted through the existing `getHighlighter()` in
      [`lib/highlighter.ts`](../packages/app/src/lib/highlighter.ts) with the language resolved by
      `languageForFile` from [`lib/languages.ts`](../packages/app/src/lib/languages.ts) — grammars
      are already lazy-loaded per language, so this costs a call, not a bundle.
  - Measured rather than fixed-height, because a content hit renders its `contextLines` neighbours
    and a commit hit renders a subject that may wrap: `useVirtualizer({ count, getScrollElement,
    estimateSize: () => 22, overscan: 24, measureElement: (el) => el.getBoundingClientRect().height })`,
    with `ref={virtualizer.measureElement}` and `data-index` on every row. This is the **repo's
    first measured virtualizer** — [`graph-view.tsx`](../packages/app/src/features/graph/graph-view.tsx):169
    and [`diff-view.tsx`](../packages/app/src/features/diff/diff-view.tsx):137 are both fixed — so
    it gets its own note rather than being copied from either.
  - **The rule that keeps measurement stable under streaming appends:** the flattened row array is
    built **append-only**. A batch that introduces a new file appends that file's group header and
    then its hits; hits for a file already in the list append to the end of the array, *not* into
    that file's existing group. Inserting mid-array would shift every index below it and invalidate
    every cached measurement on every batch. The visual grouping the user sees is therefore
    "grouped in arrival order", which for `git grep` is path order anyway.
  - `overscan: 24` matches both existing virtualizers; `estimateSize: () => 22` is the pre-measure
    guess only — 22px is a monospace line at `text-xs leading-relaxed` plus its row padding.
- [x] Matched-range emphasis on each hit. Commit and content hits are literal or regex matches and
      their ranges come from the query, not from a fuzzy score: an exported
      `matchRanges(text: string, query: string, opts: { regexp: boolean; ignoreCase: boolean }): [number, number][]`
      in `features/search/match-ranges.ts`, rendered as `<mark>` spans.
  - `<mark>` is styled `bg-primary/25 text-foreground rounded-[2px]` and inherits nothing from the
    shiki token underneath it, so a match inside a comment is as legible as one inside a keyword —
    in both themes, since the token is `--primary` and not a hex.
  - An invalid user regex is caught **here** as well as by git: `matchRanges` wraps its `new RegExp`
    in a try and returns `[]` rather than throwing, so a half-typed pattern dims the highlighting
    instead of blanking the view while git is still deciding.
  - *If Phase 23 has landed:* the Files mode's ranges come from its `fuzzyMatch`'s `indices`
    instead. Two match models, one visual treatment.
- [x] A results/preview split on `useResizable` with its width persisted in the `layout` slice of
      [`ui-store.ts`](../packages/app/src/store/ui-store.ts), alongside `filesTreeWidth`. Selecting a
      content hit opens the file in the Phase 16 preview scrolled to the line; selecting a commit hit
      opens the Phase 12 inspector via `selectCommit(sha)`.
  - `searchResultsWidth: 420` in `LayoutSizes` and `DEFAULT_LAYOUT`, bounds
    `{ min: 280, max: 900 }` in `LAYOUT_BOUNDS`. **No `version` bump** — `migrate`
    ([`ui-store.ts`](../packages/app/src/store/ui-store.ts):717) already spreads `current.layout`
    before `saved.layout`, so a persisted v2 payload without the key takes the new default. The
    store stays at `version: 2`.
  - Scrolling to the line is `scrollPreviewToLine(container, line)` from Theme D — a
    `[data-line="N"]` query plus `scrollIntoView({ block: 'center' })`. It cannot be written before
    D's first two items land, because today's preview has no `data-line`.
- [x] The truncation marker: when the cap is hit, the list ends in an explicit row reading
      **“Stopped at {cap} results — narrow the query.”** with the cap's current value interpolated,
      and a “Change the limit” link opening the Search settings page. A silent cut is the one failure
      mode of this view that produces a confidently wrong answer.
  - It is a real row in the flattened array (`{ kind: 'truncated' }`), not a footer outside the
    scroller, so it is reached by scrolling to the end exactly like the last hit — a banner pinned
    above the fold is one a user scrolling results never reads.
- [x] An empty state that distinguishes four cases, with the literal copy fixed here so two
      executors write the same view:
  - **No query yet** — “Search this repository.” / “Commits by message, author or content · file
    contents at any revision · file names.”
  - **Searching** — “Searching…” with a live count beneath, “{n} results so far”, and a Cancel
    button that calls `search.cancel({ repoId, requestId })`.
  - **No matches** — “No matches for “{query}”.” / “Try another mode, or clear the filters.”
  - **Failed** — “git could not run this search.” above `stderr`'s first line in a `<pre>`, because
    an invalid regex is the most common way this view will fail and git already explains it well.
- [x] Accessibility on a list that arrives asynchronously: the scroller is `role="list"` with rows
      `role="listitem"`; the result count is a separate `aria-live="polite" aria-atomic="true"`
      element; and **the live count is throttled to one update per 500 ms** while streaming, so a
      screen reader announces progress rather than being flooded by a batch every few milliseconds.
      The final count and the truncation state are always announced.

  - Focus order: query input → mode tabs → modifier toggles → results scroller. `ArrowDown` from
    the input moves focus into the list without submitting; `Escape` in the list returns focus to
    the input. `Enter` on a row does what a click does.
- [ ] An in-flight-search readout in the footer, so a grep started here and left running while the
      user switches view is visible rather than invisible: a `<FooterCluster>` child in
      [`features/terminal/footer-bar.tsx`](../packages/app/src/features/terminal/footer-bar.tsx)
      rendering “Searching… {n}” with a click that returns to the Search view and a stop button that
      cancels.
  - It renders **only** while `countOf('search') > 0` in the renderer's own mirror of that count
    (the store's `requestId !== null`), and it is the phase's whole observability story — a
    `console.warn` when the ceiling refuses a search is the only thing logged, because that is the
    one failure a user cannot see and would otherwise report as “search stopped working”.
  - Phase 27 moves the footer into zones. This lands as a plain cluster child today and is named in
    that phase's file map as a segment to adopt; it does not wait for it.
- [ ] `e2e/search-view.spec.ts` against the mock bridge: each mode returns and renders, a second
      query cancels the first, the truncation marker appears at the cap, and an invalid pattern shows
      the error state rather than an empty list.

### D — Blame (L) ✅ DONE (PR #1, 2026-08-30)

**The first two items are a prerequisite for Theme C's scroll-to-line and Theme E's find bar**, and
land before either. Everything after them is blame proper.

- [ ] `CodePreview` in [`code-preview.tsx`](../packages/app/src/features/files/preview/code-preview.tsx)
      renders **one row per line** instead of one HTML blob. Today it calls `codeToHtml` and drops the
      result into a single `overflow-auto` div through `dangerouslySetInnerHTML` — there is no
      per-line DOM, no line number and no metric anything else can hang off. Switch to
      `highlighter.codeToTokens(content, { lang, theme: HIGHLIGHT_THEME(dark) })` and render each
      line as `<div data-line={n}>` containing its tokens as `<span style={{color}}>`.
  - The container is a CSS grid, `gridTemplateColumns: 'auto 1fr'` — gutter column, then code
    column — with each line contributing two cells. One scroller, so alignment is **structural**:
    there is no measurement to drift and no second scroll position to synchronise.
  - `CodePreviewProps` gains `gutter?: (line: number) => ReactNode`. Omitted, the grid collapses to
    a single column and the pane looks exactly as it does today — asserted by a test that the
    no-gutter render still contains the whole file's text and still carries `data-selectable`.
  - Above `HIGHLIGHT_CAP_BYTES` (200 KB) the rows still render, **plain**: no `codeToTokens` call,
    each line's raw text in the same `<div data-line>`. That is what makes “the gutter still
    renders, the code beside it goes plain” true rather than aspirational, and it keeps the
    existing cap's purpose — no synchronous tokenizing of a minified bundle — intact.
  - `dangerouslySetInnerHTML` leaves the file. Note it in the commit message: the comment that
    justified it goes with it.
- [ ] `export function scrollPreviewToLine(container: HTMLElement, line: number): void` beside it —
      `container.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ block: 'center' })`,
      a no-op when the line is absent. This is the one function Theme C's hit navigation and Theme E's
      find bar both call; neither reaches into the DOM itself.
- [ ] A blame gutter in
      [`file-preview.tsx`](../packages/app/src/features/files/preview/file-preview.tsx), passed to
      `CodePreview` as its `gutter` prop, toggled per file and off by default. Each line shows a
      short sha, the author and a relative date; runs from the same commit are visually grouped so a
      file blamed to six commits reads as six bands rather than five hundred rows.
  - Banding is `gridRow: span N` on the run's single metadata cell, so a run of 90 lines renders
    **one** cell rather than 90 identical ones — the difference between a 5000-line file costing 40
    gutter cells and costing 5000.
  - Alternating runs tint `bg-muted/30`; the run's left edge takes a 2px `border-l` in the commit's
    colour from the Phase 14 avatar palette, so the bands read as bands at both themes and at both
    row densities. `sha` is `font-mono text-[10px] text-muted-foreground`, seven characters.
  - The toggle's state is `blameByFile: Record<string, true>` in the **plain** half of
    `blame-store.ts`, keyed `` `${fsScopeKey(scope).join('/')}\0${relPath}` `` — per file, off by
    default, and deliberately not persisted: blame is a question you ask about a file, not a
    preference about the pane.
  - Uncommitted lines (sha `0000000…`) render “Uncommitted” in italic muted text with no date and
    no click target.
- [ ] Blame is read through `blame.read` and cached with a new
      `keys.blame(repoId, relPath, rev, followRenames)` in
      [`services/queries.ts`](../packages/app/src/services/queries.ts), returning the prefix
      `['repos', repoId, 'blame', …]` so a whole repo's blame can be invalidated in one call.
- [ ] [`services/watch-invalidation.ts`](../packages/app/src/services/watch-invalidation.ts)
      invalidates blame when the file could have changed under it — a blame gutter that still
      describes the previous save is a quietly wrong answer, which is the failure mode this phase is
      least willing to ship.
  - `WatchEvent` is `{ repoId, kind, at }`
    ([`domain/watch.ts`](../packages/shared/src/domain/watch.ts):16) — **it carries no path**, so
    per-file invalidation is not expressible. Add
    `client.invalidateQueries({ queryKey: keys.blame(repoId), exact: false })` to the
    `worktree`/`index` arm and to the `head` arm, and invalidate the lot.
  - That is correct rather than merely cheap: at most one blame query is mounted at a time, because
    there is one preview pane. “All blame queries” is one refetch.
  - Widening the watch contract with paths is explicitly **not in this phase** — see below.
- [ ] Clicking a blame line opens that commit in the Phase 12 inspector, with the file preselected —
      the same navigation a commit hit in Theme C performs, extracted so both call it:
      `openCommitAtFile(sha: string, relPath: string): void` in `features/search/open-search.ts`,
      wrapping `selectCommit` from [`ui-store.ts`](../packages/app/src/store/ui-store.ts):373.
- [ ] **Reblame:** a per-line action that re-runs blame at the parent of that line's commit,
      answering *what was here before*. It reads the `previous <sha> <filename>` field parsed in
      Theme A, so it follows renames correctly for free rather than guessing the path.
  - The action is on the gutter cell's context menu and on a hover button; a line whose
    `previous` is `null` (the commit that introduced the file) shows the action disabled with the
    title “First version of this file”.
- [ ] A reblame navigation stack in the store with back/forward, showing the current revision in the
      preview header. Without the stack, reblame is a one-way door out of the file you were reading.
  - `stacks: Map<string, { entries: { rev: string; relPath: string }[]; index: number }>` in the
    plain half of `blame-store.ts`, keyed by the same file key as `blameByFile`. Reblame pushes at
    `index + 1` and **truncates everything after it** — a new branch of history discards the
    forward entries, exactly as browser history does.
  - Cleared wholesale when `selectedRepoId` changes. Not persisted: restoring a user to a
    historical revision of a file on relaunch, with no memory of why, is worse than losing the
    trail.
  - The header reads `{relPath} @ {shortSha}` with back/forward chevrons, disabled at each end.
- [ ] A rename-following toggle (`-C -M`) exposed on the gutter as well as in Settings, because it is
      a per-investigation decision as often as a preference, and the cost is visible enough that a
      user should be able to turn it on for one file. The gutter toggle overrides the Settings
      default for that file only, and lives in `blameByFile`'s sibling `followByFile`.
- [ ] `blame-store.test.ts`: the reblame stack pushes, pops and truncates on a new branch of history,
      and clears on repo switch; and `blame-lines.test.ts` over the run-grouping that turns per-line
      records into bands.

#### E — Inline entry points, and the filter input the repo keeps rewriting (M) ✅ DONE (PR #1, 2026-08-30)

The find bar depends on **D's first two items**.

- [ ] `packages/app/src/components/filter-input.tsx` — the shared text filter that does not exist
      today. The pattern is already written twice, in
      [`repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx):95 (`matchesRepoQuery`,
      whitespace-split AND terms, lowercased) and
      [`reviews-list.tsx`](../packages/app/src/features/reviews/reviews-list.tsx):159 (a single
      lowercased `includes`); extract the better of the two — the repos one — keep the AND-terms
      matcher as an exported pure function, and give it a clear button and an `Escape`-to-clear.
  - ```ts
    export function matchesTerms(haystack: string, query: string): boolean;
    export function FilterInput(props: {
      value: string; onChange: (next: string) => void; placeholder: string;
      count?: { matched: number; total: number }; autoFocus?: boolean;
    }): JSX.Element;
    ```
  - `matchesTerms` keeps the repos panel's two load-bearing conventions verbatim: an empty query
    matches everything, and the haystack's fields are joined with `\0` so a term cannot span
    two of them.
- [ ] Retrofit both call sites onto it, and add the third the Changes view has never had:
      [`all-changes-view.tsx`](../packages/app/src/features/changes/all-changes-view.tsx) has no
      text filter at all, which is the most obviously missing one in the app.
  - `matchesRepoQuery` becomes a two-line wrapper over `matchesTerms` rather than being deleted —
    it is the panel's domain vocabulary and it has its own callers.
  - The Changes view's haystack is the path only; its placeholder is “Filter changed files”.
- [ ] A find bar in the file preview on `Mod+f` — find-in-this-file, scoped to the open file and
      explicitly *not* a second search surface. `features/files/preview/find-bar.tsx`.
  - Match count as “{i} / {n}”, next/previous stepping that **wraps at both ends**, `Enter` = next,
    `Shift+Enter` = previous, `Escape` closes and returns focus to the preview.
  - Case-sensitivity and regex toggles beside the input — the same two the query bar has, so a user
    does not leave the file to run a case-sensitive find. Whole-word is *not* offered: it is the
    least-reached-for of the three and the bar is deliberately narrow. The two toggles are
    unpersisted, resetting to the Settings defaults each time the bar opens.
  - Ranges come from Theme C's `matchRanges` and render as `<mark>` inside the `data-line` rows
    D built; the current match takes `bg-primary/45` against the others' `bg-primary/25`, and
    stepping calls `scrollPreviewToLine`.
  - Its overflow action is “Search the whole repo”, which calls `openSearch(query, 'content')`.
  - `Mod+f` is bound `scope: 'app'`, so it does not fire while the terminal has focus — `Mod+f`
    inside a shell belongs to the shell. Within the app it is safe: the renderer loads from
    `file://` with no browser find to shadow.
- [ ] A search box in [`graph-header.tsx`](../packages/app/src/features/graph/graph-header.tsx)
      beside the existing ref and author filters. Typing filters the loaded rows by **dimming**,
      matching what `AuthorFilter` already does and for the same reason — dropping rows breaks lane
      topology.
  - It also carries a hit count and next/previous, because dimming alone leaves the user scrolling
    50 000 rows to find the seven that lit up. Stepping sets the graph selection via
    `selectCommit`, which the graph already scrolls to.
  - **The count is worded “{n} of {loaded} loaded”**, never “{n} of {total}”. It is honest only
    about rows already streamed, and a bare “7 of 412” read as a repo-wide answer is exactly the
    confidently-wrong result this phase exists to avoid.
  - Submitting (`Enter` with no active step, or the box's overflow action) hands off to the Search
    view in commits mode with the query prefilled.
- [ ] The hand-off is one function, not three: `features/search/open-search.ts` exports
      `openSearch(query: string, mode: SearchMode, scope?: { rev?: string; paths?: readonly string[] }): void`,
      which the find bar, the graph box and (when it exists) the palette source all call — so there
      is exactly one definition of what “search this” means.
  - It sets the store's mode, query and scope, then `setActiveView('search')`. It does **not**
    start the search: the view's own debounced effect does, so a hand-off and a keystroke take the
    same path.
- [ ] `filter-input.test.ts` over `matchesTerms`, including the case-folding, the
      empty-query-matches-everything convention both existing call sites rely on, and the
      `\0` join that stops a term matching across two fields.

### F — Chords, the palette source, and Settings (M)

- [ ] **Fetch moves off `Mod+Shift+f`.** `sync.fetch` becomes `Mod+Shift+r` in `DEFAULT_KEYMAP` in
      [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts):83, and `Mod+Shift+f`
      becomes `search.open`. The fetch-pull-push triad loses its shape — `Shift+r` / `Shift+p` /
      `Shift+u` — and that is the accepted cost of taking the conventional find-in-files chord.
  - **Chords are lowercase in this file.** Every existing binding reads `Mod+Shift+f`,
    `Mod+Shift+p`, `Mod+r` — the letter is not capitalised even under `Shift`. A binding written
    `Mod+Shift+F` never matches, and the keymap test below is what catches it.
  - It is an **edit** to the existing `sync.fetch` entry, not a second entry. Adding rather than
    editing leaves two bindings for one command, which the duplicate-chord test does not catch.
- [ ] Update the native menu in [`menu.ts`](../packages/desktop/src/main/menu.ts) so the Fetch item's
      displayed accelerator matches, and the sync chips' tooltips with it. A stale accelerator in a
      native menu is the kind of wrong that survives for six phases.
- [ ] Add `search.open` (`Mod+Shift+f`) and `search.findInFile` (`Mod+f`) to `COMMAND_IDS` and
      `DEFAULT_KEYMAP` with labels `Search` and `Find in File`, and handlers in the dispatcher — the
      handler literal in [`app.tsx`](../packages/app/src/app.tsx) today. `search.open` sets the
      active view; `search.findInFile` opens the preview's find bar and is a no-op outside the
      Files view.
  - *If Phase 23 has landed:* the handlers go in its `useCommandHandlers()` instead. Either way
    this theme adds a handler, not a dispatch mechanism.
- [ ] `search.open` is `scope: 'global'` so it escapes the terminal via `GLOBAL_CHORDS`
      ([`keybindings.ts`](../packages/shared/src/keybindings.ts):89), the way `terminal.toggle` does;
      `search.findInFile` stays `'app'`, since `Mod+f` inside a shell belongs to the shell.
- [ ] Extend the keymap test in
      [`keybindings.test.ts`](../packages/app/src/services/keybindings/keybindings.test.ts): no two
      bindings share a chord (which is what catches the fetch move if it is done by addition rather
      than by edit), every `CommandId` has a label, every chord's final segment is lowercase, and
      `Mod+Shift+r` resolves to `sync.fetch`.
- [ ] Add `NumberField` and `Toggle` to
      [`settings-pages/controls.tsx`](../packages/app/src/features/settings/settings-pages/controls.tsx),
      which today exports only `Field` and `Choice` (a segmented radiogroup). The Search page needs a
      real numeric cap and three booleans, and every existing page has been folding booleans into
      two-option `Choice`s for want of a switch.
  - ```ts
    export function NumberField(props: { label: string; hint: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; suffix?: string }): JSX.Element;
    export function Toggle(props: { label: string; hint: string; value: boolean; onChange: (b: boolean) => void }): JSX.Element;
    ```
  - Both are built on the existing `Field` wrapper so labels, hints and spacing match the other
    seven pages exactly. `Toggle` is a `role="switch"` button with `aria-checked`; `NumberField`
    clamps on blur rather than on keystroke, so typing “1” on the way to “1000” is not rewritten
    under the cursor.
  - No existing page is migrated onto them in this phase — see *Not in this phase*.
- [ ] A **Search** settings page: `'search'` added to `SettingsPageId` and `SETTINGS_PAGES` (group
      `general`, after `'graph'`) in [`ui-store.ts`](../packages/app/src/store/ui-store.ts),
      `SETTINGS_PAGE_ICON` in [`nav-icons.ts`](../packages/app/src/components/nav-icons.ts), a new
      `settings-pages/search-page.tsx` built from `controls.tsx`, and an entry in `PAGE_CONTENT` in
      [`settings-view.tsx`](../packages/app/src/features/settings/settings-view.tsx).
- [ ] The page's controls, each named with its control type and its default:
  - `Toggle` **Regex by default** (off) · `Toggle` **Case-sensitive by default** (off) ·
    `Toggle` **Whole word by default** (off).
  - `NumberField` **Result limit** (5000, min 100, max 100000, step 500), hint stating the cost:
    “A larger limit means git keeps walking after the answer is on screen.”
  - `NumberField` **Context lines** (0, min 0, max 10) for content hits.
  - `Toggle` **Follow renames when blaming** (off), hint: “`-C -M`. Materially slower on large
    files.”
  - These write to the `search-store`'s persisted slice, not to `ui-store` — the page reads the
    same store the query bar does, so a default changed here is the default the next query uses.
- [ ] Update [`e2e/settings-pages.spec.ts`](../packages/app/e2e/settings-pages.spec.ts), which
      enumerates the pages and will fail on the new one until it does.
- [ ] ⏳ *only if Phase 23 has landed:* a **search source** registered with its provider seam in
      `services/palette/sources/` — typing into the palette offers “Search commits for …” /
      “Search content for …” as actions that call `openSearch`. It is a hand-off, not a result
      provider: the palette does not run git.
- [ ] ⏳ *only if Phase 23 has landed:* `palette.open`'s source list gains the entry, and its
      source test gains a case asserting the search actions appear for a non-empty query and not for
      an empty one.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | **new** `shared/src/domain/search.ts`, **new** `shared/src/domain/blame.ts`, [`domain/index.ts`](../packages/shared/src/domain/index.ts), [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts), [`ipc/bridge.ts`](../packages/shared/src/ipc/bridge.ts), [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts), [`domain/watch.ts`](../packages/shared/src/domain/watch.ts) (**unchanged** — the no-path shape is what Theme D's invalidation is designed around) |
| git-engine | **new** `commands/search.ts`, **new** `commands/blame.ts`, **new** `commands/grep.ts`, **new** `parsers/blame-parser.ts`, **new** `parsers/grep-parser.ts`, **new** `parsers/__fixtures__/grep-z-context.txt` (recorded from real git), [`commands/log.ts`](../packages/git-engine/src/commands/log.ts) (`buildLogArgs`, `--follow`), [`commands/index.ts`](../packages/git-engine/src/commands/index.ts), [`parsers/index.ts`](../packages/git-engine/src/parsers/index.ts), [`parsers/log-parser.ts`](../packages/git-engine/src/parsers/log-parser.ts) (**unchanged** — `LOG_FORMAT`, `chunkRecords` and `parseLogRecord` are reused verbatim, and a commit hit is a `Commit`), [`exec/git-exec.ts`](../packages/git-engine/src/exec/git-exec.ts) (**unchanged** — `spawnGit` is the seam) |
| Main | **new** `main/stream-registry.ts`, **new** `main/search-service.ts`, **new** `main/ipc/search-handlers.ts`, [`log-service.ts`](../packages/desktop/src/main/log-service.ts) (becomes a consumer; `logOptionsFor` stays), [`main/index.ts`](../packages/desktop/src/main/index.ts), [`preload/index.ts`](../packages/desktop/src/preload/index.ts), [`menu.ts`](../packages/desktop/src/main/menu.ts), [`ipc/handle.ts`](../packages/desktop/src/main/ipc/handle.ts) (**unchanged** — `handle`/`handleOp` are used as-is) |
| Renderer — search | **new** `features/search/search-view.tsx`, **new** `features/search/search-store.ts`, **new** `features/search/query-bar.tsx`, **new** `features/search/result-list.tsx`, **new** `features/search/match-ranges.ts`, **new** `features/search/open-search.ts` |
| Renderer — preview & blame | [`preview/code-preview.tsx`](../packages/app/src/features/files/preview/code-preview.tsx) (**rewritten** to per-line rows + `gutter` prop + `scrollPreviewToLine`), [`preview/file-preview.tsx`](../packages/app/src/features/files/preview/file-preview.tsx), **new** `preview/blame-gutter.tsx`, **new** `preview/blame-store.ts`, **new** `preview/find-bar.tsx` |
| Renderer — shell | [`app.tsx`](../packages/app/src/app.tsx) (`NAV_ITEMS`:164, the render chain:690, the handler literal; `FORGE_GATED_VIEWS`:185 **unchanged** — search is not gated), [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts) (`ViewId`, `VIEW_IDS`, `SettingsPageId`, `SETTINGS_PAGES`, `LayoutSizes`, `DEFAULT_LAYOUT`, `LAYOUT_BOUNDS`; **`version` stays 2**), [`components/nav-icons.ts`](../packages/app/src/components/nav-icons.ts), [`services/queries.ts`](../packages/app/src/services/queries.ts) (`keys.blame`), [`services/watch-invalidation.ts`](../packages/app/src/services/watch-invalidation.ts), [`features/terminal/footer-bar.tsx`](../packages/app/src/features/terminal/footer-bar.tsx) (one new `FooterCluster` child) |
| Renderer — shared | **new** `components/filter-input.tsx`, [`features/repos/repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx), [`features/reviews/reviews-list.tsx`](../packages/app/src/features/reviews/reviews-list.tsx), [`features/changes/all-changes-view.tsx`](../packages/app/src/features/changes/all-changes-view.tsx), [`features/graph/graph-header.tsx`](../packages/app/src/features/graph/graph-header.tsx), [`features/graph/author-filter.tsx`](../packages/app/src/features/graph/author-filter.tsx) (**unchanged** — the dimming precedent the graph box copies) |
| Settings | **new** `features/settings/settings-pages/search-page.tsx`, [`settings-pages/controls.tsx`](../packages/app/src/features/settings/settings-pages/controls.tsx) (`NumberField`, `Toggle`), [`features/settings/settings-view.tsx`](../packages/app/src/features/settings/settings-view.tsx) |
| Neighbour seams | **None are required.** Phase 23 (`services/palette/`) and Phase 24 (`commands/grep.ts`, `mstudio:fs:search`) do not exist on disk today; the two `⏳` items in Theme F and the four *If Phase 23/24 has landed* bullets are the entire optional surface, and each names its own file |
| Docs | [`CLAUDE.md`](../CLAUDE.md) (the new chords, and Fetch's move), [`docs/INITIAL_PLAN.md`](../docs/INITIAL_PLAN.md), [`todo/outstanding.md`](outstanding.md) (search and blame come off the list) |
| Tests | **new** `grep-parser.test.ts`, `blame-parser.test.ts`, `search.integration.test.ts`, `grep.integration.test.ts`, `blame.integration.test.ts`, `stream-registry.test.ts`, `filter-input.test.ts`, `match-ranges.test.ts`, `blame-store.test.ts`, `blame-lines.test.ts`, `code-preview.test.tsx`, `e2e/search-view.spec.ts`, `e2e/blame.spec.ts`; edited [`ipc.test.ts`](../packages/shared/src/ipc/ipc.test.ts), [`keybindings.test.ts`](../packages/app/src/services/keybindings/keybindings.test.ts), [`e2e/settings-pages.spec.ts`](../packages/app/e2e/settings-pages.spec.ts), [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: `search.ts`, `grep.ts` and `blame.ts` are plain Node in git-engine and
      import no `electron`; the Search view reaches main only through `window.midniteStudio`.
- [ ] Vitest (A): `expect(buildLogArgs({ limit: 100, all: true, revisions: ['main'] }))` equals the
      exact array the function returns today — **byte-identical**, element for element. The
      regression that would silently change the graph.
- [ ] Vitest (A): `buildLogArgs({ follow: true, paths: ['a', 'b'] })` throws `RangeError`; with one
      path and `all: true` the output contains `--follow` and **not** `--all`.
- [ ] Vitest (A): `buildLogArgs({ grep: ['x', 'y'] })` emits `--grep=x`, `--grep=y` **and**
      `--all-match`; with one term it emits no `--all-match`.
- [ ] Vitest (A): `buildGrepArgs({ pattern: 'foo', rev: 'v1', paths: ['src'], … }).slice(-4)` equals
      `['-e', 'foo', 'v1', '--']` — rev before the separator, pathspecs after it.
- [ ] Vitest (A): `parseGrep` over the **recorded** `grep-z-context.txt` fixture returns hits whose
      `kind` is `'match'` for the matched line and `'context'` for its neighbours, and returns a
      non-empty `remainder` when the payload is truncated mid-record.
- [ ] Vitest (A): the blame parser over a three-hunk file where hunks two and three reuse hunk one's
      commit, asserting `result.commits` has **one** entry and every line resolves its author from
      it; plus a `previous` line surviving onto `BlameLine.previous` with both sha and path.
- [ ] Vitest integration (A): a scratch repo where a string is added in one commit and removed in
      another, asserting `-S` finds exactly those two; a `git grep` at an older rev returning content
      that no longer exists in the working tree; and a blamed file after a rename, with and without
      `-C -M`.
- [ ] Vitest integration (A): the edge-case repo states — empty repo returns `[]` not an error;
      detached HEAD greps the worktree; a CRLF file's hit `text` carries no `\r`; `src/café notes.md`
      survives the `-z` round-trip; a binary file is absent from the hits and the run still exits 0;
      and the pattern `-Wall` is found rather than parsed as a flag.
- [ ] Vitest (B): `POLICY` asserted as data — registering a second `'log'` cancels the first,
      registering a `'search'` alongside a live `'log'` cancels neither, and two `'search'`
      registrations cancel independently. Starting a log does **not** cancel a running search: the
      specific regression the registry refactor could introduce.
- [ ] Vitest (B): `release` decrements `countOf`, and a stream that finishes naturally leaves the
      map — assert `countOf(win, 'search') === 0` after `done` resolves.
- [ ] Vitest (B): the fifth concurrent `startGrep` on one window resolves `{ ok: false }` with the
      ceiling message, and the four in flight are untouched.
- [ ] Vitest (B): the cap — a service fed 6000 hits with `cap: 5000` forwards exactly 5000, calls the
      stream's `cancel()` once, and sends `searchDone` with `truncated: true`.
- [ ] Vitest (B): `SearchStartRequest` rejects `pattern: '-i'`, `rev: '--all'`, and
      `paths: ['../etc/passwd']`; and accepts `pattern: '-Wall'` **only** through the refine's
      message being the failure — i.e. the refine rejects it and the UI's `-e` path is the
      documented way a user searches for it. (If the refine is relaxed later, this test is the
      record of why it was not.)
- [ ] Vitest (B): the `search*`/`blame*` prefix block in `ipc.test.ts` covers all five channel keys
      across `CHANNELS` **and** `EVENT_CHANNELS`, in the exhaustive style of `ipc.test.ts:556`.
- [ ] Vitest (C): rehydrating `search-store` from a persisted payload that contains `results` leaves
      `results` empty and `mode`/`flags`/`lastQuery` restored — the persist split, asserted rather
      than trusted.
- [ ] Vitest (C): a v2 `ui-store` payload with no `searchResultsWidth` rehydrates to the default 420
      and `version` is still 2 — the no-bump claim, asserted.
- [ ] Vitest (C): the flattened row array is append-only — feeding two batches where the second
      contains a hit for a file seen in the first leaves every index from the first batch unchanged.
- [ ] Vitest (C): `matchRanges` returns `[]` rather than throwing for the invalid regex `'('`, and
      returns the expected pairs for a literal, a case-insensitive and a regex query.
- [ ] Vitest (D): `CodePreview` with no `gutter` prop renders every line of a 200-line file, carries
      `data-selectable`, and emits `data-line="1"` … `data-line="200"`; above `HIGHLIGHT_CAP_BYTES` it
      still emits every `data-line` with plain text and no token spans.
- [ ] Vitest (D): run-grouping turns 500 per-line records over 6 commits into 6 bands, and the band
      spanning 90 lines renders one metadata cell with `gridRow: span 90`.
- [ ] Vitest (D): `invalidateForWatchKind` invalidates `keys.blame(repoId)` on `worktree`, `index`
      and `head`, and does **not** on `refs`.
- [ ] Vitest (D): the reblame stack pushes, truncates the forward entries on a new branch, and is
      empty after a repo switch.
- [ ] Vitest (E): `matchesTerms` — the AND-terms behaviour, case-folding, the
      empty-query-matches-everything convention both existing call sites depend on, and that a term
      cannot match across the `\0` field join.
- [ ] Vitest (F): no two keybindings share a chord; every chord's final segment is lowercase;
      `Mod+Shift+r` resolves to `sync.fetch` and `Mod+Shift+f` to `search.open`; and `sync.fetch`
      appears exactly once in `DEFAULT_KEYMAP`.
- [ ] Playwright (`e2e/search-view.spec.ts`): each mode renders; a second query cancels the first
      (asserted by the mock bridge recording a `cancel` before the second `start`); the truncation
      row appears at the cap with the cap's number in it; an invalid regex surfaces git's stderr in
      the error state rather than an empty list; and a commit hit opens the inspector.
- [ ] Playwright (`e2e/search-view.spec.ts`): the footer readout appears while a stream is live,
      names a count, and disappears on done — including when the user has navigated to another view.
- [ ] Playwright (`e2e/blame.spec.ts`): the gutter's `data-line` cells align with the code's at three
      scroll positions (same `offsetTop` for the same line number); reblame pushes a stack entry and
      back returns; and the rename toggle re-queries.
- [ ] Screenshot, per the visual-phase convention: the Search view in each of its three modes and in
      each of its four empty/loading/error/truncated states, the blame gutter, and the find bar —
      all in both themes.
- [ ] **Open, for a human:** `git grep` for a single common character in a repository with 100k+
      files, and confirm the cancel button actually stops the child process — checked in Activity
      Monitor, not inferred from the UI going quiet.
- [ ] **Open, for a human:** blame a 5000-line file with `-C -M` on and off, and confirm the slower
      path is worth the toggle it was given.
- [ ] **Open, for a human:** run a commit search, a content search and a graph refresh at the same
      time in a real repository and confirm none of the three cancels either of the others.
- [ ] **Open, for a human:** scroll a streaming result list of 5000 mixed content hits while batches
      are still arriving, and confirm the measured virtualizer does not jump — the append-only rule
      is asserted in a unit test, but a visible scroll jump under real timing is what that rule
      exists to prevent.
- [ ] **Open, for a human:** in a packaged `.app`, confirm `Mod+Shift+f` reaches the app rather than
      the shell, and that Fetch on `Mod+Shift+r` is not shadowed by `Mod+r` `view.refresh` under a
      fast double-press.

## Not in this phase

- **Quick-open / the file finder.** It is [Phase 23's Theme G](phase-23-command-palette.md) on
  `Mod+P`, over `git ls-files -z --exclude-standard` with a tip-sha-keyed index and a fuzzy matcher.
  This phase's Files mode is a **substring** match over its own `ls-files` read — deliberately worse,
  deliberately small, and deliberately not an index, so there is nothing to fork when Phase 23 lands.
- **The command palette itself, and its fuzzy matcher.** Also Phase 23. The two `⏳` items in
  Theme F are the whole of this phase's interest in it, and they are excluded from the count.
- **The explorer's find-in-files panel.** It is
  [Phase 24's Theme E](phase-24-writable-explorer.md). This phase writes `commands/grep.ts` and
  `parsers/grep-parser.ts` — which Phase 24 then consumes rather than creates — but it builds no
  panel above the tree.
- **Searching ignored or untracked content.** `git grep` covers tracked content. The empty state
  says so rather than leaving the user to wonder why a file they can see is not matched.
- **Widening `WatchEventSchema` with paths.** The watcher knows which paths fired before it
  debounces, and blame is the first consumer that would want them — but a shared-schema change,
  a main-process change and every consumer's revalidation is a large bill for one query that is
  mounted at most once.
- **Migrating the existing settings pages onto `NumberField` and `Toggle`.** Seven pages currently
  express booleans as two-option `Choice`s; converting them is a visual change to surfaces this
  phase does not otherwise touch, and it would bury the Search page's diff.
- **Replace-in-files.** Every search here is a read, and a repo-wide write driven by a regex is a
  different phase with a different confirm story — and one that wants Phase 22's undo underneath it.
- **Search across multiple repositories.** The whole contract is `RepoId`-scoped, as every other
  read is. Cross-repo search is a different data model, not a wider query.
- **A search index.** No trigram store, no cache warming, no non-git backend. `git grep` is fast
  enough on real repositories and an index that can be stale is worse than a search that is slow.
- **Persisted search history or saved searches.** The store keeps the last query shape so the view
  reopens where you left it; a history list is a surface of its own.
- **A real `--grep` re-stream from the graph header.** See the resolved decision below: the box dims
  and counts, and hands off. A text input that silently re-streams 50 000 rows is a surprising
  amount of work to happen behind a keystroke.
- **Blame for uncommitted lines** beyond git's own `0000000` "Not Committed Yet" rendering, and
  **blame in the diff view** — the gutter belongs to the preview pane this phase, not to `DiffView`.
- **Virtualising the file preview.** `CodePreview` becomes per-line rows in Theme D, which is what a
  virtualizer would need, but it still renders every line. The 200 KB `HIGHLIGHT_CAP_BYTES` bound is
  what keeps that affordable, and virtualising a pane that already caps is work without a symptom.
- **Submodules**, deferred wholesale in [`outstanding.md`](outstanding.md), and consequently
  `git grep --recurse-submodules`.

## Decisions / open questions

- **Resolved — the standalone path is the primary path, because neither neighbour has landed.**
  At the time of this refinement Phase 23 and Phase 24 are both `◻ TODO` at 0%, and
  `fuzzy-match.ts`, `commands/grep.ts`, `parsers/grep-parser.ts` and `mstudio:fs:search` are absent
  from the tree. The doc previously wrote the additive case as primary and the standalone case as a
  trailing clause, which made an executor check a dependency on every second item for an answer
  that is the same every time. Inverted: this phase writes grep whole, ships a substring Files mode,
  and marks the two palette items `⏳`. If a neighbour lands first, the four *If Phase 23/24 has
  landed* bullets are the whole delta.
- **Resolved — all four brainstormed capabilities ship, but two of them are Phase 23's to own.**
  The brainstorm scoped commit search, content grep, blame and quick-open. Phase 23 owns quick-open
  end-to-end and defers commit search to here by name. What is genuinely net-new here is the part
  no neighbour has: the pickaxe over history, blame, grep at a revision, cancellable streaming, and
  one view to type all of it into.
- **Resolved — `CodePreview` is rewritten to per-line rows, and Theme D owns the rewrite.**
  It renders shiki's `codeToHtml` output as one HTML string today, so there is no `data-line`, no
  line number and no metric for a gutter to align to — three items across C, D and E were written
  against a structure that does not exist. `codeToTokens()` into a two-column CSS grid makes
  alignment *structural*: one scroller, no measurement, nothing to drift. The alternatives were
  post-processing shiki's `.line` spans (alignment survives only until a line soft-wraps) and two
  synchronised scrollers (the drift the doc itself calls "worse than no blame column"). D owns it
  because blame is the deliverable that cannot exist without it; C's scroll-to-line and E's find bar
  are declared dependent on D's first two items.
- **Resolved — the supersede policy is a table in the registry, not an argument each caller passes.**
  `POLICY: Record<StreamKind, 'supersede' | 'concurrent'>` is read by `register`. Passing the policy
  per registration was the more flexible option and its failure mode is two log call sites
  disagreeing about whether logs supersede; a dumb map with no policy leaves "a search must never
  cancel the graph" living nowhere and untestable as a unit. As a table it is one line of data the
  test asserts directly.
- **Resolved — the 5000 cap is enforced in `search-service.ts`.** The engine stays policy-free (it
  streams until git exits or `cancel()` is called) and the renderer cannot stop a child process. The
  service is the only layer that both knows the cap — which rides on the request, because Settings
  configures it — and holds the `cancel()`. The cost is that the cap is not covered by git-engine's
  own tests, which is why it gets its own vitest in B.
- **Resolved — argv safety is defended twice: the schema refuses a leading `-`, and the builders use
  `-e` and `--` anyway.** Either alone is load-bearing in a way that rots: a refine alone leaves the
  builders fragile for the next call site, and builder discipline alone lives in one function a
  future caller can skip. Together, a pattern like `-Wall` reaches git through `-e` rather than being
  unsearchable, and a smuggled `--upload-pack=` is refused at the boundary.
- **Resolved — the results list is a measured virtualizer, and the row array is append-only.**
  A content hit renders its context neighbours and a commit subject can wrap, so fixed rows would
  either clip or waste space. Measured rows are the repo's first — `graph-view.tsx` and
  `diff-view.tsx` are both fixed — and the risk they carry is index churn under streaming appends.
  The append-only rule removes it: a new file's hits append at the end rather than being inserted
  into that file's existing group, so no already-measured index ever moves. The visible cost is that
  grouping is by arrival order, which for `git grep` is path order.
- **Resolved — `controls.tsx` gains a real `NumberField` and `Toggle`.** The page needs a numeric cap
  with a stated cost and three booleans; the file has only `Field` and `Choice`. A `Choice` of
  discrete cap values was the smaller option and is what `MonitorPage` does for
  `metricsIdleIntervalMs`, but a cap is genuinely continuous and "1000 / 5000 / 20000" is a made-up
  ladder. The seven existing pages are **not** migrated onto the new controls in this phase.
- **Resolved — blame invalidates wholesale, because `WatchEvent` carries no path.** It is
  `{ repoId, kind, at }`. Adding `keys.blame(repoId)` to the `worktree`/`index` and `head` arms
  invalidates every blame query, which is at most one — there is one preview pane. Widening the
  shared schema with paths is the precise answer and a large bill for one consumer; it is listed as
  out of scope with that reason.
- **Resolved — the search store is one store with a `partialize` that excludes results.** Two stores
  would make the split structural rather than a promise, at the cost of two hooks in every component
  that needs both the mode and the results — which is most of them. The persisted slice is a named
  exported type used as `partialize`'s return annotation, the same trick `ui-store.ts` uses so the
  slice and its migration cannot drift.
- **Resolved — Fetch moves to `Mod+Shift+r` and search takes `Mod+Shift+f`, in lowercase.** The
  conventional chord won over leaving Fetch alone and putting Search on `Mod+3`. Two known costs,
  both accepted: the `Shift+f`/`Shift+p`/`Shift+u` triad stops reading as a set, and `Mod+Shift+r`
  now sits one modifier from `Mod+r` `view.refresh` — worth revisiting if the manual pass finds it
  easy to hit by accident. The casing is not a detail: every chord in `DEFAULT_KEYMAP` ends in a
  lowercase letter, and a binding written `Mod+Shift+F` silently never fires.
- **Resolved — the log service is generalised rather than copied.** A sibling `search-service.ts`
  duplicating the single-active-stream pattern would have been the lower-risk commit, but it would
  be the third copy of it (log, pty, metrics all hand-roll the same shape) and the first one that
  needed *concurrent* streams. The refactor lands as its own commit with its own green gate,
  precisely because it touches the working graph stream. `logOptionsFor` stays behind: it is
  ref-filter logic with its own test, and commit search does not use it.
- **Resolved — commit search renders as a flat list on the Search view, and dims when driven from the
  graph header.** The graph cannot remove rows without breaking lane topology, which is why the Phase
  14 author filter dims; that constraint is real and stays. The Search view has no lanes and no such
  constraint, so it shows only matches.
- **Resolved — the Content mode defaults to the working tree, not `HEAD`.** It is what the user is
  looking at, it includes the uncommitted edit that is very often the reason they are grepping, and
  the rev picker is one control away. `HEAD` is the more reproducible answer and the less useful one;
  remembering a rev per repo would leave a user returning to a stale revision without noticing.
- **Resolved — the find bar is find-in-open-file, plus a case and a regex toggle.** The toggles earn
  their place because leaving the file to run a case-sensitive find is the exact friction the bar
  exists to remove; whole-word does not, and is left to the Search view. It gains no file list — the
  moment it does it has become Theme C in a smaller box — and its overflow action hands the query to
  Theme C instead. The toggles reset to the Settings defaults on each open rather than persisting,
  because a sticky regex toggle in a find bar surprises the next find.
- **Resolved — the reblame stack is unpersisted, keyed by file, cleared on repo switch.** Per file
  rather than one global stack, so reblaming file A, reading file B and coming back does not lose A's
  trail. Unpersisted because restoring a user to a 2019 revision of a file on relaunch, with no
  memory of why, is worse than losing the trail. It truncates its forward entries on a new branch of
  history, exactly as browser history does.
- **Resolved — the graph header's box dims loaded rows, and also counts and steps through them.**
  A real `--grep` re-stream would find commits not yet loaded and would make a text input silently
  re-stream 50 000 rows. Dimming matches `AuthorFilter`'s established behaviour and its reason.
  Dimming *alone*, though, leaves the user scrolling to find the seven rows that lit up — so the box
  carries a count and next/previous that move the graph selection. The count is worded
  **"{n} of {loaded} loaded"** and never "of {total}", because it is honest only about rows already
  streamed, and a bare "7 of 412" read as a repo-wide answer is precisely the confidently-wrong
  result this phase exists to prevent.
- **Resolved — an in-flight search is visible in the footer, and nothing else is logged.** A grep
  started in the Search view and left running while the user switches to Graph is otherwise
  invisible, which is how a user comes to believe search is broken. One `FooterCluster` child, a
  count and a stop button. The only console output in the phase is a `warn` when the per-window
  ceiling actually refuses a search — the one failure a user cannot see. Full start/cancel/done
  timing logs were the alternative and are noise in every session that is not the concurrency
  manual pass.
