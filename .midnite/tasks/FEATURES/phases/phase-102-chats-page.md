# Phase 102 — Chats page

A top-level **Chats** page: conversations with the roster's agent CLIs (Claude Code, Codex,
Antigravity/`agy`, any other agent with a print mode) and local Ollama models, in the Sessions
page's layout — an explorer on the left with the same filters, search and repo grouping, a chat UI
in the centre. When an agent edits files, the thread shows a reviewable card and a modal where each
file and hunk is accepted or rejected; nothing reaches the working tree before an accept.

> **Not Sessions, and not the companion.** Sessions manages terminal ptys. The companion is the
> floating voice assistant. A chat is headless — one CLI process per turn, resumed by the CLI's own
> session id — and the composer carries a switch for the companion rather than a copy of it.

## Headlines

**Theme A — Navigation.** ✅ `chats` joined `VIEW_IDS` and the rail now reads Dashboard, Notes,
**Chats**, Sessions, **Knowledge** (Knowledge moved from under Notes to under Sessions). A
`LuMessagesSquare` glyph, the breadcrumb label, a registry entry (`global: true`, so it opens with no
repo), a palette row and chord-free `view.chats` — `Mod+c` is copy and `Mod+Shift+c` is DevTools'
element picker, so the letter that names the feature was not free. `chats` is a detachable page role.
`sessions`' palette keywords lost the word `history` because Sessions now sorts ahead of History in
`VIEW_IDS`.

**Theme B — Wire contract and persistence.** ✅ `shared/src/chats.ts` holds the zod schemas and the
pure helpers both sides need (title, date buckets, the change-set state machine). Nine invoke
channels and one event channel (`chatsEvent`), all answering `GitOpResult`; the mock bridge got a
streaming in-memory implementation. **Persistence is global, not per repo**: one JSON file per chat
under `<userData>/chats/`, each recording the repo it was started in. The page is reachable with no
repo open and many chats have none; a per-repo file would dirty the working tree with transcripts and
leave a repo-less chat nowhere to live. One file per chat so a corrupt file costs one conversation,
temp-and-rename writes, saves serialised per chat. Reviewable patches sit beside them in
`patches/<changeSetId>.json`, so the wire shape stays small.

**Theme C — Engines and streaming.** ✅ Runs go through `runProcess` (the spawn engine Docs' Ask AI
uses) with each CLI's streaming output: Claude Code `stream-json` with `--include-partial-messages`,
Codex `exec --json`, `agy --output-format stream-json`, plain stdout for any other print-mode agent,
and `/api/chat` streamed for Ollama. Multi-turn uses each CLI's own resume (`--resume`, `exec resume`,
`--conversation`) while the session id and its working directory still match — CLIs key sessions by
directory — and replays a transcript otherwise (changed engine, rewound thread, other engines, a
resume that fails before saying anything, which is retried once). Stop kills the process group and
settles the message `cancelled`, keeping the text so far. Install state comes from the shared agent
probe store behind `useAgents()`.

**Theme D — Reviewable changes.** ✅ **Mechanism: a throwaway snapshot, a captured diff, a patch
back.** An `edit` turn runs in a copy of the repo that includes the user's uncommitted and untracked
state (`createSnapshot`, git-engine), committed once as a baseline inside the copy's own private
`.git`. Afterwards `captureChanges` stages what the agent did and reads one patch per file (rename
detection on, `--binary` so binary files stay applyable). Accepted files or hunks are applied to the
real checkout with `git apply` through the per-repo write queue; a patch that no longer applies is a
`GitOpResult` `conflict` (`op: 'change-apply'`) and the file is marked, the rest still applied. A copy
rather than `git worktree add`: a linked worktree registers itself in the real repo's
`.git/worktrees`, shows up in the app's worktree list, and starts from a commit rather than from the
working tree the user is looking at. It is a convenience boundary, not a security one. Card states —
pending, accepted, rejected, partial, conflict — derive from per-hunk statuses by pure functions in
`shared` and persist with the chat. `--permission-prompt-tool` on the MCP server is the live
per-edit alternative for Claude Code; it is not built (see `outstanding.md`).

**Theme E — The page.** ✅ Explorer: engine, repo, date and pinned facets, search over title / last
message / repo, pinned group on top then per-repo groups, rename, pin, delete, new chat — built from
`ExplorerSearch` / `ExplorerGroup` / `ExplorerNotice` / `MultiSelectMenu`, which the Sessions page now
uses too. Centre: a thread that sticks to the bottom without fighting the reader (smooth for new
messages, instant while streaming, a "Jump to latest" button), user bubbles with copy and edit,
assistant turns rendered through the app's one markdown renderer (`MarkdownBody` over the Files
preview's `MarkdownCode`: highlighted fences with a copy button, tables, links, diffs), retry, an
activity strip for tool calls, and a centred composer pinned to the bottom. The composer is the shared
`AiComposer` plus a Stop button immediately left of Send while streaming, text-file attachments,
engine/model, mode (Ask / Edit) and repository sheets, the mic, and a companion switch that reads and
writes `ui-store`'s existing `companionEnabled` / `companionPanelOpen`. The review modal reuses the
git client's `DiffView`, adding only a `renderHunkActions` slot.

**Theme F — Verification.** 🔄 Unit, git-engine integration (real temp repos) and assembled-view
tests are green; one real-browser spec covers the composer's centring and the thread's scroll
pinning. What remains is a human pass against the real CLIs in the packaged app.

## A — Navigation

- [x] `chats` in `VIEW_IDS`, `PAGE_WINDOW_ROLES`, the view registry (global), breadcrumbs, palette labels and keywords
- [x] Rail order Notes → Chats → Sessions → Knowledge, comments and nav-order tests updated
- [x] `view.chats` command (chord-free, with the reason), palette icon and safety class
- [x] Layout width `chatsListWidth` with bounds

## B — Wire contract and persistence

- [x] zod schemas and pure helpers in `shared/src/chats.ts`, with tests
- [x] Channels, bridge types, preload and mock bridge
- [x] Per-chat JSON store with atomic writes, serialised saves, corrupt-file tolerance
- [x] `change-apply` conflict op

## C — Engines and streaming

- [x] Drivers and stream parsers for Claude Code, Codex, agy, generic print-mode agents (parsers checked against captured real output for claude and agy)
- [x] Ollama streamed `/api/chat`, whole thread each turn
- [x] Resume by session id and directory, transcript replay otherwise, one retry on a dead session
- [x] Stop kills the process group; partial text kept; snapshot discarded
- [x] Service tests with a fake CLI, and end-to-end tests with a real shell-script CLI and a real repo

## D — Reviewable changes

- [x] `createSnapshot` / `captureChanges` / `applyFilePatches` in git-engine, tested against real temp repos
- [x] Per-file and per-hunk apply through the write queue; conflicts as a `GitOpResult` `conflict`
- [x] Card state machine in `shared`, persisted with the chat
- [x] Inline card and review modal with accept / reject per file, per hunk, and all
- [ ] Live per-edit approval with `--permission-prompt-tool` on the MCP server (Claude Code)

## E — The page

- [x] Explorer facets, search, grouping, rename / pin / delete / new, shared explorer components
- [x] Thread, markdown rendering, copy / retry / edit, stick-to-bottom scrolling
- [x] Composer: stop beside send, attachments, engine / model / mode / repo sheets, mic
- [x] Companion switch on the composer
- [x] Empty state with suggestions, accessible log region and labelled controls

## F — Verification

- [x] `moon run :typecheck :lint :test` green
- [x] Real-browser spec: composer centring and scroll pinning
- [ ] Packaged-app pass against the real Claude Code, Codex and agy CLIs, including a rejected and a conflicting change
