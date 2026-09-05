# Phase 70 — The API client grows an environment, a test and a run

**Refined: x1** · 2026-09-05 · plan shape (split), data model & IPC contract, security & blast radius, persistence, concurrency, testing & verification

[Phase 66](phase-66-api-client.md) taught this app to open a real Postman collection, build a
request and read the answer. **This phase is the other half of it** — the parts that turn a
request sender into an API client you would actually keep a collection in: environments with a
two-tier `{{var}}` resolution and a secret overlay that never reaches a commit, a `pm.*` test
editor running in a sandbox in main, a sequential collection runner with an aggregate pass/fail,
and the two conveniences that only make sense once all of that exists — persisted request history
and "copy as curl".

It exists as its own phase because Phase 66 was eleven themes and 58 items before it was refined,
and because three of the four themes here have a cost Phase 66 deliberately declines to pay: this
is the phase that executes user-supplied JavaScript, and the phase that writes a secret to disk.
Both deserve to be reviewed as their own change, not smuggled in behind a request builder. See
Phase 66 Decision 1.

**Blocked on Phase 66 landing Themes A, C, E and G.** Not partially — every theme here extends a
symbol Phase 66 introduces, and none of them is meaningful against a client that cannot yet send.

**Builds on.**
- [`packages/shared/src/domain/api-client.ts`](../../../packages/shared/src/domain/api-client.ts)
  (Phase 66 Theme A) — `PostmanEnvironmentSchema` already ships there, `.passthrough()` like
  everything else in the file, because Phase 66's importer has to *recognise and refuse* an
  environment file with a real message. Theme A here is the first code that reads it.
- `packages/desktop/src/main/api-client/interpolate.ts` (Phase 66 Theme E) — one-pass `{{var}}`
  resolution against a collection's own `variable[]`, called from `send.ts` immediately before the
  request is built. Theme A adds the second tier **at that same call site**, which is why Phase 66
  put interpolation in main rather than the renderer in the first place.
- `packages/desktop/src/main/api-client/send.ts` (Phase 66 Theme E) — the `fetch` + `readCapped` +
  `AbortController` engine. Theme C's runner calls it in a loop; it does not get its own.
- [`packages/desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) —
  `confineParent`, `ensureConfinedDirs`, `createFile` (`O_CREAT|O_EXCL|O_WRONLY`),
  `openForOverwrite` (`O_RDWR|O_NOFOLLOW`), `confineTree` (both sides through `realpath`).
  Theme A's overlay writes go through these, like Phase 66 Theme G's collection writes.
- [`packages/desktop/src/main/workflow/executors/transform.ts`](../../../packages/desktop/src/main/workflow/executors/transform.ts)`:13` —
  the repo's one written position on this subject, and the reason Theme B is its own theme in its
  own phase: *"**No JS evaluation.** That is a sandbox question, and opening it here would drag a
  security review into a phase that otherwise has none."* Phase 43 declined it. This phase accepts
  it, deliberately and in one place.
- **There is no `vm` usage anywhere in `packages/desktop`** — `require('vm')`, `from 'vm'` and
  `node:vm` all return zero hits. Theme B is the first, so it carries the whole convention with it
  rather than following one.
- [`packages/app/src/features/api-client/monaco-field.tsx`](../../../packages/app/src/features/api-client/monaco-field.tsx)
  (Phase 66 Theme D) — the controlled `<Editor>` wrapper. The test editor is this component with
  `language: 'javascript'`, which means Monaco's TypeScript worker (one of the five inlined in
  [`lib/monaco/monaco-loader.ts`](../../../packages/app/src/lib/monaco/monaco-loader.ts)) gives the
  `pm.*` editor real completion for free — see Theme B's ambient `.d.ts` item.
- [`packages/app/src/store/api-client-store.ts`](../../../packages/app/src/store/api-client-store.ts)
  (Phase 66 Theme C) — tabs, derived-dirty drafts, and the ten-deep in-memory `responses` map that
  Theme D here persists a redacted subset of.
- [`packages/app/src/features/actions/actions-view.tsx`](../../../packages/app/src/features/actions/actions-view.tsx) —
  the run-list + detail-pane skeleton Theme C's runner copies, right down to its resizable
  `layout.actionsJobsHeight` split.
- [`packages/desktop/src/main/council-output.ts`](../../../packages/desktop/src/main/council-output.ts)'s
  `appendCapped` and `COUNCIL_OUTPUT_CAP_BYTES` — already the cap behind
  `HTTP_RESPONSE_CAP_BYTES`; Theme B caps a script's `console.log` output with the same function
  rather than inventing a second budget.
- [`packages/shared/src/redact.ts`](../../../packages/shared/src/redact.ts) (Phase 65 Theme B) —
  `redactPaths`, the existing home-dir redactor. Theme D's persisted history reuses its shape for
  a *value* redactor rather than writing a second one from scratch.

**Scope guardrails.**
- **Auth is still Bearer / Basic / API key only.** OAuth2 is *not* in this phase either. It needs a
  redirect-capture flow and a token store with a refresh clock, and the app's browser engine
  (Phase 32) is where it would live — a separate phase, after this one.
- **The `pm.*` surface is a pinned subset, and the pin is a list in a file.** `pm.test`,
  `pm.expect` (a small chai-like subset), `pm.environment.get/set`, `pm.collectionVariables.get/set`,
  `pm.response.json()/text()/code/headers`, read-only `pm.request`, and `pm.variables.get`.
  **No `pm.sendRequest`** — chained requests are a different execution model and would make the
  runner re-entrant.
- **The sandbox is a Node `vm` context, not `isolated-vm` or QuickJS.** Settled in the brainstorm
  and re-affirmed at x1 with the mitigation list Theme B carries: `vm` is not a security boundary,
  so the boundary is built out of what *is* one — no `require`, no `process`, no globals but the
  pinned surface, a hard `timeout`, and a default-off consent gate for a collection this machine
  did not create. See Decision 2.
- **The collection runner is sequential only.** One request at a time, top to bottom, against one
  environment. No parallelism, no CSV/JSON data-file iteration, no retries.
- **Code generation is one-way and reads from the draft, not the wire.** "Copy as curl" and "Copy
  as fetch" only. No import from curl, no client-library scaffolding, no OpenAPI.
- **Persisted history is redacted, capped and repo-local.** It is not a second copy of your
  credentials, and Theme D's whole design is about that.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Landing order.** A first — it is the only theme the other three all read from (the runner needs
an environment to run against, the test scripts need `pm.environment`, and history needs to know
which environment produced a response). Then B and D in parallel; C last, because it aggregates
B's results.

## Deliverables

### A — Environments, two-tier `{{var}}`, and the secret overlay (M)

- [ ] Add `packages/desktop/src/main/api-client/environment-io.ts`:
      `listEnvironments(repoRoot)`, `readEnvironment(repoRoot, id)`,
      `saveEnvironment(repoRoot, env)`, `deleteEnvironment(repoRoot, id)`, each returning Phase 66's
      `ApiOpResultOf(...)` envelope and each going through `confineTree`/`confineParent` before it
      touches a path.
  - Files live at `.midnite/api/environments/<slug>.postman_environment.json` in the **open
    repository**, beside Phase 66's `collections/`.
- [ ] The secret split, and it is the whole point of the theme. On save, a value whose row has
      `type: 'secret'` is written to a sibling
      `.midnite/api/environments/<slug>.local.json` — a flat `Record<string, string>` keyed by the
      variable's `key` — and the committed base file keeps the row with **`value: ''`** and its
      `type: 'secret'` intact.
  - The base file keeps the row, not just the key, so a teammate who pulls the repo sees *which*
    secrets a collection needs and gets empty fields to fill, rather than a request that fails with
    an unresolved variable and no hint.
  - Read merges the overlay over the base, per key. The editor is unaware of the split: it reads a
    merged environment and writes a whole one, and `saveEnvironment` does the partitioning.
- [ ] `ensureApiGitignore(repoRoot)` writes `.midnite/api/.gitignore` containing `*.local.json`
      (plus a comment line naming Midnite Studio) on the first environment save, if absent.
  - This is the rule that actually protects a user, and Phase 66 Decision 9 records why: Phase 66's
    root-`.gitignore` entry protects this repository only, and a user's secrets are in *their* repo.
  - It is written with `createFile` (`O_CREAT|O_EXCL`), so an existing `.gitignore` is never
    clobbered; if one exists without the pattern, append through `openForOverwrite` after reading,
    and if the pattern is already there, do nothing.
- [ ] **A save that would write a secret into a repository with no `.gitignore` protection blocks
      on a confirm**, in the manner of every other destructive op in this app: a dialog naming the
      file path, the number of secret-valued rows, and what will be ignored. Cancel writes nothing.
      Getting this wrong once puts a production bearer token in a public repo's history, which is
      not a thing an undo fixes.
- [ ] Add `features/api-client/environment-editor.tsx`:
      `export function EnvironmentEditor({ repoId, environmentId }: {...})` — a `KeyValueTable`
      (Phase 66 Theme D's) with two extra columns: a `type` toggle (`default` ⇄ `secret`) and the
      `enabled` checkbox it already has.
  - A `secret` row's value renders as `••••••••` with a reveal-on-hold eye button; the value is
    still in renderer memory (it has to be, to be edited), and the mask is a shoulder-surfing
    defence, not a security control. The tooltip says so in one clause.
- [ ] An environment quick-switcher in the API Client view's own toolbar — a `<select>`-shaped
      popover listing every environment plus **"No environment"**, defaulting to none.
  - It lives **in the view, not the global status bar** (Phase 66's Decision 4, now settled): the
    environment concept means nothing outside this view, and a status-bar slot would advertise an
    app-wide scope it does not have.
  - The active environment id is per-repo and **is** persisted — `activeEnvironmentByRepo:
    Record<string, string | null>` in `api-client-store`'s preference slice, registered in
    [`store/persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts). It is a
    preference, not session state: coming back to a repo and finding yourself pointed at prod
    because the app forgot is the failure mode.
- [ ] Extend Phase 66's `interpolate.ts` to two tiers, resolved in this order and no other:
      **environment variable → collection variable → left literal with a warning.** Postman has a
      third, global tier; it is still out of scope, and the resolver's doc comment says so.
  - One pass, still. A resolved value containing `{{b}}` is not re-expanded — Phase 66 Decision 7's
    reasoning holds and gets stronger once an environment can be edited by anyone with commit
    access to the repo.
- [ ] `ApiSendRequestRequest` gains `environmentId: string | null`; main loads the merged
      environment at send time and never accepts variable *values* from the renderer.
  - This is the reason the secret survives: a secret value is read from disk in main, interpolated,
    put on the wire, and dropped. It is in renderer memory only while the environment editor is
    open on it.
- [ ] `main/api-client/environment-io.test.ts`: save with two secret rows and assert the base file
      contains **neither value** (a substring assertion on the raw bytes, not a parsed compare);
      read merges the overlay back; a deleted secret row removes its overlay key; the `.gitignore`
      is created once and not duplicated on a second save; `confineTree` refuses a symlinked
      `environments/` and writes nothing.
- [ ] `main/api-client/interpolate.test.ts` gains: environment shadows collection; a disabled
      environment row does not shadow; both tiers missing leaves the token literal with one warning
      naming it; a value containing `{{b}}` is not re-expanded.

### B — The test editor and the sandboxed `pm.*` runner (L)

- [ ] Add `packages/desktop/src/main/api-client/script-runner.ts`:
      `export function runScript(source: string, context: ScriptContext, timeoutMs: number): ScriptRun`,
      where `ScriptRun = {results: AssertionResult[], logs: string[], mutations: {environment:
      Record<string,string>, collectionVariables: Record<string,string>}, error: string | null}` and
      `AssertionResult = {name: string, passed: boolean, error?: string}`.
- [ ] The context is built with `vm.createContext(sandbox, {codeGeneration: {strings: false, wasm:
      false}})` and run with `new vm.Script(source).runInContext(ctx, {timeout: timeoutMs,
      breakOnSigint: true})`.
  - `codeGeneration.strings: false` kills `eval`/`new Function` inside the context — the first
    thing a script would reach for to break out.
  - `timeout` only interrupts synchronous code. An `await`-shaped hang is not caught by it, so the
    sandbox exposes **no** async primitive at all: no `setTimeout`, no `Promise` on the sandbox
    object, no `fetch`. A script that cannot start an async operation cannot hang asynchronously.
- [ ] The sandbox object is an explicit allow-list and nothing else: `pm`, `console` (a stub with
      `log`/`warn`/`error` appending through `appendCapped` into `logs`), `JSON`, `Math`, `Date`,
      `String`, `Number`, `Boolean`, `Array`, `Object`, `RegExp`, `Error`. **No `require`, no
      `process`, no `Buffer`, no `globalThis` passthrough, no `module`.**
  - A named test asserts each of those five absences individually — one `expect(() =>
    run('process.exit(0)')).…` per line — because "we didn't add it" and "it isn't reachable" are
    different claims and only the second one is worth anything.
  - `vm` is **not** a security boundary and the file's header says so in the first paragraph. The
    boundary here is the allow-list plus Theme B's consent gate, not the module.
- [ ] `pm.environment.set(k, v)` and `pm.collectionVariables.set(k, v)` write into the `mutations`
      record and **do not touch disk**. The handler applies them after the run, through Theme A's
      `saveEnvironment`, which is where the secret split and the confirm live. A sandbox with a
      file descriptor is not a sandbox.
- [ ] `pm.expect` is a small chai-like subset with a fixed surface: `.to.equal`, `.to.eql` (deep),
      `.to.be.a(type)`, `.to.be.true/false/null/undefined`, `.to.include`, `.to.have.property(k)`,
      `.to.have.status(n)`, `.to.be.above/below(n)`, and `.not` inverting any of them. Anything else
      throws `TypeError: pm.expect(...).to.X is not supported` — a named failure the user can act
      on, not `undefined is not a function`.
- [ ] A script that throws outside a `pm.test` sets `ScriptRun.error` and yields zero results; a
      script that throws *inside* one becomes that test's `{passed: false, error}`. A `vm` timeout
      becomes `error: 'Script timed out after {n} ms.'` — never a rejected IPC invoke, and never a
      crashed handler.
- [ ] **Consent gate: scripts do not run by default for a collection this machine did not import
      itself.** A collection carries a `_midniteScriptsTrusted` marker in the sibling
      `.local.json` (gitignored, therefore never travelling with the file); without it, a request
      with a non-empty script shows a one-time bar — **"This collection contains scripts. Run
      them?"** with *Run once* / *Always for this collection* / *Never*.
  - This is the trust boundary Phase 66's scope guardrails deliberately deferred, made explicit.
    A collection is a file a colleague sends you; the difference between that and a shell script
    they send you is only that this one looks like data.
  - The marker lives in the `.local.json` overlay rather than the collection because a trust
    decision must not be committable — otherwise trusting it once trusts it for the whole team.
- [ ] Two channels: `apiRunScript: 'mstudio:api-client:run-script'` (a plain `handle`, since a
      script run is bounded by its own timeout) and `apiSetScriptTrust:
      'mstudio:api-client:set-script-trust'`. Both added to
      [`channels.ts`](../../../packages/shared/src/ipc/channels.ts)'s Phase 66 group with kebab
      verbs, both typed onto the `apiClient` bridge namespace.
- [ ] `runScript` is invoked automatically from the renderer immediately after `sendRequest`
      resolves, for a tab whose test script is non-empty **and** whose collection is trusted. Not
      from inside the send handler: the runner (Theme C) needs to call send without scripts and
      scripts without send, and fusing them removes that seam.
- [ ] Add `features/api-client/test-editor.tsx`: two `MonacoField`s with `language: 'javascript'`,
      labelled **Pre-request Script** and **Tests**, in a fifth builder tab named **Scripts** with a
      count badge when either is non-empty.
  - Ship an ambient `pm.d.ts` string registered via
    `monaco.languages.typescript.javascriptDefaults.addExtraLib(...)` so the pinned surface
    autocompletes and an unsupported `pm.sendRequest` red-squiggles in the editor rather than
    failing at run time. The `.d.ts` is generated from the same list the sandbox allow-lists, in
    one file, so the two cannot drift.
- [ ] Add `features/api-client/test-results-panel.tsx`: one row per assertion with a pass/fail
      glyph and the failure message inline, a `logs` disclosure below it, and — when scripts are
      untrusted — the consent bar instead.
- [ ] `main/api-client/script-runner.test.ts`: every pinned `pm.*` method exercised individually;
      each of the five escape attempts (`require`, `process`, `Buffer`, `globalThis.constructor`,
      `eval`) asserted unreachable; `while(true){}` hits the timeout and returns an error rather
      than hanging the suite; a throw inside `pm.test` becomes a failed assertion and a throw
      outside becomes `error`; `pm.environment.set` appears in `mutations` and **not** on disk
      (assert the file is byte-identical after the run).

### C — The collection runner (M)

- [ ] Add `features/api-client/collection-runner.tsx`:
      `export function CollectionRunner({ repoId, collectionId }: {...})` — a target picker (whole
      collection, or one folder), the environment picker from Theme A, a **Run** button, and a
      results pane, laid out like
      [`features/actions/actions-view.tsx`](../../../packages/app/src/features/actions/actions-view.tsx)'s
      list-plus-detail split.
- [ ] Add `packages/desktop/src/main/api-client/runner.ts`:
      `export async function runCollection(req: ApiRunCollectionRequest, emit: (e: ApiRunEvent) =>
      void, signal: AbortSignal): Promise<ApiRunSummary>` — a flat depth-first walk of the item tree
      in file order, calling Phase 66's `sendApiRequest` then Theme B's `runScript` per request.
- [ ] **This one streams**, unlike `sendRequest` (Phase 66 Decision 6): a run is unbounded in
      duration and a partial run is exactly what the user wants to watch. Two `EVENT_CHANNELS`
      entries — `apiRunProgress: 'mstudio:api-client:run-progress'` and `apiRunDone:
      'mstudio:api-client:run-done'` — carrying a `runId`, following
      `dbQueryBatch`/`dbQueryDone`'s pattern and typed on the bridge as
      `onRunProgress(handler) => Unsubscribe`.
- [ ] A request that fails at the transport level does **not** stop the run: it is recorded with
      zero assertions and an error, and the walk continues. A run that stopped on the first
      unreachable host would be useless against a partly-deployed environment, which is when you run
      one.
- [ ] Abort: **Stop** aborts the in-flight request's `AbortController` and stops before the next
      one is dequeued. The summary is emitted anyway, marked `aborted: true`, with the requests that
      never ran listed as `skipped` rather than silently absent.
- [ ] `ApiRunSummary = {runId, total, completed, skipped, passed, failed, durationMs, aborted}`,
      rendered as a header strip over an expandable per-request list: request name, status pill,
      duration, and its assertion rows (Theme B's `test-results-panel.tsx`, reused, not
      re-implemented).
- [ ] A run is **in-memory only** — no run history on disk in this phase. Theme D persists *request*
      history, which is a different and smaller thing; a run's responses would multiply the redaction
      surface by the size of a collection.
- [ ] `main/api-client/runner.test.ts`: file-order sequencing across a nested folder fixture
      (assert the exact order, not just the count); a mid-run abort leaves later requests `skipped`
      and emits a summary; a transport failure on request 2 of 4 still runs 3 and 4; a script that
      calls `pm.environment.set` affects the *next* request in the same run (the one behaviour that
      makes a runner more than a for-loop).

### D — Request history and code generation (S)

- [ ] Persist a redacted request history per repo at `.midnite/api/history.local.json` —
      **`.local.json`, therefore covered by Theme A's `.gitignore`**, capped at 200 entries,
      evicting oldest-first.
  - Each entry is `{id, at, method, url, status, durationMs, sizeBytes, collectionId, itemPath,
    environmentId}` — metadata only. **No headers, no request body, no response body.** A URL is
    stored with its query string; a value that matched a secret-typed environment variable at send
    time is replaced with `{{key}}`, reusing [`shared/src/redact.ts`](../../../packages/shared/src/redact.ts)'s
    shape for a value redactor.
  - The cap evicts the **row**, and there is no sidecar file to evict with it — the bug Phase 45
    found twice in stores that had one is structurally absent here.
- [ ] A **History** section below the collection tree, listing the last N for the open repo, newest
      first, each row re-openable as a tab pre-filled from the collection item it names (not from the
      history row — the row has no body, and re-sending a stale body would be a lie about what it
      does).
- [ ] A **Clear history** action with a confirm naming the entry count.
- [ ] `Copy as curl` on a request tab's overflow menu, and on a history row: generates a
      shell-quoted `curl` invocation from the **draft**, with `{{var}}`s **left unresolved**.
  - Unresolved on purpose, and a one-line note in the copied output says so: resolving them puts a
    bearer token on the clipboard and, very often, straight into a Slack message. A user who wants
    the resolved form can paste the variables themselves.
  - Add `packages/shared/src/domain/api-codegen.ts` — `toCurl(draft): string` and
    `toFetch(draft): string`, pure functions in `shared` so they are testable under bare vitest and
    usable from either process.
- [ ] `Copy as fetch` — the same, emitting a JS `fetch(url, {method, headers, body})` snippet.
- [ ] `api-codegen.test.ts`: shell-quoting a header value containing a single quote and a space;
      a `form-data` body becoming repeated `-F` flags; a `binary` body becoming
      `--data-binary @path`; a disabled header omitted; `{{var}}` surviving verbatim through both
      generators.

### E — Verification (M)

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: nothing new in `git-engine`, no renderer `fetch`, no new package. The
      Phase 66 grep assertion (`packages/app/src/features/api-client/` contains zero `fetch(`) still
      passes with this phase's files in it.
- [ ] Vitest (A): the base file provably contains no secret value; overlay merge on read; the
      `.gitignore` written once; two-tier precedence and the disabled-row case.
- [ ] Vitest (B): every pinned `pm.*` method; all five escape attempts unreachable; the timeout; the
      throw-inside vs throw-outside split; `pm.environment.set` not touching disk.
- [ ] Vitest (C): exact file-order sequencing; abort leaves `skipped`; a transport failure does not
      stop the walk; a variable set by request 1's script is visible to request 2.
- [ ] Vitest (D): the codegen quoting cases and the redaction of a secret-valued query parameter.
- [ ] Playwright: create an environment with one plain and one secret row, save, and assert
      (through a filesystem read in the spec, not the UI) that the committed file holds the plain
      value and not the secret one.
- [ ] Playwright: switching environments changes a request's resolved-URL preview without
      reopening the tab.
- [ ] Playwright: a test script with one passing and one failing assertion renders both; a script
      that throws renders as an error row and the app does not hit an error boundary.
- [ ] Playwright: the consent bar appears for an untrusted collection, *Run once* runs the script,
      and a reload shows the bar again (proving the marker was not written).
- [ ] Playwright: running a four-request fixture collection shows the aggregate summary; **Stop**
      mid-run leaves the remainder marked skipped.
- [ ] Screenshots, light and dark: the environment editor with a masked row, the Scripts tab, the
      test-results panel with a mixed pass/fail, the runner summary, and the history section.
- [ ] **Open, for a human:** take a collection with real pre-request and test scripts from an actual
      project and run it — the pinned `pm.*` subset's coverage is an empirical claim, and the only
      way to check it is against scripts nobody here wrote.
- [ ] **Open, for a human:** clone the repo fresh on a second machine, confirm the secrets are
      absent and the base environment's rows are present-but-empty, and fill them in. This is the
      whole promise of the overlay and it cannot be tested in one checkout.

---

## Files this phase touches

| File | What |
|---|---|
| [`packages/shared/src/domain/api-client.ts`](../../../packages/shared/src/domain/api-client.ts) | `ApiRunEvent`, `ApiRunSummary`, `AssertionResult`, `ScriptRun`; `PostmanEnvironmentSchema` is already there from Phase 66 (A, B, C) |
| `packages/shared/src/domain/api-codegen.ts` · `api-codegen.test.ts` | **new** — `toCurl`/`toFetch`, pure, in `shared` so bare vitest can reach them (D) |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | environment CRUD + `run-script` + `set-script-trust` + `run-collection`/`cancel-run` in `CHANNELS`; `run-progress`/`run-done` in **`EVENT_CHANNELS`** (A, B, C) |
| `packages/desktop/src/main/api-client/environment-io.ts` · `.test.ts` | **new** — the secret split, `ensureApiGitignore`, all writes through `fs-scope-write` (A) |
| `packages/desktop/src/main/api-client/interpolate.ts` | Phase 66's one-pass resolver gains the environment tier; still one pass (A) |
| `packages/desktop/src/main/api-client/script-runner.ts` · `.test.ts` | **new** — the repo's **first** `node:vm` use; allow-list sandbox, `codeGeneration.strings: false`, hard timeout, no async primitive (B) |
| `packages/desktop/src/main/api-client/runner.ts` · `.test.ts` | **new** — sequential walk calling `sendApiRequest` + `runScript`, streaming progress (C) |
| `packages/desktop/src/main/api-client/history.ts` · `.test.ts` | **new** — 200-cap redacted metadata at `history.local.json` (D) |
| `packages/desktop/src/main/ipc/api-client-handlers.ts` | Phase 66's file gains this phase's handlers; every body still try/caught (A, B, C, D) |
| [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) | new methods on the existing `apiClient` namespace, plus the first `subscribe(...)` entries in it (C) |
| [`packages/desktop/src/main/fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) | (**unchanged**) — load-bearing for A and D |
| [`packages/desktop/src/main/council-output.ts`](../../../packages/desktop/src/main/council-output.ts) | (**unchanged**) — `appendCapped` caps a script's `console.log` output (B) |
| [`packages/app/src/store/api-client-store.ts`](../../../packages/app/src/store/api-client-store.ts) | `activeEnvironmentByRepo`, `scriptTrust`, `runs`, `history` (A, B, C, D) |
| [`packages/app/src/store/persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) | `activeEnvironmentByRepo` in the **preference** partition — Phase 63's exhaustiveness check (A) |
| `packages/app/src/features/api-client/environment-editor.tsx` · `environment-switcher.tsx` | **new** — the masked `KeyValueTable` and the in-view picker (A) |
| `packages/app/src/features/api-client/test-editor.tsx` · `test-results-panel.tsx` · `script-consent-bar.tsx` | **new** — two `MonacoField`s at `language: 'javascript'`, the ambient `pm.d.ts`, the trust bar (B) |
| `packages/app/src/features/api-client/collection-runner.tsx` | **new** — target + environment + Run, `actions-view.tsx`'s split (C) |
| `packages/app/src/features/api-client/history-section.tsx` | **new** — below the collection tree (D) |
| [`packages/app/src/features/api-client/monaco-field.tsx`](../../../packages/app/src/features/api-client/monaco-field.tsx) | (**unchanged**) — Phase 66's wrapper, reused at `language: 'javascript'` (B) |
| `packages/app/e2e/api-client-environments.spec.ts` · `api-client-scripts.spec.ts` · [`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) | **new specs**; the mock bridge learns environments, script runs and run events (E) |

---

## Verification

Reproduced per house convention; Theme E above carries the checkable items. In short:
`moon run :typecheck :lint :test` green and boundary lint clean; the secret overlay proven by a
raw-bytes assertion that the committed file never contains a secret value; the sandbox proven by
five individually-named escape attempts and a timeout that does not hang the suite; the runner
proven on exact file order, abort-leaves-skipped, and a variable set by one script reaching the
next request; codegen proven on shell quoting and on `{{var}}` surviving unresolved; Playwright
over environments, scripts, consent and a four-request run; screenshots in both themes; and two
human passes — real third-party scripts, and a fresh clone on a second machine.

---

## Not in this phase

- **OAuth2, Digest and AWS Signature auth.** OAuth2 needs a redirect-capture flow, a token store
  and a refresh clock; the browser engine from [Phase 32](phase-32-browser-engine-and-tabs.md) is
  where it would live. It is the next API-client phase, not a theme of this one.
- **`pm.sendRequest` and request chaining.** It makes the runner re-entrant and turns a script into
  a program with its own network budget. The pinned subset is pinned partly to keep that door shut.
- **Data-file-driven iteration (CSV/JSON rows).** Postman's collection runner takes a data file and
  runs N iterations. That is a second execution model over the same walk, and it wants the runner to
  have proven itself on one iteration first.
- **Parallel or retrying runs.** Sequential is what makes a run reproducible, and reproducibility is
  the only reason to run a collection rather than click through it.
- **Run history on disk.** Theme D persists *request* metadata; a run's per-request responses would
  multiply the redaction surface by the size of the collection for a feature nobody has asked for.
- **`isolated-vm` or a QuickJS sandbox.** See Decision 2 — the honest position is that `vm` plus a
  hard allow-list plus consent is proportionate here, and that a *real* isolate is what you build
  when you decide to run scripts you have never seen without asking. Recorded, not dismissed.
- **Global-scope variables (Postman's third tier).** Two tiers cover a collection that travels with
  a repo. A third, machine-global tier has no home in a repo-local design and would be the first
  thing to leak between projects.

---

## Decisions / open questions

1. **Resolved — this phase exists because [Phase 66](phase-66-api-client.md) was split.** Eleven
   themes and 58 items was a multi-week phase whose halves shared only a file format. Phase 66 keeps
   everything on the *open a collection → send → read the answer* path; this phase takes the four
   things that decorate it, and it takes them **because they are the expensive ones** — one executes
   user JavaScript, one writes secrets to disk. Reviewing those as their own change is the point,
   not an accident of splitting. *No human was available to confirm the split; recorded as the
   recommendation acted on.*

2. **Resolved — the sandbox is Node `vm` with an allow-list and a consent gate, not `isolated-vm`.**
   Re-affirmed at x1, but with the reasoning made honest: `vm` **is not a security boundary** — a
   sufficiently determined script can reach the host realm through a prototype chain — so the
   security comes from what is in the context, not from the module. Hence: no `require`, no
   `process`, no `Buffer`, `codeGeneration.strings: false`, no async primitive, a hard `timeout`,
   mutations returned as data rather than applied, and scripts off by default for a collection this
   machine did not import. `isolated-vm` is a native module and would be this repo's second, with
   the dual-ABI cost [Phase 61](phase-61-database-explorer.md) Decision 6 documents at length; QuickJS
   is a WASM blob with its own bridging cost. Neither is proportionate to *"most real collections'
   scripts are five lines of `pm.test`"*. The test suite asserts the five specific escapes, so the
   claim is checked rather than asserted.

3. **Resolved — the secret overlay keeps the row in the base file with an empty value.** The
   alternative — omitting the row entirely — makes the base file smaller and the teammate's
   experience worse: they clone, run a request, and get an unresolved-variable warning with no
   indication that a secret was ever expected. An empty-valued row is a form to fill in.

4. **Resolved — the environment switcher lives in the API Client view's toolbar.** Phase 66 carried
   this as a recommendation; it is settled here because this is the phase that builds it. The
   environment concept is scoped to this view, and a status-bar slot would claim otherwise. The
   *selection* is persisted per repo, though — an app that forgets and silently points you at
   production is the failure this guards against.

5. **Resolved — trust is stored in the gitignored `.local.json`, not in the collection.** A trust
   decision that could be committed would trust a collection for everyone who pulls it, which
   inverts the gate. Keeping it in the overlay means trust is per-machine, which is what "I looked at
   these scripts" actually means.

6. **Resolved — the runner streams, and `sendRequest` still does not.** Phase 66 Decision 6 argued a
   capped single response has nothing to chunk. A run does: it is unbounded in time, and watching
   request 3 of 40 go red is the feature. Two `EVENT_CHANNELS` entries keyed by `runId`, following
   `dbQueryBatch`/`dbQueryDone`.

7. **Resolved — `Copy as curl` leaves `{{var}}` unresolved.** Resolving is the obvious behaviour and
   the wrong one: the most common destination for a copied curl is a chat message. The copied text
   carries a one-line comment saying the variables are unresolved, so the behaviour is visible
   rather than surprising.

8. **Open — does a `pm.environment.set` during a normal (non-run) send write to disk?** Theme B
   returns mutations as data and the handler applies them through `saveEnvironment` — which, for a
   secret-typed key, triggers Theme A's confirm dialog. A confirm firing after every send would be
   intolerable. *Recommendation:* **apply mutations to non-secret keys silently, and hold secret-key
   mutations in memory for the session with a one-time notice.** A script setting a secret is
   almost always caching a token it just fetched, and a token that lives for the session is the
   right lifetime for it anyway. Settle before Theme B's handler is written; it changes the
   signature.

9. **Open — what happens to a run when the repo is switched mid-run?** Phase 66's
   `closeRepoTabs(repoId)` aborts in-flight sends for that repo. A run is longer-lived and the user
   may well switch away deliberately to do something else while it finishes. *Recommendation:*
   **let it finish, and surface it in the status bar** the way a long-running fetch already is —
   aborting work the user started because they navigated is the more annoying of the two failures.
   If that proves fiddly, abort with a toast naming the run; do not silently drop it.
