# Phase 66 — API Client

**Refined: x1** · 2026-09-05 · plan shape (split), data model & IPC contract, file-map precision, editor stack correction, functionality & edge cases, security & blast radius, testing & verification, out-of-scope tightening

A Postman-compatible API client, added as a sixth **API Client** entry in the Workspace sidebar
group alongside Explorer/Search/Tests/Optimizer/Database. Import real `.postman_collection.json`
files, browse them as a tree, open requests as tabs, build them with a full
params/headers/body/auth editor, send them from the main process, read the response, and export
the file back with every key it arrived with. This is the first phase to touch anything
HTTP-client-shaped — there is no prior art anywhere in this tracker beyond one workflow-scoped
`fetch` call.

**This phase is the shippable core; the rest of it lives in
[Phase 70](phase-70-api-client-environments-tests-and-runs.md).** The x1 refinement split what
was one eleven-theme, 58-item phase: environments and the secret overlay, the `pm.*` test editor
and its sandbox, the collection runner, and request history/codegen all moved to Phase 70, which
builds on this one. See Decision 1. What stays here is the thing that is useful on its own — a
client that can open a real collection, send a request and show you the answer — and it stays
useful without a single line of Phase 70.

**Builds on.**
- [`packages/desktop/src/main/workflow/executors/http.ts`](../../../packages/desktop/src/main/workflow/executors/http.ts) —
  the only existing HTTP-send code in this repo, and the direct crib for Theme E. Verified at x1:
  `HTTP_RESPONSE_CAP_BYTES` is `= COUNCIL_OUTPUT_CAP_BYTES` (`:25`, re-exported from
  `@midnite/studio-shared`, not a local literal); `readCapped(response): Promise<{text, truncated}>`
  (`:43`) pulls `response.body.getReader()` in a loop calling `appendCapped(buffer, value, cap)`
  from [`main/council-output.ts`](../../../packages/desktop/src/main/council-output.ts) and
  **breaks out the moment `truncated` flips** (`:59`) rather than draining an oversized body,
  with `reader.cancel()` in a `finally` (`:62`); the timeout is
  `const deadline = setTimeout(() => controller.abort(), timeoutMs); deadline.unref?.()` (`:96-97`)
  paired with a 100 ms `setInterval` cancel poll (`:100-102`), both `unref`'d and both cleared in
  the same `finally` (`:160-161`); response headers are flattened with `response.headers.forEach`
  into a plain object (`:138-141`) because a `Headers` instance `JSON.stringify`s to `{}` and
  therefore cannot cross IPC. One real difference is preserved: the workflow executor treats a
  non-2xx as `ok: true` because a 404 can be the *answer* a workflow condition is checking for;
  here, likewise, every completed response (any status) is a successful `ApiResponse`, and only a
  transport failure or a timeout is `{ok:false}`.
- [`packages/desktop/src/main/demo-api/fixture-server.ts`](../../../packages/desktop/src/main/demo-api/fixture-server.ts)'s
  `startFixtureServer()` — the loopback HTTP server
  [`workflow/executors/executors.test.ts`](../../../packages/desktop/src/main/workflow/executors/executors.test.ts)`:18-22`
  spins up in `beforeAll` to test `httpExecutor` against a real socket. Its own header says the
  acceptance criterion is that the suite passes *"with the machine's network cable out"*. Theme E's
  tests use it too, and do **not** mock `fetch` — corrected at x1, see Decision 8.
- [`packages/desktop/src/main/ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) —
  `handle(channel, schema, handler, onInvalid)` (`:21`), `handleBare(channel, handler)` (`:104`)
  and `handleOp(channel, schema, handler)` (`:40`). **`handleOp` only converts a *schema* failure
  into an envelope** (`onInvalid = (issue) => failure(issue)`, `:45`); an exception thrown inside
  the handler body still rejects the invoke. Every handler in Theme E therefore catches its own
  errors — see Theme E's first item.
- [`packages/desktop/src/main/ipc/repo-handlers.ts`](../../../packages/desktop/src/main/ipc/repo-handlers.ts) —
  `registerRepoHandlers(getWindow: () => BrowserWindow | null): void` (`:29`) is the shape
  `registerApiClientHandlers` copies, and its `repoPickDirectory` `handleBare` (`:186-198`) is the
  native-dialog pattern Theme G's import adapts to `showOpenDialog` with a `.json` filter.
- [`packages/shared/src/domain/database.ts`](../../../packages/shared/src/domain/database.ts)'s
  `DbOpFailureSchema` / `DbOpResultSchema` / `DbOpResultOf` (`:145`, `:153`, `:159`) — **not**
  [`domain/result.ts`](../../../packages/shared/src/domain/result.ts) directly. Phase 61 made the
  call this phase repeats: an op with no `conflict` arm gets its own two-arm envelope rather than
  borrowing `GitOpResult`'s three, and `database.ts`'s own header says *"nothing here reuses a
  git-shaped type"*. `ApiOpResultOf` in Theme A is a third copy of the same six lines, deliberately.
- [`packages/app/src/features/files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) —
  **Monaco, via `@monaco-editor/react` 4.7.0, since Phase 64 Theme C.** The x1 refinement's largest
  correction: the pre-refinement doc built every editor in this phase on CodeMirror 6, which the
  app no longer uses. `code-editor.tsx:24` says so in as many words — *"replaces CodeMirror 6"* —
  the seven `@codemirror/*` entries in `packages/app/package.json` have **zero** importers left in
  `packages/app/src`, and [Phase 64](phase-64-offline-monaco-and-themes.md) Theme G exists to
  delete them. See Decisions 3 and 4.
- [`packages/app/src/lib/monaco/monaco-loader.ts`](../../../packages/app/src/lib/monaco/monaco-loader.ts)'s
  `getMonaco()` and
  [`monaco-languages.ts`](../../../packages/app/src/lib/monaco/monaco-languages.ts)'s
  `monacoLanguageForFile(fileName): string` — the local-bundle loader (`loader.config({ monaco })`,
  never the CDN) and the extension→Monaco-id table, which already maps `graphql: 'graphql'`,
  `xml: 'xml'` and `json: 'json'`. Monaco 0.56.0 ships Monarch grammars for all three under
  `esm/vs/basic-languages/`; `json` additionally gets one of the loader's five inlined workers.
- [`packages/app/src/components/view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx)'s
  `VIEW_COMPONENT: Record<ViewId, ViewEntry>` (`:140`) — **`Record`, not `Partial`**, so a new
  `ViewId` with no registry entry is a typecheck failure, not a blank pane. The pre-refinement doc
  did not mention this file at all; Theme B now does.
- [`packages/app/src/components/tree-section.tsx`](../../../packages/app/src/components/tree-section.tsx) —
  the collapsible-section primitive, with `depth?: 0 | 1 | 2 | 3` driving `TREE_INDENT`. It is
  **flat, not recursive**: nesting is the caller instantiating more of them at greater depth. Its
  nearest existing use for exactly this job is
  [`features/database/connection-tree.tsx`](../../../packages/app/src/features/database/connection-tree.tsx).
- [`packages/app/src/features/actions/actions-view.tsx`](../../../packages/app/src/features/actions/actions-view.tsx) —
  the list-pane + `ResizeHandle` + detail-pane skeleton Theme B's shell copies. No existing view is
  a four-pane analogue of this one; this is the closest, and `features/workbench` is the closest for
  tab mechanics.
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts)'s `ViewId`
  **and its separate `VIEW_IDS` array** (`:133-152`) — `viewForPath` is
  `VIEW_IDS.find((view) => pathForView(view) === path) ?? 'graph'` (`:1964`), so a `ViewId` added
  to the union but not the array silently routes to the graph. Two edits, not one.
- [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx)'s `WORKSPACE_NAV_ITEMS` (`:282`) —
  which at x1 has **five** entries (Explorer, Search, Tests, Optimizer, Database), not the three the
  pre-refinement doc claimed. API Client is the sixth. Ungated: it takes no `FORGE_GATED_VIEWS`
  entry (`:330`) because nothing here needs a GitHub remote.
- [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts)'s
  `view.video` (`:258`) — a chord-free *view-navigation* command in `group: 'view'`, which is a
  closer precedent for `view.apiClient` than `view.refresh` (`:186`, an action). Only five of
  nineteen views have a `view.*` command at all, and
  [`nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts)'s `VIEW_COMMAND` is a
  `Partial` with five entries. See Decision 5.
- [`packages/desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) —
  Phase 24's writable-explorer confinement: `confineParent(root, relPath)` (`:63`),
  `ensureConfinedDirs(root, relPath)` (`:179`), `createFile(target)` (`:133`,
  `O_CREAT|O_EXCL|O_WRONLY`), `openForOverwrite(target)` (`:120`, `O_RDWR|O_NOFOLLOW`),
  `confineTree(root, target)` (`:215`, both sides through `realpath`, target must sit *strictly*
  inside root) and `describeFsError(error)` (`:228`). Every write in Theme G goes through these —
  no new write path, and no `fs.writeFile` on a renderer-supplied path anywhere in this phase.
- [`packages/desktop/src/main/ipc/demo-api-handlers.ts`](../../../packages/desktop/src/main/ipc/demo-api-handlers.ts)
  exists already and is unrelated — the Workflows feature's throwaway demo HTTP *server*
  (Phase 43 Theme D), on `mstudio:demo-api:*`. Named here only to head off the collision: this
  phase's channels are `mstudio:api-client:*`, its handler file is `ipc/api-client-handlers.ts`,
  and its bridge key is `apiClient`, never bare `api`.

**Scope guardrails.**
- **Everything Phase 70 owns is out of this one**: environments and the `{{var}}` second tier, the
  gitignored secret overlay, the environment switcher, the `pm.*` test editor and its `vm` sandbox,
  the collection runner, persisted request history, and code generation. `{{var}}` interpolation
  *does* ship here, resolved against **collection variables only** (`collection.variable[]` is part
  of the v2.1 file itself, so a collection is self-contained without an environment).
- **Auth is Bearer / Basic / API key only.** No OAuth2 (a redirect-capture flow, likely a hidden
  `BrowserWindow`), no Digest, no AWS Signature. Settled in the brainstorm; unchanged at x1.
- **Import/export targets real Postman v2.1 JSON files only.** No curl import/export (Phase 70
  Theme D does the *export* half as codegen), no Postman Cloud API sync.
- **Collections live repo-local, under `.midnite/api/` in the open repo, git-versioned.** No
  app-global "scratch" workspace mode. Note this is the *opened* repository's `.midnite/`, not this
  one's — a distinction the pre-refinement doc got wrong; see Decision 9.
- **The HTTP send path is Node's global `fetch` in the main process**, matching the workflow
  executor precedent exactly. No `net.request` engine, no new `packages/http-engine`: the send
  logic is one handler behind one IPC channel, and the scope does not justify a new electron-free
  package the way `db-engine`'s five SQL drivers did. **The renderer never calls `fetch`** — the
  boundary rule, and also the reason a request can carry a `file://`-adjacent binary body at all
  (the renderer cannot read a file; main can).
- **No SSH tunneling, no client TLS certs, no cookie-jar persistence, no redirect-chain UI, no
  request chaining.** Each is a natural follow-on once the client has real usage behind it.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Landing order.** A → B → C in sequence (each is the previous one's only consumer); D and F can
go in parallel once C's store exists; E is independent of all of them after A and can land at any
point; G needs A and E's handler file. H is last.

## Deliverables

### A — Shared contracts: the Postman v2.1 wire shape (M)

- [ ] Add [`packages/shared/src/domain/api-client.ts`](../../../packages/shared/src/domain/api-client.ts)
      and one `export * from './api-client';` line in
      [`domain/index.ts`](../../../packages/shared/src/domain/index.ts) (alphabetical — the
      top-level [`src/index.ts`](../../../packages/shared/src/index.ts) already re-exports
      `./domain` wholesale and needs no edit).
  - `PostmanItemSchema` is the one **recursive** schema in the file: a folder
    (`{name, item: PostmanItem[]}`) or a request (`{name, request: PostmanRequestSchema}`). Express
    it as `const PostmanItemSchema: z.ZodType<PostmanItem> = z.lazy(() => …)` with a hand-written
    `PostmanItem` interface above it, because `z.infer` cannot see through `z.lazy`.
  - **`z.lazy` and `.passthrough()` both have zero occurrences in `packages/shared/src` today** —
    grep confirms it. Both are net-new here, both are correct zod v3 API (`packages/shared` pins
    `zod: ^3.23.8`), and a one-line comment in the file should say why each is needed so the next
    reader does not assume it was a slip.
- [ ] Every object schema in the file is `.passthrough()`, including the recursive arm.
  - This is the whole "real Postman file compatibility" requirement: an exported collection carries
    `protocolProfileBehavior`, `_postman_id`, `event[]`, `variable[]`, `description` objects and
    `auth` shapes this app does not model, and a round-trip that dropped them would corrupt a file
    the user shares with a team.
  - The one exception is `ApiResponse`, which is ours and never round-trips to disk — strict.
- [ ] `PostmanRequestSchema`: `{method: z.string(), url: PostmanUrlSchema, header: z.array(PostmanHeaderSchema).optional(), body: PostmanBodySchema.optional(), auth: PostmanAuthSchema.optional()}`.
  - `method` is a bare `z.string()`, **not an enum** — Postman permits arbitrary verbs and a strict
    enum would reject a real file on import. The method *dropdown* in Theme D offers seven; the
    schema accepts what it is given.
  - `PostmanUrlSchema` is `z.union([z.string(), z.object({raw: z.string(), …}).passthrough()])` —
    Postman v2.1 writes both forms, and a v2.0-era export is frequently the string.
- [ ] `PostmanEnvironmentSchema` (`{id, name, values: [{key, value, type: 'default'|'secret', enabled}]}`)
      ships **here**, in this phase, even though nothing reads it until
      [Phase 70](phase-70-api-client-environments-tests-and-runs.md) Theme A.
  - Reason: Theme G's importer must *recognise and refuse* a `.postman_environment.json` with a
    real message rather than failing the collection parse with a schema-shaped wall of text.
- [ ] `ApiRequestDraftSchema` — the renderer's editable shape, deliberately **not** the on-disk one:
      `{id, name, method, url, params: KeyValueRow[], headers: KeyValueRow[], auth: ApiAuth,
      bodyMode: BodyMode, bodies: Record<BodyMode, string>, binaryPath: string | null}`, with
      `KeyValueRow = {key: string, value: string, enabled: boolean}`.
  - `bodies` is a `Record` keyed by mode, not a single `body` field — that is what makes Theme D's
    "switch JSON → raw → JSON without losing the JSON" acceptance criterion structural rather than
    a thing to remember.
  - A pair of pure functions, `toDraft(item: PostmanItem): ApiRequestDraft` and
    `toPostmanRequest(draft: ApiRequestDraft, original: PostmanRequest | null): PostmanRequest`,
    live in this file. The second takes the original so passthrough keys survive the round trip —
    it merges over the original rather than constructing fresh.
- [ ] `BodyMode = z.enum(['none','json','form-data','urlencoded','raw','binary','graphql','xml'])`
      and `ApiAuth = z.discriminatedUnion('type', [none, bearer, basic, apikey])`.
- [ ] `ApiResponseSchema`: `{status: number, statusText: string, headers: Record<string,string>,
      body: string, bodyIsJson: boolean, contentType: string | null, durationMs: number,
      sizeBytes: number, truncated: boolean}`.
  - `body` is a `string`, always, even for JSON — the renderer parses it. `HttpNodeOutput` in
    `http.ts:27-40` types its `body` as `unknown` and that is right for a workflow node feeding
    another node; here the response viewer needs the raw text to show unformatted, and re-stringifying
    a parsed value loses the server's own key order.
  - `headers` is a flat `Record<string,string>` for the `Headers`-serialises-to-`{}` reason
    `http.ts:138-141` documents.
- [ ] `ApiOpFailureSchema` / `ApiOpResultSchema` / `ApiOpResultOf(schema)` in the same file,
      copying `database.ts:145-159`'s two-arm shape verbatim: `{ok:true, value} | {ok:false,
      kind:'error', message}`.
- [ ] Channels in [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts)
      under a new `// --- api client (Phase 66) ---` group, **kebab-case verbs** per the file's own
      convention note at `:6` (`mstudio:<domain>:<verb>`, cf. `mstudio:db:list-connections`):
      `apiListCollections: 'mstudio:api-client:list-collections'`, `apiReadCollection`,
      `apiSaveCollection`, `apiImportCollection`, `apiDeleteCollection`, `apiSendRequest`,
      `apiCancelRequest`. Seven `CHANNELS` entries, no `EVENT_CHANNELS` entry (see Decision 6).
- [ ] Payload schemas in [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) as plain
      `export const X = z.object(…)` with no sibling `z.infer` type (the `Db*` group's convention);
      `ApiSendRequestRequest` carries `{repoId, requestId, draft, collectionVariables, timeoutMs}`
      and `ApiCancelRequestRequest` carries `{requestId}` — `requestId` mirrors
      `DbQueryStartRequest`, which is how a cancel finds its in-flight operation.
- [ ] An `apiClient` namespace on `MidniteStudioBridge` in
      [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), typed the way `db` is at `:974-992`
      — `In<typeof S.X>` for requests, `z.infer<typeof S.X>` for responses, `Unsubscribe` for
      nothing here.
- [ ] `packages/shared/src/domain/api-client.test.ts`: three real Postman-exported collections
      committed under `packages/shared/src/domain/__fixtures__/api-client/`, each parsed and
      re-serialised, asserting **deep key-set equality with the original parsed JSON** — not
      `toEqual` on the object, which would pass even if a key were dropped and re-added with a
      different value. Plus: `toDraft`/`toPostmanRequest` round-trips a request with an unknown
      top-level key and keeps it.

### B — Nav, view registry and the command (S)

- [ ] Add `'apiClient'` to the `ViewId` union in
      [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts)`:103-130` **and** to the
      `VIEW_IDS` array at `:133-152`. Both, or `viewForPath('/apiClient')` falls through to
      `'graph'`.
- [ ] Add `apiClient: { Component: ApiClientView }` to `VIEW_COMPONENT` in
      [`components/view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx)`:140`,
      lazy-loaded in the file's `const loadX = () => import(…); const X = lazy(() => loadX().then((m) => ({default: m.X})))`
      form. No `global: true` — the view needs an open repo, because its collections live in one.
- [ ] Add `{ view: 'apiClient', label: 'API Client', icon: VIEW_ICON.apiClient }` to
      `WORKSPACE_NAV_ITEMS` in [`app.tsx`](../../../packages/app/src/app.tsx)`:282`, as the sixth
      entry after Database. Not added to `FORGE_GATED_VIEWS` (`:330`).
- [ ] `apiClient: LuSend` in
      [`components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts)'s
      `VIEW_ICON: Record<ViewId, IconType>` (`:46`) — `Record` again, so this is required, not
      optional. `LuSend` is already in the repo
      ([`features/reviews/review-action-bar.tsx`](../../../packages/app/src/features/reviews/review-action-bar.tsx)`:8`),
      so no new import family and no
      [`components/icons/icon-names.test.ts`](../../../packages/app/src/components/icons/icon-names.test.ts)
      surprise.
- [ ] Add `{ id: 'view.apiClient', label: 'Go to API Client', group: 'view' }` to `COMMANDS` in
      [`keybindings.ts`](../../../packages/shared/src/keybindings.ts), beside `view.video` (`:258`)
      — no `chord` key at all (Decision 5). **Do not** add it to `nav-chords.ts`'s `VIEW_COMMAND`:
      that map exists to render a chord in the rail tooltip, and a chord-free entry would render an
      empty bubble.
- [ ] Add `packages/app/src/features/api-client/api-client-view.tsx` exporting
      `export function ApiClientView()`: the shell — `<div className="flex h-full min-h-0">`, a
      fixed-width left pane, a `<ResizeHandle resizable={tree} axis="x" label="Resize the API
      collection tree" />` and the right pane, copying
      [`features/actions/actions-view.tsx`](../../../packages/app/src/features/actions/actions-view.tsx)'s
      skeleton including its `<PageDetachMark role="…" />` header slot.
  - The left-pane width persists through the same `layout.*` mechanism `actionsJobsHeight` uses,
    under a new `apiTreeWidth` key. A new persisted key goes in
    [`store/persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts)'s **preference**
    partition (Phase 63's exhaustiveness check fails the build otherwise).
- [ ] Empty state, literal copy: heading **"No collections yet"**, body **"Import a
      `.postman_collection.json` file to get started. Collections are stored in `.midnite/api/` in
      this repository, so they travel with it."**, and one primary button **"Import collection…"**
      wired to Theme G. A repo with no open repository shows the app's existing `EmptyWorkspace`
      instead, which the view registry already handles for non-`global` views.

### C — Collection tree, request tabs, and the store (M)

- [ ] Add `packages/app/src/store/api-client-store.ts` — zustand, its **own** store, not an arm of
      `workbench-store.ts` (Decision 2). Shape:
      `{collections: ApiCollectionSummary[], tabs: ApiTab[], activeTabId: string | null,
      responses: Record<string, ApiResponse[]>, inFlight: Record<string, string>,
      openTab(ref), focusTab(id), closeTab(id), editDraft(id, patch), markSaved(id),
      closeRepoTabs(repoId)}`.
  - `ApiTab = {id: string, repoId: string, collectionId: string, itemPath: string[], draft:
    ApiRequestDraft, savedDraft: ApiRequestDraft}` — `dirty` is **derived**
    (`JSON.stringify(draft) !== JSON.stringify(savedDraft)`), never stored, exactly as
    [`file-preview.tsx`](../../../packages/app/src/features/files/preview/file-preview.tsx) derives
    it from `file-editor-store`'s `content !== savedContent`. A stored boolean is a second source
    of truth that goes stale on undo.
  - `itemPath` is the folder-name path to the request inside the collection, not an index — Postman
    items have no stable ids, and an index breaks the moment a sibling is inserted above.
  - **Nothing in this store is persisted.** Tabs hold unsaved edits to a file that lives in a
    repo; restoring them across an app restart into a file that changed underneath is a data-loss
    shape, and `persisted-keys.ts` would have to classify every field. Session state, in memory.
- [ ] `closeRepoTabs(repoId)` is called from the same place
      [`features/repos/use-prune-closed-repos.ts`](../../../packages/app/src/features/repos/use-prune-closed-repos.ts)
      calls `workbench-store`'s, and additionally aborts any in-flight request for that repo via
      `apiClient.cancelRequest`. A closed repo's collections are gone from disk's point of view.
- [ ] Add `features/api-client/collection-tree.tsx` exporting
      `export function CollectionTree({ repoId }: { repoId: string })`, built on
      [`components/tree-section.tsx`](../../../packages/app/src/components/tree-section.tsx) with
      one `TreeSection` per collection at `depth={0}` and one per folder at `depth={1..3}`,
      recursing through a local `renderItems(items, depth)` and clamping `depth` at 3 (the prop's
      own ceiling) — the same way
      [`features/database/connection-tree.tsx`](../../../packages/app/src/features/database/connection-tree.tsx)
      nests schema levels.
- [ ] A request row renders `<MethodBadge method={…} />` + name, and is the only clickable thing;
      `MethodBadge` is a small local component with a fixed colour per verb (GET green, POST blue,
      PUT amber, PATCH violet, DELETE red, everything else muted), taken from `@bilo-io/ui` tokens
      so it survives a `StudioPalette` change.
- [ ] A tab in the strip shows `MethodBadge` + name + a `●` when derived-dirty, using
      `file-preview.tsx`'s glyph and `title="Unsaved changes"` verbatim.
  - x1 correction: the pre-refinement doc said this mirrors "`tab-strip.tsx`'s existing unsaved-state
    convention". **There is no such convention** — `WorkbenchTab` is a four-arm union of read-only
    surfaces (`all-changes`/`run`/`review`/`commit`) with no dirty concept anywhere. The only
    dirty indicator in the app is `file-preview.tsx`'s.
- [ ] Closing a dirty tab opens the app's existing `ConfirmDialog` — **"Discard unsaved changes to
      *{name}*?"**, confirm label **"Discard"**, destructive tone. Closing a clean tab closes it.
- [ ] Context menu per tree row, via
      [`components/context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx): on a
      collection — *New request*, *New folder*, *Rename*, *Export…*, *Remove from repo*; on a folder
      — *New request*, *New folder*, *Rename*, *Duplicate*, *Delete*; on a request — *Rename*,
      *Duplicate*, *Delete*. Every one of them mutates the in-memory collection and marks it dirty;
      **none of them writes to disk** — that is Theme G's explicit Save.
- [ ] `api-client-store.test.ts`: open/focus/close lifecycle including `nextFocusAfterClose`-style
      neighbour selection; `editDraft` flips derived-dirty and `markSaved` clears it;
      `closeRepoTabs` drops only the named repo's tabs and leaves another repo's alone.

### D — Request builder (L)

- [ ] Add `features/api-client/request-builder.tsx` exporting
      `export function RequestBuilder({ tabId }: { tabId: string })` — the method/URL bar above a
      four-tab row (Params · Headers · Auth · Body) above the tab's body, with the response viewer
      (Theme F) below a horizontal `ResizeHandle`.
- [ ] Method dropdown offering GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS, plus a free-text arm so an
      imported request with an unusual verb round-trips (Theme A's `method: z.string()` is why this
      is possible; a select that silently rewrote it to GET would corrupt the file on save).
- [ ] URL input with `{{var}}` tokens highlighted inline. Implementation: a single-line
      `contentEditable`-free approach — a plain `<input>` over a `<div aria-hidden>` mirror that
      re-renders the same text with `<mark>` spans, scroll-synced on `onScroll`. **Not** a Monaco
      instance: Monaco's smallest useful height is ~19px of line plus chrome, and one editor
      instance per open tab per URL field is a real cost for a field with no language.
  - A token whose name is not in the collection's `variable[]` gets a warning tone and a
    `title="No collection variable named foo"`. Unresolved-variable *behaviour* on send is Theme E's.
- [ ] Params tab: a `KeyValueTable` (a local component, reused by Headers and the two form body
      modes) bidirectionally synced with the URL's query string.
  - The rule, because both directions are plausible and they conflict: **the URL is authoritative
    on blur of the URL input; the table is authoritative on any table edit.** Typing in the table
    rewrites `draft.url`'s query string in row order, preserving rows with `enabled: false` in the
    table but omitting them from the URL. This is Postman's own behaviour and is what makes a
    disabled row survive a save.
- [ ] Headers tab: the same `KeyValueTable` with the per-row `enabled` checkbox. A small set of
      computed headers (`Host`, `Content-Length`, and `Content-Type` when the body mode implies one)
      renders greyed and non-editable above the user rows, labelled **"Auto-generated"** — the same
      affordance Postman uses, and the answer to "why did my Content-Type change".
- [ ] Auth tab: `None` / `Bearer Token` / `Basic Auth` / `API Key`, each with its own field set
      (`token`; `username`+`password`; `key`+`value`+`in: 'header'|'query'`). Values accept
      `{{var}}`. **Nothing here is masked and nothing is stored specially** — an auth value typed in
      this phase is written to the collection file in plain text, exactly as Postman does. Masking
      and the gitignored overlay are Phase 70 Theme A; until then the Auth tab carries a one-line
      hint: **"Values are saved to the collection file. Use an environment variable for secrets
      (coming in a later release)."**
- [ ] Body tab, one editor per `BodyMode`:
  - `json` / `raw` / `xml` / `graphql` → `features/api-client/monaco-field.tsx` (next item), with
    `language` `'json'` / `'plaintext'` / `'xml'` / `'graphql'`. All four grammars ship with
    Monaco 0.56.0; `graphql` in particular resolves what the pre-refinement doc left open (Decision 3).
  - `form-data` / `urlencoded` → the `KeyValueTable`; `form-data` rows additionally carry
    `type: 'text' | 'file'` and a file row stores a path, not bytes.
  - `binary` → a button opening the native file picker through a new main-side channel, storing the
    absolute path in `draft.binaryPath`. The renderer never reads the file; Theme E does.
  - `none` → a centred **"This request does not send a body."**
- [ ] Add `features/api-client/monaco-field.tsx` exporting
      `export function MonacoField({ value, onChange, language, height, readOnly }: {value: string;
      onChange: (v: string) => void; language: string; height?: string | number; readOnly?: boolean})`
      — a controlled `<Editor>` wrapper.
  - It is a **new component, not a reuse of `CodeEditor`**: `CodeEditor({fileName})` reads and
    writes `useFileEditorStore` directly (`:104`, `:113`) and derives its language from a file name.
    Neither is true here. See Decision 4.
  - It repeats `code-editor.tsx`'s theme effect verbatim — `getMonaco()`, `resolveEditorPalette(resolved)`,
    `monaco.editor.defineTheme('studio-'+paletteId, …)`, `setTheme` — and its
    `options` (`automaticLayout: false`, `scrollBeyondLastLine: false`, `minimap: {enabled: false}`
    here, `fontFamily: DEFAULT_EDITOR_FONT_FAMILY`), plus `loading={null}`.
  - `automaticLayout: false` means the field must call `editor.layout()` on container resize —
    reuse whatever `code-editor.tsx` does for the same reason rather than turning the flag on, which
    installs a 100ms polling `ResizeObserver` per instance.
- [ ] A **"Beautify"** action on the `json` and `xml` modes only, running Monaco's own
      `editor.action.formatDocument` — free for `json` (the JSON worker is one of the loader's five),
      a no-op for `xml`, so the button hides when `getAction` returns null rather than failing
      silently on click.
- [ ] `request-builder.test.tsx`: switching `json` → `raw` → `json` preserves the JSON text (the
      `bodies: Record<BodyMode, string>` contract); editing a param row rewrites the URL's query
      string and leaves a disabled row out of it; the Auth tab's `apikey` + `in: 'query'` shows up
      in the computed-params preview and not in the user rows.

### E — Main-process send engine (M)

- [ ] Add `packages/desktop/src/main/api-client/` for the logic and
      `packages/desktop/src/main/ipc/api-client-handlers.ts` for registration — the repo's split
      (thirteen `main/<feature>/` directories today, each with a thin
      `main/ipc/<feature>-handlers.ts` wrapper; `demo-api` is the exact pattern).
      `export function registerApiClientHandlers(getWindow: () => BrowserWindow | null): void`,
      called in [`main/index.ts`](../../../packages/desktop/src/main/index.ts) immediately after
      `registerDemoApiHandlers()` (`:356`).
- [ ] **Every handler body wraps itself in try/catch and returns `{ok:false, kind:'error', message:
      describeFsError(e)}`.** `handleOp` converts a schema failure to an envelope but not a thrown
      exception (`handle.ts:40-45`) — an uncaught throw rejects the invoke and the renderer sees an
      opaque Electron error string instead of a rendered message.
- [ ] Add `main/api-client/send.ts` exporting
      `export async function sendApiRequest(req: ApiSendRequest, signal: AbortSignal): Promise<ApiResponse>`.
      Structure copied from `http.ts:84-161`:
  - Interpolate `{{var}}` against `req.collectionVariables` **here in main**, immediately before
    building the request — never in the renderer. In this phase that is only collection variables;
    Phase 70 Theme A adds the environment tier *at this same call site*, which is why interpolation
    lives here from day one rather than being moved later.
  - An unresolved `{{var}}` is left **literally in place** and the response is returned with a
    `warnings: string[]` entry naming it. Substituting an empty string is the other plausible
    choice and is worse: a URL silently becomes `https://api./users` and the 404 looks like the
    server's fault.
  - Query params from enabled rows via `target.searchParams.set` (`http.ts:84-86`); headers from
    enabled rows plus the auth-derived one; body per `bodyMode` — `binary` streams from
    `draft.binaryPath` through `createReadStream` after `confineTree` has cleared it against the
    repo root, so a request cannot exfiltrate `~/.ssh/id_rsa` by way of a crafted collection file.
  - `readCapped`-shaped reader with `HTTP_RESPONSE_CAP_BYTES` and `appendCapped`, breaking on
    `truncated` and `reader.cancel()` in a `finally`.
  - Headers flattened with `response.headers.forEach`; `durationMs` from a `performance.now()`
    bracket; `sizeBytes` from the bytes actually read, which is the capped count when `truncated`
    (and the viewer says so rather than lying about the body's real size).
- [ ] Timeouts: `const deadline = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);
      deadline.unref?.()`, cleared in a `finally`. 30 s default, taken from a new
      `Settings ▸ API Client ▸ Request timeout` number field, because a slow staging API and a hung
      one are indistinguishable at any fixed value.
- [ ] `cancelRequest`: a module-level `Map<string, AbortController>` keyed by `requestId`, populated
      on send and deleted in the send's `finally`. `cancelRequest` on an unknown id is a **no-op
      returning `{ok:true}`**, not an error — the race where a response lands as the user clicks
      Cancel is normal, and an error toast for it is noise.
  - No 100 ms cancel poll here: `http.ts` needs one only because a workflow's cancellation arrives
    on a `context.signal.cancelled()` poll rather than as an event. An IPC cancel is an event, so it
    calls `controller.abort()` directly.
- [ ] Wire the `apiClient` namespace in
      [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — an object literal in
      the `workflow`/`demoApi` shape at `:351-366`, `call(CHANNELS.apiX, req)` per method — and add
      `| 'apiClient'` to the `Pick<MidniteStudioBridge, …>` at `:101-145`. Missing that `Pick` entry
      compiles and then hands the renderer `undefined` at runtime.
- [ ] `main/api-client/send.test.ts` (vitest, no electron import needed by `send.ts` itself):
      against `startFixtureServer()`, assert a 200 with a JSON body sets `bodyIsJson`; a **404
      resolves as `{ok:true}`** with `status: 404`; a route that never responds hits the timeout and
      returns `{ok:false}` with a message naming the millisecond budget; an abort mid-body returns
      `{ok:false}` and leaves the controller map empty; an oversized route sets `truncated: true`
      and stops reading (assert the server saw the socket close before it finished writing).
- [ ] `main/api-client/interpolate.test.ts`: `{{a}}` resolved, `{{a}}` unresolved left literal with
      a warning, `{{{{a}}}}` and a `{{` with no closer both left alone, and a variable whose value
      itself contains `{{b}}` **not** re-expanded (one pass, no recursion — the alternative is a
      cycle bomb in a file the user did not write).

### F — Response viewer (M)

- [ ] Add `features/api-client/response-viewer.tsx` exporting
      `export function ResponseViewer({ tabId }: { tabId: string })`: a status/time/size strip, a
      `Body | Headers` tab pair, and the body pane.
- [ ] The status strip: `<StatusPill status={…} />` coloured by class (2xx green, 3xx blue, 4xx
      amber, 5xx red), then `statusText`, then `durationMs` and `sizeBytes` formatted with the app's
      existing byte/duration helpers rather than a local `toFixed`.
- [ ] Body rendering by `contentType`, in this order:
  - JSON (`application/json`, `+json`, or `bodyIsJson`) → `MonacoField` with `language: 'json'`,
    `readOnly`, pretty-printed via `JSON.stringify(JSON.parse(body), null, 2)` with the raw text
    behind a **Raw** toggle. A body that fails to parse despite the content-type falls to text and
    shows a **"Not valid JSON"** note — a real and common server behaviour.
  - XML/HTML → `MonacoField`, `language: 'xml'` / `'html'`, `readOnly`.
  - `text/*` and anything else textual → `MonacoField`, `language: 'plaintext'`, `readOnly`.
  - `image/*` → an `<img>` with the body as a `data:` URL, capped: over 2 MB, show the placeholder
    below instead of building a 2.7 MB base64 string on the render thread.
  - Anything else → a centred **"{contentType} · {size} — no preview"** with a **Save response
    as…** button going through the same main-side dialog Theme G uses.
- [ ] The truncated banner, above the body, whenever `ApiResponse.truncated`: **"Response truncated
      at {cap} — the rest was not read."** Not a toast: it must stay on screen for as long as the
      body it is describing.
- [ ] Empty and in-flight states: before the first send, **"Send the request to see a response."**;
      while in flight, the app's existing skeleton plus a **Cancel** button wired to
      `apiClient.cancelRequest({requestId})`; on `{ok:false}`, a red-toned block with the envelope's
      `message` and a **Retry** button, never a thrown error and never a blank pane.
- [ ] In-memory response history per tab: `responses[tabId]` capped at **10**, newest first, with a
      small picker in the strip. Not persisted, because a response is not part of the collection
      file and writing one to `.midnite/api/` would put a bearer token in a git-tracked file.
      Persisted history is [Phase 70](phase-70-api-client-environments-tests-and-runs.md) Theme D,
      which has to answer that question properly.
- [ ] `response-viewer.test.tsx`: each content-type branch picks the expected renderer; the
      truncated banner appears exactly when `truncated` is set; a `{ok:false}` envelope renders the
      message and a Retry, and never throws into the error boundary.

### G — Import, export, and git-friendliness under `.midnite/api/` (M)

- [ ] `importCollection` handler: `dialog.showOpenDialog(win, {title: 'Import Collection',
      filters: [{name: 'Postman collection', extensions: ['json']}], properties: ['openFile']})`,
      copying `repoPickDirectory`'s `handleBare` shape (`repo-handlers.ts:186-198`) including its
      `win ? showOpenDialog(win, …) : showOpenDialog(…)` fallback.
  - The chosen file is read and parsed through Theme A's schema. Three distinguishable failures,
    each with its own message: not JSON (**"That file is not valid JSON."**), JSON but not a
    collection (**"That looks like a Postman *environment*, not a collection — environment support
    is coming in a later release."** when it parses as `PostmanEnvironmentSchema`, otherwise
    **"That file is not a Postman v2.1 collection."**), and a collection whose `info.schema` names
    a version this app does not know (imported anyway, with a warning — passthrough is what makes
    that safe).
- [ ] The parsed collection is written to `.midnite/api/collections/<slug>.postman_collection.json`
      **inside the open repository**, via `ensureConfinedDirs(repoRoot, '.midnite/api/collections')`
      then `createFile(confineParent(repoRoot, rel))`. `<slug>` is the collection's `info.name`
      slugified, de-duplicated with a `-2` suffix; a collision never overwrites, because
      `createFile` opens `O_CREAT|O_EXCL`.
- [ ] `listCollections` / `readCollection` resolve `repoId` through the repo registry the same way
      `repo-handlers.ts` does, then `confineTree(repoRoot, target)` before reading — a symlink
      pointed out of the repo is refused, not followed.
- [ ] `saveCollection` writes through `openForOverwrite` (`O_NOFOLLOW`), serialising with
      **`JSON.stringify(value, null, 2)` plus a trailing newline, and key order taken from the
      parsed original** — `JSON.parse` preserves insertion order for string keys, and
      `toPostmanRequest`'s merge-over-original (Theme A) is what keeps it. Stable output is the
      whole point: a one-header edit must be a one-hunk diff, not a whole-file rewrite.
- [ ] An `.midnite/api/README.md` is written on first import — three lines saying what the directory
      is, that it is safe to commit, and that Midnite Studio wrote it. A directory that appears in
      someone's `git status` with no explanation is a support thread.
- [ ] Export: **Export…** on a collection's context menu opens `dialog.showSaveDialog` with the
      collection's own filename defaulted, and writes the identical bytes `saveCollection` would.
      There is no separate serializer — one function, two destinations, so the round-trip test
      covers both.
- [ ] Add `.midnite/api/**/*.local.json` to this repo's root
      [`.gitignore`](../../../.gitignore), beside the existing `.env`/`.claude/settings.local.json`
      entries. This is a **convenience for developing the app against its own repo only** — the rule
      that matters ships in [Phase 70](phase-70-api-client-environments-tests-and-runs.md) Theme A,
      which writes `.midnite/api/.gitignore` into the *user's* repository. x1 correction: the
      pre-refinement doc had only the root entry, which would have protected nobody's secrets but
      ours (Decision 9).
- [ ] `main/api-client/collection-io.test.ts`: a fixture collection imported into a temp git repo,
      read back, saved with no edit, and compared to the original **byte for byte after both are
      normalised to 2-space-indent-plus-newline** — an exact-equality assertion, not "whitespace
      insignificant". Plus: an import whose target name already exists lands as `<slug>-2`; a
      `confineTree` refusal on a symlinked `.midnite/api` returns `{ok:false}` and writes nothing.

### H — Verification (M)

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: `packages/app` reaches every new capability only through
      `window.midniteStudio.apiClient.*`; `packages/shared` gains one domain module and imports
      nothing but zod; `git-engine` is untouched; no new package.
- [ ] A grep-level assertion in the renderer test suite that `packages/app/src/features/api-client/`
      contains **zero** occurrences of `fetch(` — the one rule of this phase that eslint's
      `no-restricted-imports` cannot express, and the one an executor is most likely to break
      because `fetch` is ambient in a jsdom test.
- [ ] Vitest (A): the three-fixture passthrough round-trip, key-set equality, and the
      `toDraft`/`toPostmanRequest` unknown-key survival.
- [ ] Vitest (E): the fixture-server suite — 200/404/timeout/abort/truncated — and the
      interpolation suite. No `vi.mock('node:fetch')` anywhere; the acceptance criterion is that
      `moon run desktop:test` passes with networking off.
- [ ] Vitest (C, D, F): the store lifecycle, the body-mode round-trip, the params↔URL sync, and the
      content-type rendering branches.
- [ ] Playwright: API Client appears in the Workspace rail group as the sixth entry and navigating
      to it renders the empty state (no collection in the fixture repo).
- [ ] Playwright: with a fixture collection on disk, the tree renders its folders and requests,
      opening a request opens a tab, and sending it against `startFixtureServer()` renders the
      response — the one end-to-end path the phase exists for.
- [ ] Playwright: editing a header marks the tab dirty (`●`), closing it prompts, discarding closes
      it, and re-opening shows the unedited request.
- [ ] Playwright: import → no edit → export produces a file `git diff --exit-code` reports as
      unchanged against the committed fixture.
- [ ] Screenshots, light and dark: the empty state, the tree with a collection expanded, the request
      builder on the Body/JSON tab, the response viewer on a JSON body, and the truncated banner.
- [ ] **Open, for a human:** send a real request against a real external API end to end — CI
      fixtures cover shape and behaviour, not a live TLS path, a redirect, or a real server's
      header casing.
- [ ] **Open, for a human:** import a collection exported from a *current* Postman install (not a
      hand-built fixture), edit one header, save, and confirm the git diff is one hunk.

---

## Files this phase touches

| File | What |
|---|---|
| `packages/shared/src/domain/api-client.ts` | **new** — the Postman v2.1 schemas (`z.lazy` + `.passthrough()`, both firsts in this package), `ApiRequestDraft`, `ApiResponse`, `ApiOpResultOf`, `toDraft`/`toPostmanRequest` (A) |
| `packages/shared/src/domain/api-client.test.ts` · `domain/__fixtures__/api-client/*.json` | **new** — three real exported collections, key-set round-trip (A) |
| [`packages/shared/src/domain/index.ts`](../../../packages/shared/src/domain/index.ts) | one `export *` line; the top-level barrel needs no edit (A) |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | seven `mstudio:api-client:*` channels (kebab verbs, per `channels.ts:6`), payload schemas in the `Db*` style, an `apiClient` namespace typed like `db` at `:974-992` (A) |
| [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) | `view.apiClient`, `group: 'view'`, **no** `chord` key — beside `view.video` at `:258` (B) |
| `packages/desktop/src/main/api-client/send.ts` · `interpolate.ts` · `collection-io.ts` | **new** — the engine, in `main/<feature>/` per the thirteen-directory convention (E, G) |
| `packages/desktop/src/main/api-client/send.test.ts` · `interpolate.test.ts` · `collection-io.test.ts` | **new** — against `startFixtureServer()`, never a `fetch` mock (E, G) |
| `packages/desktop/src/main/ipc/api-client-handlers.ts` | **new** — `registerApiClientHandlers(getWindow)`, every body try/caught because `handleOp` does not catch throws (E) |
| [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) | one registration line, after `registerDemoApiHandlers()` at `:356` (E) |
| [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) | the `apiClient` namespace at the `workflow`/`demoApi` block `:351-366`, **and** `\| 'apiClient'` in the `Pick` at `:101-145` (E) |
| [`packages/desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) | (**unchanged**) — load-bearing for every write in G; `confineParent`/`ensureConfinedDirs`/`createFile`/`openForOverwrite`/`confineTree` |
| [`packages/desktop/src/main/workflow/executors/http.ts`](../../../packages/desktop/src/main/workflow/executors/http.ts) | (**unchanged**) — the crib for `send.ts`; `HTTP_RESPONSE_CAP_BYTES` and `appendCapped` are imported, not copied (E) |
| [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | `'apiClient'` in **both** the `ViewId` union `:103-130` and the `VIEW_IDS` array `:133-152` (B) |
| [`packages/app/src/components/view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx) | a lazy `apiClient` entry in `VIEW_COMPONENT` `:140` — `Record`, so it is mandatory (B) |
| [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) | the sixth `WORKSPACE_NAV_ITEMS` entry at `:282`; **not** in `FORGE_GATED_VIEWS` `:330` (B) |
| [`packages/app/src/components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) | `apiClient: LuSend` in `VIEW_ICON` `:46` (B) |
| [`packages/app/src/components/nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts) | (**unchanged**) — deliberately no entry; a chord-free command would render an empty tooltip (B) |
| [`packages/app/src/store/persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) | `apiTreeWidth` in the **preference** partition; Phase 63's exhaustiveness check fails otherwise (B) |
| `packages/app/src/store/api-client-store.ts` · `api-client-store.test.ts` | **new** — tabs, drafts, derived dirty, in-memory responses. Not persisted, not an arm of `workbench-store` (C) |
| `packages/app/src/features/api-client/` | **new** — `api-client-view.tsx`, `collection-tree.tsx`, `request-builder.tsx`, `key-value-table.tsx`, `monaco-field.tsx`, `response-viewer.tsx`, plus their tests (B, C, D, F) |
| [`packages/app/src/features/files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) | (**unchanged**) — the Monaco theme/options recipe `monaco-field.tsx` repeats; **not** reusable directly, it is bound to `useFileEditorStore` (D) |
| [`packages/app/src/lib/monaco/monaco-loader.ts`](../../../packages/app/src/lib/monaco/monaco-loader.ts) · [`monaco-languages.ts`](../../../packages/app/src/lib/monaco/monaco-languages.ts) | (**unchanged**) — `getMonaco()` and the id table already cover `json`/`xml`/`graphql` (D) |
| `packages/app/e2e/api-client.spec.ts` · [`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) | **new spec**; the mock bridge learns an `apiClient` namespace and an `apiCollections` fixture (H) |
| Root [`.gitignore`](../../../.gitignore) | `.midnite/api/**/*.local.json` — for developing against this repo only; the user-repo rule is Phase 70 (G) |

---

## Verification

Reproduced per house convention; Theme H above carries the checkable items. In short:
`moon run :typecheck :lint :test` green; boundary lint clean with no new package and no renderer
`fetch`; the Postman round-trip proven by key-set equality against three real exported files; the
send engine proven against a loopback fixture server with the network off, covering 200/404/
timeout/abort/truncated; the import → browse → open → send → render path proven end to end in
Playwright; screenshots in both themes; and two human passes — one real external API, one
collection exported from a current Postman install.

---

## Not in this phase

- **Environments, the `{{var}}` second tier, and the secret overlay.** Owned by
  [Phase 70](phase-70-api-client-environments-tests-and-runs.md) Theme A. This phase interpolates
  against a collection's own `variable[]`, which is enough to make a collection portable and is
  already in the file format.
- **The `pm.*` test editor and its sandbox.** Owned by
  [Phase 70](phase-70-api-client-environments-tests-and-runs.md) Theme B. It is the only part of
  the original scope that executes user-supplied JavaScript in the main process, and
  [`workflow/executors/transform.ts`](../../../packages/desktop/src/main/workflow/executors/transform.ts)`:13`
  already refused exactly that once — *"That is a sandbox question, and opening it here would drag a
  security review into a phase that otherwise has none."* This phase keeps that property.
- **The collection runner.** Owned by
  [Phase 70](phase-70-api-client-environments-tests-and-runs.md) Theme C — it is meaningless before
  test scripts exist to aggregate.
- **Persisted request history and code generation.** Owned by
  [Phase 70](phase-70-api-client-environments-tests-and-runs.md) Theme D. Ten in-memory responses
  per tab ship here; writing any of them to disk needs the secret question answered first.
- **OAuth2, Digest and AWS Signature auth.** OAuth2 alone needs a redirect-capture flow and a
  token store; the app has a browser engine (Phase 32) that could host it, and that is the phase
  after Phase 70, not this one.
- **A new `packages/http-engine`.** The send path is one file behind one channel. A package
  boundary earns its cost when something else needs to import it under bare vitest, and nothing does.
- **curl import, Postman Cloud sync, WebSocket/gRPC/SSE.** Each is a second protocol or a second
  source of truth; both are the kind of scope that turns a client into a product.
- **Per-request proxy settings and TLS-verification toggles.** A "disable certificate verification"
  switch is a security decision that deserves its own default-off gate and confirm, in the manner
  of `Settings ▸ Git Safety`, not a checkbox smuggled into a request builder.

---

## Decisions / open questions

1. **Resolved — the phase is split; this is the core, [Phase 70](phase-70-api-client-environments-tests-and-runs.md)
   is the rest.** At eleven themes and 58 items this was a multi-week phase whose halves shared
   only a file format, and the tracker's standing preference is PR-sized themes. The line is drawn
   at *"can you open a real collection, send a request, and read the answer"* — everything on that
   path is here (A–G, 60 items across seven themes plus verification); everything that decorates it
   is Phase 70. The letters were re-lettered rather than left with holes: old J (import/export) is
   now G and old K (verification) is now H, which is safe because nothing is built, no PR references
   a letter, and `tracker-check` rule 5 compares the doc's letters to the index's theme key.
   *No human was available to confirm the split; recorded here as the recommendation acted on.*

2. **Resolved — `api-client-store.ts` is its own store, and does not become an arm of
   `workbench-store.ts`.** Stronger than the pre-refinement reasoning, on evidence:
   [`workbench-store.ts`](../../../packages/app/src/store/workbench-store.ts)`:20-26`'s
   `WorkbenchTab` is a closed four-arm union (`all-changes`/`run`/`review`/`commit`) of **read-only**
   surfaces, every arm keyed by `repoId` and none carrying a draft, a dirty flag, or an editable
   buffer. An API request tab is all three. And [Phase 61](phase-61-database-explorer.md)'s x1
   Decision 7 already settled the shared question the other way — *do not scope the store; filter by
   kind* — for query tabs that genuinely belong in the Changes workbench. These tabs do not appear
   there at all, so neither generalisation applies. Nothing blocks a later merge if both stores turn
   out to be the same shape.

3. **Resolved — the editors are Monaco, and GraphQL is a solved problem.** The pre-refinement doc
   built four editors on CodeMirror 6 and left GraphQL open on the grounds that *"GraphQL has no
   official CodeMirror 6 language package"*. Both premises are dead:
   [Phase 64](phase-64-offline-monaco-and-themes.md) Theme C replaced the Files-view editor with
   Monaco (`code-editor.tsx:24` — *"replaces CodeMirror 6"*), the seven `@codemirror/*` deps have
   **zero** importers left in `packages/app/src`, and Phase 64 Theme G exists to delete them.
   Monaco 0.56.0 ships Monarch grammars for `graphql`, `xml`, `html` and `javascript` under
   `esm/vs/basic-languages/`, and `monaco-languages.ts` already maps `graphql: 'graphql'`. So: no
   new dependency, no hand-rolled highlighter, no plain-text fallback, and no new CodeMirror debt in
   a phase landing after the decommission was scheduled.

4. **Resolved — `monaco-field.tsx` is a new controlled wrapper, not a reuse of `CodeEditor`.**
   `CodeEditor({fileName})` reads and writes `useFileEditorStore` directly (`:104`, `:113`) and
   derives its language from a file name; a body editor has neither a file nor that store. The
   alternative — generalising `CodeEditor` to take `value`/`onChange` — touches the Files view's
   save path for the benefit of a feature that has not shipped yet. If [Phase 61](phase-61-database-explorer.md)'s
   SQL editor lands and wants the same wrapper, lifting it to `components/` is a later, cheap move.

5. **Resolved — `view.apiClient` gets no chord.** `group: 'view'`, no `chord` key, following
   `view.video` (`keybindings.ts:258`) rather than `view.refresh` (`:186`, which is an action, not
   a navigation). Only five of nineteen views have a `view.*` command and
   `nav-chords.ts`'s `VIEW_COMMAND` is a `Partial` with five entries — a chord here would be the
   sixth reserved letter for a view most sessions never open, and `keybindings.ts:263` already
   records that the `Mod+Shift+` space is *"nearly exhausted"*. It is reachable from the rail and
   the palette.

6. **Resolved — `sendRequest` is a single `invoke`, not a stream.** The response body is capped at
   `HTTP_RESPONSE_CAP_BYTES` before it ever reaches the renderer, so there is no unbounded payload
   to chunk, and Phase 61's streaming `dbQueryBatch`/`dbQueryDone` pair exists because a result set
   is unbounded and a partial one is useful. A partial HTTP response is not. `cancelRequest` is
   still its own channel keyed on `requestId`, exactly as `DbQueryCancelRequest` is.

7. **Resolved — an unresolved `{{var}}` is left literal and warned about, not substituted with an
   empty string.** Substitution produces `https://api./users` and a 404 that reads as the server's
   fault; leaving the token in produces an obviously-wrong URL and a named warning. One
   interpolation pass only, no recursion into resolved values — a collection is a file the user did
   not necessarily write, and a self-referential variable should not be able to hang the main
   process.

8. **Resolved — the send engine's tests use the loopback fixture server, not a `fetch` mock.**
   The pre-refinement doc said "mocked `fetch`"; the repo's own precedent is the opposite and says
   why in writing — `main/demo-api/fixture-server.ts` exists so the http-executor suite passes
   *"with the machine's network cable out"*, and `executors.test.ts:18-22` starts it in `beforeAll`.
   A mock would not have caught the truncation-stops-reading behaviour, which is the one thing in
   Theme E that is easy to get wrong.

9. **Resolved — the gitignore rule that matters goes into the *user's* repository, not ours.**
   The pre-refinement doc's only ignore item was `.midnite/api/environments/*.local.json` in this
   repo's root `.gitignore`, which would have protected exactly one repository's secrets: this one.
   The collections and (in Phase 70) the overlays live under `.midnite/api/` in whatever repository
   the user has open. So Phase 70 Theme A writes a `.midnite/api/.gitignore` into the target repo
   on first import; this phase's root entry stays, as a convenience for developing the app against
   itself, and is labelled as such.

10. **Resolved — auth values are stored in plain text in this phase, and the UI says so.** Masking
    without the overlay is worse than no masking: it implies a protection that is not there. The
    Auth tab carries one line of literal copy pointing at the later release, and Phase 70 Theme A
    turns it on for real.

11. **Open — does the request-tab strip live inside the API Client view, or does an API request
    become a `WorkbenchTab` visible from the Changes view?** Decision 2 settles the *store*; this is
    the *surface* question, and it is genuinely open because [Phase 55](phase-55-multi-window-studio.md)
    made pages detachable and a detached API Client window would want its own strip either way.
    *Recommendation:* **inside the view.** It is what every other tabbed surface in the app does
    except the workbench, it needs no coordination with Phase 61, and a request tab appearing beside
    a commit diff has no story for what the tab strip means. Revisit only if detached windows
    turn out to need a shared strip.

12. **Open — where does the request timeout preference live?** Theme E names a
    `Settings ▸ API Client ▸ Request timeout` field with a 30 s default, which means an eighteenth
    settings page for one number. *Recommendation:* **do not add a page.** Put the field in the API
    Client view's own toolbar overflow menu, persisted in `api-client-store`'s (otherwise
    unpersisted) preference slice via `persisted-keys.ts`. If Phase 70 adds a second and third
    preference — it likely will, for the runner's delay and the script timeout — promote all of
    them to a page then, which is one move instead of three.
