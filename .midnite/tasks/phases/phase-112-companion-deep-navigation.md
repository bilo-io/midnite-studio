# Phase 112 — Companion deep navigation: open any resource

**Written with the user** (via `/midnite-ideate`) · 2026-10-10

[Phase 81](phase-81-where-the-companion-can-take-you.md) taught the companion and the `ui.*` MCP
tools to go to **any view or settings page**, plus three arguments that already had store-level
actions: an issue number, a settings page and a URL. It deliberately stopped there — its *Not in
this phase* list names "open the file `bar.ts`" as a seam to be built page by page. Say "show me
the commit about the lock screen", "open my chat about auth" or "pull up the dragon model" today
and the best the companion can do is open the right *page* and leave you to find the thing.

This phase lets the companion — by voice/STT and by typing — and an agent over the `midnite` MCP
server **open a specific resource inside a page**: a commit selected and scrolled to in the graph,
a chat, a live or closed session, a note, a kanban card, a workflow run, a model, a DB table, a
settings section. It builds one shared **`ResourceRef`** union, one **`revealResource(ref)`**
engine, a programmatic way into every page that does not have one, a **resolver** that turns
spoken descriptions into refs, the grammar and follow-ups ("this one", "the next one", "its PR",
"go back") on top, and the MCP/deep-link surfaces that reuse it all.

Scope guardrails:
- **Reveal only shows.** Select, scroll, focus, expand-to-visible, highlight. It never plays,
  runs, checks out, sends, stages or edits. Acting on a resource stays Phase 81's per-page
  deferred work; the companion's *authority* is unchanged, only its *aim* improves.
- **No new index, no new inference path.** The resolver scans list APIs that already exist; the
  `ask.ts` router learns the new target shape but does not choose among candidates.
- **Bodies never leave over MCP.** `ui.find` returns kind, id, title and a short label — never a
  chat transcript, note body or diff.
- **Phase 81's rules hold for every reveal**: execution happens in the main window (popouts
  relay), detached windows are focused rather than duplicated, a locked screen refuses, and the
  unsaved-file guard can block a navigation.
- Package boundaries as ever: the ref schema is `shared` (zod only); every opener is `app`;
  `desktop` only carries the MCP tools, the protocol parse and the request/reply it already has.

> **Effort tags:** S ≈ ≤ 2h · M ≈ half-day to a day · L ≈ 1–2 days. Themes A and B land first;
> C, D, E, F and G are independent of each other once B is in; H needs G; I needs B (and G for
> `ui.find`).

> **Findings, verified against the current tree, that this phase is built on.**
>
> **1. There is no resource-reference type anywhere.** The `navigate` intent
> ([`companion.ts`](../../../packages/shared/src/companion.ts), `navigate` arm ~`:2770`) is
> `{ view?, page?, issue?, url? }`; `CompanionUiActionSchema`
> ([`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) ~`:4155`) mirrors it; `ui.navigate`
> ([`mcp.ts`](../../../packages/shared/src/mcp.ts) ~`:464`) takes view/page/issue and not even
> `url`. The nearest things to refs are palette item-id prefixes in
> [`providers.ts`](../../../packages/app/src/services/palette/providers.ts) (`ref:reveal:`, `file:`,
> `session:`, `repo-issue:`, `project-board:`), `GraphSelection` in
> [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) and `MediaSelection {project, path}`.
>
> **2. Selection is split three ways.** Some pages already expose a store action:
> `selectCommit(sha)` (graph), `useFilesStore.revealFile`, `useReviewsStore.selectPull`,
> `openIssueModal`, `useActionsStore.selectRun/selectJob`, `useChatsStore.select`,
> `revealSession` ([`reveal-session.ts`](../../../packages/app/src/features/terminal/reveal-session.ts)),
> `selectLiveSession/selectClosedSession`, `useDatabaseConnectionsStore.select`, the workbench and
> API-client `openTab`, `browserStore.openTab`, `setProjectBoard`. Some have a **one-shot
> open-request store** fed by an MCP event — model, terrain, sprite
> ([`use-model-agent-events.ts`](../../../packages/app/src/features/media/model/use-model-agent-events.ts)
> is the pattern), plus `useWorkflowRevealStore`. The rest are **component-local `useState`**: the
> selected note (`notes-view.tsx`), kanban card (`tasks-view.tsx`), workflow (`workflows-view.tsx`),
> every media tab other than model/terrain/sprite, the file-diff expansion (`changes/expansion.ts`),
> and councils, which sit behind a hook-only history (`councils-history-store.ts`).
>
> **3. Three MCP "open" tools are half-wired.** `game_open` emits `gamesOpen` and preload exposes
> `games.onOpen`, but nothing in the renderer subscribes. `music_open` and `map_goto` subscribe
> inside their tab components (`audio-tab.tsx`, `map-tab.tsx`), so they do nothing unless that tab
> is already mounted, and they never switch the view.
>
> **4. The graph cannot reveal a commit it has not loaded.** `graph-view.tsx` scrolls the
> virtualizer to the selected row only if the row is in the loaded window and not filtered out;
> `resolveRevision` ([`queries.ts`](../../../packages/app/src/services/queries.ts)) expands short
> shas. There is no named "reveal sha" that pages in, clears a filter and lands. File reveal has
> no line; settings have no section anchors.
>
> **5. Nothing can find a non-git thing by name.** The palette's sources are built inside
> `palette.tsx` from hooks; the Search view (Phase 25) is git only. Lists that a resolver can scan
> already exist: `chats.list`, live and closed sessions, `notes-store` (bodies in memory), the MCP
> `*_list` families, `graph.log`, `forge.pulls`, the loaded issues.
>
> **6. The deep-link protocol knows two verbs.** [`protocol-parse.ts`](../../../packages/desktop/src/main/protocol-parse.ts)
> accepts `open?repo=` and `clone?url=` only.

## Headlines

*The companion and MCP agents can open a specific commit, chat, session, note, card, model, table
or setting — not just the page it lives on.* Planned 2026-10-10.

**Theme A — `ResourceRef`, one shape for "a thing in the app".** ◻ Zod union in `shared` across git, agent work, notes/media and tools/settings; `navigate.target`; `CompanionUiAction` gains `reveal`/`find`; one spoken-label helper.

**Theme B — `revealResource`, the engine.** ◻ Plain function over a total per-kind revealer table, reusing Phase 81's window/popout/lock/unsaved-guard plan; a `last revealed` slot for follow-ups.

**Theme C — Git + forge revealers.** ◻ Commit reveal that always lands (page in, unfilter, scroll, pulse), branch/tag/stash, file + line, file diff within a commit, PR, issue, CI run/job.

**Theme D — Agent-work revealers.** ◻ Chat, live/closed session, council (out of the hook-only history), workflow + run, kanban board + card (out of component state).

**Theme E — Notes + media revealers.** ◻ Note and doc, and open-request stores for image, video, audio, map and game; fix the dead `game_open` and the mount-dependent `music_open`/`map_goto`.

**Theme F — Tools + settings revealers.** ◻ DB connection and table, API-client request, browser tab, settings section anchors.

**Theme G — The resolver.** ◻ `findResources(query, kinds?)` scanning existing lists with fuzzy ranking, recency words ("latest", "previous") and a cap; no new index.

**Theme H — Grammar, ambiguity and follow-ups.** ◻ Target phrases in `parseIntent`, numbered-chip disambiguation as one pending choice, "this / next / its PR / back", and the `ask.ts` router taught the target shape.

**Theme I — MCP `ui.reveal`/`ui.find` and the deep link.** ◻ Two tools behind `allowUi` (titles and ids only), `ui.navigate.url`, `ui.state.selection`, and `midnite-studio://reveal?ref=`.

---

## Deliverables

### A — `ResourceRef`, one shape for "a thing in the app" (M)

- [ ] New [`packages/shared/src/domain/resource-ref.ts`](../../../packages/shared/src/domain/resource-ref.ts):
      `ResourceRefSchema`, a `z.discriminatedUnion('kind', …)`, re-exported from the package
      index. Every variant carries the minimum needed to find it again, and a repo-scoped one
      carries `repoId`:
      ```ts
      // git + forge
      | { kind: 'commit'; repoId; sha }            | { kind: 'ref'; repoId; fullName }   // branch/tag/remote
      | { kind: 'stash'; repoId; index }           | { kind: 'file'; repoId; path; line?: number }
      | { kind: 'commitFile'; repoId; sha; path }  | { kind: 'pull'; repoId; number }
      | { kind: 'issue'; repoId; number }          | { kind: 'ciRun'; repoId; runId; jobId? }
      // agent work
      | { kind: 'chat'; id }                       | { kind: 'session'; id; closed?: boolean }
      | { kind: 'council'; id; runId? }            | { kind: 'workflow'; id; runId? }
      | { kind: 'board'; repoId; projectId }       | { kind: 'card'; repoId; projectId; cardId }
      // notes + media
      | { kind: 'note'; id }                       | { kind: 'media'; repoId; media: MediaKind; project; path? }
      // tools + settings
      | { kind: 'dbTable'; connectionId; table? }  | { kind: 'apiRequest'; repoId; collectionId; itemPath }
      | { kind: 'browserTab'; url }                | { kind: 'setting'; page: SettingsPageId; section?: string }
      ```
      `MediaKind` = `doc | image | video | audio | model | terrain | sprite | map | game`.
      Export `RESOURCE_KINDS` and `ResourceKind`.
  - *Acceptance:* `resource-ref.test.ts` round-trips one fixture per kind and rejects a missing
    discriminator, a negative `line` and an unknown `media`.
- [ ] `resourceRefLabel(ref, names?)` in the same file — the **spoken/visible** short label
      ("commit a1b2c3d", "PR 812", "the *Auth* chat", "the dragon model"), following Phase 80
      Theme A's spoken-form rules (short sha as 7 characters, never a full URL, host only).
      Pure; titles come from the optional `names` map so `shared` stays data-only.
- [ ] The `navigate` intent in [`companion.ts`](../../../packages/shared/src/companion.ts) gains
      `target?: ResourceRef` and a new `reference?: 'this' | 'next' | 'previous' | 'parent' | 'back'`
      (Theme H fills the second). Existing `view/page/issue/url` keep working unchanged; `issue` is
      kept as a shorthand that normalises to `{ kind: 'issue' }`.
- [ ] `CompanionUiActionSchema` in [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) gains
      `{ type: 'reveal'; ref: ResourceRef }` and `{ type: 'find'; query: string; kinds?: ResourceKind[]; limit?: number }`;
      the `ipc.test.ts` channel↔schema table needs no new channel (both ride `companionUiRequest`).

### B — `revealResource`, the engine (M)

- [ ] New [`packages/app/src/features/companion/reveal/reveal.ts`](../../../packages/app/src/features/companion/reveal/reveal.ts):
      `revealResource(ref, opts: { caller: 'companion' | 'mcp' | 'link' }) => Promise<RevealOutcome>`
      where `RevealOutcome = { ok: true; did: 'revealed' | 'focused-window'; label } | { ok: false; reason: 'locked' | 'not-found' | 'no-repo' | 'blocked-unsaved' | 'unavailable'; say }`.
      A plain function over `getState()` and `bridge()`, like the rest of the companion's
      [`runtime.ts`](../../../packages/app/src/features/companion/runtime.ts) — no hooks.
- [ ] A **total** revealer table, `REVEALERS: { [K in ResourceKind]: Revealer<K> }` in
      `reveal/revealers.ts`, each entry `{ view: ViewId; reveal(ref): Promise<RevealOutcome> }`.
      Adding a kind to `ResourceRefSchema` without a revealer is a type error. Themes C–F fill
      the entries; this theme lands them as `unavailable` stubs.
- [ ] The plan step reuses [`navigate.ts`](../../../packages/app/src/features/companion/navigate.ts)
      `resolveNavigation` for the revealer's `view`: detached page → `focusRole` then reveal in
      that window via the existing relay; popout companion → relay to main; locked → refused;
      `setActiveView` runs inside `guardNavigation`, and a blocked guard returns
      `blocked-unsaved` without selecting anything. A repo-scoped ref whose `repoId` is not the
      selected repo calls `selectRepo` first (the `use-model-agent-events.ts` order).
- [ ] A **`lastRevealed`** slot (`reveal/reveal-history.ts`, a small zustand store, not
      persisted): the last 20 successful refs with timestamps, read by Theme H's follow-ups and
      by `ui.state`.
- [ ] `act()` in [`handoff.ts`](../../../packages/app/src/features/companion/handoff.ts): a
      `navigate` with `target` calls `revealResource` and speaks `say`/*"Here's {label}."*; speech
      and selection happen together (Phase 81 Theme B's rule).
  - *Acceptance:* `reveal.test.ts` — one case per plan branch (focus, relay, locked, unsaved
    guard, repo switch, stub `unavailable`), with fake revealers.

### C — Git + forge revealers (M)

- [ ] **A commit reveal that always lands.** `revealCommit(repoId, sha)` in
      [`features/graph/`](../../../packages/app/src/features/graph/): resolve a short sha with
      `resolveRevision`; if the row is not loaded, page the graph in until it is (bounded — give
      up past the existing history cap with `not-found` and *"That commit is older than the graph
      has loaded — search for it instead."*); if a ref filter hides it, clear the filter and say
      so; `selectCommit(sha)`; scroll the virtualizer to centre it; pulse the row once (respecting
      the Phase 46 motion policy).
- [ ] `ref` → reveal its tip commit and highlight the ref badge; `stash` → `graphSelection
      {kind:'stash'}`; `file` → `useFilesStore.revealFile(path)` plus a `line` that the preview
      scrolls to and highlights (new optional `line` on the files store's reveal — closes the gap
      noted in `knowledge-node-panel.tsx`).
- [ ] `commitFile` → reveal the commit, then expand that file's diff in the commit inspector
      through a new store-level `expandFile(sha, path)` lifted out of `changes/expansion.ts`.
- [ ] `pull` → `useReviewsStore.selectPull`; `issue` → `openIssueModal` (moves Phase 81's issue
      path onto the table); `ciRun` → `useActionsStore.selectRun`, then `selectJob` when given.
  - *Acceptance:* vitest per revealer against store fakes; one Playwright spec (real virtualizer
    scroll + `getBoundingClientRect`) that reveals a commit outside the loaded window and asserts
    it is selected and inside the viewport.

### D — Agent-work revealers (M)

- [ ] `chat` → `setActiveView('chats')` + `useChatsStore.select(id)` (the
      `ref-agent-avatar.tsx` sequence).
- [ ] `session` → live: `revealSession(id)`; closed: Sessions view + `selectClosedSession(id)`.
- [ ] `council` → lift the history in `councils-history-store.ts` so a plain function can
      `push({ kind: 'council' | 'run', id })` without the hook; the view consumes the same store.
- [ ] `workflow` → `useWorkflowRevealStore.reveal({ workflowId, runId })`; move the
      `workflows-view.tsx` `selectedId` into that store so a reveal works when the view is not
      yet mounted.
- [ ] `board`/`card` → `setProjectBoard(repoId, projectId)`; lift the selected card out of
      `tasks-view.tsx` `useState` into a store field, open the card and scroll it into view.
  - *Acceptance:* each lifted selection keeps its existing click behaviour (the view's own vitest
    suites stay green unchanged) and a reveal issued **before** the view mounts is honoured on mount.

### E — Notes + media revealers (M→L)

- [ ] `note` → Notes view + a store-level `selectNote(id)` lifted from `notes-view.tsx`.
- [ ] `media` → `setActiveView('media')`, `openMedia(tab)`, then the tab's selection. Model,
      terrain and sprite already have open-request stores; **add the same one-shot pattern** for
      doc, image, video, audio, map and game, each consumed by its `*-tab.tsx` on mount and on
      change.
- [ ] Fix **`game_open`**: subscribe to `games.onOpen` in an app-level listener (beside the model/
      terrain/sprite listeners mounted in [`app.tsx`](../../../packages/app/src/app.tsx)) that
      routes through `revealResource({ kind: 'media', media: 'game', … })`.
- [ ] Fix **`music_open`** and **`map_goto`**: move their subscriptions from `audio-tab.tsx` /
      `map-tab.tsx` to app-level listeners that switch view and tab first, then hand the payload
      to the new open-request store — so they work from any view.
  - *Acceptance:* a vitest per media kind — a reveal while another view is active ends with
    `activeView === 'media'`, the right tab, and the item selected after mount.

### F — Tools + settings revealers (M)

- [ ] `dbTable` → `useDatabaseConnectionsStore.select(connectionId)`; with `table`, open (or focus
      an existing) query tab via `useWorkbenchStore.openTab({ kind: 'query', … })` showing that
      table's preview query — **not executed** (reveal only shows).
- [ ] `apiRequest` → API-client `openTab`/`focusTab` for that item; never sends.
- [ ] `browserTab` → focus an existing tab with that URL, else `openTab(url)` (Phase 81's url path,
      moved onto the table).
- [ ] `setting` → `setSettingsPage(page)` and, with `section`, scroll to and briefly highlight an
      anchor. Add `id`/`data-settings-section` anchors to each settings page's section headers
      and a `SETTINGS_SECTIONS: Record<SettingsPageId, readonly { id; label; keywords }[]>` table
      in `app` that the resolver and grammar read.

### G — The resolver (L)

- [ ] New [`packages/app/src/features/companion/reveal/resolve.ts`](../../../packages/app/src/features/companion/reveal/resolve.ts):
      `findResources(query, opts?: { kinds?: ResourceKind[]; limit?: number }) => Promise<ResourceMatch[]>`
      with `ResourceMatch = { ref; title; detail?; score }`. Plain function, no index: it asks one
      **source** per family and merges.
- [ ] Sources, each `(query) => Promise<ResourceMatch[]>`, reading lists that already exist:
      commits (`graph.log` message search, capped), refs, PRs (`forge.pulls`), loaded issues,
      chats (`chats.list` titles + previews), live and closed sessions, councils, workflows and
      runs, boards and cards, notes (titles + in-memory bodies), media (each `*_list`), DB
      connections and tables, API collections, settings pages + `SETTINGS_SECTIONS`.
- [ ] Ranking reuses the palette's [`fuzzy-match.ts`](../../../packages/app/src/services/palette/fuzzy-match.ts)
      and frecency store; recency words resolve without fuzzy matching — "latest/last/most recent
      {kind}", "previous {kind}", "the one before". A kind word in the query ("chat", "commit",
      "model", "note") narrows `kinds`. Exact ids win outright (a sha prefix, `#812`, `PR 812`).
- [ ] Budget: each source has a timeout (300 ms) and a result cap; a slow source is dropped from
      that answer, never blocks it.
  - *Acceptance:* `resolve.test.ts` with fake sources — kind narrowing, exact-id win, recency
    words, a timed-out source omitted, ties broken by recency. No wall-clock assertions.

### H — Grammar, ambiguity and follow-ups (M)

- [ ] `parseIntent` ([`companion.ts`](../../../packages/shared/src/companion.ts)) learns target
      phrases after `NAVIGATE_VERBS` ("open/show/pull up/go to/take me to") — a kind word plus a
      description, an exact id, or a recency word — and emits `navigate { target: { kind: 'query', … } }`
      as an **unresolved** form that the app resolves through Theme G. (`shared` stays free of the
      resolver; it only recognises the shape.)
- [ ] **Ambiguity:** one match → reveal. Several → the companion says *"Three chats match — the
      first is {title}."* and posts numbered chips; "two", "the second", a chip click or Return on
      the first resolves it. One pending choice at a time, expiring like Phase 81's confirm tier
      (60 s); a new request replaces it. None → *"I couldn't find a {kind} matching {query}."*
- [ ] **Follow-ups** from `lastRevealed` and the live selection: "this {kind}" → the current
      selection; "the next/previous one" → the adjacent item in the same list (graph row, chat
      list, session list); "its PR" / "its commit" / "its run" → a small `RELATED` map
      (commit → PR via `forge.pulls` head sha, PR → head commit, CI run → commit, card → PR if
      linked); "go back" → `panel.back` history.
- [ ] The `ask.ts` route prompt ([`ask.ts`](../../../packages/desktop/src/main/companion/ask.ts)
      `buildAskPrompt`) documents the `target` and `reference` shapes and the resource kinds, so a
      phrasing the regex misses still comes back as a validated `navigate` intent. `parseAskReply`
      fixtures for each.
- [ ] **Verb precedence** with Phase 111's planned `switchAgent`, written into `parseIntent`'s
      order and tested: repo → agent/model → view → resource.
  - *Acceptance:* `companion.test.ts` phrase fixtures (≥ 40, spanning all four families),
    `handoff.test.ts` for chip resolution and expiry, one e2e in
    [`companion-panel.spec.ts`](../../../packages/app/e2e/companion-panel.spec.ts) typing "open my
    chat about auth" with two seeded matches and picking "two".

### I — MCP `ui.reveal`/`ui.find` and the deep link (M)

- [ ] `MCP_TOOLS` in [`mcp.ts`](../../../packages/shared/src/mcp.ts) gains `ui.reveal`
      (`readOnly: false`, input `{ ref: ResourceRef }`, output `{ did, label }`) and `ui.find`
      (`readOnly: true`, input `{ query; kinds?; limit? ≤ 20 }`, output `{ matches: { ref; title; detail?; link }[] }`
      — **titles and ids only, never bodies**). Both are gated by the existing `allowUi` switch in
      [`mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts); `ui.find` is refused with
      the switch off too, because it enumerates the user's work. Descriptions obey the `mcp.test.ts`
      ≤ 220-char rule.
- [ ] `ui.navigate` gains the missing `url` field; `ui.state` gains `selection: ResourceRef | null`
      and `lastRevealed: ResourceRef | null`.
- [ ] Main side: both go through [`ui-bridge.ts`](../../../packages/desktop/src/main/companion/ui-bridge.ts)
      `requestUiAction` (5 s timeout); renderer side [`ui-requests.ts`](../../../packages/app/src/features/companion/ui-requests.ts)
      runs `revealResource(…, { caller: 'mcp' })` / `findResources`, posts the existing *"Agent:
      opened {label}"* toast, and records in the audit ring.
- [ ] **Deep link:** [`protocol-parse.ts`](../../../packages/desktop/src/main/protocol-parse.ts)
      accepts `midnite-studio://reveal?ref=<base64url JSON>`, validated with `ResourceRefSchema`,
      and forwards it to the main window as a `reveal` action (`caller: 'link'`). `resourceRefLink(ref)`
      in `shared` builds the URL; `ui.find` results carry it. An invalid ref is a toast, never a throw.
  - *Acceptance:* `server.test.ts` — switch off → both refused before IPC; `tools.test.ts` —
    `ui.find` output contains no field longer than the title cap; `protocol-parse.test.ts` —
    valid, malformed-base64 and schema-failing refs; the mcp-shim list test counts the two new
    tools and checks `ui.reveal`'s `ref` is a JSON-schema `oneOf`.

## Files this phase touches

| Area | Files |
|---|---|
| Contract | [`shared/src/domain/resource-ref.ts`](../../../packages/shared/src/domain/resource-ref.ts) (new), [`shared/src/companion.ts`](../../../packages/shared/src/companion.ts), [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) |
| Engine | [`app/src/features/companion/reveal/`](../../../packages/app/src/features/companion/) (new: `reveal.ts`, `revealers.ts`, `reveal-history.ts`, `resolve.ts`), [`navigate.ts`](../../../packages/app/src/features/companion/navigate.ts), [`handoff.ts`](../../../packages/app/src/features/companion/handoff.ts), [`runtime.ts`](../../../packages/app/src/features/companion/runtime.ts), [`ui-requests.ts`](../../../packages/app/src/features/companion/ui-requests.ts) |
| Git | [`features/graph/`](../../../packages/app/src/features/graph/), `changes/expansion.ts`, [`features/files/files-store.ts`](../../../packages/app/src/features/files/files-store.ts), reviews/actions/issues stores |
| Agent work | chats store, [`reveal-session.ts`](../../../packages/app/src/features/terminal/reveal-session.ts), `councils-history-store.ts`, `workflows-view.tsx` + workflow reveal store, `tasks-view.tsx` |
| Notes + media | `notes-view.tsx`, notes store, each `media/*/…-tab.tsx`, `use-model-agent-events.ts` (pattern), [`app.tsx`](../../../packages/app/src/app.tsx) listeners |
| Tools + settings | DB connections + workbench stores, API-client store, [`browser-store.ts`](../../../packages/app/src/store/browser-store.ts), [`settings-pages/`](../../../packages/app/src/features/settings/settings-pages/) anchors |
| Desktop | [`main/companion/ask.ts`](../../../packages/desktop/src/main/companion/ask.ts), [`main/companion/ui-bridge.ts`](../../../packages/desktop/src/main/companion/ui-bridge.ts), [`main/mcp/tools.ts`](../../../packages/desktop/src/main/mcp/tools.ts), [`main/protocol-parse.ts`](../../../packages/desktop/src/main/protocol-parse.ts), `main/games/game-mcp.ts` |

## Verification

- [ ] `moon run :typecheck :lint :test` green; no new `no-restricted-imports` exceptions.
- [ ] Every `ResourceKind` has a non-stub revealer (a test iterates `RESOURCE_KINDS` and asserts no
      `unavailable` outcome against seeded fakes).
- [ ] Voice pass (packaged app, real STT): "show me the commit about the lock screen", "open my
      last chat", "pull up the dragon model", "open settings, companion voice section", "the next
      one", "its PR", "go back" — each lands on the right thing, spoken label matches.
- [ ] Ambiguity pass: a query with three matches shows chips; "two" opens the second; a chip
      expires after 60 s.
- [ ] Graph pass: revealing a commit beyond the loaded window and one hidden by a ref filter both
      land selected and on screen.
- [ ] MCP pass from a real agent session: `ui.find` → `ui.reveal` on a returned ref opens it with a
      toast; with "Let agents steer the UI" off both are refused naming the switch; `ui.find`
      output carries no note or chat body.
- [ ] `game_open`, `music_open` and `map_goto` work from the Graph view.
- [ ] A `midnite-studio://reveal?ref=…` link opened from a terminal reveals the resource; a
      malformed one shows a toast.
- [ ] Detached-window and popout-companion reveals follow Phase 81's rules (focus, relay); a
      locked screen refuses; an unsaved buffer blocks with the dialog up.

## Not in this phase

- **Acting on a resource on arrival** — playing a clip, running a query, sending a request,
  checking out a ref, opening a file for editing. Reveal only shows; per-page actions remain Phase
  81's deferred, page-by-page work.
- **Resource chips rendered in notes, chats and the companion thread** from `midnite-studio://`
  links — the link form lands here; rendering it everywhere is a follow-up for `outstanding.md`.
- **A persistent search index** (SQLite FTS or similar) and **CLI-chosen candidates**. Revisit only
  if the scan resolver proves too slow on real histories.
- **MCP repository writes** — still Phase 57 Decision 5's deferred follow-up.
- **Bodies over MCP** — `ui.find` never returns transcripts, note bodies or diffs.

## Decisions / open questions

1. **Scope: all four families.** *Settled by the user* — git + forge, agent work, notes + media,
   tools + settings — split into Themes C–F so they parallelise once A and B land.
2. **Resolver backing.** *Settled: scan existing lists*, fuzzy-ranked, per-source timeout. Rejected:
   a persistent index in main (a new subsystem), the CLI choosing among candidates (a round-trip on
   every ambiguous turn).
3. **Ambiguity.** *Settled: speak the count and the first title, show numbered chips*, one pending
   choice, 60 s expiry. Rejected: open-best-and-cycle (wrong thing appears), always-picker (not
   hands-free).
4. **MCP exposure.** *Settled: titles and ids only, under the existing `allowUi` switch.* `ui.find`
   is refused with the switch off even though it is a read, because it enumerates the user's work
   (unlike `ui.state`, which only reports what is on screen).
5. **Deep links.** *Settled: a small theme* — `midnite-studio://reveal?ref=` parses into the same
   engine and `ui.find` returns the link; rendering chips is out.
6. **Follow-ups.** *Settled: "this / next / previous / its X / back"* from `lastRevealed`, the
   live selection and a small `RELATED` map.
7. **Reveal scope.** *Settled: show only.*
8. **Verb collision with Phase 111's `switchAgent`.** *Recommendation:* fix the precedence as repo
   → agent/model → view → resource in `parseIntent`, whichever phase lands second adds the test.
9. **Ref encoding in the URL.** *Recommendation:* base64url JSON validated by `ResourceRefSchema`,
   rather than a hand-written path grammar per kind — one parser, schema-checked, and a new kind
   needs no URL work. Open if human-readable links turn out to matter.
10. **Order.** *Recommendation:* A → B first (B lands stubs), then C, D, E, F, G in parallel, then
    H and I. Theme E is the largest (six new open-request stores plus three fixes); split E's
    fixes into their own PR if it runs long.
11. **Open, for a human:** should "next/previous" in the graph follow first-parent history or the
    visual row order? Recommendation: visual row order — it is what the user is looking at.
