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
| **feature** | One folder of `packages/app/src/features/`: a view or panel plus its stores and tests. Each feature is placed in the frame or in exactly one owning app. Once a feature is extracted, it becomes its own package, `packages/features/<name>/` ([Packages](#packages)). |

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
| `knowledge` | frame | user decision: tools every app wants, so the frame, not Mind; now `packages/frame/src/knowledge/` |
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
| `agent` | agents | agent roster, probes, midnite menu: Agents owns the roster; the frame renders only its title-bar entry. The install probe and status predicate moved to the frame; the MCP tools view is the `mcp-tools` package; the menu, project actions and setup dialog stay in `packages/app` |
| `automate` | agents | the kill switch stays in `packages/app` (see "Agents: workflows, tools and what stayed behind") |
| `chats` | agents |  |
| `councils` | agents |  |
| `models` | agents |  |
| `workflows` | agents | user decision; the engine, executors, stores, trigger scheduler and demo API (main) and the Graphs view (renderer) are the `workflows` package |
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
| `chats` | agents | the Chats view, composer and change review; the turn service and engines in main. Optional host members (companion toggle, open in graph) are Studio's |
| `councils` | agents | the Councils view and run orchestration; its runner takes the pty, roster and Ollama key as ports |
| `models` | agents | the Models view and the Ollama client, pull queue and settings; terminal-backed actions (launch with, `ollama serve`) are optional host members |
| `finance` | money | the panel, status-bar segment and dashboard widgets (once two folders, `finance` and `finance-dashboard`) as one package |
| `diagnostics` | monitor | problem list and crash log; the status-bar segment stays in the frame |
| `monitor` | monitor | full view; the status-bar segment stays in the frame |
| `vault` | vault | the metadata-only view of stored secrets, forge accounts and database logins |

A tuple layer (`media`) lists the owner first; the others reuse the folder.

## Packages

Theme C of Phase 113 adds the packages the suite is built from. Studio is still the only thing that ships.
`packages/app` and `packages/desktop` now act as **Studio's composers**: they put the packages below
together, and until Themes G and H give every app its own composition, they are the only ones.

**Studio is `apps/studio`** (`moon run studio:start`): the composition of every feature and the frame, the
dev harness, and still installable for power users. `packages/app` and `packages/desktop` are its renderer
and main internals; `studio:start`/`bundle`/`dist` delegate to the `desktop:*` tasks, which keep working.
`apps/studio/src/composition.ts` lists the features it composes and a test holds that list to `packages/features/*`.

### The layer graph

```
                 renderer side                                main side
shared ◀ frame ◀ feature/renderer ◀ app          shared ◀ runtime ◀ feature/main ◀ desktop
                       ▲                                                ▲
                       └──────────── feature/manifest.ts (shared only) ─┘
```

| Package | Folder | Holds | May import |
|---|---|---|---|
| `@midnite/studio-runtime` | `packages/runtime` | The main-process contract every feature's main half registers against: `FeatureMainContext` (`ipc.handle`/`handleBare`, `emit`, `trashItem`), `defineFeatureMain`, `sendToLiveWindow`, and `createRecordingContext` for tests. Theme D's shared services: the one vault (`createVaultService` — three namespaces over the files Studio's three vaults wrote, each access made as a `RuntimeAppId`, `safeStorage` injected) and the pty broker client (`createBrokerService(...).attach(appId)`; the server that loads node-pty stays in desktop). The CLI/MCP server follows. | `shared`, `electron` |
| `@midnite/studio-frame` | `packages/frame` | The renderer pieces every app wears. Today that is the bridge, the toast store, `DelayedFallback`/`Spinner`/`CONTENT_BOX`/`NavLockToggle` (taken out of `app.tsx`), the metrics primitives behind the status-bar monitor segment, the settings-section and switch-row primitives, `FilterInput` and `useWindowFocusGate`. It also defines the **chrome port**, described below. | `shared`, `react`, `@bilo-io/*`, `react-icons` |
| `@midnite/studio-feature-<name>` | `packages/features/<name>` | A single feature, as the three parts described under "The feature template". | the frame (renderer half), the runtime (main half), `shared` |

The rule from [Vocabulary](#vocabulary), as code: **an app may import features and the frame. A feature
may import the frame and `shared`, but never an app and never another feature. The frame never imports a
feature.** Features talk to each other through the link router and through `shared` ids.

The rule is enforced in [`eslint.config.mjs`](../eslint.config.mjs), with one `no-restricted-imports` block
per layer. Flat config does not merge that rule across blocks: the last block that matches a file replaces
it. So each layer's block spells out its full pattern list, and
[`scripts/layer-boundaries.test.mjs`](../scripts/layer-boundaries.test.mjs) checks every rule. For each
rule it lints a one-line fixture import at a path inside the layer, and it fails if a rule stops firing
or if an allowed import starts to. The rules also catch relative paths that climb into another layer
(`../../notes/renderer/…`), as well as package names.

The packages are built in two ways. The **frame and a feature's renderer half are consumed as source**.
Their `exports` point at `.ts` files, and the composing app's Vite build and vitest compile them, so
there is no build step and no stale `dist` between a change and the window. The **runtime and a
feature's main half are built** with `tsc -b` to CommonJS in `dist/`, the same way `knowledge` is. That is
because desktop's esbuild bundle and its typecheck both read declarations from `dist/`.

### The feature template

[`packages/features/optimizer`](../packages/features/optimizer) is the pilot: Cleaner's one feature. Copy
its layout:

```
packages/features/<name>/
  manifest.ts          pure data both halves read (imports @midnite/studio-shared only)
  manifest.test.ts     holds the halves and the shared registrations to the manifest
  renderer/index.ts    views (lazy loaders) + settings pages, keyed by manifest ids; the host port
  renderer/testing.ts  internals for an app's composition tests (production code may not import it)
  main/index.ts        defineFeatureMain({ register(ctx, services) }) — every manifest IPC channel
  moon.yml             id feature-<name>; tags layer-feature + app-<owner> + app-studio
  package.json         exports ./renderer, ./renderer/testing, ./main (dist); sideEffects: false
  tsconfig.json        the renderer half (noEmit); tsconfig.main.json builds main/ to dist/
```

- **`manifest.ts`** is created with `defineFeatureManifest` (`shared/src/domain/feature-manifest.ts`). It
  holds the feature id, the owning app (from `FEATURE_PLACEMENT`), the views with their rail entry and
  `global` flag, the settings pages, the IPC channels the main half registers, the event channels it
  emits, and its MCP tools. Its job is to describe what the feature *has*, so both halves read it and the
  composers wire from it.
- **The renderer half** keys `<name>Views` and `<name>SettingsPages` by the manifest's ids, using
  `satisfies Record<Id, …>`. A view the manifest names cannot ship without a component, and a component
  cannot ship that the manifest does not name.
- **The main half** never imports `electron`. It gets IPC registration and window events through the
  `FeatureMainContext` its composer passes in. The services it calls arrive as a typed `services`
  argument, because today those services still reach desktop internals such as the browser, the pty and
  the repo registry. That keeps it testable under plain vitest against `createRecordingContext()`.
  Desktop's `ipc/optimizer-handlers.ts` is now only that adapter: it builds the real services and context,
  then calls `optimizerMain.register`.

### What an app without a terminal leaves out

A host port may declare a member **optional** and the feature drops the affordance when it is absent: models'
`terminal` (launch an agent on a model, run `ollama serve`), chats' `CompanionToggle` and
`openWorkingCopyInGraph`. Agents (`apps/agents`) leaves those out and supplies plain chrome for the rest
(`src/compose/plain-ui.tsx`, `plain-composer.tsx`). Its councils run each member as a piped login shell
(`main/shell-runner.ts`) rather than through the pty broker, and `dugite` is stubbed in its bundle: it has no
repository registry yet, so every chat runs in its scratch directory. Both arrive with Coder and the
Sessions integration (slice 2).

### Agents: workflows, tools and what stayed behind (Phase 113 Theme N, slice 2)

Agents now composes five packages: chats, councils, **workflows**, models and **mcp-tools**.

- **`packages/features/workflows`** — the Graphs view and canvas (renderer) and the whole graph engine
  (main): the run engine and its loop controller, every node executor, the workflow, run-history and
  template stores, the trigger scheduler, the gate approval poll and the demo API. Everything a node reaches
  outside the engine is one `WorkflowsPorts` object (`main/ports.ts`): the pty and terminal session a node
  runs in, the agent roster and Ollama binding and key, the forge a gate and trigger watch, the repository
  registry a `git-status` node reads, Electron's notification and clipboard. Studio fills all of it
  (`packages/desktop/src/main/ipc/workflow-handlers.ts`); Agents fills the roster, the Ollama daemon and key,
  and a **piped login shell for script nodes** (`apps/agents/main/node-session.ts`) and leaves the rest
  absent, so a `git-status`, forge or gate-comment step reports its own failure and an **agent node fails
  with a plain message** — it drives an interactive CLI to idle, which needs a pty, and Agents ships no
  broker until the Sessions integration. `ai-prompt`/`ai-extract` run the same CLI headlessly and work.
  The renderer reads app state through `WorkflowsHost` (persisted pane sizes and collapse flags, the dismiss
  stack, `Modal`/`Popover`/`MultiSelectMenu`/`TreeSection`, a run's node sessions); Studio's host keeps every
  `ui-store` key, so no stored value moved. The graph list's Duplicate/Export/Delete row menu needs a context
  menu host; without one (Agents) the same three actions are hover buttons on the row.
- **`automate` is not a feature package.** The kill switch (`kill-switch-modal`, `kill-scope`) stops
  terminal sessions, task boards, repositories and forge accounts across the *whole app*; every scope but
  `flow` names something Agents does not have, and the `flow` scope is only a filter on terminal sessions.
  It stays in `packages/app` as Studio chrome. A graph run is cancelled from its own panel in both apps.
- **`packages/features/mcp-tools`** — a package out of the `agent` folder (`FEATURE_PACKAGE_SPLITS`): the
  `McpToolsView` (the tool list filtered by `listMcpToolIds(isAppInstalled)`, the master and allow switches, the
  shim command, the call log) and the three `mcp` channels over an `McpToolsServer` port. Studio renders it as
  Settings ▸ MCP Server, unchanged (same switches, same test ids; `isAppInstalled` defaults to every app).
  Agents renders it as its Tools tab with `serverAvailable={false}` and `installedSet(['agents'])`: it lists
  the frame's and Agents' tools and says the `midnite` server is Studio's. **The server itself did not move** —
  it reaches the repo registry, git and the media services — so Agents answers the channels with
  `createNoMcpServer()`; serving one `midnite` socket for the whole suite is the runtime daemon's job.
- **The `agent` folder, split.** What had a second consumer or no Studio coupling moved to the frame:
  `agent-probe-store` and `agent-install-status` (`frame/src/agents/`), and `resolveHeadlessAgent` (shared).
  What stayed in `packages/app/src/features/agent/` is Studio chrome or is welded to it: the title-bar midnite
  menu, project actions and setup dialog (the title bar and the repository lifecycle), `agent-commands` (the
  menu's skill table), `use-skill-handoff` and `repo-capability` (the terminal and the repo registry) and
  `follow-primary-agent` (`ui-store`, chats and media prefs). They move when those surfaces do.
- **Quit.** Agents holds `will-quit` once to run `disposeWorkflows()` (kills script shells as a process group,
  cancels in-flight runs so each node's child process group dies, closes the demo API), then finishes with
  `app.exit` — a second `app.quit()` after a prevented `will-quit` is ignored by Electron.

### Ports: how a feature reaches what it does not own

A feature cannot import an app, so it cannot reach the app's stores or chrome. Each thing it needs comes
through a **port**: an interface the feature (or the frame) declares and the composing app implements.

- **The frame's chrome port**, `FrameChromeProvider`/`useFrameChrome` in `frame/src/chrome/`, provides
  `IconButton`, `ConfirmDialog`, `useDialogs` and `PageDetachMark`. That is chrome Studio still implements
  in `packages/app`. Its prop and request types (`IconButtonProps`, `ConfirmRequest`, `BlastRadius`) live
  in the frame, and app's components are type-checked against them. Studio's implementation is
  `app/src/compose/studio-chrome.ts`.
- **A feature's own host port** covers app state the feature reads but does not own. For optimizer that is
  `OptimizerHost` in `renderer/host.tsx`, with `useSettings(selector)` and `getSettings()` over the
  settings that stay persisted in Studio's `ui-store`, so no persisted key moves. Studio's adapter is
  `app/src/compose/optimizer-host.ts`. A missing provider throws instead of quietly falling back to state
  that is never saved.

`app/src/compose/studio-providers.tsx` installs both. It wraps the main window, every detached window and
the vitest `render` helper.

### View and settings-page ids

`VIEW_IDS` and `SETTINGS_PAGE_IDS` (`shared/src/domain/view.ts`) are no longer hand-written literals.
[`feature-registrations.ts`](../packages/shared/src/domain/feature-registrations.ts) declares each
feature's ids (`FEATURE_VIEWS`, `FEATURE_SETTINGS_PAGES`, keyed by placement folder).
`STUDIO_VIEW_ORDER` and `STUDIO_SETTINGS_PAGE_ORDER` list the features in Studio's order, and each mention
takes that feature's *next* id. That is how one feature's ids can sit apart in the list: optimizer's
`trashSafety` page sits well before its `optimizer` page. `composeFeatureIds` unions the ids, and a test
pins the result to the old literal lists, so no persisted id or order changed. A later app's composer
unions only its own features.

### Moon: which apps does a change touch?

`.moon/workspace.yml` registers any `packages/*/moon.yml` and `packages/features/*/moon.yml` as a project,
so a new feature joins `moon run :typecheck :lint :test` just by existing. The glob targets the `moon.yml`
file rather than the folder. Folder globs make both moon 1.41 (CI's `pnpm exec moon`) and moon 2.5
register a phantom `packages` project.

Each project's `app-*` tags name the apps that compose it:

- `app-all` marks shared, the runtime and the frame.
- `app-<owner>` plus `app-studio` marks a feature.
- `app-studio` marks `app` and `desktop`.
- git-engine, knowledge and db-engine carry no tag. They reach Studio through desktop.

[`scripts/affected-apps.mjs`](../scripts/affected-apps.mjs) (`moon run root:affected-apps`) runs
`moon query projects --affected --downstream deep` against `origin/main` and prints the app ids. It
builds the moon 1 or moon 2 pipeline to match the moon it finds. Its test pins its app list to
`PLACEMENT_APP_IDS` and each feature's tags to `FEATURE_PLACEMENT`. Theme F's affected-only bundle builds
will use it.

[`scripts/gate-projects-check.mjs`](../scripts/gate-projects-check.mjs) maps `packages/features/<name>` to
project `feature-<name>`. A new feature therefore fails CI until it is added to `gate-node` (or
`gate-native`) in `ci.yml`.

### Extracting the next feature

1. Add the feature's ids to `FEATURE_VIEWS`/`FEATURE_SETTINGS_PAGES` if it is not there yet, and leave
   Studio's order alone.
2. `git mv` its folder from `packages/app/src/features/<name>` into `packages/features/<name>/renderer`,
   along with its store and settings pages. Copy optimizer's `package.json`, `moon.yml`, tsconfigs and
   `vitest.config.ts`, and set the `app-*` tags from `FEATURE_PLACEMENT`.
3. Write `manifest.ts`. Then key the renderer half by its ids, and move its IPC handlers from desktop into
   `main/` behind a services type.
4. Fix each import the layer rules reject. Anything that every app needs moves down into the frame. Each
   piece of app state becomes a port on the feature's host, with the Studio adapter in
   `app/src/compose/`. Each dialog or button becomes the chrome port.
5. In Studio, add the package to `packages/app` and `packages/desktop` (dependencies, tsconfig references,
   moon `dependsOn`). Read its views and settings pages in `view-registry.ts`, `settings-view.tsx` and
   `nav-groups.ts`. Call its `main` from desktop's handler adapter. Then add the project to `gate-node` and
   to `NODE_PROJECTS`.
6. Composition tests that render the feature inside Studio stay in `app/src/compose/<name>/` and import
   `/renderer/testing`. Tests of the feature alone move with it and use its in-memory test host.

### Building a new app on the kit

A new suite app (`apps/<id>`) writes its composition, not its chrome:

- **Chrome:** `createFrameChrome()` from the frame gives a complete `FrameChrome` and the `DialogHost`
  to mount beside `FrameChromeProvider` (real blast-radius confirm, `KitIconButton`, no detach mark).
- **Settings:** `createPersistedStore({ key, defaults, pick, state })` loads and writes through a slice,
  swallowing storage errors; Cleaner's `compose/cleaner-host.ts` is the example.
- **Styles:** `tailwind.config.ts` is `{ presets: [frameTailwindPreset], content: frameContent(__dirname, ['<feature>']) }`
  from `packages/frame/tailwind-preset.ts`, so the frame and each feature's classes are scanned.
- **Main:** `createIpcContext(el)` builds the zod-parsing `FeatureMainContext` from injected electron
  shapes; register each feature's `main` against it.
- **Preload:** list channels over `createBridgeSlice(ipcRenderer)` (`call`/`send`/`subscribe`). Import
  `@midnite/studio-shared/ipc/channels` and `@midnite/studio-runtime/app-main/bridge-slice` by source
  path (alias both in `bundle-main.mjs`), never the barrels: that took Cleaner's preload from
  426 KB to 24 KB.

## App compositions

Each app in `apps/` composes the frame, its assigned features, and its host ports into an installable desktop product.

### App 5: Browser (`apps/browser`)

The Browser app (`apps/browser`) composes the frame's `browser` feature and the `web-apps` rail.

**What the app adds over the frame's browser panel:**
1. **Full-window browsing canvas**: In Studio, the browser is an auxiliary panel (overlay or side-by-side) sharing space with git graphs, terminals, and editor panes. `apps/browser` gives browsing the full window with full-bleed page viewports, dedicated tabs, search, history, bookmarks, and keyboard navigation without git/editor chrome.
2. **First-class web-apps rail dock**: Integrates the Phase 83 `web-apps` rail as a primary dock surface alongside ephemeral browser tabs. Pinned web apps (Slack, Notion, Linear, Spotify, GitHub) retain persistent, isolated session partitions (`persist:app-<id>`) with fast switching and flyout management.
3. **Agent-driven browsing sessions**: Native hooks for AI agents to steer, inspect, and test web pages. Autonomous sessions support agent automation, step-by-step navigation, DOM snapshot inspection, and companion interaction directly from the browser window.
4. **Independent profile & workspace isolation**: Dedicated session storage, cookies, and cache independent of code repository checkouts.

**Package architecture & ports:**
- **Moon tags**: `layer-app`, `app-browser`.
- **Imports**: Composes `@midnite/studio-frame` and features; reaches main via bridge; never imports other apps or desktop directly.
- **Ports**: Implements the frame's chrome port (`FrameChromeProvider`) and the `BrowserHost` port (managing tab state, web-apps dock state, agent session mode, and browser settings).


### App 6: Cleaner (`apps/cleaner`) — the first app that ships as its own bundle

Cleaner (`apps/cleaner`, Phase 113 Theme H1) composes one feature, `packages/features/optimizer`
(`FEATURE_PLACEMENT.optimizer` = `cleaner`), over the frame and `shared`. It is the first app with the
three things a release needs to pack it as `midnite-cleaner-X.Y.Z-bundle.zip`: a moon project
(`apps/cleaner/moon.yml`, id `app-cleaner`), a `vite build` that writes `dist/`, and
`resources/icon.icns`. An app without the icon is skipped by `release.yml`'s `bundles` job.

- **Home view**: `views/cleaner-home.tsx` — the optimizer's lazy view framed with Cleaner's accent
  (`#14b8a6`, the launcher catalog's) and name, plus a Settings toggle that shows the feature's two settings
  pages (Trash safety, Optimizer). `cleaner-manifest.ts` is the app's own pure-data manifest.
- **Ports it implements**: the frame chrome (`compose/cleaner-chrome.tsx`, with a real confirm dialog showing
  the blast radius — every Cleaner action is destructive — in `compose/dialogs.tsx`) and `OptimizerHost`
  (`compose/cleaner-host.ts`: the optimizer's settings, persisted in Cleaner's own localStorage, every
  destructive switch off by default).
- **Styling**: its own `tailwind.config.ts` (Studio's token map, own `content` globs over the frame and the
  optimizer renderer) and `@bilo-io/ui`'s token CSS.
- **Icon**: `node apps/cleaner/scripts/make-icon.mjs` regenerates `resources/icon.icns` from the catalog glyph
  (`CHROMIUM_PATH=<chrome-headless-shell>` to use an installed browser). The `.icns` is committed.
- **Main side** (`apps/cleaner/main/`, Theme H2): `index.ts` (single instance, userData under the runtime's data
  directory, one window over `dist/index.html`), `preload.ts` + `bridge.ts` (exposes only `optimizer`, `metrics`
  and `repos.pickDirectory` on `window.midniteStudio`), `context.ts` (a `FeatureMainContext` from the runtime and
  an injected `ipcMain`, registering the optimizer's handlers) and `services.ts`. `scripts/bundle-main.mjs`
  esbuilds main and preload to `dist/main.cjs` / `dist/preload.cjs`; `scripts/pack-bundle.mjs` (the release's pack
  step) names `main.cjs` as the bundle's `main`, which the stub's Electron runs from `Resources/app`, and
  `verifyAppBundle` refuses a declared `main` the bundle does not carry. `MIDNITE_CLEANER_SMOKE=1` makes main print
  `midnite-cleaner:ready` and quit once the window has loaded (no window shown, hidden from the Dock) — the
  opt-in proof `apps/launcher/src/main/bundles/cleaner-install.proof.test.ts` uses it.
- **Not here yet**: the optimizer's scanners and process table are Studio-only today (they live in
  `packages/desktop` and reach the repo registry, browser and pty), so Cleaner's `services.ts` answers those
  operations with a plain "not available yet" message. Porting them behind runtime ports is Theme H3.

### Media: one folder, several packages, one tab registry (Phase 113 Theme Q)

`media` is the one placement folder three apps share (Creator, Media, Gamer), so it is split into
packages that never import each other — `FEATURE_PACKAGE_SPLITS` (`shared/src/domain/placement.ts`)
maps each to the folder it came from and the apps that compose it:

- **`packages/features/media-core`** (Creator, Media, Gamer, Studio) — `MediaShell({ tabs })`, the tab
  strip and layout, the projects explorer, the export toolbar, the `use-media` data hooks, and the
  main-side media store, watcher and ffmpeg export (`createMediaService`, `mediaCoreMain`). It reads
  app state through its `MediaHost` port; `createStandaloneMediaHost` is a complete host for any app
  that is not Studio.
- **`packages/features/media-docs`**, **`media-images`** (Creator, Studio) — one tab each: a
  `MediaTabDescriptor` (`mediaDocsTab`, `mediaImagesTab`), a host port for what differs per app (Studio's
  AI thread pane and create panel, which are built on its ai-thread composer and voice), and a main
  half (doc export and Ask AI; image generation, with provider keys read in main only).
- **`packages/features/media-audio`**, **`media-video`** (Creator, Studio) — the next two tabs, same
  shape. Audio's host port carries Studio's Suno-style prompt form (ai-thread + voice), the music
  editor sub-tab (still Studio's code until the music slice) and the remembered sub-tab; the feature's
  `BasicPromptForm` is what an app without them shows. Its main half is the audio service, Import and
  the engine status; the local MusicGen worker's fork is injected (`createMusicBroker({ spawn })`), so
  the feature never imports `electron` — an app with no engine passes `unavailableMusicWorker()`. Video's
  main half is the whole video service (project discovery, the studio dev server, the render queue,
  toolchain probe, Setup), spawning the engine CLIs through the runtime's `process-runner` and
  `login-shell` (moved there for it); its window events, OS handoffs, repo lookup and template path are
  injected. Its host port carries the integrated terminal, the embedded studio view, the agent surfaces
  (Edit thread, editorial skills) and a handful of chrome pieces — all optional, with plain defaults
  (an iframe studio, plain markdown, a "run `npm install` in …" hint).
- **`packages/features/slides`** (Creator, Studio) — not a tab: the markdown deck, its modal and the
  shared Present button, renderer-only. Its host port is the overlay rules the deck lives by (dismiss
  stack, focus trap, occluder, link opener, highlighter). The modal has its own entry
  (`@midnite/studio-feature-slides/renderer/modal`) so an app can `import()` it lazily; the barrel is
  what an entry chunk may import.

**The registry contract lives in the frame** (`packages/frame/src/media/`): the descriptor type, and
the **media kit port** — the shell's plumbing a tab composes (`MediaLayout`, the explorer, the export
toolbar, the data hooks) as types plus `MediaKitProvider`/`useMediaKit()`. A tab feature imports only
that; `MediaShell` installs media-core's implementation (`mediaKit`) around the tabs it renders; the
app lists the descriptors in strip order. Shared cannot hold it (a descriptor carries a React
component), and the frame implements none of it. `scripts/layer-boundaries.test.mjs` proves a tab
cannot reach the shell or a sibling tab, by name or by relative path. Theme R and S tabs follow the
same shape.

### App 10: Creator (`apps/creator`)

Creator composes media-core with Docs, Images, Video and Audio (Slides is not a tab: a doc's Present button opens its deck). Its main (`apps/creator/main/`) scopes media to
one repository id, `creator`, resolved to `<userData>/media` (userData under
`Midnite Runtime/apps/creator`), serves the gallery's `mstudio-file://repo/creator/…` URLs from that
root through the runtime's path jail, and reads image provider keys from the runtime vault as
`creator`. The preload exposes `media` and `video` — no `secrets` namespace, so a provider key is read
in main and never reachable from the renderer. Docs has no Ask AI pane (Creator has no agents yet) and
Images and Audio use the features' plain forms. Audio imports files and reports the local engine as
unavailable (its ONNX worker lives in Studio's desktop package); Video keeps its workspace under the
media root (`<media>/.midnite/media/video`), serves iterations from it as `mstudio-file://video/-/…`,
copies `templates/media-video` into the bundle for Setup, and — with no terminal — shows the
`npm install` to run. `MIDNITE_CREATOR_SMOKE=1`
with `MIDNITE_CREATOR_USER_DATA=<tmp>` prints `midnite-creator:ready` and quits.

### App 8: Coder (`apps/coder`) — Phase 113 Theme O slice 1

Coder composes two feature packages: **`packages/features/forge`** (Reviews and Actions over every forge
provider) and **`packages/features/tests`** (the Tests view), over the frame. It opens on Reviews, with Actions
and Tests as tabs beside it, and a small repository list on the left. The git graph, sessions, tasks, the API
client and the database are later slices.

**Decision 1 — how the renderer folders split into packages.** Four placement folders (`forge`, `reviews`,
`actions`, `tests`) became **two** packages, not four:

- `features/forge` holds `forge`, `reviews` and `actions` (`FEATURE_PACKAGE_FOLDERS.forge` in
  `shared/src/domain/placement.ts`, the opposite direction from media's `FEATURE_PACKAGE_SPLITS`). Its main half
  is every forge provider, the account registry, the poller and their handlers; its renderer is the forge status
  vocabulary, the forge query hooks, Reviews and Actions.
- `features/tests` holds `tests`: discovery, per-suite trust and the runner in main, the Tests view in the
  renderer.

Why: Reviews renders Actions' run detail in its Checks tab, and both draw the status vocabulary
(`StatusPill`, `runStatus`, …) and the forge query hooks (`useForgePulls`, `useForgeRuns`, …). Split per
folder, `reviews` would import `actions` and both would import `forge` — the feature→feature import the layer
rules forbid — or that whole data layer would have to move into the frame, which every app wears (Cleaner and
Money included) for the sake of one app. No app composes Reviews without Actions, so a split would buy no
install-time choice either. Tests touches none of it, so it stays its own package. Each folder keeps its
placement row and its own view registrations, so Studio's view and settings-page order is unchanged. What
Studio's frame-placed surfaces need from the forge (the repos sidebar's forge sections, the graph's CI column,
the status-bar chip, the issue modal) they import from `@midnite/studio-feature-forge/renderer` — an app may
import a feature; when those surfaces move into the frame (slice 2), the status vocabulary moves with them.

Each package sits behind a host port: `ForgeHost` (chrome over app state, the diff kit, the selected repository,
pane sizes, link routing, and optional Studio-only members — Present, the agent hand-off, preview deployments,
"Fetch to compare", applying a suggestion) and `TestsHost` (selected repository, list width, optional "Run in
terminal"). Studio's adapters are `app/src/compose/forge-host.tsx` and `tests-host.ts`, nested in
`StudioProviders`; the issue modal, which `app.tsx` mounts outside `StudioProviders`, gets the forge host
installed around it too, because it draws status pills. The status vocabulary's tooltip falls back to a native
`title` where no host is installed, so a pill never throws. Any other app uses
`createStandaloneForgeHost({ useActiveRepo, useForgeKind, openExternal })` — plain chrome and a plain diff.
Reviews' Present button belongs to the slides feature, so it reaches the forge through the host, not an import.
`formatNumber`, the review-thread anchoring (`threadsForFile`, `positionForLine`) and `relativeAgeFromIso`
moved into the frame on the way.

**Decision 2 — how Coder reads a repository's forge remote: `.git/config`, read-only, in main.** Studio asks
git (`git config -z --get-regexp`, git-engine's `listRemotes`) through dugite's bundled binary. Coder does not
bundle git: `scripts/pack-bundle.mjs` packs `dist/` with everything inlined by esbuild, and dugite resolves its
git binary from its own package directory at run time, so carrying it means shipping that directory (42 MB for
dugite 2.7.1's darwin-arm64 git) beside the bundle and pointing dugite at it — machinery the bundle format does not have, for
one read. Instead `readGitConfigRemotes` (the forge feature's `main/git-config-remotes.ts`) reads the checkout's
config file (following a linked worktree's `.git` file to its `commondir`), applies `url.<base>.insteadOf`, and
hands the same `key\nvalue\0` records to git-engine's own `parseRemoteConfig`, so both apps derive a forge
identically. It never writes and never runs anything. Not honoured: `include`/`includeIf` and the global or
system config — a remote defined only there reads as "no forge", the honest answer. The forge feature's main
half takes the remotes through a `remotes(repoId)` port, so it never knows which way they were read. git-engine
is still bundled for its pure parsers (diff parsing, test discovery over the filesystem), with `dugite` stubbed
as Agents does.

**Coder's repositories.** No Studio repo registry: `main/repos.ts` keeps `{ id, path }` rows in Coder's userData.
A folder joins only through main's native dialog — `repos.pickDirectory` offers the chosen path once, and
`repos.open` admits only a path that was offered, resolves it to its real path and requires a `.git`. After that
every channel takes a `repoId`. The renderer's bridge is `forge`, `forgeProject`, `forgeAccounts`, `tests`,
`remotes.list` and four `repos` members (`main/bridge.ts`); there is no `secrets`, `fs`, `pty` or `ops` namespace.

**Forge tokens stay in main, behind the grants.** The account registry's vault is the runtime vault as `coder`,
built with `createVaultGrants({ directory }).authorize` (`scripts/app-vault-grants.test.mjs`). Without a grant to
the `forge-accounts` namespace a token-backed account reads as having no token — the HTTP providers send nothing
and report `not-authenticated`, while a `gh`-delegated GitHub account still works through `gh` — and adding an
account fails with a sentence instead of storing anything. Granted (Vault ▸ App access), the token reaches the
forge's HTTP API in main and never an answer: `apps/coder/main/context.test.ts` walks both cases, and the forge
feature's no-token-wire test holds the accounts channel to `hasToken`. Account records live in Coder's own
`forge-accounts.json`, so an account added in Studio shows in Coder only once added there too (the token itself
is shared through the vault). Review writes are behind Coder's own "Review actions" switch, off by default as in
Studio. `MIDNITE_CODER_SMOKE=1` with `MIDNITE_CODER_USER_DATA=<tmp>` prints `midnite-coder:ready` and quits.

**Left out in this slice:** the plain diff has no split layout, syntax colour or image diff (Studio's diff view
moves into the frame with the graph); no Present, agent hand-off, preview deployments, "Fetch to compare",
suggestion apply or "Run in terminal" (each an optional host member Coder does not have yet); no Settings pages
(Reviews, Accounts) — those stay in Studio's Settings view.

### Money's brokerage and exchange accounts (Phase 113 Theme P slice 2)

Read-only accounts live in the finance feature (`packages/features/finance/main/accounts/`). Trading is
deferred (`outstanding.md`); nothing here can place, amend or cancel an order, withdraw or transfer.

**The connector contract** (`accounts/connector.ts`). A connector is one file implementing
`AccountConnector`: `id`, `label`, `assetClass`, the credential `fields` its form asks for,
`supportsEnvironment`, a `readOnlyHint`, `allowedEndpoints` (an allowlist of `{method, path}`),
`baseUrl(environment)`, and exactly three read methods, `balances()`, `positions()` and `history()`
(equity points), each returning the normalised `Balance`, `Position` and `PerformancePoint` of
`shared/src/finance-accounts.ts`. Adding one is a file: implement it, add its id to
`ACCOUNT_CONNECTOR_IDS`, register it in `accounts/registry.ts`, add a recorded-fixture test.
Shipped: **Alpaca** (stocks; paper or live) and **Kraken** (crypto; `API-Sign` is a pure,
known-answer-tested function).

**Read-only is enforced, not hoped for.** A connector never sees the transport: it is handed a
`ReadOnlyRequester` built from its own allowlist, so any other `(method, path)` throws before the
fetcher is called; a second guard refuses any path containing an order, trade, withdraw, transfer,
cancel, deposit or wallet word even if allowlisted. `connectors.test.ts` asserts that sixteen
order/withdraw/transfer paths cannot be built and that a connector exposes only read verbs. The add form
tells the user to create a read-only key at the provider as the second lock.

**Keys stay in main.** Credentials are stored in the runtime vault's `secrets` namespace as
`finance.account.<connector>.<accountId>.<field>`: names no channel can ask for (`SecretKey` is an
enum, so `secretsGet`/`secretsHas`/`secretsSet` reject them), set through `financeAccountAdd` (a
write-only `fields` bag that is verified first and never echoed), read by main for one call, deleted
by `financeAccountRemove`. Money's vault is behind the grants as before: without a grant to the
`secrets` namespace an add fails and stores nothing. Non-secret metadata (`accounts.json`) lives
beside the finance cache. Responses are walked by `response-schemas.test.ts` for key-like fields,
and error text is scrubbed of the credential values it was built from. Snapshots are cached in
main for 60 seconds; a failing account answers its own `error` and keeps its last good numbers, and
never blanks another account.

## Knowledge's host port (Phase 113 Theme M)

Knowledge is frame-owned: the view, its sigma canvas, its filters store and its hooks live in
`packages/frame/src/knowledge/` and read everything Studio-specific through one port, `KnowledgeHost`
(`knowledge-host.tsx`), installed once at an app's root with `<KnowledgeHostProvider host={...}>`. The port is a list,
not a service locator; a member exists only because the view reads it:

| Member | What it carries | Studio (`compose/knowledge-host.tsx`) | Mind (`compose/knowledge-host.tsx`) |
|---|---|---|---|
| `useFocus()` | window focus, gating the canvas's animation | `useWindowFocused` | `focus`/`blur` listeners |
| `useCorpus()` | `{ repoId, worktreePath? }` - what the graph is of | the active worktree | the fixed notebook id, no worktree |
| `useSettings()` / `getSettings()` / `setSettings(patch)` | renderer variant, layout id, detail id, the two panel widths | `ui-store` | a persisted store under `midnite-mind.knowledge` |
| `prefersReducedMotion()` | motion, read imperatively by the canvas | `appearance-store` | `prefers-reduced-motion` |
| `panelBounds` | min / max / initial of the two panels | `LAYOUT_BOUNDS`, `DEFAULT_LAYOUT` | its own |
| `Popover` | the variant pills' overflow menu | Studio's `Popover` | the frame's `SimplePopover` |
| `SourcePreview` | what a node's detail panel shows for its source | `FilePreview` on the file and line | the note itself |
| `Absent?` | what shows when there is no graph | omitted: the "graphify this repo" instructions | "Nothing to graph yet" |

`IconButton` is not on this port: the view takes it from the frame's chrome port (`useFrameChrome`) through
`knowledge-icon-button.tsx`. The query keys (`knowledgeKeys`) moved into the frame with the hooks; Studio's
`services/queries.ts` spreads them into its `keys`, so no call site changed. The filters store seeds its three
persisted preferences from the host when the provider first renders (`bindKnowledgeSettings`) and writes each change
back, in place of reading `ui-store` at module init.

**Two entries.** The light half (the host port, `knowledgeKeys`, `useKnowledgeGraphExists`, `SimplePopover`) is on the
frame barrel. The view is its own entry, `@midnite/studio-frame/knowledge`, because it pulls sigma and graphology; an app
loads it with `React.lazy`, so neither is in any entry chunk (Mind's `dist/` shows it: the sigma code is its own 189 KB
chunk). A suite app that composes it needs an explicit vite/vitest alias for that subpath, placed before the
`@midnite/studio-frame` one.

**Mind's corpus is its notebook, and it needs no external tool.** Studio answers the three Knowledge channels from a
repository's `graphify-out/graph.json`, which the user builds with graphify - the app never runs it. Mind has no
repository and nothing to run, so its main (`apps/mind/main/knowledge.ts`) builds the same `graph.json` shape from the
notes (`notes-graph.ts`: a node per note, a node per `#tag`, a `references` link per `[[first line]]`, communities by
note status) and runs it through `@midnite/studio-knowledge`'s projection and layout. The layout runs in-process (a
notebook is hundreds of nodes) and is cached under `<userData>/knowledge-cache` by a content hash, so an unchanged
notebook never lays out twice. An empty notebook answers `absent`, which the view shows as Mind's own empty state. Because
nothing is spawned there is no missing-tool state to show; if a later version wants graphify's richer extraction over
exported notes, that would be a host-injected runner behind the same channels, never a download.

The app mounts the view inside `QueryClientProvider` (the view's reads are react-query queries) within the two host
providers; nothing sits outside them. In Studio the provider nests in `compose/studio-providers.tsx`, which both the main
window and the popout root render.
