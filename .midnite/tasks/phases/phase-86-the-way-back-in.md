# Phase 86 — The way back in, and somewhere to write it down

**Brainstormed with a human in the loop** · 2026-09-13 · from two asks in one breath — "make Sessions
an actual manager I can still talk to, and give me a one-click way back into an agent conversation"
and "Notes deserves a page, not a modal".

[Phase 15](phase-15-multi-terminal-sessions.md) gave this app many ptys and the idea of an *agent*
session. [Phase 21](phase-21-agent-roster-and-terminal-identity.md) gave a terminal its identity.
[Phase 30](phase-30-terminal-that-survives-you.md) made those sessions outlive the window via the
detached broker. [Phase 67](phase-67-the-sessions-you-closed.md) built the Sessions view — and built
it, deliberately, as a **history browser for sessions that have already ended**.
[Phase 58](phase-58-notes-and-the-menu.md) gave Notes a modal behind the quick-access menu. This
phase closes the gap both of those left: the Sessions view can only show you the dead, and Notes can
only be jotted in, never written in.

> **Three findings from the grounding pass, and the first one changes what "flesh out Sessions"
> means.**
>
> **1. Sessions is a graveyard, and the living are somewhere else entirely.**
> [`sessions-view.tsx:83`](../../../packages/app/src/features/sessions/sessions-view.tsx) renders
> only `ClosedSession` rows from `useSessionHistory()`
> ([`queries.ts`](../../../packages/app/src/services/queries.ts)). Its row
> ([`:534 SessionRow`](../../../packages/app/src/features/sessions/sessions-view.tsx)) has exactly
> **two** actions: select-to-show-transcript, and `IconButton icon={LuTrash2} label="Purge session"`
> at `:598`. Live sessions live in a completely separate surface —
> [`terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx)
> inside [`terminal-panel.tsx`](../../../packages/app/src/features/terminal/terminal-panel.tsx),
> reading `useTerminalStore`. So "turn Sessions into a manager" is not adding buttons to a list — it
> is **merging two lists that read from two different stores**, one renderer-only and live
> (`terminal-store`), one main-persisted and dead
> ([`session-history-store.ts`](../../../packages/desktop/src/main/session-history-store.ts), plain
> JSON at `FILE_NAME = 'session-history.json'`, `:44`).
>
> **2. The resume machinery is three-quarters built, and the missing quarter is the only hard part.**
> `AgentDefinition.resume` already exists — [`terminal.ts:126–132`](../../../packages/shared/src/terminal.ts),
> "CLI arguments passed to resume a previous conversation on revive" — and is already populated per
> agent: `claude → ['--continue']` (`:220`), `codex → ['resume','--last']` (`:298`),
> `cursor → ['--continue']` (`:321`), `goose → ['session','--resume']` (`:468`), and six more of the
> twelve in `BUILTIN_AGENTS` (`:214`). **`agy` and `cline` have none.** The "type a command into a
> fresh terminal" primitive exists too: `PtyCreateRequest.initialInput`
> ([`schemas.ts:1247`](../../../packages/shared/src/ipc/schemas.ts)), the renderer-side
> `queueInput(sessionId, text)` → `pendingInput`
> ([`terminal-store.ts:131`](../../../packages/app/src/features/terminal/terminal-store.ts), consumed
> at [`terminal-panel.tsx:204`](../../../packages/app/src/features/terminal/terminal-panel.tsx)), and
> [`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts)'s
> `startAgent({…, autoSend})`. What does **not** exist anywhere in this repo is the agent's *own*
> conversation id. `sessionId` here always means **Midnite's** id
> ([`schemas.ts:1237`](../../../packages/shared/src/ipc/schemas.ts)); nothing parses a Claude or
> Codex conversation UUID out of pty output, and nothing persists one. Without it, every resume is
> "the last conversation in this directory", not "the one you clicked".
>
> **3. Both agents that matter already keep that id on disk, keyed by cwd.** Verified on this
> machine during the brainstorm: Claude Code writes
> `~/.claude/projects/<cwd-slug>/<uuid>.jsonl` — **312 files for this repo alone** — and Codex writes
> `~/.codex/sessions/<year>/…/rollout-<ISO-timestamp>-<uuid>.jsonl`. Reading the newest file under
> the slug for a session's cwd, mtime-matched to that session's own window, recovers the exact
> conversation id **without scraping a single byte of pty output** and survives an app restart. That
> is the seam this phase builds on, and it is why exact-id resume ships for two agents rather than
> twelve.

> **Scope guardrails.** This phase merges the live and closed session lists into one manager,
> captures agent conversation ids for `claude` and `codex`, and moves Notes to a real view backed by
> real files. It does **not** rewrite the terminal panel, does not touch the broker protocol, does
> not add a second xterm per pty, and does not put notes into the user's repositories. The ten agents
> with no on-disk store keep working exactly as they do today, via their existing `resume` args.

> **Effort tags:** **S** ≈ an afternoon · **M** ≈ a day · **L** ≈ two days or a genuinely risky seam.

## Background

Two halves, deliberately in one phase because they share nothing but a rail and both are "a surface
that outgrew where Phase 58/67 put it".

**Half one — Sessions becomes a manager.** Today you can see that a session ended and read what it
said. You cannot see what is running, cannot get back into it, and cannot restart the conversation it
was having. The pieces to fix that are all present (`revealSession()`, `queueInput`,
`AgentDefinition.resume`, `SessionActivitySchema`); they have simply never been pointed at this view.

**Half two — Notes gets a page.** [`notes-modal.tsx:31`](../../../packages/app/src/features/notes/notes-modal.tsx)
is mounted once at [`app.tsx:1696`](../../../packages/app/src/app.tsx) and edits notes in a plain
`<textarea>`. Its store ([`notes-store.ts`](../../../packages/app/src/store/notes-store.ts)) is
zustand-`persist`-to-localStorage, per-repo, renderer-only — so a note is invisible to every agent,
to the Phase 57 MCP tools, and to a second window, and it dies with the site data. The actions worth
keeping are already there: `handleDraftPlan` (`brainstorm`) and `handleAdhocTask` (`execAdhoc`) at
[`note-row.tsx:105–116`](../../../packages/app/src/features/notes/note-row.tsx), both going through
[`use-skill-handoff.ts:79`](../../../packages/app/src/features/agent/use-skill-handoff.ts).

## Deliverables

### Theme A — One list, one truth (M)

- [x] A single selector that merges live rows (`useTerminalStore`) and closed rows
      (`useSessionHistory()`) into one `ManagedSession[]`, discriminated by a `liveness:
      'running' | 'asleep' | 'closed'` field derived — never stored twice — from which store the row
      came from plus `TerminalSession.asleep`.
- [x] Live rows sort above closed ones; within each group the existing
      [`session-order.ts`](../../../packages/app/src/features/sessions/session-order.ts) ordering is
      preserved rather than reinvented.
- [x] `RepoSessionsGroup` ([`sessions-view.tsx:453`](../../../packages/app/src/features/sessions/sessions-view.tsx))
      keeps its per-repo grouping and now holds both kinds.
- [x] **The agent icon moves to the left of the title/name** in `SessionRow` (`:534`), ahead of the
      text rather than trailing it.
- [x] **The status dot gets a hover tooltip naming the state** — wrapped in the app's existing
      `<Tooltip>`, reading from `dotStateFor` (`:64`) extended to cover live states, and sourcing the
      live half from the already-streamed `SessionActivitySchema`
      (`'thinking' | 'waiting' | 'idle'`, [`terminal.ts:55`](../../../packages/shared/src/terminal.ts),
      delivered over `mstudio:pty:activity` and consumed by
      [`use-agent-activity.ts`](../../../packages/app/src/features/terminal/use-agent-activity.ts)).
      The dot is focusable so the tooltip is reachable by keyboard, not hover alone.
- [x] Purge stays closed-only; a running session offers no purge affordance at all (not a disabled
      one).
- [x] The existing filters (`reason`, provider) grow a liveness facet, and the empty states in
      [`sessions-skeletons.tsx`](../../../packages/app/src/features/sessions/sessions-skeletons.tsx)
      learn the "nothing running, nothing closed" case distinctly from "no repo open".

### Theme B — The conversation id (L)

- [x] `agentConversationId?: string` added to the session record in `shared`. **Note the trap:**
      `TerminalSessionSchema` ([`terminal.ts:487`](../../../packages/shared/src/terminal.ts)) closes
      with `.superRefine(agentIdMatchesKind)` and is therefore a `ZodEffects` — it **cannot be
      `.extend()`ed**. The field goes into the object literal, before the refinement.
- [x] The same field carried onto `ClosedSessionSchema`
      ([`session-history.ts:31`](../../../packages/shared/src/domain/session-history.ts)) and through
      `closedFromSession()`, which stays the single narrowing point.
- [x] A main-process `agent-conversation/` module with one adapter per supported agent behind a
      common `{ locate(cwd, since, until): Promise<string | null> }` seam.
- [x] **Claude adapter:** slugify `cwd` the way Claude Code does, list
      `~/.claude/projects/<slug>/*.jsonl`, pick the newest whose mtime falls inside the session's
      window, return the filename UUID.
- [x] **Codex adapter:** walk `~/.codex/sessions/<year>/…`, match `rollout-<ISO>-<uuid>.jsonl` on the
      timestamp in the name against the session window, return the trailing UUID.
- [x] Both adapters are **read-only and best-effort**: a missing directory, an unreadable file or no
      match returns `null` and is not an error. Nothing in the app fails because an agent store moved.
- [x] A new IPC channel pair in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts) to
      request/refresh a session's conversation id, following the existing `sessions:*` naming beside
      `sessionsHistory` (`:409`), `sessionsTranscript` (`:414`) and `sessionsPurge` (`:422`).
- [x] Capture happens on session end (so the id lands on the closed record) **and** on demand for a
      running session, so the resume button works before the session dies.
- [x] Fixtures for both adapters — a temp dir laid out like each agent's real store — plus the
      negative cases: empty dir, no mtime match, malformed filename.

### Theme C — Resume, in one click (M)

- [x] A pure `buildResumeCommand(agent, conversationId)` in `shared`, returning the argv for that
      agent: the exact-id form where the agent supports one, otherwise the agent's existing
      `AgentDefinition.resume` args unchanged, otherwise `null`.
- [x] An `IconButton` on every resumable row **with a tooltip** naming what it will run, sitting
      beside the existing purge action in `SessionRow`.
- [x] Clicking it calls `startAgent({…, autoSend: true})` with the built command, opening a terminal
      **prepopulated and sent**.
- [x] **An explicit, documented exception to the house default.**
      [`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts) defaults
      `autoSend: false` on purpose — "the user's Return runs it". Resume restores a conversation
      rather than acting on the repo, so this phase carves the exception; the reason goes in a
      docblock at the call site, not in a commit message.
- [x] The button is absent — not disabled — for an agent with no resume path at all (`agy`, `cline`).
- [x] A row whose agent has `resume` args but **no captured id** still gets the button, with a
      tooltip that says plainly it resumes the most recent conversation in that directory rather than
      this one. The UI never implies precision it does not have.
- [x] Tests: one per agent shape — exact id, args-only fallback, no-resume — asserting the argv
      built, and a view test asserting the tooltip text differs between the exact and fallback cases.

### Theme D — The pane that shows a live terminal (M/L)

- [x] Selecting a **closed** session keeps today's behaviour exactly:
      [`transcript-view.tsx`](../../../packages/app/src/features/sessions/transcript-view.tsx),
      read-only, still deliberately holding no WebGL context.
- [x] Selecting a **running** session shows its real, interactive terminal on the right.
- [x] **One xterm per pty.** The pane does not mount a second view of a live process; it reuses the
      single instance, handing off via the existing
      [`reveal-session.ts`](../../../packages/app/src/features/terminal/reveal-session.ts)
      `revealSession(sessionId)` primitive and the `ptyIds` map in `terminal-store`. Phases
      [45](phase-45-leak-audit.md) and [84](phase-84-live-everywhere-lighter-when-hidden.md) both
      bear on this and neither is to be regressed.
- [x] A store-level "send input to session X" action — today `sendInput` is reachable only from
      inside a mounted `TerminalView` via `sendInputRef`
      ([`use-terminal-ipc.ts:181`](../../../packages/app/src/features/terminal/use-terminal-ipc.ts)),
      which the manager needs and does not have.
- [x] `revealSession()` returns `false` for non-`main` surfaces (`fab`, `kanban`, `board`) — the row
      for such a session says where it actually lives instead of silently doing nothing.
- [x] The pane tears down cleanly on view switch, repo switch and window close, asserted rather than
      assumed.

### Theme E — Notes leaves the modal (M)

- [x] `'notes'` added to `VIEW_IDS` ([`view.ts:33`](../../../packages/shared/src/domain/view.ts)).
- [x] An icon in `VIEW_ICON` ([`components/nav-icons`](../../../packages/app/src/components/nav-icons.tsx)),
      from `react-icons/lu` per the house rule — never `lucide-react`, never the package root.
- [x] A rail row **directly under Dashboard**, above the `workspace` section — which means it sits
      with `PINNED_ITEM` ([`app.tsx:312`](../../../packages/app/src/app.tsx)) rather than inside one
      of the three `NavItem` arrays (`:322`, `:331`, `:342`).
- [x] **A delimiter between Dashboard and Notes**, using the app's existing hairline idiom
      (`<span aria-hidden className="h-4 w-px shrink-0 bg-border" />`, [`app.tsx:1155`](../../../packages/app/src/app.tsx),
      rotated for a vertical rail) — and honouring the Phase 39 Theme B rule recorded at
      [`app.tsx:1128–1137`](../../../packages/app/src/app.tsx): **a separator must never be
      stranded.**
- [x] An entry in `VIEW_COMPONENT` ([`view-registry.tsx:142`](../../../packages/app/src/components/view-registry.tsx)) —
      it is a `Record<ViewId, ViewEntry>`, **not** a `Partial`, so a missing entry is a typecheck
      failure, not a silent gap. Notes is `global: true` only if it can render with no repo open;
      decide that explicitly (see Decisions).
- [x] Palette label + keywords in
      [`services/palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts), and
      a popout role in `PAGE_WINDOW_ROLES` ([`window.ts`](../../../packages/shared/src/domain/window.ts))
      if Notes should detach.
- [x] **The modal survives as quick-capture.** The `N` leaf in
      [`quick-access-menu.tsx:62–65`](../../../packages/app/src/features/quick-access/quick-access-menu.tsx)
      still opens it; `ui-store`'s `notesOpen`/`toggleNotes` (`:582`, `:2187–2188`) are untouched.
      Both surfaces read one store, and a note added in one appears in the other without a reload.

### Theme F — Notes on disk (L)

- [x] A main-process notes store writing per-repo files under the app's **userData** directory —
      *not* inside the user's repositories, so notes are never a committed artefact. It follows
      [`session-history-store.ts`](../../../packages/desktop/src/main/session-history-store.ts)'s
      shape: a `createNotesStore(directory)` factory, an atomic write, and a `nullNotesStore` for
      tests.
- [x] A channel set in `channels.ts` — list / save / delete / reorder — mirroring the existing
      `terminalList`/`terminalSave`/`terminalForget`/`terminalReorder` quartet (`:390–393`).
- [x] The `Note` shape moves to `shared` as a zod schema (today it is a bare TS type at
      [`notes-store.ts:6–26`](../../../packages/app/src/store/notes-store.ts)), keeping
      `status: 'captured' | 'planned' | 'implemented'`, `done`, `order` and the timestamps.
- [x] **A one-way localStorage → disk migration that cannot lose a note.** It runs once, writes disk
      first, verifies the read-back, and only then marks the localStorage payload migrated — it never
      deletes it. The existing v1→v2 `migrate` at `notes-store.ts:219` runs *before* this, so the
      migration reads a v2 payload.
- [x] Corrupt or unreadable notes file at boot degrades to an empty list plus a visible notice —
      never a blank view and never a crash (the Phase 65 posture).
- [x] Writes are debounced and serialised per repo; two windows editing the same note do not
      interleave into a corrupt file.
- [x] `notes-store` keeps its zustand shape and its selectors (`notesForRepo`, `:53`) so
      `note-row.tsx` and `notes-modal.tsx` change as little as possible.
- [x] Tests: migration with a populated localStorage payload, migration with none, corrupt-file boot,
      concurrent-write serialisation.

### Theme G — The Notes page proper (M) ✅ DONE (PR #389, #391, #396)

- [x] A two-pane view: a **notes sidenav** on the left (the list, grouped and filtered as the modal
      does, with its `hideCompleted` toggle and `{doneCount}/{totalCount}` pill carried over) and a
      content pane on the right.
- [x] **A full editor** in the content pane — Monaco, reusing the existing wrapper at
      [`code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx), bundled
      offline by [Phase 64](phase-64-offline-monaco-and-themes.md).
- [x] **Lazy-loaded**, so the Notes view carries no Monaco weight until it is opened — this is a
      *third* Monaco surface and [Phase 77](phase-77-thirteen-megabytes-of-editor.md) is about
      putting Monaco on a diet. The decision to add it is explicit (see Decisions), and the mitigation
      is part of the deliverable rather than an afterthought.
- [x] **A markdown preview toggle**, rendering through the existing
      [`markdown-preview.tsx`](../../../packages/app/src/features/files/preview/markdown-preview.tsx)
      (`react-markdown` + `remark-gfm`, already a dependency) with
      [`prose.ts`](../../../packages/app/src/features/markdown/prose.ts)'s shared classes. The toggle
      state is per-view, remembered.
- [x] The row actions come across intact and become real buttons in the content pane's header:
      **Brainstorm** (`skillId: 'brainstorm'`), **Execute (adhoc)** (`skillId: 'execAdhoc'`), the
      status cycle, and delete — all still routed through
      [`use-skill-handoff.ts`](../../../packages/app/src/features/agent/use-skill-handoff.ts) so the
      primary-agent resolution stays in one place.
- [x] Drag-reorder still works, reusing
      [`notes-reorder.ts`](../../../packages/app/src/features/notes/notes-reorder.ts)'s
      `spliceVisibleOrder` rather than a second implementation.
- [x] Unsaved-edit safety: switching notes, switching views or closing the window commits the buffer
      first. No note is lost to a navigation.

### Theme H — Verification (M) ◐ PARTIAL (PR #464 — 3 "Open, for a human" items remain)

- [x] `moon run :typecheck :lint :test` green.
- [x] Package boundaries hold: `shared` stays zod-only and electron-free, the adapters live in
      `desktop`, and `app` reaches them only through `window.midniteStudio`.
- [x] Unit tests for the merged session selector — live-above-closed ordering, liveness derivation,
      and a session that transitions running → closed while the view is mounted
      (`session-order.test.ts`).
- [x] Unit tests for `buildResumeCommand` across all three agent shapes (`terminal.test.ts`).
- [x] Unit tests for both conversation-id adapters against fixture directories, including every
      negative case (`claude.test.ts`, `codex.test.ts`).
- [x] Unit tests for the notes disk migration, including the "already migrated" and "corrupt file"
      paths (`notes-migration.test.ts`).
- [x] A view test asserting the status dot's tooltip is reachable by keyboard and names the state
      (`sessions-view.test.tsx`).
- [x] A Playwright **visual** spec for the Sessions view with both live and closed rows, and one
      for the Notes page in edit and preview modes — within the ~100-baseline / 3 MB cap
      (`e2e/visual/sessions-view.spec.ts`, `e2e/visual/notes-view.spec.ts`). Both are verified
      locally against a `-u`-generated baseline (screenshots inspected, all three crops correct);
      per `.gitignore`'s own rule, only `*-linux.png` is ever committed, and generating that requires
      `MSTUDIO_CROSS_PLATFORM=1 moon run root:visual-regen` (Docker), unavailable in the sandbox that
      built this PR. **No baseline is committed for these two specs yet** — a fast-follow with
      Docker access needs to run the regen script once before the `visual` CI job
      (`cross-platform` label) is ever asked to check them; until then they simply sit outside that
      opt-in job's scope, same as every other unlabelled PR.
- [x] An e2e **only** where a browser is genuinely required — the live-terminal pane in Theme D (real
      xterm) — with the reason named in the spec's header comment, per
      [`docs/TESTING.md`](../../../docs/TESTING.md). Everything else stays vitest
      (`e2e/sessions-live-terminal.spec.ts`).
- [x] `scripts/e2e-budget.mjs` ratchet still passes (raised 440 → 441).
- [ ] **Open, for a human:** resume a real Claude Code session from the Sessions view and confirm the
      restored conversation is the one that was clicked, not merely the newest in that directory.
- [ ] **Open, for a human:** resume a real Codex session, same check.
- [ ] **Open, for a human:** a long Notes editing session in the page while the modal is also opened
      from the quick-access menu — confirm both surfaces stay in agreement.

## Files this phase touches

| Area | Files |
|------|-------|
| Sessions view | [`sessions-view.tsx`](../../../packages/app/src/features/sessions/sessions-view.tsx), [`transcript-view.tsx`](../../../packages/app/src/features/sessions/transcript-view.tsx), [`session-order.ts`](../../../packages/app/src/features/sessions/session-order.ts), [`sessions-skeletons.tsx`](../../../packages/app/src/features/sessions/sessions-skeletons.tsx), [`sessions-store.ts`](../../../packages/app/src/store/sessions-store.ts) |
| Terminal seam | [`terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts), [`reveal-session.ts`](../../../packages/app/src/features/terminal/reveal-session.ts), [`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts), [`use-terminal-ipc.ts`](../../../packages/app/src/features/terminal/use-terminal-ipc.ts), [`use-agent-activity.ts`](../../../packages/app/src/features/terminal/use-agent-activity.ts) |
| Shared contract | [`terminal.ts`](../../../packages/shared/src/terminal.ts), [`domain/session-history.ts`](../../../packages/shared/src/domain/session-history.ts), [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`domain/view.ts`](../../../packages/shared/src/domain/view.ts), [`domain/window.ts`](../../../packages/shared/src/domain/window.ts) |
| Main process | `packages/desktop/src/main/agent-conversation/` (new), [`session-history-store.ts`](../../../packages/desktop/src/main/session-history-store.ts), [`terminal-service.ts`](../../../packages/desktop/src/main/terminal-service.ts), `packages/desktop/src/main/notes-store.ts` (new), `packages/desktop/src/main/ipc/` |
| Notes | [`notes-modal.tsx`](../../../packages/app/src/features/notes/notes-modal.tsx), [`note-row.tsx`](../../../packages/app/src/features/notes/note-row.tsx), [`notes-reorder.ts`](../../../packages/app/src/features/notes/notes-reorder.ts), [`notes-store.ts`](../../../packages/app/src/store/notes-store.ts), `packages/app/src/features/notes/notes-view.tsx` (new) |
| Rail & registry | [`app.tsx`](../../../packages/app/src/app.tsx), [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx), [`nav-icons.tsx`](../../../packages/app/src/components/nav-icons.tsx), [`nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts), [`palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts) |
| Reuse, unchanged | [`code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx), [`markdown-preview.tsx`](../../../packages/app/src/features/files/preview/markdown-preview.tsx), [`prose.ts`](../../../packages/app/src/features/markdown/prose.ts), [`use-skill-handoff.ts`](../../../packages/app/src/features/agent/use-skill-handoff.ts) |

## Not in this phase

- **Notes as committed `.md` inside each repo.** Considered and rejected during the brainstorm — it
  makes notes a versioned artefact in every repository the user opens. userData only.
- **MCP tools over notes.** Putting notes on disk is what would make this possible; exposing them to
  [Phase 57](phase-57-mcp-server.md)'s tool surface is a separate decision with its own blast radius.
- **Exact-id resume for the other ten agents.** Two adapters prove the seam. `cursor`, `copilot`,
  `openclaude`, `opencode`, `kilo`, `aider`, `grok` and `goose` keep their existing `resume` args;
  `agy` and `cline` get no button.
- **Parsing conversation ids out of pty output.** The on-disk stores make it unnecessary for the two
  agents that matter, and it is brittle for the rest.
- **A second xterm per pty.** Explicitly out — Theme D hands off to the single instance.
- **Rewriting the terminal panel or `terminal-session-list.tsx`.** The manager reads the same store;
  the panel keeps its own list.
- **A chord for the Notes view.** `nav-chords.ts` maps only five views today; adding a sixth is a
  keymap decision, not a side effect of this phase.
- **Closing out [Phase 67](phase-67-the-sessions-you-closed.md)'s 20 open verification items.** This
  phase will re-open several of them; finishing them is that phase's business.

## Decisions / open questions

- **✅ Resolved — conversation ids come from the agents' on-disk stores**, not from pty scraping.
  Verified on this machine: 312 Claude `.jsonl` files for this repo, and Codex's `rollout-*.jsonl`
  naming carries both a timestamp and a UUID.
- **✅ Resolved — one status-sorted list**, live above closed, rather than two groups or tabs.
- **✅ Resolved — live selects to a real terminal, closed to the transcript.**
- **✅ Resolved — notes move to main-process files on disk**, not localStorage and not in-repo.
- **✅ Resolved — Monaco is the Notes editor**, reusing `code-editor.tsx`.
- **✅ Resolved — the Notes modal survives** as quick-capture alongside the page.
- **✅ Resolved — the resume button auto-sends**, as an explicit documented exception to
  `startAgent`'s `autoSend: false` default.
- **Open — is the Notes view `global: true`?** Notes are per-repo today (`notesForRepo`), which
  argues `false`. But a rail row directly under Dashboard that greys out with no repo open is a poor
  first impression. *Recommendation:* `global: true`, rendering a "no repo open" empty state, and
  revisit if per-repo scoping makes that confusing.
- **Open — how is a session's mtime window defined for adapter matching?** `createdAt` is known;
  the upper bound for a *running* session is "now". *Recommendation:* match on
  `[createdAt - 60s, closedAt ?? now]` and take the newest candidate, treating ties as no match rather
  than guessing.
- **Open — does the conversation id survive a `--continue` that forks a new conversation?** Resuming
  may create a *new* id, leaving the stored one stale. *Recommendation:* re-capture on the resumed
  session rather than inheriting, and treat the stored id as "the conversation this row was", not
  "the conversation this row is".
- **Open — does adding a third Monaco surface need Phase 77 to land first?** *Recommendation:* no —
  lazy-load it here, and let Phase 77 shrink all three at once. Flagged so Phase 77's numbers account
  for it.
- **Open — should the merged list show sessions from non-`main` surfaces** (`fab`, `kanban`,
  `board`)? *Recommendation:* yes, show them, but label where they live and offer reveal rather than
  a pane, since `revealSession()` returns `false` for them.
