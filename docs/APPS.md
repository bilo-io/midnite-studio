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

## Packages

Theme C of Phase 113 adds the packages the suite is built from. Studio is still the only thing that ships.
`packages/app` and `packages/desktop` now act as **Studio's composers**: they put the packages below
together, and until Themes G and H give every app its own composition, they are the only ones.

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

