# Midnite Apps — layers and placement

[Phase 113](../.midnite/tasks/phases/phase-113-midnite-apps-suite-split.md) turns the launcher's tiles
into separately installable apps that share one runtime. This page is the vocabulary and the placement
map every later theme assumes. Its machine-readable twin is
[`packages/shared/src/domain/placement.ts`](../packages/shared/src/domain/placement.ts); a vitest
([`packages/app/src/placement.test.ts`](../packages/app/src/placement.test.ts)) fails when a folder in
[`packages/app/src/features/`](../packages/app/src/features/) is missing from the map, when the map names
a folder that is gone, or when a row below disagrees with the const.

## Vocabulary

| Term | Means |
|---|---|
| **runtime** | The headless main-process services no window owns: the vault (all credentials), the pty broker, the `midnite` CLI and MCP server, the link router, the updater, the app registry, window and Dock identity, and the `version`. |
| **frame** | The renderer chrome every app wears: layout, title bar and status bar, terminal, companion, loops, quick access, palette, the browser panel, files, search, themes, setup, settings, the git graph and its write ops, the knowledge graph, each app's landing, and the dashboard grid. |
| **app** | One installable product that owns one area of work: Cleaner, Monitor, Vault, Capture, Browser, Mind, Agents, Coder, Money, Creator, Media, Gamer. Studio is every app composed, the internal superset and dev harness. |
| **feature** | One folder of `packages/app/src/features/`: a view or panel plus its stores and tests. Each feature is placed in the frame or in exactly one owning app. |

**The layer rule:** the frame holds tools every app wants; an app owns one area of work. The runtime holds
services no window owns.

**Say "frame", never "shell".** `@bilo-io/shell` is the shell package this repo consumes, and a second
meaning for the word would make "the shell" ambiguous in code, docs and review.

**Web apps are not apps.** The Phase 83 rail of embedded third-party sites (Spotify, Google Calendar,
YouTube) is `web-apps`: the feature folder, `domain/web-apps.ts`, `web-apps-service.ts`, the `webApps`
bridge namespace, the `mstudio:web-apps:*` channels, the `web-apps` Settings page and the
`enabledWebApps` setting. A web app keeps its `persist:app-<id>` session partition, so renaming never signs
anyone out. The detached-window roles stay `apps-<id>` because they are keys in `windows.json` and
`windows-reopen.json` on disk.

## Placement

The frame:

| Folder | Layer | Notes |
|---|---|---|
| `activity` | frame |  |
| `battery` | frame |  |
| `browser` | frame | the panel; the Browser app composes this folder, and the full-window app adds `web-apps` |
| `changes` | frame | working-tree changes belong to the git graph |
| `commit` | frame |  |
| `companion` | frame |  |
| `conflicts` | frame |  |
| `dashboard` | frame | widget grid; widgets belong to apps |
| `diff` | frame |  |
| `empty` | frame | the no-repo empty state, wearing every app |
| `files` | frame |  |
| `geo` | frame |  |
| `graph` | frame |  |
| `history` | frame |  |
| `knowledge` | frame | user decision: tools every app wants, so the frame, not Mind |
| `landing` | frame | each app's home |
| `loops` | frame |  |
| `markdown` | frame |  |
| `palette` | frame |  |
| `quick-access` | frame | the Mod+l menu; its N capture will write into Mind when installed |
| `rebase` | frame |  |
| `repos` | frame |  |
| `screensaver` | frame |  |
| `search` | frame |  |
| `settings` | frame |  |
| `setup` | frame |  |
| `stash` | frame |  |
| `status` | frame |  |
| `status-bar` | frame | including the battery, monitor and diagnostics segments |
| `terminal` | frame |  |
| `themes` | frame |  |
| `titlebar-status` | frame | title-bar readouts |
| `version` | frame | the pill and release notes; the version itself is a runtime service |
| `weather` | frame |  |

The apps, grouped by owner:

| Folder | Layer | Notes |
|---|---|---|
| `agent` | agents | agent roster, probes, midnite menu: Agents owns the roster; the frame renders only its title-bar entry |
| `automate` | agents |  |
| `chats` | agents |  |
| `councils` | agents |  |
| `models` | agents |  |
| `workflows` | agents | user decision |
| `web-apps` | browser | Phase 83 third-party rail, renamed from `apps` |
| `optimizer` | cleaner | Cleaner |
| `actions` | coder |  |
| `api-client` | coder |  |
| `database` | coder |  |
| `forge` | coder |  |
| `reviews` | coder |  |
| `sessions` | coder |  |
| `tasks` | coder | user decision |
| `tests` | coder |  |
| `slides` | creator |  |
| `media` | creator, media, gamer | tabs split: doc/image/audio/video to Creator, map/terrain/model/sprite/game to Gamer, players reused by Media |
| `notes` | mind |  |
| `finance` | money |  |
| `finance-dashboard` | money | listed with Money in the map |
| `diagnostics` | monitor | problem list and crash log; the status-bar segment stays in the frame |
| `monitor` | monitor | full view; the status-bar segment stays in the frame |

A tuple layer (`media`) lists the owner first; the others reuse the folder.
