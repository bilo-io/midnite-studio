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
| `browser` | frame | the panel; now `packages/features/browser` together with `web-apps` (`FEATURE_PACKAGE_FOLDERS.browser`), which the Browser app composes full-window |
| `changes` | frame | working-tree changes belong to the git graph |
| `commit` | frame |  |
| `companion` | frame | now `packages/features/companion` (Phase 123 Theme F): the panel, voice and reveal engine behind the `CompanionHost` port, and the main half (STT, TTS, ask) behind `CompanionMainServices`; Studio's revealers, sources and adapter live in `packages/app/src/compose/companion/` |
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
| `report` | frame | Report an Issue: the dialog, its frame modal and its main half (`packages/features/report`), so every app files to midnite-apps the way Studio does |
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
| `tasks` | coder | user decision; now `packages/features/tasks` behind `TasksHost`. Studio's terminal-backed card parts (live session, Play, composer, Auto-mate), the issue modal and Plan with AI stay in `packages/app` as optional host members |
| `tests` | coder |  |
| `slides` | creator |  |
| `media` | creator, media, gamer | tabs split: doc/image/audio/video to Creator, map/terrain/model/sprite/game to Gamer, library to Media (`media-library`, Theme R) |
| `notes` | mind |  |
| `chats` | agents | the Chats view, composer and change review; the turn service and engines in main. Optional host members (companion toggle, open in graph) are Studio's |
| `councils` | agents | the Councils view and run orchestration; its runner takes the pty, roster and Ollama key as ports |
| `models` | agents | the Models view and the Ollama client, pull queue and settings; terminal-backed actions (launch with, `ollama serve`) are optional host members |
| `finance` | money | the panel, status-bar segment and dashboard widgets (once two folders, `finance` and `finance-dashboard`) as one package |
| `diagnostics` | monitor | problem list and crash log; the status-bar segment stays in the frame |
| `monitor` | monitor | full view; the status-bar segment stays in the frame |
| `vault` | vault | the metadata-only view of stored secrets, forge accounts, database logins and web-app sign-ins, plus the credential parts of Studio's Settings ▸ Accounts and ▸ Agent (through `VaultHost`) |
| `capture` | capture | `packages/features/capture` (Theme K): stills, regions, recordings, the global chord and the opt-in clipboard history; Send to… reaches a chat, a pull-request comment and Creator only through `CaptureHost` |
| `vanguard` | vanguard | `packages/features/vanguard` (Phase 120): the Vanguard view (findings, Sensors, Network), Settings ▸ Vanguard, the findings handlers and the sensor host; the findings ledger itself is the runtime's |

A tuple layer (`media`) lists the owner first; the others reuse the folder.

## Packages

Theme C of Phase 113 adds the packages the suite is built from. Studio is still the only thing that ships.
`packages/app` and `packages/desktop` now act as **Studio's composers**: they put the packages below
together, and until Themes G and H give every app its own composition, they are the only ones.

**Studio is `apps/studio`** (`moon run studio:start`): the composition of every feature and the frame, the
dev harness, and still installable for power users. `packages/app` and `packages/desktop` are its renderer
and main internals; `studio:start`/`bundle`/`dist` delegate to the `desktop:*` tasks, which keep working.
`apps/studio/src/composition.ts` lists the features it composes and a test holds that list to `packages/features/*`.

**Studio's entries live in `apps/studio/entry/`** (Phase 113 Theme G). The renderer and the main process both
boot from there. `packages/app/index.html` loads `entry/renderer.ts`, which mounts `bootStudioRenderer` from
`@midnite/studio-app/boot` (`packages/app/src/boot.tsx`, which was `main.tsx`).
`packages/desktop/scripts/bundle.mjs` builds `dist/bundle/main.js` from `entry/main.ts`, which calls
`startStudioMain` from `@midnite/studio-desktop/main` (`packages/desktop/src/main/index.ts`).

The tooling stays beside the code it builds: Vite's config and `index.html`, the esbuild script, the preload,
the workers and electron-builder. That keeps the packaged app's layout, its bundle id, the CSP and the
e2e/perf harnesses exactly where they were. In dev, a serve-only Vite plugin (`vite-studio-entry-plugin.ts`)
serves the out-of-root entry by its `/@fs/` URL.

Each entry may import only its one seam (and `shared`), and eslint holds it to that. The composition itself
still never imports an internal. apps/studio's typecheck maps each seam to a contract file (`boot-contract.ts`,
`main-contract.ts`), so it does not compile the renderer and main a second time.
`composition.test.ts` asserts that both builds start from these entries.

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
`openWorkingCopyInGraph`, tasks' `terminal` (a card's live session, Play, Stop, composer and Auto-mate).
Agents (`apps/agents`) leaves those out and supplies plain chrome for the rest
(`src/compose/plain-ui.tsx`, `plain-composer.tsx`). Its councils run each member as a piped login shell
(`main/shell-runner.ts`) rather than through the pty broker, and `dugite` is stubbed in its bundle: it has no
repository registry yet, so every chat runs in its scratch directory. Its workflow **agent nodes** do use a pty —
on the runtime host's broker, as a guest (Coder slice 4, below).

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
  absent, so a `git-status`, forge or gate-comment step reports its own failure. An **agent node** drives an
  interactive CLI to idle, which needs a pty: since Theme O slice 4 it runs on the runtime host's shared broker
  as a guest (`apps/agents/main/broker-sessions.ts`, below) and fails with a plain message when no host broker
  is running. `ai-prompt`/`ai-extract` run the same CLI headlessly and work either way.
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
  that is never saved. Vault's is `VaultHost` (`openWebApp` and Studio's forge kit; Studio's adapter is
  `app/src/compose/vault-host.tsx`, and `apps/vault` composes `{ openWebApp: null, forge: null }`).

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

## The shell (Phase 123)

Every app that renders `SuiteAppShell` (`packages/frame/src/shell/`) wears the same window as Studio: a
frameless title bar, a rail over its own views with Settings at its foot, the app's logo, and the status bar.
An app composes it; it does not copy it. The shell itself is not optional.

### What an app gets for free

- **A frameless window.** `openWindow` spreads `suiteWindowOptions(process.platform)`
  (`runtime/src/app-main/suite-window.ts`: `titleBarStyle: 'hidden'` and the traffic-light inset on macOS) and
  merges its `--mstudio-frameless=` launch argument into `webPreferences.additionalArguments`; the preload's
  `windowChrome` slice reports it. The shell draws `TitleBar` as the drag region, drops the inset in full
  screen, and a double-click on it calls `windowChrome.toggleMaximize` (a no-op in full screen; a click on a
  control in the bar is left alone). Vanguard keeps its options in `main/window-options.ts`, which imports no
  `electron`, so a test can assert them.
- **The launcher's logo.** `appLogoUrl(app)` serves a 256 px copy of the launcher's tile, written by
  `generate-app-logos.cjs` and held byte-identical by a drift test. `SUITE_APP_IDS` in `shared` is the one id
  list. Nothing hand-copies a PNG.
- **A rail.** Built from the manifest's `nav`, with the app accent on the logo tile and the active row only. A
  row that names a `command` shows that chord on hover, never a literal.
- **Settings, last in the rail.** The suite pages (Appearance, Keyboard shortcuts, Monitor) come first, then
  the app's own `settingsPages`. `Mod+,` (`view.settings`) opens it in every app.
- **The chords.** `useKeybindings` and the command palette live in `frame/src/commands/`; an app binds only the
  commands it has a handler for, and a chord that is not its own reaches the page untouched. `SUITE_COMMANDS`
  in `shared/src/keybindings.ts` is the subset a suite app answers; no app defines a chord literal.
- **Shared preferences.** Appearance, palette, motion and the title-bar cluster persist through the runtime's
  `suite-prefs` file under `<appData>/Midnite Runtime/`, so one change reaches every app. They never go in
  `localStorage`, which is per-app.
- **The status bar and the monitor core.** `suiteSegments(panels)` gives the five suite segments, dropping any
  whose panel the app lacks; the monitor segment opens the metrics-only flyout, and each main's
  `bindMetricsToWindow` pauses sampling on blur, hide and minimise.

### The manifest fields

An app's `src/<id>-manifest.ts` carries `ShellManifestFields` beside its id, name and accent
(`frame/src/shell/nav-config.ts`):

| Field | Meaning |
| --- | --- |
| `nav` | `NavConfig`: the views in rail order. Settings is never one of them. `navConfigProblems(nav)` is `[]` for a sound config (at least one view, unique ids, every `command` a real `CommandId`); each manifest test asserts it. A host over several modules builds it with `navFromModules(APP_MODULES.<host>, { <module>: <MODULE>_NAV_GROUP })`, one titled group per module. |
| `panels` | `{ terminal?, companion?, fab? }`, each on unless set `false`. This is how a panel is opted out. |
| `settings` | The ids of the app's own settings pages, after the suite's. A page id of the form `app:<name>` is an app page. |

### The hosts

The frame imports no feature, so everything a panel needs from outside it arrives through a host port the
composer fills (the `notes/renderer/host.tsx` pattern), never an eslint exception:

- `FrameChromeProvider`: the app's chrome (name, settings, report entry).
- `TerminalHost`, `CompanionHost`, `LoopsHost`: the panels' ports, in `packages/features/<name>/renderer`. Each
  feature ships a default host in its own package, since the frame cannot name the port's type. Studio fills
  them in `packages/app/src/compose/`.
- `TitleBarHost`: the right cluster's metrics cadence and privacy switches.
- `StatusBarChromeProvider`: the status bar's tooltip and popover; the default is a `title` and the frame's
  `SimplePopover`.

### Deferred: a pty host for the suite apps

Terminal, companion and FAB/Loops are built as features behind those ports, but **no suite app mounts them
yet**, so `panels` is declared in the manifests and not rendered. The reason is main-side, not renderer-side:
the broker script, `node-pty`, confinement and the agent probe live in `packages/desktop`, and an app can only
attach to Studio's broker as a guest, which cannot create a session. The companion also needs Studio's dispatch,
agents and utility fork, and the FAB starts its loop in the terminal. Each joins with the host it needs, never
as a button that does nothing. Until then the chords `terminal.toggle`, `fab.toggle` and `companion.toggle` are
not bound outside Studio, and the shell's e2e covers only what a suite app actually has.

### Testing the shell

`packages/app/e2e/suite-shell/` drives Vanguard's and Agents' own renderers (each on its own Vite server, from
`playwright.config.ts`) through `test-support/suite-bridge.ts`, a deep-proxy `window.midniteStudio` that
answers an unlisted call with `{ ok: true, value: null }` and takes per-path `answers` for the few reads a pane
crashes without. Appearance is `e2e/visual/suite-shell.spec.ts`: framed, frameless and nav collapsed.

## App compositions

Each app in `apps/` composes the frame, its assigned features, and its host ports into an installable desktop product.

### App 5: Browser (`apps/browser`) — Phase 113 Theme L

Browser composes one feature package, **`packages/features/browser`**, over the frame and `shared`: the
same pane, tabs, toolbar, new-tab page, find bar, launcher, switcher and web-apps rail that Studio's
browser panel is, given the whole window. It is a real bundle: `resources/icon.icns`, an Electron main
and a `pack-bundle` zip, like Cleaner and Coder.

**Decision 1 — one package for two folders.** `browser` and `web-apps` became one package
(`FEATURE_PACKAGE_FOLDERS.browser = ['browser', 'web-apps']`, the forge's direction). The web-apps rail
measures its native view with the pane's `boundsFromRect`, and both ride the same `WebContentsView`
services in main; split, `web-apps` would import `browser`, the feature→feature import the layer rules
forbid. The package takes `browser`'s placement (the frame, so its moon tag is `app-all`); `web-apps`
keeps its own placement row (the Browser app). Each folder keeps its registrations, so Studio's view
order is unchanged.

**The renderer half** (`renderer/`) reaches the app through the **`BrowserHost` port**
(`renderer/host.tsx`): a zustand-shaped `ui` store (the layout, launcher and switcher state, the
discard threshold, the occluder count, the selected repository and the web apps' enabled, detached and
on-screen state — names matching Studio's `ui-store`, whose persisted keys did not move), the repository
and remote hooks, Studio's modal, tooltip, context menu and Escape stack, the occluder hook, the popout
header slots, the brand marks and each web app's glyph. `standalone` is true in an app that *is* the
browser: the pane offers no layout picker, no "Close browser" and no Escape-to-close, and neither the tab
strip nor a web app offers Detach. Studio's adapter is `packages/app/src/compose/browser-host.tsx`
(`standalone: false`, so Studio keeps every one of them); its composition tests are in
`app/src/compose/browser/`.

**The main half** (`main/`) is what moved out of `packages/desktop`: `browser-service.ts`,
`web-apps-service.ts`, **`browser-security.ts` unchanged** (every navigation guard, permission handler,
window-open handler and partition rule, with its test, byte-for-byte), `dev-server-probe.ts`, and the
handlers for every browser and web-apps channel. It imports no `electron`: the host installs a
structural port (`browser-electron.ts`: `createView`, `sessionFromPartition`, `onDisplayMetricsChanged`,
`openExternal`) with `installBrowserMain({ electron, log, readDiscardSettings })`, and passes a
**sender-aware IPC port** (`BrowserSenderIpc`) because tab creation, bounds and visibility are resolved
against the window that asked — the runtime's `FeatureMainContext` does not carry the sender. Desktop's
adapter is `main/browser-port.ts` (the real Electron, plus the one cast from `BrowserWindow` to the port's
`BrowserHostWindow` — `View` and `BrowserView` are not structurally assignable) and
`main/ipc/browser-feature-handlers.ts`, which calls `browserMain.register`.

**What Browser is** (`apps/browser`):

- **Renderer** (`src/`): `BrowserApp` wraps `BrowserShell` in the frame chrome (`compose/browser-chrome.tsx`,
  the suite kit) and its `BrowserHost` (`compose/browser-host.tsx`: `standalone: true`, no repositories, a
  small Escape stack with Studio's occludes rule, a native-title tooltip, the kit's context menu, and a
  `PiGlobeFill` mark in the accent `#f59e0b`). The state is `browser-ui-store.ts` (key
  `midnite-browser.ui`: enabled web apps, the last one opened, the discard threshold). Any kit dialog or
  menu counts as an occluder, so the page's native view hides beneath it.
- **The three pieces #853 settled**: full-window browsing (the feature's `BrowserPane`); **web apps** on the
  rail (`WebAppsRailRow`), each taking the page when opened (`components/web-app-view.tsx` over the
  feature's `WebAppPane` and its `persist:app-<id>` partition), turned on and off from a "Web apps" menu —
  Studio's Settings ▸ Apps; and the **agent session** strip (`components/agent-session-bar.tsx`), which
  mirrors a session that lives in main — see *The policy module and the agent-session contract* below.
- **Keys** (`use-browser-keys.ts`): the browser commands' chords from `shared`'s `COMMANDS`, matched as
  Studio's dispatcher matches them. The app menu is only the app and edit menus, so `Mod+w` and `Mod+r`
  reach the tab commands rather than closing or reloading the window.
- **Main** (`main/`): `identity.ts` (name `Midnite Browser`, userData `<Midnite Runtime>/apps/browser`,
  `MIDNITE_BROWSER_USER_DATA` overrides it, `MIDNITE_BROWSER_SMOKE=1` prints `midnite-browser:ready` once
  the window has loaded and quits), `index.ts` (single instance, `guardAppWindow`, every permission denied on
  the default session — Studio replaces Electron's default the same way; the tabs keep the feature's own
  partition security), `context.ts` (registers `browserMain` with the real Electron behind the port, the
  idle-discard sweeps, and `clipboardWriteText`), and `preload.ts` + `bridge.ts`, which expose only
  `browser`, `webApps`, `clipboard` and `menu` on `window.midniteStudio`. Browser holds no credential, so it
  composes no vault and no pairing. `scripts/bundle-main.mjs` writes `dist/main.cjs` and `dist/preload.cjs`.
  Web-app idle discard is off (Studio reads it from its settings; Browser has none yet).
- **Icon**: `moon run launcher:icons` writes `resources/icon.icns` from the launcher's Browser tile logo, so
  the Dock shows what the launcher does. The `.icns` is committed, so a release now packs
  `midnite-browser-X.Y.Z-bundle.zip`.
- **Build task**: the feature has a `main/`, so it keeps a real `build` (`tsc -b tsconfig.main.json`); only a
  renderer-only feature takes slides' no-op.

**The policy module and the agent-session contract (Phase 117).** The browser's security rules are a set of
Electron-free modules in `features/browser/main/`, each taking a structural stand-in for what it touches so it
tests under bare vitest (`pure-rules.test.ts` lists every rule with its test file and fails if one imports
`electron`). `browser-security.ts` holds the navigation, permission and download rules; `browser-session-policy.ts`
is the one place a session rule is installed (`applyBrowserSessionPolicy`, called for `persist:browser` and every
`persist:app-<id>`, in a test-pinned order); `permission-grant-store.ts`, `site-verdict-state.ts`,
`download-policy.ts`, `filter-list.ts` and `phishing-rules.ts` are the rest. The one `webRequest` listener set
(`browser-request-filter.ts`) fans out through `withRequestGate`, which is how an agent session gates a tab's egress.
Tabs have no preload; main's only page reads are isolated-world scripts. [`docs/BROWSER_SECURITY.md`](BROWSER_SECURITY.md)
is the full account.

The **agent-session contract** is `BrowserAgentSession` (`main/browser-agent-session.ts`) with the wire types in
`shared/browser-agent.ts`: six tools (`navigate`, `read`, `find`, `click`, `type`, `screenshot`) over one tab, a
per-session origin allowlist, a pause for the user on an off-list navigation, a password field, a form submit and a
download, and every page word returned only as `UntrustedPageContent` (`shared/untrusted-page-content.ts`, 64 KiB,
path-redacted, provenance-tagged). The session holds no vault handle (`browser-agent` is a never-grantable vault
principal). The renderer's `agent-session-store.ts` only mirrors it — `start`, answers and "Take over" go over
`browser.agentStart`/`agentTool` and every change returns as an `agent-session` browser event — and the agent
runtime that issues the tool calls is Phase 121. `apps/browser/src/compose/browser-agent-boundary.test.tsx` holds
every tool response to the envelope.

### Vault: web-app sign-ins and Studio's credential settings (Phase 113 Theme J slice 3)

**Web-app sign-ins.** The Vault view lists each web app's own `persist:app-<id>` partition (names unchanged)
as a cookie count and the sites those cookies belong to — `WebAppSignInSchema` in `shared`'s
`domain/web-apps.ts`, over `webAppsSignIns`/`webAppsSignOut`. **No cookie value, name, path or storage
contents crosses**: the browser feature's main half (`features/browser/main/web-app-sign-ins.ts`) reads a
partition through the `BrowserElectron` port, whose cookie type names only `domain`, and builds each row
field by field. *Sign in* asks the host to open the app (Studio does what its rail does: switch the app on,
open its flyout, or focus its window when detached). *Sign out* clears that one partition's storage and cache
behind the kit's destructive confirm, which counts the cookies (`BlastRadiusKind` `'cookies'`) and names the
sites, then reloads the app's live view. The channels are `mstudio:web-apps:*`, so the browser feature
answers them wherever it is composed; `apps/browser`'s preload does not expose them. **`apps/vault` cannot see
Studio's partitions** (they live in Studio's `userData`), so its vault main answers "needs Midnite Studio"
(`NEEDS_STUDIO_SIGN_INS`) and its view shows that sentence with no buttons.

**Studio's credential settings.** Settings ▸ Accounts' add-account form (provider picker, token field,
error, submit), its remove button and its "How this works" note, and Settings ▸ Agent's write-only
`AgentKeyField`, are vault-feature components (`features/vault/renderer/forge-account-credentials.tsx`,
`agent-key-field.tsx`). Studio's pages keep everything forge-owned (the account list, Make active, switching
preferences, reachable repos, the setup banner) and render the credential parts through composition. The
forge kit those components need — the provider table and react-query add/remove mutations — reaches them
through `VaultHost.forge`. The provider table moved out of `accounts-page.tsx` into
`settings-pages/forge-providers.ts`, because the account switcher, the setup pages and the dashboard read it
too. What stayed: Ollama's key row on the Ollama page (it reads the models feature's queries), the Companion
STT key (its own `safeStorage` store, not the vault), and database logins, which are edited in the database
feature's connection dialog, not on a settings page.

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
- **Icon**: `moon run launcher:icons` regenerates `resources/icon.icns` from the launcher's Cleaner tile logo,
  so the Dock shows what the launcher does. The `.icns` is committed.
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
  shape. **The music editor is Audio's own sub-tab, not a package of its own**: it opens Audio's
  projects, sends its renders to the Generator through Audio's export code, and a `media-music` package
  could not import `media-audio` (features never import one another) — so it lives in
  `renderer/music-editor/` and `main/music/` (song store, `.mid` I/O, exports, the General MIDI sample
  cache). Tone.js loads only when the Editor sub-tab opens (`React.lazy`). Audio's host port carries
  what needs Studio: the Suno-style prompt form (ai-thread + voice), the song's agent chat (built on the
  chats feature and the agent engines — absent in Creator, which then shows no chat button), the
  instrument picker's `Popover` (the frame's `SimplePopover` otherwise) and the remembered sub-tab;
  the feature's `BasicPromptForm` is what an app without them shows. Its main half is the audio
  service, Import, the engine status and the editor's songs, exports and GM samples (the composer
  injects the native pickers and ffmpeg, so no window crosses the port: dialogs use the focused one);
  the agent runs, the chat thread and Antigravity registration stay Studio's main. the local MusicGen worker's fork is injected (`createMusicBroker({ spawn })`), so
  the feature never imports `electron` — an app with no engine passes `unavailableMusicWorker()`.
  **Its manifest owns the `music_*` MCP tools** (`mcpTools`, owner `creator`): `mcpToolOwner` reads the
  manifest before `defaultMcpToolOwner`, so a Creator-only install lists them and an Agents-only one does
  not. Every tool-listing consumer passes the manifests — the server and shim from
  `desktop/src/main/mcp/tool-manifests.ts`, `McpToolsView` through its `manifests` prop (Studio and Agents
  both pass Audio's); the handlers stay in Studio's `main/mcp`. Video's
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
- **`packages/features/media-map`**, **`media-terrain`**, **`media-sprite`**, **`media-game`** (Gamer,
  Studio; Phase 113 Theme S slice 1) — one package per tab, not one `media-gamer`. **Why four, though
  they hand work to each other:** every hand-off crosses a seam that is a function, not an import, so
  nothing forced a merge. Terrain's "Show on map" is `TerrainHost.showOnMap` (the app posts to Maps'
  focus store and switches tab); a Maps capture hands its heightmap to Terrain through the structural
  `CaptureTerrainPort`, which Terrain's own service satisfies; Sprites' terrain-to-tiles job takes
  Terrain's `bakeSplat`, and Games' terrain-pack import takes `exportTerrain`, as injected deps the
  composer fills from `@midnite/studio-feature-media-terrain/main`. One package would have made Studio's
  imports shorter and Gamer's bundle no smaller — and the next app to want Maps alone (Media) could not
  have it. Each follows the Images/Video shape: a `MediaTabDescriptor`, an optional-everything host port
  (`MapHost`, `TerrainHost`, `SpriteHost`, `GameHost` — a tab rendered with none still works), `chrome.tsx`
  wrappers over the frame's chrome port, a manifest, and a main half whose `create<X>Runtime(deps)` wires
  the services from injected Electron pieces (`net.fetch`, `nativeImage`, `utilityProcess`, the media
  store, `userData`) so `mediaXMain.register(ctx, …)` and the whole half run under bare vitest.
  **The Model tab is `packages/features/media-model`** (slice 2, below). What Sprites needs from it —
  `useRiggedModels`, `useMapEngine`, `loadRenderJob` — is one spread, `modelSpriteSeams`, that Studio and
  Gamer both put into `SpriteHost`. The pure encoders every one of them reads — PNG/APNG, OBJ/glTF writers, the software
  preview renderer, `extractJson` — moved to **`@midnite/studio-runtime`'s media kernel**
  (`runtime/src/media/`), with one-line re-exports left at the desktop's old paths. **The play-test loop is
  the games feature's** (slice 3): `game-state`, `playtest`, `game-mcp` (the `game_*` implementations over
  an injected page port), `game-agent` (the argv builder and commit-per-pass loop) and `game-agent-service`
  live in `media-game/main/games/`, wired once by `createGameLoop({ runtime, contents })` — play-tests plus
  the ungated tools, the run's page reached through `contents` (the composer's one cast of a view's
  `webContents`). The agent thread store is the feature renderer's too (`game-agent-store.ts`). **What stays
  in the desktop:** the `map-mcp`, `terrain-mcp` and `sprite-mcp` tool files, Studio's consent gate over the
  global server (`mcp/game-tools.ts`), its iterate panel and Studio's Electron shells
  (`ipc/media-*-handlers.ts`, `games/game-electron.ts`).
  **Processes:** the map-capture and terrain-build workers are `utilityProcess`es forked lazily by the
  features' brokers and killed on cancel or quit (`dispose()`); the game runs as a sandboxed
  `WebContentsView` in its own partition, closed by `stopAll()` on quit. Each worker has its own small
  entry export (`./map-capture-worker`, `./terrain-worker`) so the worker bundle does not inline the
  feature's main half.

- **`packages/features/media-model`** (Gamer, Studio; Phase 113 Theme S slice 2) — the 3D editor tab: the
  library, the sculpt/paint/rig/SDF editors, SF3D import and the iterative harness's UI (renderer), and the
  model service, library, sculpt store, `model_*` tool factories, SF3D service/installer/broker and the LLM
  engines (main). `createModelRuntime(deps)` wires the services from injected pieces — the media store, the
  Trash, an `OllamaSeam`, and the optional `runAgent`, `iterative` and `sf3d` — so an app that has no agents
  (Gamer) leaves them out and an agent or SF3D request answers "not available". **Its host port**
  (`ModelHost`, every member optional): the prompt composer with its engine picker, mic and spoken outcome,
  the agent roster, the tree sections and their persisted collapse state, the licence modal, the editor's
  icon selects and the Monaco JSON view — each Studio's chrome (`compose/media-model-host.tsx`), each with a
  plain fallback. The kit gained `MediaPaneToggles`, and the frame chrome's menu entries gained submenus
  (`FrameSubmenuItem`) and a `disabledReason`; the frame's `createDialogs()` now draws a plain context menu
  (`openMenu`), so an extracted app's explorer has right-click. **Entries:** `./renderer` (the tab, the host
  port), `./events` (the `model_open` request store and the engine preference — what an app's eager root
  reads), `./kernel` (the pure geometry/rig/library helpers), `./render-job` (the three.js job behind
  "Render from 3D", loaded lazily), `./manifest` (pure data) and `./sf3d-worker`. **Processes:** SF3D's ONNX
  inference runs in `sf3d-worker`, a `utilityProcess` Studio forks lazily and kills on cancel (an ORT run
  cannot be interrupted) or quit (`disposeSf3d`); Gamer forks none. The iterative harness's *host* is the
  runtime's `IterativeHost` type (`runtime/src/agent-run/host.ts`, slice 3 — Games' agent loop drives runs
  through it too); Studio's implementation (`desktop/src/main/media/iterative-host.ts`: a private server via
  its MCP server, its stdio shim, its roster) stays in the desktop, and Gamer has its own for game runs
  (App 11). `McpToolError` moved to the runtime so the tool factories can throw it.
- **MCP tool ownership is declared by the feature manifests** (Theme S item 2): `model_*` (the design loop's
  and SF3D's), `game_*`, `terrain_*`, `sprite_*` with `tileset_generate`, `background_generate` and the
  sprite-kind `map_*`, and the Maps tab's own `map_*` are each listed in their feature manifest's
  `mcpTools`, owner `gamer`; the dead default rule in `shared/src/mcp-tool-owners.ts` is gone (only forge and
  workflow tools still resolve by table). Every consumer that lists tools passes the manifests: the server
  and the stdio shim (`desktop/src/main/mcp/tool-manifests.ts`), Studio's Settings ▸ MCP
  (`app/src/compose/mcp-tool-manifests.ts`) and Agents' Tools tab, which imports the five new manifests by
  their pure-data `./manifest` entry. Studio lists exactly `MCP_TOOL_IDS`; a Gamer-only install lists
  Gamer's tools; Creator-only lists none of them (`tool-manifests.test.ts` and each feature's manifest test).
  Studio's global MCP server answers every tool; Gamer runs no global server — only a private one per game
  agent run, answering that run's `game_*` tools (App 11). The socket transport both use is the runtime's
  `startMcpSocketServer` (`runtime/src/mcp/socket-server.ts`; Studio's `mcp/server.ts` wraps it with its
  default path, tool listing and audit ring).

- **`packages/features/media-library`** (Media, Studio; Phase 113 Theme R slice 1) — the Library tab
  (`mediaLibraryTab`, id `library`, appended last to `MEDIA_TABS` so no persisted tab id or strip position
  moves). Not repo-scoped: it reads only folders the user picked (a native picker in main — never a scan of
  `~`; `/`, the home directory itself, a duplicate and a nested folder are refused). **Main half**
  (`createLibraryService({ dataDir, pickDirectory, readKey?, online?, … })`, `mediaLibraryMain`): a walk
  that skips dot-entries, symlinks and NAS junk (`@eaDir`, `$RECYCLE.BIN`, …) and classifies films, shows
  (`S01E02`, `1x02`, `Season N/`), music and photos; local metadata first — `.nfo`, sidecar art
  (`poster.jpg`, `folder.jpg`, a show's own folder), ID3v2/FLAC tags and embedded covers through a small
  bounded reader in the feature (no tag dependency); an index (`library.json`) and art cache under the
  composer's data dir, never inside a root, with incremental rescan (size, mtime, `.nfo` mtime) and watch
  progress. **Bytes** reach the renderer as `mstudio-file://library/<rootId>/<path>` (`libraryFileUrl`), the
  existing scheme with a new host, so the CSP is unchanged; `resolveFile` answers only indexed items and their
  art, through the runtime's path jail. **Online metadata is off by default**: the TMDB provider
  (`createTmdbProvider(fetch)`, an injected fetch) runs only when the user switches it on *and* a key reads
  back — the key is not even read while it is off — fills only what local metadata left empty, at most 40
  lookups a scan and once per item. The key is `media.tmdbApiKey`, read in main from the vault; no channel
  returns it. **Renderer:** per-kind grids, a continue-watching row, show and album drill-downs and a detail
  pane whose player resumes from the saved position and saves progress (throttled, plus pause/end). The
  feature drives its own `<video>`/`<audio>` — Audio's player store is bound to media-store projects and
  cannot be imported by a sibling feature — and `LibraryHost` carries what differs per app: an optional
  `Player`, the key field (Studio's vault-backed `ApiKeyRow`) or a hint (Media's). **Slice 2 (R2) fills the
  `NO_LAN_STREAMING` seam.** *Playlists* (create, rename, reorder, delete) live in the same index (`playlists`
  and a per-item `probes` cache, both zod-defaulted so a slice-1 index still parses) and play in sequence in the
  Library's player. *Share on your network* is `createLanStreamServer` (`main/lan-server.ts`): plain `node:http`
  behind an injected `listen`, **off by default** and started at launch only when the user left it on *and*
  chose "start with the app". It binds the one private IPv4 address the user picks (`lan-addresses.ts`:
  RFC 1918 or link-local, and one of this machine's interfaces — never `0.0.0.0`, never public). Every request
  carries a 256-bit sharing token in `?k=` (`lan-store.ts`, `<dataDir>/lan-token`, 0600, never logged, never
  in the vault), compared as sha256 digests in constant time before any routing; without it the answer is a
  bare 401. Routes take ids only (index, item page, playlist page, `/media/<id>` with Range, `/art/<id>`,
  `/transcode/<id>`), every byte comes through `resolveFile`, GET/HEAD only, and the pages carry a hash-pinned
  CSP (`lan-pages.ts`, `default-src 'none'`). *Transcoding* uses a **system ffmpeg only** — a path the user picks
  in main's own file dialog ("Choose ffmpeg…"; the renderer cannot name a binary), then Homebrew, MacPorts, `PATH` (`ffmpeg.ts`) — spawned with an argument array and no shell and with
  `-protocol_whitelist file` + a real-container `-format_whitelist` before `-i` (`FFMPEG_INPUT_GUARD`),
  two at a time, as fragmented MP4 (H.264 + AAC, copied when already so), killed when the client goes or the
  server stops; without it the rest is listed as not playable. The renderer's Share panel (start/stop,
  interface picker, link with token, new link behind a confirm, connected devices, ffmpeg status) is in both
  Studio's Media ▸ Library and Midnite Media; the server is disposed on quit in both.

**The registry contract lives in the frame** (`packages/frame/src/media/`): the descriptor type, and
the **media kit port** — the shell's plumbing a tab composes (`MediaLayout`, the explorer, the export
toolbar, the data hooks) as types plus `MediaKitProvider`/`useMediaKit()`. A tab feature imports only
that; `MediaShell` installs media-core's implementation (`mediaKit`) around the tabs it renders; the
app lists the descriptors in strip order. Shared cannot hold it (a descriptor carries a React
component), and the frame implements none of it. `scripts/layer-boundaries.test.mjs` proves a tab
cannot reach the shell or a sibling tab, by name or by relative path. Theme R and S tabs follow the
same shape.

### App 12: Media (`apps/media`) — Phase 113 Theme R slices 1–2

Media composes media-core's shell with the Library tab alone (`MEDIA_TABS = [mediaLibraryTab]`), over the
frame, with `createStandaloneMediaHost({ repoId: null, key: 'midnite-media.ui', initialTab: 'library' })` —
no repository at all. Its main (`apps/media/main/`) builds the library service with its own data dir
(`<userData>/media-library`, userData under `Midnite Runtime/apps/media`) and the native folder picker, and
registers `mediaLibraryMain` through `createIpcContext`. It serves `mstudio-file://library/…` and no other host
(`file-protocol.ts`), through the library's own resolver, forwarding the request's headers so a player's
Range requests seek. **The preload exposes `media.library` and the shell's `media.onChanged` only** — no
`secrets`, no media store, git, pty or browser (`bridge.test.ts`). The window is sandboxed and guarded
(`guardAppWindow`). **Media composes no vault; its one key comes from the runtime host's:** `main/pairing.ts`
holds `safeStorage` for its pairing seed only, `main/keys.ts` is the allow-list of the one name it ever asks
for (`media.tmdbApiKey`), and `connectRuntimeVault({ appId: 'media', identity })` reads it, paired and only
as far as the user's grants in Vault allow; a smoke run reaches no host. The renderer has no key field — the
Metadata section says to add the key in Vault and grant it to Media. **No network** until the user switches
online metadata on and the key is granted; **no listening socket** until the user starts Share on your
network (slice 2) — then one, on the private address they picked, behind the sharing token, and closed on
`will-quit`. Its main passes `os.networkInterfaces` and `PATH` to `createLanStreamServer`; a smoke run never
calls `startAtLaunch`.
`scripts/app-vault-grants.test.mjs` names Media among the guests and `scripts/release-bundles.test.mjs` holds
it in the `--all` matrix with its icon (the launcher's Media tile logo, written by `moon run launcher:icons`).
The launcher's Media tile and its three leaves land on Studio's Media ▸ Library while
`runsIn` is still `studio`. `MIDNITE_MEDIA_SMOKE=1` with `MIDNITE_MEDIA_USER_DATA=<tmp>` prints
`midnite-media:ready` and quits.

### App 13: Capture (`apps/capture`) — Phase 113 Theme K slices 1–2

**`packages/features/capture`** (Capture, Studio) is the whole of it: the Capture view (renderer) and its main
half, over one structural port (`main/port.ts`, `CaptureElectron`) that a composer builds from Electron's own
modules with `electronCapturePort` — so the feature imports no `electron`, and no test in it captures a real
screen, asks for the real Screen Recording permission, takes a real chord or reads the real clipboard
(`main/test-fixtures.ts`). What it holds to:

- **No capture without a user action.** Every grab, region and recording starts from a click, or from the
  user's own chord. The Screen Recording permission is *read* first (`main/permission.ts`); macOS's prompt is
  asked for only from the permission panel's "Ask macOS", once, while it is undetermined — a denied or
  restricted answer offers "Open System Settings" instead, so there is no prompt loop.
- **Names are main's.** `cap-<yyyymmdd>-<hhmmss>-<hex>.png|webm` and `clip-<hex>.png`, under the composer's
  data dir (`<userData>/capture/captures`, `…/clipboard`). Files reach the renderer over the existing
  `mstudio-file:` scheme's `capture` host, and `captureFileResolver` answers only a name of that shape inside
  that directory — the CSP is unchanged.
- **Recording is a one-shot gate** (`main/display-media.ts`): the renderer arms the source the user picked,
  then calls `getDisplayMedia`; the composer's display-media handler hands out that source once, video only,
  to its own origin's main frame, and an arm expires after ten seconds. Slices are `MediaRecorder` WebM, sent
  in order; main checks the type and caps the size, and a refused slice aborts the whole recording.
- **The global chord** is one accelerator, registered only while the app runs, re-registered when changed,
  released on quit; a chord another app holds is reported as `conflict`, never retried. Studio ships none;
  Midnite Capture ships `CommandOrControl+Shift+2`.
- **Clipboard history is off by default**, text and images only, capped by count and bytes, kept under the
  data dir and cleared behind a confirm. It skips any entry marked `org.nspasteboard.ConcealedType`,
  `TransientType` or `AutoGeneratedType` (password managers set these), records nothing already on the
  clipboard when it is switched on, and polls only while it is on.
- **Send to… prepares, never posts.** `CaptureHost` (renderer) is the composer's: Studio's `sendToChat`
  drops a text attachment naming the capture's path into a *new* chat's draft (chats' `offerAttachment`
  slot) and hands off to Agents ▸ Chats; its `creator` writes a screenshot into the selected repository's
  Creator ▸ Images ▸ `Captures` through the media store and reveals it there. The user presses send, or
  keeps the image. Its `prComment` lists the selected repository's open pull requests (the forge's own
  `useForgePulls` cache, via `fetchQuery`); picking one puts the screenshot on the clipboard through main's
  clipboard port *first*, then opens the PR in the embedded browser at its comment box
  (`capturePrCommentUrl`, GitHub's `#new_comment_field`) with "The capture is on your clipboard — paste it
  into the comment." Nothing is uploaded or posted by Capture: the forge's composer takes text only, so the
  user pastes and submits.
- **The region overlay** (slice 2): `captureRegionStart` freezes the display under the pointer once and
  opens one frameless, transparent, always-on-top window over it (`main/overlay.ts`), from the Region button
  or the user's chord only. The window is the composer's — sandboxed, `guardAppWindow`ed, loading only the
  app's own `capture-overlay.html` (a plain-DOM page with its own strict CSP meta, built from
  `renderer/overlay/`) — and its preload exposes `window.midniteCaptureOverlay` with three calls
  (`captureOverlayFrame`/`Confirm`/`Cancel`) and nothing else. Each overlay gets a fresh token in
  `additionalArguments` (`CAPTURE_OVERLAY_ARG`), and main answers those channels only for the live token.
  Drag then mouse-up or Enter confirms; Escape, right-click or blur cancels; it closes either way. The
  region is cropped in main from the frozen grab — no second capture. Where no overlay can open, the
  in-view picker over the same frame stays as the fallback.

Studio composes it through the view and rail registry (`capture` after `vault`, global), the capture host in
`compose/capture-host.tsx`, `useCaptureShortcutLanding` at the app root, and in main
`ipc/capture-handlers.ts` — the gate ORed into the app session's permission rule as `allowAppAudioOnly`'s
`also` hole, the `capture` host on `mstudio-file`, disposal in `before-quit`.

Midnite Capture (`apps/capture/`) composes the feature alone over the frame, with `STANDALONE_CAPTURE_HOST`
(no Studio destination; chat, PR comment and Creator are listed disabled with where they live). Its own
Send to is **Copy to clipboard**, **Show in Finder** and **Open in Midnite Studio** — the last opens
`midnite-studio://capture?id=<CaptureId>` (`studioCaptureLink`; an id only, never a path). Studio's deep-link
handler asks first ("Import this capture from Midnite Capture?") because a link is remote-triggerable, then
`captureImport` copies that one capture read-only out of Midnite Capture's data dir — refusing an index
entry whose file name is not the one its id and type imply — and selects it in the Capture view. Its main gives it its own data dir (userData under `Midnite Runtime/apps/capture`), a
sandboxed, guarded window, and a session that **denies every permission** but the armed gate's
(`main/permissions.ts`). **The preload exposes `capture` only** — no `secrets`, fs, git, pty, browser or
media store (`bridge.test.ts`); the overlay window's own preload (`main/overlay-preload.ts`) exposes the
three overlay calls only, and `scripts/app-window-guard.test.mjs` holds both windows to `guardAppWindow`.
**Capture composes no vault, opens no listening socket and makes no network
call.** `scripts/release-bundles.test.mjs` holds it in the `--all` matrix with its icon
(the launcher's Capture tile logo, written by `moon run launcher:icons`); the launcher's Capture tile
and its three leaves land on Studio's Capture view while `runsIn` is still `studio`.
`MIDNITE_CAPTURE_SMOKE=1` with `MIDNITE_CAPTURE_USER_DATA=<tmp>` takes no chord, never reads the clipboard,
prints `midnite-capture:ready` and quits.

### App 14: Vanguard (`apps/vanguard`) — Phase 120 Theme B

Vanguard composes `packages/features/vanguard` (the view, Settings ▸ Vanguard, the findings handlers and the
sensor host), `report` and the `sessions` guest main, copied from Monitor's template. Its sensors are the
always-on half of the suite's security story; they write into the runtime's findings ledger
(`<userData>/security/`), which the Guard loop (Phase 122) and the agent policy layer (Phase 121) write into too.
The sensor host (`main/sensor-host.ts`) imports no `electron`: the composer injects `userData`, a `runProcess`
(the runtime's no-shell runner) and the ledger's writer. **Policy differs by composer:** Vanguard's own app
starts every enabled sensor at launch; Studio starts none until the Vanguard view has been opened once
(persisted in `vanguard.json`, main-side like `mcp.json`), so a user who never looked at it never has `lsof` polled.
The app **composes no vault** (`scripts/app-vault-grants.test.mjs`) and its preload exposes the `vanguard` and
`report` namespaces plus read-only `terminal.list` and an attach-only `pty` — it can write a keystroke into a
session it did not start (Theme H's pause), never create or kill one. The launcher's Vanguard tile lands on
`midnite-studio://view?id=vanguard&tab=findings|sensors|network` while `runsIn` is still `studio` and `comingSoon` is true.

### App 11: Gamer (`apps/gamer`) — Phase 113 Theme S slices 1–3

Gamer composes media-core with Games (home), Maps, Terrain, Models and Sprites. Its main (`apps/gamer/main/`)
scopes media to one repository id, `gamer`, resolved to `<userData>/media` (userData under
`Midnite Runtime/apps/gamer`), serves `mstudio-file://repo/gamer/…` from that root through the runtime's
path jail, registers `mstudio-file`, `mstudio-game` and `mstudio-tile` in **one**
`registerSchemesAsPrivileged` call (Electron keeps only the last list), and answers `mstudio-tile:` through
the Maps runtime's one fetcher. Games live under `~/Midnite Games` (the feature's default; there is no repo
list, so a game is found by scanning the root). The preload exposes `media` and `games` only. **Gamer
composes no vault; its keys come from the runtime host's** (slice 2): `main/pairing.ts` is the one module
that holds `safeStorage` (its own pairing seed, under its own keychain item — a smoke run reaches neither the
keychain nor a pairing file), `main/keys.ts` is the allow-list of the three names it ever asks for
(`media.mapTilerApiKey`, `media.geminiApiKey`, `media.openaiApiKey`), and `connectRuntimeVault({ appId:
'gamer', identity })` reads them — paired, then only as far as the user's grants in Vault allow. A denied,
unpaired or absent key reads as unset: Maps offers only the keyless tile sources, and Sprites' generating
methods and Terrain's prompted heightmap say "not available" until Gemini or OpenAI is granted. No value
reaches the renderer (the preload has no `secrets` namespace; no channel returns one).
`scripts/app-vault-grants.test.mjs` now names Gamer among the guests. Image generation reuses the Images
feature's `createImageService` as a library (its providers; Antigravity is off — Gamer runs no agent outside a game run) and the
Model engines reuse the Models feature's Ollama client, so Gamer's main depends on those two features'
*main halves* (an app composing a feature it does not own, as Agents does with the Gamer manifests).
**Models in Gamer:** Ollama is the only engine (the Model tab's iterative runs are not offered — Gamer's agent
host serves game runs only); SF3D reports "unavailable"
(an ONNX worker and a ~1 GB model are not in Gamer's bundle); the explorer, editor, sculpt/paint/rig, export
and the library work. "Render from 3D" works: Gamer mounts `SpriteRenderHost` at its root, main sends the
render request to its window, and the three.js job loads from the Model feature on first use.

**The play-test loop in Gamer** (slice 3, Phase 107's loop finished inside Gamer). *Play-tests* run exactly as
in Studio — `createGameLoop` over Gamer's games runtime, the page reached through `game-electron.ts`'s
`gamePageContents`: `playtests/*.json` replayed deterministically through the kit hook, frame asserts, a
screenshot per failure in `playtests/results/`, the toolbar's Playtests menu unchanged. *Create and iterate*
needs what Studio's iterative host gives it, so Gamer composes its own (`main/agent-host.ts`, an
`IterativeHost`):
- **A private MCP server per run** (`createRunServers`, runtime): a fresh `0o700` directory under
  `<userData>/mcp-runs/` (the OS temp dir when that path is too long for a Unix socket) holding one `0o600`
  socket whose only dispatcher is `createGameAgentDispatch` — this game's `GAME_AGENT_TOOL_IDS`, fixed to its
  id or path, under the call ceiling. The run's `finally` closes it and removes the directory; nothing listens
  before a run or after it. Gamer runs no other MCP server.
- **Its own shim**, `dist/game-mcp-shim.cjs` (`main/workers/game-mcp-shim.ts` over the runtime's
  `createRunShim`), run by Gamer's own binary with `ELECTRON_RUN_AS_NODE=1`: `tools/list` names only the game
  agent's tools, any other id is refused before the socket, and `--socket` is required — there is no
  global-socket discovery, so it needs no Studio installed and cannot reach Studio's `midnite` server.
- **The same confinement, from the same code**: `runGameAgent`/`buildGameCliArgs` (the feature's) — Claude
  Code with `--strict-mcp-config`, `--tools Read,Edit,Write,Glob,Grep`, `--permission-mode dontAsk` and an
  allow-list of those plus the run's `mcp__midnite__game_*` tools; Codex with `--sandbox workspace-write` and
  network off; any other CLI refused before anything is spawned or served. Never a shell tool.
- **The roster** is the built-in entries by id (no `agents.json` overrides); the CLI gets the login shell's
  PATH (`runtime/src/shell-path.ts`, moved from the desktop) in its own environment only. No API key is
  injected — Claude Code and Codex use their own sign-in, as in Studio — so `keys.ts`'s allow-list is
  unchanged.
- **Kill**: the CLI runs in its own process group (the runtime's `runProcess`), killed whole on cancel; on
  quit `gameAgents.cancelAll()` and `agentHost.dispose()` kill every live group and close every run's server
  synchronously. The renderer side is `src/compose/gamer-game-agent.tsx` (Claude Code or Codex, passes,
  Run/Cancel, the thread and Undo turn) over the feature's thread store. `main/agent-loop.test.ts` drives it
  end to end with a fake CLI over the built shim.

The bundle carries `templates/media-game`, the vendored `game-engines` (copied when
`packages/desktop/resources/game-engines` exists — `scripts/vendor-game-engines.mjs` produces it, a copy from
node_modules with no download) and `terrain-materials`, plus the two worker scripts and the game agent shim
beside `main.cjs`. `MIDNITE_GAMER_SMOKE=1` with `MIDNITE_GAMER_USER_DATA=<tmp>` prints `midnite-gamer:ready`
and quits; a smoke run composes no agent host, so it starts no server and no agent.

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
and Tests as tabs beside it, and a small repository list on the left. The git graph is slice 2, the API client
and the database slice 3, Sessions slice 4 and Tasks slice 5 (below).

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
was bundled for its pure parsers only (diff parsing, test discovery over the filesystem), with `dugite` stubbed
as Agents does — until slice 2 gave Coder a graph and, with it, a git (Decision 3 below).

**Coder's repositories.** No Studio repo registry: `main/repos.ts` keeps `{ id, path }` rows in Coder's userData.
A folder joins only through main's native dialog — `repos.pickDirectory` offers the chosen path once, and
`repos.open` admits only a path that was offered, resolves it to its real path and requires a `.git`. After that
every channel takes a `repoId`. The renderer's bridge is `forge`, `forgeProject`, `forgeAccounts`, `tests`,
`remotes.list`, five `repos` members (`refs` since slice 2), the `log` stream and four read-only `status` reads
(`main/bridge.ts`); there is no `secrets`, `fs`, `pty` or `ops` namespace.

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

### Coder slice 2: the git graph and diff in the frame (Phase 113 Theme O)

The commit graph and the diff view are frame-owned now: `packages/app/src/features/graph` and `features/diff`
moved (`git mv`) to `packages/frame/src/graph/` and `src/diff/`, each with its own entry —
`@midnite/studio-frame/graph` and `@midnite/studio-frame/diff` — so an app that never shows them carries none of
it. Studio opens on the graph, so it still imports the view statically (the same chunking as before); Coder
loads it with `React.lazy`. The light half — the port, the persisted state shapes and defaults, and
`useGraphStore`, which the status bar, sessions and the watcher read — is on the barrel.

**One port, `GitHost`** (`frame/src/graph/git-host.tsx`), serves both views, installed at an app's root with
`<GitHostProvider host={...}>`; `useGitHost()` throws without it. Its members, by group:

| Group | Members | Studio (`compose/git-host.tsx`) | Coder (`compose/git-host.tsx`) |
|---|---|---|---|
| state | `useUi(selector)` / `getUi()` over `GitUiState`, `useGraphVisible()`, `panelBounds` | `useUiStore` itself (its `UiState` is a structural superset, so tsc holds them together); `activeView === 'graph'` | a persisted store under `midnite-coder.git`; the Graph tab |
| data | `queryKeys`, `useActiveWorktree`, `useStatus`, `useRefs`, `useStashes?`, `revealStashes?` | its own query hooks and `keys`, so the watcher's invalidation still reaches every graph/diff query | react-query over its read-only bridge; no stashes |
| chrome | `Tooltip`, `MultiSelectMenu`, `UserAvatar`, `useDismiss`, `useOccluder?`, `useCascadeReveal`, `useRevealCount`, `resolveAgentIcon`, `useLineHighlight?`, `ci?` | the components the views imported before the move; shiki line highlighting; the forge's `StatusGlyph` | small kit versions; plain-text diffs; the forge's glyph |
| panels | `CommitPanel`, `WorkingTreePanel?`, `ConflictBanner?`, `StashInspector?`, `ConflictStudio?`, `CiRunModal?`, `RefAgentAvatar?` | `CommitInlinePanel`, `WorkingTreeInlinePanel`, the conflict banner and studio, the stash inspector, the CI run modal, the agent avatar | a commit's file list beside the frame's `DiffView` |
| Studio-only | `useActions?`, `useAgents?`, `useSessionHistory?`, `useAgentWorktreeSessions?`, `onHiddenRowCount?` | `use-graph-actions.ts` (menus, drag-to-merge, checkout, sync), the agent roster and sessions, keep-alive eviction | — |

`GitUiState`'s shapes (`GraphSelection`, `GraphColumns`, `DiffLayout`, the column bounds and defaults) moved to
`frame/src/graph/graph-ui-state.ts`; `ui-store` imports and re-exports them, so no stored key or value changed.
`IconButton` and the page-detach mark come from the frame's chrome port. Pure helpers the views used moved with
one-line re-exports left at their old app paths: `services/avatars`, `lib/perf`, `lib/languages`,
`lib/reduced-motion`, `lib/use-window-focus`, `lib/use-page-visible`, `components/stat-pill`.

**What stayed in Studio, and why.** Everything that writes or that only Studio has: `features/graph/use-graph-actions.ts`
(every write op, the write queue, the blast-radius confirm and the force-push gate stay exactly where they were —
the port only hands the graph `openCommitMenu`/`openRefMenu`/`openDropMenu`/`checkout`/`runSync`),
`graph-inline-panels.tsx` (it composes Studio's commit inspector and the working copy's commit box),
`ci-run-modal.tsx` (forge run detail), `ref-agent-avatar.tsx` and `use-agent-worktrees.ts` (terminals and chats),
`reveal-commit.ts` (the companion's and MCP's "show me this commit"), and `features/diff/line-highlight.ts` (shiki).
Commit, status, changes, history, stash, conflicts and repos did not move: the graph reaches them only through
the panel members. Without `useActions` the graph is read-only by construction — no context menu, no drag (the
drag sensors are disabled), no double-click checkout, no sync buttons on a badge. Studio's component tests for
the graph stay in `packages/app/src/features/graph/` and render inside `StudioProviders`
(`test-support/studio-render.tsx`), so they still assert Studio's real tooltip, store and icons; the frame tests
the view under a read-only host of its own (`graph/test-host.tsx`, `graph-view.read-only.test.tsx`). Nothing that
renders graph or diff UI is mounted outside `StudioProviders` in `app.tsx`.

**Decision 3 — Coder's git binary: the system git, behind dugite's API, never bundled.** git-engine shells out
through one seam (`exec/git-exec.ts`, dugite's `GitProcess.exec`/`spawn`). Coder's `scripts/bundle-main.mjs`
aliases `dugite` to `apps/coder/main/system-git.ts`, which implements those two calls over `child_process` and
the machine's own git. Why not dugite's bundled git: it is 42 MB (`dugite/git`, darwin-arm64) against a Coder
bundle of a few MB, `scripts/pack-bundle.mjs` packs only `dist/` with everything inlined, and dugite finds its
binary from its own package directory at run time — so carrying it means a second directory beside the bundle
and pointing dugite at it, for an app that only reads. Coder's channels are read-only (`log`, refs, `status`,
`show`, `diff`, numstat — all under git-engine's `GIT_OPTIONAL_LOCKS=0`), and those behave the same on every
git Apple has shipped in years (this machine's Command Line Tools: 2.50.1); dugite's version pinning matters for
the writes and porcelain-drift Studio does, not for these. Resolution order: `MIDNITE_GIT`, Homebrew
(`/opt/homebrew/bin/git`, `/usr/local/bin/git`), then the active developer directory's own git
(`xcode-select -p` + `/usr/bin/git`). It never runs `/usr/bin/git` itself — on a Mac without the tools that is an
`xcrun` shim that pops Apple's install dialog. With no git at all every call answers one sentence — install the
Command Line Tools with `xcode-select --install`, then reopen the repository — which the log stream carries to
the graph's "Could not read the history" state. Studio is unchanged: it still bundles dugite.

**Coder's git main is read-only, and registers through the runtime seam.** `apps/coder/main/git.ts`
(`registerCoderGit(ctx, { pathOf })`, over the runtime's `FeatureMainContext`) answers exactly
`repo:refs`, `log:start`/`log:cancel` (rows laid out in main by `LaneLayoutSession`, streamed as `log:batch`/`log:done`),
`status:get`, `commit:detail`, `commit:file-diff` and `commit:stats`. Every path comes from Coder's own repository
list; a request's `worktreePath` is ignored. **No write op is exposed** — no checkout, commit, push, reset, stash
or branch — so nothing needs the write queue; a write in Coder would mean bringing `use-graph-actions.ts`' gates
with it, which is later work. It lives in the app rather than a feature package because only Coder needs it
today: Studio's `desktop` keeps its richer handlers (worktrees, per-window streams, the watcher). When a second
app wants the graph, it becomes a shared main half.

**Coder's Graph tab** (`apps/coder/src/views/coder-home.tsx`) loads `GraphView` lazily over `CODER_GIT_HOST`
(`src/compose/git-host.tsx`); the graph's preferences persist under `midnite-coder.git` (`git-store.ts`), and the
selected repository is Coder's own, mirrored in so a switch closes the open commit. Opening a commit shows
`CoderCommitPanel` — its message, its files and the frame's `DiffView`/`DiffToolbar` (split layout and context
expansion included), in its own lazy chunk. The graph code is a 122 KB chunk of its own; Coder's `dist/` is 2.7 MB.
**Left out in this slice:** the working-copy row shows but does not open (no commit box), no stash rows, no
syntax colour or image diffs in a commit's diff (shiki and Studio's file protocol stay in Studio), no agent
provenance marks (no roster), no live refresh (no watcher: a switch of tab or repository restreams), and Reviews
still wears the forge's plain diff — swapping in the frame's `DiffView` is a forge-host change for a later slice.

### Coder slice 3: the API client and the Database tool (Phase 113 Theme O)

Two more features, each a package of its own, composed by Studio exactly as before and by Coder as two new tabs
(**API** and **Database**): **`packages/features/api-client`** and **`packages/features/database`**. Each follows
the forge's shape — `manifest.ts`, a `main/` half registered against the runtime's `FeatureMainContext`, a
`renderer/` half behind a host port, a moon project (listed in `composition.ts`, `NODE_PROJECTS`, `ci.yml`'s
gate-node line, `tsconfig.base.json` and the desktop's moon/tsconfig/package lists).

**What moved where.**

| From | To |
|---|---|
| `desktop/src/main/api-client/*`, `ipc/api-client-handlers.ts`, `script-runner-worker/` | `features/api-client/main/` (collections, environments, history, send, runner, the sandbox, the broker) |
| `app/src/features/api-client/*`, `store/api-client-store.ts` | `features/api-client/renderer/` (the monaco field stays in the app, below) |
| `desktop/src/main/db/*`, `ipc/database.ts` | `features/database/main/` (connections store, credential binding, query service, handlers) |
| `app/src/features/database/*`, the workbench / connections / query-results stores | `features/database/renderer/` (the Monaco query editor stays in the app) |
| `desktop/src/main/fs-scope-write.ts` | `runtime/src/fs-jail-write.ts` (the confining jail, a re-export shim left behind) |
| `readCapped`, `HTTP_RESPONSE_CAP_BYTES` out of the workflows feature's `http` executor | `runtime/src/read-capped.ts` (the workflows executor re-exports them) |
| `TREE_INDENT` | the frame; the frame's kit gained `KitPopover`, `KitTreeSection`, `useEscapeDismiss` |

**The API client's script runner executes user code, and it moved without gaining a privilege.** The `vm`
sandbox — the allow-list, the context flags, `pm.expect` — is still `script-runner.ts`, byte for byte; it runs
only in a worker, never in main. The feature's main never imports `electron`, so it cannot fork anything itself:
`createScriptRunnerBroker({ spawn })` takes the fork from its composer (Studio: `utilityProcess.fork` of
`script-runner-worker.js` from `desktop/src/script-runner-worker`; Coder: of `script-runner-worker.cjs`, a third
esbuild entry beside `main.cjs`). The worker's own entry, `startScriptRunnerWorker(process.parentPort)`, is the
feature's `./script-runner-worker` export — deliberately **not** on its `./main` export, so the sandbox is not in
any main bundle. **The child is killed** on a timeout (parent side, past `vm`'s own), on a cancelled run (the run's
`AbortSignal` reaches the broker, which kills the process and answers "Script cancelled."; the next run forks a
fresh one) and on quit (`shutdownApiClient()`, called from each app's quit hook). A collection's scripts still run
only once the user has trusted it on this machine (`collection-trust.ts`; `needs-consent` forks nothing —
`apps/coder/main/context.test.ts` holds both). HTTP goes through `configureApiClient({ fetch })`, defaulting to the
global `fetch`, so tests hold the transport.

**Database passwords are credentials, and the renderer never receives one.** The wire carries a password once, on
`dbSaveConnection` (renderer to main, write-only); `ConnectionConfig` has no password field, the list is plain
metadata, and a connect reads the password from the vault in main. In Studio the vault is its own
(`createCredentialVault(studioVault)`, the same `db-credentials` namespace file as before). **In Coder it is the
runtime host's**, over `connectRuntimeVault` — the same paired, granted client that serves the forge accounts: without
a grant to `db-credentials`, a connection opens with no password and saving one answers a sentence (the connection
itself is saved), and nothing in any answer carries the value (`apps/coder/main/context.test.ts` walks denied and
granted for both directions, with the engine faked: no database server or container starts anywhere). Coder's
connection list lives in its own userData (`db-connections.json`), so connections added in Studio show in Coder only
once added there too; the password is shared through the vault, as the forge token is. In-flight query streams are
tracked through a `QueryStreams` port: Studio backs it with its per-window stream registry (shared with the commit
log and the search), Coder with a plain in-memory one.

**The host ports.** Each renderer takes a host (`ApiClientHost`, `DatabaseHost`) for what only the app knows — the
selected repository, persisted pane sizes (Studio: `ui-store`'s `layout`, so no stored key moved) and the active
environment of each repository (`activeEnvironmentByRepo`) — and for chrome over app state (tooltips, tree sections,
popovers, dismissal). The code editors are host members too: **Studio's are Monaco** (`compose/api-client/api-client-code-field.tsx`,
`compose/database/database-query-editor.tsx`, each loaded lazily by the Studio host so Monaco stays out of the entry
chunk exactly as before), and the feature's standalone host — what Coder uses — **draws a textarea**. Each feature
ships `createStandalone…Host`, so Coder composes a tab with one line over the frame kit. Studio's composition tests
(the four API Client and three Database `.bridge.test.tsx`) moved to `packages/app/src/compose/` and mount the real
features through `StudioProviders`; the features' own tests use a test host (`renderer/test-host.tsx`).

**Coder's bridge** gains exactly `apiClient.*` and `db.*` (`main/bridge.ts`); there is still no `secrets`, `fs`,
`pty` or `ops` namespace. The Database tab is global, as in Studio — it shows with no repository selected. The
API tab's collections live under `.midnite/api/` in a checkout Coder's own list holds, confined by the runtime's
jail; its file pickers (import, export, a body file) open in main.

**Left out in this slice:** no Monaco in Coder (so no `pm.*` autocomplete, no Beautify, no SQL highlighting — each
editor is a textarea until a shared editor lives in the frame); **no SQLite in Coder** (`better-sqlite3` is a native
module the bundle format cannot carry, so its connections answer the driver's own "Failed to load better-sqlite3"
while Postgres, MySQL, MariaDB and MSSQL, which are pure JS, work); no detach-to-window mark. Sessions is slice 4;
Tasks is slice 5 (below). `MIDNITE_CODER_SMOKE=1` still prints `midnite-coder:ready`.

### Coder slice 4: Sessions, and Agents' sessions on the shared broker (Phase 113 Theme O)

**`packages/features/sessions`** — the Sessions view (renderer) and, for an app with no pty server, its
**broker-guest channels** (main). The view is the list, its filters and the routing of a selection; what a
session *is* comes through `SessionsHost` (`renderer/host.tsx`): required members every app answers (live
sessions and their status, the roster, the selection, the list width, the live pane, small chrome) and optional
capability groups an app either has or leaves out — `history` (closed rows, transcripts, purge), `graph` (commit
counts), `workflows` (run groups' reveal and kill switch), `loops`, `useKill`, `resume`. A group left out is a
control the view does not draw.

- **Studio** (`packages/app/src/compose/sessions-host.tsx`) fills every member with exactly what the view imported
  before, so the view, its test ids and its stored keys (`layout.sessionsListWidth`, `sessions-store`) are
  unchanged. Its **live pane and transcript stay in Studio** (`features/sessions/live-session-pane.tsx`,
  `transcript-view.tsx`, `live-session-terminal.tsx`): they are the terminal's — which panel already shows a
  session, the claim that keeps two xterms off one pty, the palette and replay gate. **The session archive stays in
  desktop** too: Studio's terminal service writes it when a session closes; Coder shows live sessions only.
- **Coder** composes `createGuestSessionsHost` (`renderer/guest-host.tsx`): it polls `terminal.list` (the
  feature's main half, `main/guest-sessions.ts`, over `createSharedBroker` as `coder`), titles a session from the
  host's `terminals.json` (`readHostSessions`, via the host record's `sessionsFile`) or, for another app's, by
  folder and "Started by Midnite Agents", and attaches a `GuestTerminal` (xterm, its own chunk) — subscribe,
  snapshot, stream, type, resize. No resume, no kill, no purge: Coder starts nothing, so it ends nothing (and the
  broker refuses a guest's kill of another's session anyway). Output reaches Coder's window only for a pty it has
  subscribed to; input goes only to a pty the last listing named.
- **Agents** (`apps/agents/main/broker-sessions.ts`) creates a workflow **agent node's** session on the host's
  broker as `agents` — so it appears in Coder's Sessions — and reads its activity with Studio's detector (moved to
  `runtime/src/broker/activity-detect.ts`; desktop re-exports it). It kills only its own: a cancelled node's pty,
  and on quit every one still running. With no host broker the node fails with a plain sentence, never hangs.
  Script nodes and council members stay piped login shells: one-shot, headless, and better kept out of every
  app's Sessions list.

Proven by `packages/features/sessions/main/guest-sessions.test.ts`, `renderer/guest-sessions-view.test.tsx`,
`apps/agents/main/broker-sessions.test.ts`, `apps/coder/src/coder-app.test.tsx`, and end to end on Studio's real
broker server by `packages/desktop/src/main/broker-sessions-guest.test.ts`.

### Coder slice 5: Tasks (Phase 113 Theme O)

**`packages/features/tasks`** — the Tasks view (the repository's issues and its forge boards: table, board and
dependency graph; filters, grouping, the field editors, the issue drawer and its dialogs) as a renderer-only
feature. Everything it reads that it does not own comes through **`TasksHost`** (`renderer/host.tsx`):

- `useUi`/`getUi` over a `TasksUiState` slice — the board per repository, the view mode, each board's filter,
  grouping, sort and collapsed columns, the dependency field's name, each card's skill, the forge-writes switch
  and the agent skills. Studio passes `useUiStore`, so no persisted key moved; the LRU helpers and defaults moved
  with the feature (`renderer/state.ts`) and `ui-store` re-exports them.
- `data` — the forge hooks (issues, boards, fields, items and their writes). The feature imports no forge code:
  Studio passes `app/src/services/queries`, Coder the forge feature's renderer hooks.
- Chrome: avatars, links, the multi-select menu, a modal, dismiss, cascade reveal, toasts, `copyText`.
- **Optional** members, each a control the view drops when absent: `terminal` (a card's live session and badge,
  Play/Stop, the inline composer, Auto-mate, and the skill-mapped column drop that starts an agent), `openIssue`
  (the app-wide issue modal), `runCommand` (run `gh auth refresh` in a terminal), `usePlanBlueprint`/`WandField`
  (Plan with AI), `useRepoSkills`, `PresentButton`/`setActiveMarkdown` (slides).

**Studio** (`app/src/compose/tasks-host.tsx`, `STUDIO_TASKS_HOST`) fills every member with exactly what the view
imported before. Phase 92's card agent start is unchanged: `terminal.startCardAgent` is `startAgent` with
`surface: 'kanban'`, the card's `taskRef` and the session attribution, so cards, sessions and their test ids
behave as they did. The terminal-backed pieces stay in Studio (`features/tasks/`: `card-terminal`, `card-composer`,
`use-card-play`, `use-automate`, the issue modal), the same split Sessions made for its live pane.

**Coder** (`apps/coder/src/compose/tasks-host.tsx`, `CODER_TASKS_HOST`) reads its own repository list and forge
channels — answered by the forge feature's main half in Coder's main, which reaches a stored forge token only
through the paired, granted runtime vault (`connectRuntimeVault`). No new channel or secret path: the renderer
sees boards and issues, never a stored value. Its `TasksUiState` is `compose/tasks-store.ts` (`midnite-coder.tasks`
in its own localStorage), with two values read from where Coder already keeps them: the forge-writes switch is the
header's **Review actions** box (off by default; every board and issue write obeys it, as Reviews' do), and the board
per repository is the one Reviews' "Add to project" writes (`midnite-coder.forge.projectBoardByRepo`). The card
skill list is the built-in `DEFAULT_AGENT_SKILLS` (moved to the frame so both composers seed from one list).

**Left out in Coder:** `terminal` (no Stop, live session or composer on a card; a drop into a skill-mapped column
only moves the card), `openIssue` (an issue keeps its plain link), `runCommand` (Reload only refetches; the copy
button beside `gh auth refresh -s project` stays), Plan with AI, repo skills and slides. A card's Play is the
agent-run hand-off instead (below).

#### The agent-run hand-off: a Coder card's run, started in Studio

Coder starts no terminal, so its task card's **Run in an agent** button (the Tasks host's optional `cardHandoff`,
drawn only when there is no `terminal`) hands the card's run to an app that can start an agent. The rules:

- **Data only.** What crosses is `{ issueUrl, skill }`, strict (`AgentRunHandoffSchema`,
  `shared/src/agent-run-handoff.ts`), and never a prompt, an agent, a command, a flag, a path or a repository id.
  `issueUrl` is `https://<dns-host>/<owner>/<repo>/(issues|pull)/<n>` exactly: no credentials, port, query, fragment
  or trailing path, no IP or single-label host, and the raw string must equal its normalised form (so `..`, `%2e`
  and `%2F` are refused). `skill` is one `/command` and at most four plain words, none starting with `-`, with no
  quotes, metacharacters or newline. The feature builds it (`agentRunFor`, the card's URL and the skill its picker
  shows); a draft card or a skill that is not plain gives no run and a disabled button that says why.
- **Gated.** Play is enabled only while Coder's **Review actions** switch is on (off by default), and Coder's
  `send` (`apps/coder/src/compose/agent-handoff.ts`) checks the switch again rather than trusting the button.
- **How a receiver is known.** Coder's main answers `handoff.runReceiver` (`registerRunReceiver`,
  `runtime/src/app-main/handoff.ts`) with a name or null, never a path or pid: `studio` when the runtime host record
  names Studio as the host. Agents joins once it can take a run itself, known then by the launcher's
  `installed.json`. **With no receiver** — or when the link could not be opened — Coder opens nothing and offers
  the prompt (`<skill> <url>`) to copy instead.
- **The route.** The link is `midnite://open?app=agents&run=<base64url JSON>`, opened by main's hand-off opener,
  which re-parses it and opens only a `midnite://open` link. The launcher's router sends any run-bearing link to
  Studio as `midnite-studio://run?req=…` — it skips an installed Agents bundle, which cannot take one yet, and with
  no Studio installed shows the Agents detail sheet. Studio's protocol parser decodes it to `{ kind: 'run', run }`,
  `run` null when anything about it fails.
- **Studio re-validates, on receipt** (`app/src/services/agent-run-receiver.ts`). A link is remote-triggerable —
  any web page can open one — so arriving proves nothing. A malformed or hostile run is refused with a toast; so is
  any run while the screen is locked.
- **Known repositories only.** The issue's `host/owner/repo` must match a repository the user already has open in
  Studio (its forge remote). **An unknown one is refused with a toast, exactly like a malformed link — Studio never
  resolves, clones or opens an unknown owner/name**, and a failed lookup is a refusal, not a guess.
- **Always confirmed.** The dialog shows the exact command line and the checkout it runs in; nothing starts until
  its button is pressed. The agent, its flags and the prompt are Studio's own (the repository's most recent agent,
  else the roster's first; `<skill> <url>`, exactly what Studio's own Play types). Confirmed, the prompt is typed
  into a new terminal and **sent only when Settings ▸ Projects ▸ Launch and run is on**; otherwise the user presses
  Return there.

Proven by `packages/features/tasks/manifest.test.ts`, the moved component suites under
`packages/features/tasks/renderer/`, Studio's assembled suites in `app/src/compose/tasks/` (rendered through
`test-support/tasks-render.tsx`, the two ports only), and `apps/coder/src/coder-app.test.tsx` (a board's items over
Coder's bridge; no Start, Stop or terminal on a card; task writes follow Review actions; the right link for a card;
nothing sent with Review actions off; copy-prompt with no receiver). The hand-off's own proofs:
`shared/src/agent-run-handoff.test.ts` (hostile URLs and skills, extra fields, the link round trip),
`apps/launcher/src/main/router.test.ts` (run links go to Studio), `desktop/src/main/protocol-parse.test.ts`,
`runtime/src/app-main/handoff.test.ts`, `apps/coder/main/context.test.ts` (the receiver name, the opener) and
`app/src/services/agent-run-receiver.test.ts` + `deep-link.test.tsx` (hostile and malformed runs, a well-formed link
to an unknown repository, the locked screen — all refused; the confirm-gated start; send only with Launch and run).

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

## The shared data plane: one vault, one broker, hand-off (Phase 113, toward V5)

V5 reads: *with two apps open, one login is seen by both, a terminal opened in one is reachable from the
other, and `midnite` lists only installed apps' MCP tools.* This section is the map of where each shared
thing lived when the work started, then the design that makes the clause true, and why.

### The map, before

| Shared thing | Studio (`packages/desktop`) | Coder, Money, Agents, Creator, Vault | Monitor | Mind, Cleaner, Browser |
|---|---|---|---|---|
| Vault files | `<appData>/Midnite Studio` (its `userData`) — `main/index.ts` composes `createVaultService({ directory: userData })` | `runtimeDataDirectory(appData)` = `<appData>/Midnite Runtime` — each app's `main/context.ts` composes **its own** `createVaultService` | none | none |
| Vault cipher | Studio's `safeStorage` — the keychain item "Midnite Studio Safe Storage" | each app's own `safeStorage` — "Midnite Coder Safe Storage", "Midnite Money Safe Storage", … (`app.setName` in each `identity.ts`) | — | — |
| Grants | `<userData>/vault-grants.json` | `<Midnite Runtime>/vault-grants.json` | — | — |
| Broker socket | `<userData>/broker/<version>-<buildId>[-dev].sock`, `buildId` = hash of Studio's `broker.js` (`broker-client.ts` → `runtime/src/broker/service.ts`) | no broker; Agents runs script nodes in a piped login shell | none — `terminalList` answers `inproc`, "no terminal broker of its own" | none |
| Hand-off | in-process: `STUDIO_HOSTED_APPS` is every app, so `planHandoff` is always `local` | not called — no app renderer uses `requestHandoff`; `setExternalHandoffTransport` has no caller | — | Mind's notes host answers `useHandoff: () => null` |
| MCP | the only `midnite` MCP server; lists `installed.json ∪ PLACEMENT_APP_IDS`, i.e. everything | no server | — | — |

Three things the map shows that the earlier slices' tests could not:

1. **Studio's logins are not in the runtime directory at all.** Every value a user has ever stored is in
   Studio's `userData`, under Studio's keychain item. The apps look in `Midnite Runtime`, which only the
   (off-by-default) Theme G migration would fill.
2. **The apps cannot share the runtime directory either.** `safeStorage` keys follow the process's app name,
   so a value Coder stores is ciphertext Money cannot open — and each app's `createSecureJsonStore` caches
   the file and rewrites it whole, so two apps writing the same namespace drop each other's entries (last
   writer wins). `apps/*/main/context.test.ts` hid both by storing "as Studio" with the *same* fake cipher
   the app then read with. Composing a vault per process was never going to make one login.
3. **The broker's socket is named by Studio's build**, under Studio's `userData`. Another app has neither
   Studio's `broker.js` to fingerprint nor its `userData` path, so it cannot compute the name — and if it
   were pointed at the directory, `probeLegacyBrokers` would treat Studio's current broker as a *legacy* peer
   and, finding it empty, **shut it down**. Attaching needs a mode that never spawns, retires or unlinks.

### The design

**One host process, everything else a guest.** The process whose keychain item holds the values — Studio
today; the launcher-hosted runtime once Theme G's migration re-encrypts into its identity — is the
**runtime host**. It keeps composing the one `VaultService` and the broker client exactly as before, and
additionally serves them to other apps:

- **Vault host** (`runtime/src/vault/host/`): a Unix socket at `<Midnite Runtime>/host/vault.sock`
  (directory `0700`), newline-delimited JSON, zod-parsed on the host. A guest composes
  `connectRuntimeVault({ socketPath, appId })`, which *is* a `VaultClient` — so `createForgeAccountVault`,
  Money's accounts and Agents' Ollama key bind to it unchanged. **Guests hold no vault cipher**: the only
  `safeStorage` left in a guest's main keeps its own pairing seed (below), in one module.
- **Pairing, then grants — both, never either.** A connection is served only once it has *paired* (proved it
  is the app it names, below) and then only what the host's own `vault-grants.json` allows that app; a
  guest cannot pass an `authorize`. Deny-by-default holds for every app but Studio and Vault. **No remote
  caller may be `studio`** (Studio is in-process with the host), and **`vault` may not `get`** (its preload
  has no read channel; the host enforces what the preload promises). The Vault app edits grants and
  pairings through the same socket, and must itself be paired to do so.
- **Runtime host record** (`runtime/src/host/`): `<Midnite Runtime>/host/host.json`, written atomically by the
  host at boot — `{ host, pid, broker: { socketPath, directory } | null }`. Names only, no secret.
- **Broker guests** (`attachSharedBroker`): read the record, connect to the host's broker socket and adopt
  any other live socket in its directory as a legacy peer — and never spawn, retire, unlink or shut down a
  broker. A guest lists, snapshots, streams, writes to and resizes any session. **Since Theme O slice 4 a guest
  may also create a session on the host's broker**, which the server stamps with the guest's app id as its
  `owner` (shown in `list`), **and may kill only sessions whose owner is its own id** — never Studio's or another
  app's. Monitor's `terminalList` was its first user; Agents (its workflow agent nodes) and Coder (Sessions) followed.
- **The broker server enforces that, not just the client.** `hello` declares `role: 'host' | 'guest'` and an
  `appId`; the identity is fixed by the first hello (a later one that changes it is refused). **Default-deny**: a
  connection that never says `role: 'host'` is a guest, and a guest with no valid app id cannot create. Refused
  requests answer `code: 'forbidden'`; `retire`, `shutdown` and `forget` are the host's alone. `list` and
  `snapshot` never carry a session's environment (a session's env can hold a resolved secret, such as the
  Ollama key). **What it does not do**: identity is *declared*, not proven — a same-user peer on the `0600`
  socket cannot be authenticated beyond its uid, and could signal a listed pid directly anyway — so the rule
  holds guests (and any client written to the guest protocol) to their word; it does not stop a same-user
  process that claims to be the host. An older build's client adopting a newer broker as a legacy peer sends no
  role, so its kills there are refused; an older broker ignores the new fields and stamps no owner, and a guest
  then kills nothing on it.
- **Hand-off across apps** (`runtime/src/app-main/handoff.ts` + the frame's `createAppHandoff`): an app plans a
  request against the apps *it* hosts; anything else is `external`, and main opens the `midnite://open` link
  (validated by `parseMidniteLink` — never an arbitrary URL) with `shell.openExternal`. The launcher's router
  takes it from there: the installed bundle, else Studio, else the detail sheet. Studio installs the same
  transport with `setExternalHandoffTransport`, though as the superset it never needs it.
- **MCP** needs nothing new: the filter landed in Theme D, and the only server is Studio's.

**Why not move Studio's vault into `Midnite Runtime` now.** A narrower vault-only copy would put Studio-keyed
ciphertext into the runtime directory, which the eventual runtime host (a different keychain identity) could
not open — the opposite of what Theme G's migration prepares. With a host the files do not need to move for
V5: they stay where Studio's key can read them, and the socket is where the apps meet. Nothing is copied,
moved or deleted by this work.

**When a daemon is needed.** The broker already is one; the record plus attach-only mode is all sharing it
needs. The **vault is the one service that cannot be done with shared files**, because the key is bound to a
process identity: when no host is running, a guest's vault reads as unavailable and a write fails with
"open Midnite Studio". Making that case work needs a long-running host with a stable keychain identity — the
launcher-hosted runtime of Decision 10 — plus Theme G's re-encryption into it. The same is true of serving
MCP tools with Studio closed.

### Pairing: how the host knows a socket peer claiming `coder` is Coder

Without it, any process running as the user could connect to `vault.sock`, claim a granted app's id and
read that app's secrets with no keychain prompt — strictly weaker than the per-app keychain items it
replaced. So every guest pairs.

- **Each guest app holds an Ed25519 key** whose 32-byte random seed is created on first run
  (`loadOrCreatePairingIdentity`, `runtime/src/vault/host/pairing.ts`) and kept in
  `<the app's userData>/vault-pairing.json`, **encrypted with the app's own `safeStorage`** — its own
  keychain item, which another process cannot open without that app's keychain prompt. That is the one
  thing `safeStorage` does in an app main: `apps/<app>/main/pairing.ts` is the only module allowed to
  import it (`scripts/app-vault-grants.test.mjs` holds that, and that it only feeds the pairing seed). A
  keychain that is unavailable keeps no seed and pairs nothing; a seed that will not decrypt is moved aside,
  never deleted, and a fresh one made (which then shows as a conflict until the user unpairs).
- **Every connection is challenged.** The host's first line is a fresh 32-byte nonce; the guest's first
  request is `hello { appId, publicKey, proof }`, the proof an Ed25519 signature over
  `midnite-vault-pairing\0<appId>\0<nonce>`. A captured hello proves nothing on another connection, a proof
  for one app id is not one for another, and a connection serves only the app it paired as.
- **The host binds on first hello (TOFU)** — `<runtime>/host/pairings.json`, `0600` in the `0700` host
  directory, holding **public keys only**: reading it lets nobody forge a proof. A later hello for that app id
  with a different key is refused, logged, and counted as a **pairing conflict**, which the Vault app's
  *Paired apps* section shows.
- **Re-pairing is the user's call alone**: *Unpair* in Vault (Studio's Vault view, or the Vault app, which
  must itself be paired) clears an app's binding and its conflict; the app's next hello binds afresh.
  Nothing else ever unbinds.

**The TOFU window.** A binding is trusted from the first hello for that app id. A spoofer that connects
*before the real app's first launch* (or right after an Unpair) binds that id to its own key and is then
served whatever the user grants that id. The real app, opening later, is refused and its id shows a
**pairing conflict** in Vault — which is the signal: the user unpairs it, reopens the real app, and it binds.
Grants still gate everything, so the window only matters for an app the user has granted something; the
safe order is to open an app once before granting it access. Closing the window entirely needs an
out-of-band introduction (the launcher handing each stub its key at install, or a code signature check of
the socket peer), which this slice does not build.

### Where it landed

| Piece | Files | Proven by |
|---|---|---|
| Host record | `runtime/src/host/host-record.ts` | `host-record.test.ts` (round trip, `0600`/`0700`, malformed → none) |
| Guest pairing | `runtime/src/vault/host/{pairing,pairing-store}.ts`; `apps/<app>/main/pairing.ts`; Vault's `pairing-section.tsx`; `vaultPairingsList`/`vaultPairingUnpair` | `pairing.test.ts`, `host.test.ts` ("pairing"): a spoofer without the key is refused; a replayed hello is refused; first hello binds; a second key is refused and counted; Unpair (Vault only, Vault paired) then re-bind works; granted-but-unpaired is refused; the listing carries no key |
| Vault host + guests | `runtime/src/vault/host/{protocol,server,client}.ts`; `startTestVaultHost` in `vault/testing.ts` | `host.test.ts`: a token Studio stores is read by Coder only once granted; a granted write lands in Studio's vault; a peer claiming `studio` or an unknown id is refused; `vault` lists and edits grants but never reads; no host → absent reads, refused writes, a late host is found; a second host never takes the path |
| Studio hosts | `desktop/src/main/runtime-host.ts`, wired after `initPtyService` in `main/index.ts`, closed in `before-quit` | `runtime-host.test.ts` (serves Studio's own vault; a second Studio leaves the first one's record alone; a throwaway profile hosts inside itself) |
| Guest apps | `apps/{coder,money,agents,vault}/main/context.ts`, `apps/creator/main/index.ts` — no `safeStorage`, no `authorize` | each app's `context.test.ts` now runs against a real host on a temp-dir socket |
| Broker guests | `runtime/src/broker/client.ts` (`role: 'guest'`, `appId`), `broker/shared.ts`; the rule in `desktop/src/broker/server.ts` | `desktop/src/main/broker-guest.test.ts` on the real server: listed, streamed, written to, resized and snapshotted from another app; a guest's own session created, stamped and killed, the host's never; an empty legacy broker and a dead socket left alone; a late host found. `desktop/src/broker/guest-rules.test.ts`: a hand-rolled raw client is refused kill/retire/shutdown/forget without `role: 'host'`, cannot re-hello as the host, and `list` carries no env |
| Monitor | `apps/monitor/main/shared-sessions.ts` | `shared-sessions.test.ts`, `monitor-app.test.tsx` |
| Hand-off | `shared` `CHANNELS.handoffOpen` / `HandoffOpenRequest`; `runtime/src/app-main/handoff.ts`; `frame/src/kit/handoff.ts`; Studio's `bridgeHandoffTransport` | `handoff.test.ts` in runtime, frame and app: the right `midnite://open` link, and nothing that is not one |

Still open after this: a vault and MCP server with no Studio running (the daemon above), delivering a
hand-off's view or ref *into* an installed bundle (the launcher's router opens the bundle with
`shell.openPath`, which carries no link; Studio's fallback carries all of it), and a terminal *started* from a
guest app. A forge login Studio stored *is* listed by Coder once granted: `withVaultForgeAccounts`
(`features/forge/main/forge-accounts-store.ts`) adopts the granted vault names as minimal records (`shared`'s
`forgeAccountFromVaultKey`, which the Vault app's listing uses too), re-derived on every load and never written
into Coder's own `forge-accounts.json`.
