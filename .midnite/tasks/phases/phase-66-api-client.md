# Phase 66 — API Client

A Postman-compatible API client, added as a new **API Client** entry in the Workspace sidebar
group alongside Explorer/Search/Tests. Import and edit real `.postman_collection.json` /
`.postman_environment.json` files, build and send requests with a full params/headers/body/auth
editor, switch environments with `{{variable}}` interpolation, write and run pre-request/test
scripts against a pinned `pm.*` subset, and batch-run a collection with an aggregate pass/fail
summary. This is the first phase to touch anything HTTP-client-shaped — there is no prior art
anywhere in this tracker beyond one workflow-scoped `fetch` call.

**Builds on.**
- [`packages/desktop/src/main/workflow/executors/http.ts`](../../../packages/desktop/src/main/workflow/executors/http.ts) —
  the only existing HTTP-send code in this repo. Its `HTTP_RESPONSE_CAP_BYTES` constant,
  `readCapped` streaming-with-cap reader, and `AbortController` + `setTimeout` timeout pattern
  (unref'd, plus a 100 ms poll of `context.signal.cancelled()` for mid-flight cancel) are the
  direct crib for Theme E's `sendRequest` handler — reused, not reinvented. One real difference:
  the workflow executor treats a non-2xx as `ok: true` because a 404 can be the *answer* a
  workflow condition is checking for; here every completed response (any status) is a successful
  `ApiResponse` for the same reason, and only a transport failure or timeout is `{ok:false}`.
- [`packages/desktop/src/main/ipc/repo-handlers.ts`](../../../packages/desktop/src/main/ipc/repo-handlers.ts) —
  the `handle`/`handleBare`/`handleOp` pattern from
  [`ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) every new
  `mstudio:apiClient:*` channel follows, registered the same way `registerRepoHandlers` is in
  [`main/index.ts`](../../../packages/desktop/src/main/index.ts).
- [`packages/shared/src/domain/result.ts`](../../../packages/shared/src/domain/result.ts) — the
  discriminated envelope convention. Like Phase 61's `db-engine` ops, an API-client op has no
  `conflict` arm to borrow from `GitOpResult`; it uses the same lighter `{ok:true, data} |
  {ok:false, kind:'error', message}` two-arm shape.
- [`packages/app/src/features/files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) —
  the existing CodeMirror 6 wiring (`@codemirror/language`, `@codemirror/state`,
  `@codemirror/view`, `@codemirror/commands`, `@codemirror/autocomplete`, `@codemirror/search`,
  `@codemirror/language-data` are all already dependencies). The JSON/raw/XML body editors and
  the test-script editor reuse this setup with a language extension swapped in, per-file, the
  same way Phase 61 planned to reuse it for SQL. **GraphQL has no official CodeMirror 6 language
  package** — see Decision 3.
- [`packages/app/src/components/tree-section.tsx`](../../../packages/app/src/components/tree-section.tsx) —
  the collapsible-section primitive already powering the Changes view's staged/unstaged rollup,
  reused for the collection/folder/request tree.
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts)'s `ViewId`
  and [`app.tsx`](../../../packages/app/src/app.tsx)'s `WORKSPACE_NAV_ITEMS` — the "Workspace
  group at the top of the sidenav" this feature was asked to live in is this exact array
  (Explorer/Search/Tests today); API Client becomes its fourth entry, ungated (no
  `FORGE_GATED_VIEWS` entry — nothing here depends on a GitHub remote).
- [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts)'s
  chord-free `view.refresh` entry — the precedent Theme B's `view.apiClient` command follows
  (see Decision 5).
- [`packages/desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) —
  Phase 24's writable-explorer confinement primitive (parent confined, symlink and `.git`
  refused at any depth, TOCTOU closed via descriptor). Theme J's collection/environment writes
  under the open repo's `.midnite/api/` go through this, not a new write path.
- Root [`.gitignore`](../../../.gitignore)'s existing `.env`/`.env.*` (with `!.env.example`)
  pattern — the precedent Theme G's `*.local.json` secret-overlay ignore rule follows.
- `packages/desktop/src/main/ipc/demo-api-handlers.ts` exists already and is unrelated — it is
  the Workflows feature's own throwaway demo HTTP *server* (Phase 43 Theme D), not a client.
  Named here only to head off the naming collision: this phase's handler file is
  `api-client-handlers.ts` and its bridge key is `apiClient`, never bare `api`.

**Scope guardrails.**
- **Auth is Bearer / Basic / API key only.** No OAuth2 (would need a redirect-capture flow,
  likely a hidden `BrowserWindow`), no Digest, no AWS Signature. Settled in the brainstorm.
- **Test-script sandboxing is a Node `vm` context running a pinned `pm.*` subset, not full
  isolation.** `pm.test`, `pm.expect` (a small chai-like subset), `pm.environment.get/set`,
  `pm.collectionVariables`, `pm.response.json()/text()/code/headers`, and read-only `pm.request`.
  **No `pm.sendRequest`** (chained requests) in v1. This is the same trust boundary the main
  process already has — not `isolated-vm`/`quickjs` — because most real collections' scripts
  fall inside this subset, and full isolation is only worth its cost against genuinely untrusted
  imported scripts, which this phase does not treat imported collections as.
- **The collection runner is sequential only — no data-file-driven iteration.** Run a
  folder/collection top to bottom against one environment; no CSV/JSON row substitution.
- **Import/export targets real Postman v2.1 JSON files only.** No curl import/export, no
  Postman Cloud API sync — both explicitly ruled out in the brainstorm rather than left
  ambiguous.
- **Collections and environments live repo-local, under `.midnite/api/`, git-versioned.** No
  app-global "scratch" workspace mode. A secret-valued environment field is written to a
  gitignored `*.local.json` overlay, never the committed base file — see Theme G.
- **The HTTP send path is Node's global `fetch` in the main process**, matching the existing
  workflow executor precedent exactly. No new `net.request`-based engine, no new
  `packages/http-engine` package — the send logic is one IPC handler, not a new package
  boundary, because the scope doesn't yet justify a new electron-free package the way
  `db-engine`'s five SQL drivers did.
- **No SSH tunneling, no client TLS certs, no cookie-jar persistence across requests, no request
  chaining (`pm.sendRequest`).** Each is a natural follow-on once the core client has real usage
  behind it.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Shared contracts: Postman v2.1 format (M)

- [ ] Add [`packages/shared/src/domain/api-client.ts`](../../../packages/shared/src/domain/api-client.ts):
      zod schemas for `PostmanCollection` (`info`, a recursive `item[]` folder/request tree),
      `PostmanRequest` (method, url, header[], body, auth), `PostmanEnvironment` (id, name,
      `values[]` of `{key, value, type: 'default' | 'secret', enabled}`), the renderer's editable
      `ApiRequestDraft` shape (distinct from the on-disk Postman shape), and `ApiResponse`
      (status, statusText, headers, body, bodyIsJson, durationMs, sizeBytes, truncated).
- [ ] Every object schema preserves unknown fields (`.passthrough()`) so a round-trip export
      never silently drops a key this app doesn't understand yet — the core "real Postman file
      compatibility" requirement from the brief.
- [ ] Add `BodyMode` (`'none' | 'json' | 'form-data' | 'urlencoded' | 'raw' | 'binary' |
      'graphql' | 'xml'`) — Theme D's content-type discriminant.
- [ ] Add channel constants to
      [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts)
      (`mstudio:apiClient:listCollections`, `importCollection`, `saveCollection`,
      `deleteCollection`, `listEnvironments`, `importEnvironment`, `saveEnvironment`,
      `deleteEnvironment`, `sendRequest`, `cancelRequest`, `runScript`), payload schemas in
      [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), and a new `apiClient` key in
      [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts)'s `MidniteStudioBridge`.
- [ ] `api-client.test.ts`: schema round-trips against 2–3 real Postman-exported fixture files
      committed under a `__fixtures__/` directory, asserting re-serialization preserves every
      original key (the passthrough contract, proven rather than assumed).

### B — Workspace nav + view registration (S)

- [ ] Add `'apiClient'` to `ViewId` in
      [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) and `viewForPath`.
- [ ] Add an **API Client** entry to `WORKSPACE_NAV_ITEMS` in
      [`app.tsx`](../../../packages/app/src/app.tsx) — the fourth entry, after
      Explorer/Search/Tests, ungated.
- [ ] Icon: `LuSend` from `react-icons/lu`, registered in
      [`components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) per
      [`CLAUDE.md`](../../../CLAUDE.md)'s one-icon-family rule.
- [ ] Add `view.apiClient` to `COMMANDS` in
      [`keybindings.ts`](../../../packages/shared/src/keybindings.ts) — `group: 'view'`, no
      chord (Decision 5).
- [ ] Add `packages/app/src/features/api-client/api-client-view.tsx`: the view shell —
      collection/environment tree on the left, tab strip + active tab's content on the right, an
      empty state when no collection exists yet (prompting Import).

### C — Sidebar tree + multi-request tabs (M)

- [ ] Add `features/api-client/collection-tree.tsx`, built on
      [`components/tree-section.tsx`](../../../packages/app/src/components/tree-section.tsx) —
      collections → folders → requests, with a second `TreeSection` below listing environments.
- [ ] Add `packages/app/src/store/api-client-store.ts`: the renderer's open-tabs list, active
      tab, and active-environment id, zustand, matching the existing `*-store.ts` pattern. **Not**
      `workbench-store.ts` — see Decision 1.
- [ ] A request tab shows method + name + a dirty dot, mirroring
      `features/workbench/tab-strip.tsx`'s existing unsaved-state convention.
- [ ] Context-menu actions per tree row: New request, New folder, Rename, Delete, Duplicate.
- [ ] `api-client-store.test.ts`: tab open/close/dirty lifecycle, active-environment persistence
      across tab switches.

### D — Request builder (L)

- [ ] Method/URL bar: a method dropdown (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) plus a URL
      input with inline `{{var}}` token highlighting.
- [ ] Params tab: a key/value table bidirectionally synced with the URL's query string.
- [ ] Headers tab: a key/value table with a per-row enabled checkbox (Postman's own convention —
      a disabled header is kept, not deleted).
- [ ] Auth tab: None / Bearer / Basic / API key pickers only (Decision — see Scope guardrails).
- [ ] Body tab with a content-type switcher covering every `BodyMode`: JSON/raw/XML via
      `code-editor.tsx`'s CodeMirror setup with the matching language extension; form-data and
      x-www-form-urlencoded as key/value tables like Headers; binary as a file picker; GraphQL as
      a split query/variables editor (see Decision 3 on the language-package gap).
- [ ] `request-builder.test.tsx`: switching content-type modes preserves each mode's own draft
      independently (JSON → raw → JSON round-trips without losing the JSON body).

### E — Main-process HTTP send engine (M)

- [ ] Add `packages/desktop/src/main/ipc/api-client-handlers.ts`:
      `registerApiClientHandlers(getWindow)`, following `repo-handlers.ts`'s
      `handle`/`handleOp` pattern, registered in
      [`main/index.ts`](../../../packages/desktop/src/main/index.ts) alongside the others.
- [ ] `sendRequest` handler: Node's global `fetch`, reusing `http.ts`'s `HTTP_RESPONSE_CAP_BYTES`
      cap, `readCapped`-style streaming, and `AbortController` + timeout pattern. Environment/
      collection-variable interpolation resolves here, immediately before the request is built —
      not in the renderer — so a secret value is read from disk once, used, and never held in
      renderer state any longer than the in-flight request needs.
- [ ] `cancelRequest` aborts the in-flight `AbortController`, mirroring the workflow executor's
      cancel path.
- [ ] Wire [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts)'s `apiClient`
      bridge methods.
- [ ] `api-client-handlers.test.ts` (mocked `fetch`): the timeout path, a transport-failure path
      (`{ok:false}`), and a 4xx/5xx response surfacing as an ordinary successful `ApiResponse`.

### F — Response viewer (M)

- [ ] Add `features/api-client/response-viewer.tsx`: a status/time/size header row, a headers
      table, and a body viewer with per-content-type rendering — JSON pretty-printed, XML
      formatted, HTML/text raw, an image preview for image content-types, a download affordance
      for anything else.
- [ ] Per-request response history kept in `api-client-store.ts` (last N responses, in-memory
      only — not persisted to disk, since a response is not part of the collection file).
- [ ] `response-viewer.test.tsx`: the content-type-driven rendering branch, the truncated-response
      banner when `ApiResponse.truncated` is set.

### G — Environments + variable interpolation (M)

- [ ] Add `features/api-client/environment-editor.tsx`: CRUD over an environment's key/value/
      enabled/type rows, matching Postman's own environment editor shape.
- [ ] An environment quick-switcher dropdown in the API Client view's own toolbar — scoped to
      this view, not the global status bar (Decision 4).
- [ ] Interpolation precedence: environment variables, then collection-scoped variables. No
      global-scope variables in v1 (Postman has a third tier; out of scope here).
- [ ] A value marked `type: 'secret'` is masked in the UI and, on save, split out of the
      committed base `*.postman_environment.json` into a sibling gitignored `*.local.json`
      overlay — transparent to the editor, which reads both and writes back to the correct one
      per field.
- [ ] Add `.midnite/api/environments/*.local.json` to the root
      [`.gitignore`](../../../.gitignore).
- [ ] `environment-resolution.test.ts`: interpolation precedence order, the secret split-on-save
      round-trip (edit a secret field, confirm the base file never contains its value).

### H — Test editor & sandboxed script runner (L)

- [ ] Add `features/api-client/test-editor.tsx`: `code-editor.tsx`'s CodeMirror setup with the
      JS language extension, two panes per request (pre-request script, test script) matching
      Postman's own layout.
- [ ] Add `packages/desktop/src/main/api-client/script-runner.ts`: a Node `vm` context exposing
      exactly the pinned `pm.*` subset named in Scope guardrails — `pm.test`, `pm.expect`,
      `pm.environment.get/set`, `pm.collectionVariables`, `pm.response.json()/text()/code/
      headers`, read-only `pm.request`. A script that throws surfaces as a failed assertion, not
      a crashed handler; a script that hangs is killed via `vm.Script`'s own `timeout` option.
- [ ] New `runScript(script, context)` IPC round-trip returning `{results: [{name, passed,
      error?}]}`, invoked automatically right after `sendRequest` resolves for a tab whose test
      script is non-empty.
- [ ] Add `features/api-client/test-results-panel.tsx`: a pass/fail list per request, one row per
      assertion.
- [ ] `script-runner.test.ts`: each pinned `pm.*` method exercised individually, the
      throw-becomes-failed-assertion path, the hang-timeout path.

### I — Collection runner (M)

- [ ] Add `features/api-client/collection-runner.tsx`: pick a folder or the whole collection plus
      an environment; "Run" executes every request sequentially — send, then its test script —
      no data-file iteration (Decision, Scope guardrails).
- [ ] Aggregate summary: total requests run, pass/fail assertion counts, a per-request expandable
      detail row.
- [ ] Abort mid-run, stopping before the next queued request fires.
- [ ] `collection-runner.test.tsx`: sequential ordering, the abort-mid-run path.

### J — Import/export & git-friendliness (S)

- [ ] File → Import (the existing native file-picker `dialog` pattern
      `repo-handlers.ts`'s `repoPickDirectory` already uses, adapted to `showOpenDialog` with a
      `.json` filter) accepting a real `.postman_collection.json` / `.postman_environment.json`,
      parsed through Theme A's schemas, written under `.midnite/api/collections/` or
      `.midnite/api/environments/` in the open repo via
      [`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts)'s confinement.
- [ ] Export/save-back writes the same Postman-shaped JSON, passthrough-preserved (Theme A),
      pretty-printed with a stable 2-space indent and stable key ordering — minimizing noisy git
      diffs on a trivial edit.
- [ ] `.midnite/api/` is created on first import if absent.
- [ ] `import-export.test.ts`: a real fixture file survives import → edit nothing → export with
      only whitespace-insignificant differences from the original.

### K — Verification (M)

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: `packages/app` reaches every new capability only through
      `window.midniteStudio.apiClient.*`; no new package boundary introduced.
- [ ] Playwright: API Client appears in the Workspace nav group; importing a fixture collection
      (no live network needed — a local fixture HTTP server or a mocked bridge), browsing its
      tree, opening a request tab, sending it, and seeing the response render.
- [ ] Playwright: editing headers/body/auth across content-type switches preserves each mode's
      draft independently.
- [ ] Playwright: switching environments changes `{{var}}` resolution in a request preview
      without reopening the tab.
- [ ] Playwright: a test script with a passing and a failing assertion renders both correctly in
      the test-results panel; a script that throws shows as a failed assertion, not a crash.
- [ ] Playwright: running a small fixture collection shows the aggregate pass/fail summary;
      aborting mid-run stops further requests.
- [ ] Playwright: import → edit nothing → export produces a file Git shows as unchanged (or
      whitespace-only) against the original fixture.
- [ ] Screenshots of the API Client view (empty state, request builder open, response viewer,
      environment editor, test results panel, collection runner summary), light and dark.
- [ ] **Open, for a human:** sending a real request against a real external API end-to-end (CI
      fixtures cover shape and behavior, not a live network path); a real round-trip import of a
      collection actually exported from a current Postman install, not a hand-built fixture.

---

## Files this phase touches

**New**
- [`packages/shared/src/domain/api-client.ts`](../../../packages/shared/src/domain/api-client.ts) — contracts (A).
- `packages/desktop/src/main/ipc/api-client-handlers.ts` · `packages/desktop/src/main/api-client/script-runner.ts` (E, H).
- `packages/app/src/store/api-client-store.ts` (C).
- `packages/app/src/features/api-client/` — `api-client-view.tsx`, `collection-tree.tsx`, `request-builder.tsx`, `response-viewer.tsx`, `environment-editor.tsx`, `test-editor.tsx`, `test-results-panel.tsx`, `collection-runner.tsx` (B, C, D, F, G, H, I).

**Changed**
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — new `apiClient` channels/bridge key (A).
- [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — bridge wiring (E).
- [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) — `registerApiClientHandlers` call (E).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `ViewId`, `viewForPath` (B).
- [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) — `WORKSPACE_NAV_ITEMS` entry (B).
- [`packages/app/src/components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) — `LuSend` mapping (B).
- [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — `view.apiClient` command (B).
- Root [`.gitignore`](../../../.gitignore) — `.midnite/api/environments/*.local.json` (G).
- `packages/app/package.json` — a GraphQL CodeMirror extension if Decision 3 resolves to adopting one (D).

---

## Verification

See Theme K above — reproduced here per house convention: `moon run :typecheck :lint :test`
green, boundary lint clean, the API Client view's full import → browse → build request → send →
test → collection-run flow proven end-to-end against local fixtures in CI, and a human pass
against a real external API plus a real Postman-exported collection.

---

## Decisions / open questions

1. **`api-client-store.ts` is its own store, not a generalization of `workbench-store.ts`.**
   *Settled.* `WorkbenchTab`/`WorkbenchTabKind` today power the Changes view's own tab strip, and
   Phase 61 (Database Explorer, unbuilt) separately plans to lift it to be usable per-view. Two
   unbuilt phases racing to generalize the same store is a real coordination risk; this phase
   avoids it by building its own tab state from the start, following the same pattern rather
   than sharing the same store. If Phase 61 lands first and generalizes `workbench-store.ts`
   cleanly, a later phase could migrate this store onto it — not a blocker for either.
2. **Persistence is repo-local under `.midnite/api/`, git-versioned, with a gitignored secret
   overlay.** *Settled in the brainstorm.* See Theme G's `*.local.json` split.
3. **GraphQL body editing has no official CodeMirror 6 language package.** *Open, needs a call
   when Theme D is actually built.* Options: a community package (e.g. `cm6-graphql`, unofficial
   and unvetted for maintenance/security), a minimal hand-rolled syntax highlighter (JSON-like,
   since GraphQL query syntax is simple enough to approximate), or ship the GraphQL body as a
   plain-text `raw`-mode editor with no syntax highlighting for v1 and revisit. Recommendation:
   ship plain-text for v1 — GraphQL was an additive scope item from the brainstorm, not a
   headline requirement, and a missing syntax highlighter is a visible but non-blocking gap.
4. **The environment switcher lives in the API Client view's own toolbar, not the global status
   bar.** *Recommendation, not yet settled.* This feature's environment concept only means
   anything inside this view — putting it in the shared status bar would imply an app-wide
   scope it doesn't have. Revisit if usage shows people want to see/switch the active environment
   without the view open.
5. **`view.apiClient` gets no chord.** *Recommendation, not yet settled.* Mirrors Phase 61
   Decision 4's reasoning for the Database view: reachable via the rail click and the command
   palette; a niche view doesn't need a reserved keybinding slot on day one.
6. **`pm.*` script sandbox is a Node `vm` context, not `isolated-vm`/`quickjs`.** *Settled in the
   brainstorm,* on the basis that most real collections' scripts fall inside the pinned subset
   and full isolation is only worth its cost against genuinely untrusted imported scripts.
7. **The collection runner has no data-file-driven iteration.** *Settled.* Sequential run over a
   folder/collection only; CSV/JSON row substitution is a natural follow-on phase once the core
   client has usage behind it.
