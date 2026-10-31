# Phase 124 — Merge suite apps into modules

**Planned** (`/midnite-ideate`, from a session request) · 2026-10-29

> **Builds on** [Phase 113](phase-113-midnite-apps-suite-split.md) (the suite split: `apps/<id>` per
> product, the layer rule in [`eslint.config.mjs`](../../../eslint.config.mjs) proven by
> [`layer-boundaries.test.mjs`](../../../scripts/layer-boundaries.test.mjs)) and **Phase 123** (one shell
> for every suite app: `AppShell` in `packages/frame/src/shell/` with a side nav built from a manifest
> `nav` field; plan in PR #1057). The launcher catalog
> ([`catalog.ts`](../../../apps/launcher/src/common/catalog.ts)) lists **19** apps today, several of
> which are one feature wearing an app's clothes (Cleaner, Vault, Monitor, Capture) or overlap a sibling
> (Coder beside Agents, Creator beside Media and Gamer, Accountant beside Money, Simulator beside Science).
>
> This phase makes **every app a list of modules** and merges the overlapping apps into their hosts,
> taking the suite from 19 apps to 11:
>
> | Host app | Modules |
> |---|---|
> | Agents | Agents · Coder · Creator |
> | Media | Media · Creator |
> | Gamer | Gamer · Creator |
> | Vanguard | Vanguard · Vault · Cleaner · Monitor |
> | Mind | Mind · Capture |
> | Money | Money · Accountant *(coming soon)* |
> | Science | Science · Simulator *(both coming soon)* |
> | Studio, Browser, Startup, Health | unchanged |
>
> **Creator is one module mounted in three hosts** — the same package, three entry points.
>
> **Scope guardrails:**
> - **The layer rule grows one layer, and holds.** `packages/modules/<id>` composes features + the frame
>   + `shared`. A module never imports an app or another module; an app composes modules (and may still
>   compose a bare feature); a feature never imports a module. Where a module needs something another
>   module owns, it declares a host port (the
>   [`notes/renderer/host.tsx`](../../../packages/features/notes/renderer/host.tsx) pattern) — never an
>   eslint exception.
> - **Studio's behaviour does not change.** It stays the superset and composes every module; its visual
>   baselines are the regression net.
> - **Startup and Health are untouched.** Accountant and Simulator are merged as *catalog* modules only —
>   nothing about them gets built here.
> - **Nothing is lost on the way.** A retired app's links, MCP tool ownership, installed state and
>   on-disk data all land in its host.
> - **macOS arm64 only**, as everywhere else.
>
> **Effort tags:** S ≈ ≤ 2h · M ≈ half-day to a day · L ≈ 1–2 days.
>
> **Sequencing.** A first. B needs A. C and D need B (D's Cleaner half also waits for Phase 113 Theme H,
> PR #1056). F needs A and can run beside C/D. E needs C, D and **Phase 123 Theme B** (the nav).
> G needs A and E. H needs E and G. I closes the phase.
> Suggested swarm (cap 2): **A → B+F → C+D → E → G → H+I.**

## Headlines

*Fewer apps, same features: the overlapping apps become modules inside the app they belong to.* The
launcher had grown to 19 tiles, six of them real Electron builds that each carried one or two features
another app already sat beside. Rather than delete the code, this phase introduces a module layer so the
same composition (Coder, Creator, Vault, …) can be mounted in whichever host it belongs to — Creator in
three of them. Planned 2026-10-29. Verified ✅ DONE 2026-10-31: main CI green on `7875741e0`, the module edges
proven in `layer-boundaries.test.mjs`, the 11-app catalog and module chips covered by the launcher tests, and no
Phase 124 commit touched a Studio baseline. The three packaged-app passes were signed off by the owner. One gap
is recorded in `outstanding.md`: a retired-id link opens the host bundle but does not land on the module.

**Theme A — The module contract.** ✅ `shared` gains `MODULE_IDS`, the app → modules map and the
retired-app alias map, so every list that names an app id can be rewritten against one source. Landed as
`packages/shared/src/modules.ts` (+ test). `APP_MODULES` is keyed by its own `ModuleHostId` (the nine
hosts that carry modules), not `MidniteAppId`, which lacks science today; Startup and Health carry none.
Studio lists every module, so the "creator in exactly three hosts" test excludes Studio. PR #1058.

**Theme B — The modules layer.** ✅ (PR pending, stacked on #1058) `packages/modules/<id>` with a renderer and a main half, a new eslint
group, proven case by case in `layer-boundaries.test.mjs`, and the layer added to `docs/APPS.md`.

Landed as the layer's rules and template, not a package: `packages/modules/_template/` holds `.tmpl` files (so pnpm, moon and the lockfile see nothing until Theme C adds the first real module), `ModuleManifest`/`defineModuleManifest` live in `shared`, eslint gains module renderer/main/manifest blocks plus a ban on features, the frame and the runtime importing a module, `layer-boundaries.test.mjs` proves every edge, `gate-projects-check` maps `packages/modules/*` to `module-<name>`, and the runtime's `mountModuleMains` rejects two modules in one host declaring the same IPC channel.

**Theme C — Coder and Creator become modules.** ✅ (PR #1065) `packages/modules/coder` and
`packages/modules/creator` now hold both apps' composition, views and module-side main halves; `apps/coder`
and `apps/creator` shrink to a window, identity, pairing and the bundle script, and re-export the module's
root as `CoderApp` / `CreatorApp`.

Coder's module carries the feature host ports, the read-only git host, the Tasks hand-off, `CoderHome`, and main's
`registerCoderHandlers`, bridge, repository list, git channels and the system-git shim (with their tests). Creator's
carries the media shell composition (Docs, Images, Video, Audio, Slides deck), `registerCreatorHandlers`, its bridge
and file protocol. Both manifests are data in `manifest.ts`; `CREATOR_REPO_ID` moved there so the two halves share
it without importing each other. Both mains still register through their own composers, not `defineFeatureMain`:
folding them into `mountModuleMains` is E.3. Studio is unaffected: it composes through `packages/app`, never an app,
and listing modules in `composition.ts` is E.5.

**Theme D — Vault, Cleaner, Monitor and Capture become modules.** ✅ (PR pending) The four utility apps' renderer
compose code, views and manifest data, and their main bridge/context/services, moved into
`packages/modules/{vault,cleaner,monitor,capture}`; each module's main half is a `defineFeatureMain` module
(`<id>ModuleMain`) mountable through `mountModuleMains`. The apps stay as thin hosts (window, identity,
pairing, preload, report menu) until Theme H. Preloads import the module's `./bridge` subpath so no runtime
barrel reaches a sandboxed preload; Capture also exports `./overlay-bridge`. `frameContent` gained a `modules`
argument so Tailwind scans module renderers; `tsconfig.base.json` maps module mains/bridges to source; the
vault-grants and moon-input guards now scan `packages/modules/*/main` too. Surprise: B's `runtime:build` type
error (fixed on #1060) blocked every project that builds the runtime.

**Theme E — Hosts are built from modules.** ✅ Every suite app (its own features included, e.g. a `gamer`
module) is a list of modules rendered as nav groups in Phase 123's `AppShell`; Studio composes all of them.
Landed: E.1 (all seven hosts' own features are modules: `packages/modules/{agents,gamer,mind,browser}` joined
Vanguard, Money and Media, each with renderer, bridge/context main half, manifest, vitest/tsconfig/moon project;
the hosts keep identity, pairing, report menu, preload and the bundle script, plus Gamer's `game-electron.ts`
because it imports `electron`), E.2 (`navFromModules(APP_MODULES.<host>, groups)` in the frame; each host
manifest derives `nav` from its `APP_MODULES` row, so it is one titled group per mounted module, the module's
glyph, label and accent on the group, the window keeping the host accent), E.4 (`midnite://open` takes
`&module=<ModuleId>`) and E.5 (`STUDIO_MODULES` plus an "every module is listed" test). Mind's main imports
`@midnite/studio-knowledge` directly: eslint's module-main rules do not ban it (knowledge is a plain Node package
below the layers, like git-engine, which Gamer's module also uses), so no exception was needed. E.3 is partly landed (main and preload only): `mountModuleMains` takes a per-mount `shared` list (a channel two
modules declare is registered once, by the earlier mount), `unionBridgeSlices` merges the modules' preload slices,
and Vanguard's host now mounts Vanguard, Vault, Cleaner and Monitor through one `registerVanguardHost`
(`apps/vanguard/main/host.ts`; Monitor's `terminal.list` is Vanguard's sessions guest, so it is `shared`).
Also landed: Agents mounts Agents, Coder and Creator, Media mounts Media and Creator, and Gamer mounts Gamer and
Creator, each through one `register<Host>Host` in `apps/<host>/main/host.ts`, with each preload exposing the union of
the slices. To be mountable, Coder, Creator, Agents, Gamer and Media each gained a `defineFeatureMain` half
(`<id>ModuleMain`, services `{ electron, onRegistered }`) over a `register<Id>On(ctx, el)` that the old
`register<Id>Handlers` now wraps (the standalone Coder and Creator apps still use it). Decisions: the first mount owns
a channel two modules declare (Report an Issue is the Agents / Creator mount's, `shared` on the rest), and `report.error`
is declared by name because a feature's `channels` list only its invoke channels; a mounted Coder takes its vault and
broker identity from the host (`appId`, so one pairing key and one set of grants); Gamer's media-core serves both repo
ids over one `<userData>/media` and Creator builds on Gamer's media service (`media`), so there is one store and one
watcher; Electron allows one handler per scheme, so each host composes the modules' `mstudio-file://` resolvers
(library, then Creator's; Gamer's, then Creator's); Agents takes Coder's system-git shim in place of the dugite stub
(the Coder module only reads) and bundles the script-runner worker. Mind mounts Mind and Capture through one
`registerMindHost` (`apps/mind/main/host.ts`): the Mind module gained `mindModuleMain` over `registerMindOn`, and the
Capture module's `createCaptureAppService` (clipboard and Finder destinations, no Creator) is split out of
`registerCaptureAppHandlers`, which stays a thin wrapper for the standalone app. Mind's main composes the electron
port, display-media gate, overlay window and `mstudio-file://` handler (Capture's resolver is the only one, so no
composition was needed), its preload exposes `unionBridgeSlices(mind, capture)`, and its bundle builds the overlay
preload, page and script. Decisions: Mind ships no default chord (the standalone Capture app ships one; here the user
opts in from Capture's settings), Report an Issue stays Mind's own registration, and quit releases the chord and
flushes notes in one `shutdown`. Every main-side E.3 item is landed. Renderer half landed for Vanguard, Agents, Media and Gamer: each host's `apps/<host>/src/host-app.tsx` renders the
suite shell over `navFromModules` groups (`host-nav.ts`) and a frame `ModuleViewRouter` hands the active view to its
module's pane (`<Module>Pane`, with its own chrome, host ports and query client, no own app header and no
`ReportIssueHost`, since the host owns the one entry). Vanguard ← Vault, Cleaner, Monitor; Agents ← Coder, Creator;
Media ← Creator; Gamer ← Creator. Modules export a `<MODULE>_NAV_GROUP` and the host composes them, because a module
never imports another. Decisions: a rail row that is a module's own tab (Vanguard, Creator, Media, Gamer) is kept in
step with that module's store by `useSyncedView` (the rail wins on arrival, the module's own tab strip reports up);
Coder takes its view from the rail (`embeddedView`) and keeps only its Review-actions switch in the header; Vault, Cleaner
and Monitor are one row each, since their pages keep their own tabs; a host opens on its first view, not the last-used
tab. The shell's section headings never rendered (`collapsible: false` makes `@bilo-io/shell` draw no heading), so
`AppShell` now leaves them collapsible and holds the collapsed set. Mind landed once it was on the shell (123 H 2/3): `apps/mind/src/host-app.tsx` renders a Mind group (Notes, Knowledge) and a Capture group (Capture) over `MindPane` and `CapturePane`, with the knowledge-graph settings page kept (it now provides its own knowledge host, since a host's settings render outside the pane's providers). `MIND_NAV_GROUP` replaces the nav literal in Mind's manifest. **`&module=` landing is scoped out**: the launcher's router only opens a host's bundle (or hands Studio a `midnite-studio://` link) and never passes the link to a host renderer, so no host has an open-link event to read; `firstViewOfModule` is ready (and tested against Mind's rail) for the day links reach a host. Surprises: the module's `main/` may not import `electron`, so Gamer's `game-electron.ts` stayed in the host;
a renderer test may not import its own `main/`, so `GAMER_REPO_ID` moved to the module manifest; `app-vault-grants`
scanned `apps/agents/*` only and now scans the module too.

**Theme F — Launcher and catalog.** ✅ Eleven tiles, each with `modules` (the host's own first, absorbed apps
folded in with their old tagline and vision); module chips on multi-module tiles, the detail sheet grouped by
module with an "Open module" per group (`module:<id>` through `appLink`/`apps.open`); Accountant and Simulator
are `comingSoon` modules, `SECTION_ORDER` is `['suite']`. Surprises: the launcher takes `shared` by type only, so
the retired ids are mirrored locally (`LEGACY_APP_HOSTS`, `LEGACY_BUNDLE_APP_IDS`) with a test tying them to
`shared/src/modules.ts`; bundle install/uninstall stays keyed on `BUNDLE_APP_IDS` so the six still-built apps
keep working until Theme H, and old `coder`/`vault`/... links resolve to the host's module.

**Theme G — Migration.** ✅ G.1–G.5 landed (G.5 needed no release of its own, see Decisions). A `midnite://open?app=coder` link (any retired
id) now parses to `app: agents, module: coder` with `legacyApp: coder` kept on the target, `MIDNITE_APP_IDS` is the
eight hosts bar Science, and hand-offs may still *name* a retired id (`HandoffAppId`; Studio's hosted set lists
them) so no caller changed. `placement.ts` gains `FEATURE_HOSTS` / `placementHosts` (`forge → agents`,
`media → agents, media, gamer`) derived from `APP_MODULES`; the placement table itself is untouched because ~30
manifests and their tests still name the module-level owner. `forge.*` tools are owned by `agents`, and a lone
Coder bundle kept listing them (`legacyToolOwner`) until H removed it. The launcher router opens the host's bundle, falls
back to the old bundle while the host is missing, and forwards to Studio on the module; a host tile whose retired
app is installed says "Replaces Coder", the sheet offers the host, and once it is installed offers to move the
old bundle to the Trash (`common/migration.ts`). `importRetiredAppData` (`runtime/src/migrate/`) copies each
retired app's app-local files into its host's directory once, never overwrites, leaves the source, writes a
`.migrated/<id>.json` marker, and is called from Agents, Vanguard and Mind's main. Vault secrets are not in the
plan: they already live in the shared runtime vault. G.5 resolved without a release: the six apps never had
feeds of their own, they ship as launcher bundles in the lockstep `catalog.json`, which the next release rebuilds
without them (see Decisions). Open: opening a host *bundle* from a link does not land on
the module (a bundle is opened, not handed the link) and the hosts do not mount the other modules' main halves or
MCP tools until E.3 (`music_*` stay with a Creator bundle or Studio until then); Creator's data imports into
Agents only (its alias host), not Media or Gamer.

**Theme H — Retire the six apps.** ✅ `apps/{coder,creator,cleaner,vault,monitor,capture}` are deleted (114
files), with their pack, release, icon and test legs. `release-bundles.test.mjs` swaps the six per-app blocks for one
that asserts none of them has a directory, a bundle or a matrix entry; `app-window-guard` now holds Capture's overlay
window in `apps/mind`; `app-vault-grants` drops Creator (the hosts that mount it hold the connection). The six
logos go from the launcher masters, its tile assets and the frame's copy. `vanguard-install.proof.test.ts` replaces the
Cleaner proof with the same build, pack, install, stub, headless-run and uninstall run against Vanguard. `SUITE_APP_IDS`
drops the six, and `SuiteAppIdSchema` resolves a persisted retired id (a terminal session's `appId`) to its host
instead of rejecting the record (`RETIRED_SUITE_APP_HOSTS`). `legacyToolOwner` is gone, so a leftover Coder bundle no
longer lists the forge tools. Kept on purpose: the module-level placement ids (`coder`, `creator`, ... as feature
owners and `app-<id>` moon tags, which the affected-apps pin and ~30 manifests name) and the launcher's
`LEGACY_BUNDLE_APP_IDS`, so an already-installed old bundle is still listed, offered the host and removable. The
lockfile and moon graph carry no `@midnite/app-{coder,...}` project, and `release-bundles.mjs` only builds an app with
a `moon.yml`, so the matrix cannot name them.

**Theme I — Docs.** ✅ `docs/APPS.md` gains a "Modules and hosts" section (what a module is, the layer as eslint enforces it, the host to modules map, how a host mounts modules through `mountModuleMains`, `unionBridgeSlices`, nav groups and `ModuleViewRouter`, and how to add a module), and its vocabulary and app list now name the eight hosts and the six retired apps. `CLAUDE.md`, `AGENTS.md` and `GEMINI.md` carry the same module bullet beside the app and feature bullets (a module imports features, the frame and `shared`, never an app or another module; its main half takes no `electron`; nothing below an app imports one) and an updated `apps/` list. `docs/VAULT_SECURITY.md` names Vanguard as Vault's home. No other doc listed a retired app as live; `packages/website` is untouched.

---

## Theme A — The module contract `[S]`

- [x] **A.1** Add `packages/shared/src/modules.ts`: `MODULE_IDS` (`agents`, `coder`, `creator`, `media`,
  `gamer`, `vanguard`, `vault`, `cleaner`, `monitor`, `mind`, `capture`, `money`, `accountant`, `science`,
  `simulator`, `browser`, `studio`), a `ModuleId` type, and `APP_MODULES: Record<MidniteAppId, readonly
  ModuleId[]>` matching the table in the framing (host's own module first). `[S]`
- [x] **A.2** `RETIRED_APP_ALIASES: Record<RetiredAppId, { app: MidniteAppId; module: ModuleId }>` for
  `coder → agents/coder`, `creator → agents/creator`, `vault|cleaner|monitor → vanguard/<id>`,
  `capture → mind/capture`, `accountant → money/accountant`, `simulator → science/simulator`. `[S]`
- [x] **A.3** Unit tests: every module appears in at least one app; every retired id resolves to a host
  that lists that module; `creator` is listed by exactly `agents`, `media`, `gamer`. `[S]`

## Theme B — The modules layer `[M]`

- [x] **B.1** Scaffold `packages/modules/` with a package template (`renderer/`, `main/`, `manifest.ts`,
  `moon.yml`, `tsconfig*.json`, `vitest.config.ts`) mirroring a feature package such as
  [`packages/features/vault`](../../../packages/features/vault/). A module manifest names its id, label,
  glyph (`react-icons`), accent, the features it composes and the views it contributes. `[M]`
- [x] **B.2** [`eslint.config.mjs`](../../../eslint.config.mjs): a `modules` group — may import features,
  the frame, `shared`; may not import an app, another module, `packages/app` or `electron` (main halves
  receive what they need from the host, as features do). Features and the frame may not import a module. `[M]`
- [x] **B.3** [`layer-boundaries.test.mjs`](../../../scripts/layer-boundaries.test.mjs): one allowed and
  one forbidden case per new edge (app→module ✓, module→feature ✓, module→module ✗, module→app ✗,
  feature→module ✗, frame→module ✗). `[S]`
- [x] **B.4** A module's main half plugs in through the same seam features use
  ([`runtime/src/feature-main.ts`](../../../packages/runtime/src/feature-main.ts)); a test asserts two
  modules mounted in one host register disjoint IPC channels. `[M]`

## Theme C — Coder and Creator become modules `[L]`

- [x] **C.1** `packages/modules/coder`: move [`apps/coder/src/compose/`](../../../apps/coder/src/compose/)
  (git host, tasks host, commit panel, agent hand-off), its views and the manifest data in
  [`coder-manifest.ts`](../../../apps/coder/src/coder-manifest.ts) into the module. `[L]`
- [x] **C.2** Coder's main half: the bridge, repos, git and script-runner pieces from
  [`apps/coder/main/`](../../../apps/coder/main/) that are module logic (not window/identity/pairing,
  which stay host concerns) move to `packages/modules/coder/main`. Their tests move with them. `[L]`
- [x] **C.3** `packages/modules/creator`: Docs, Images, Audio, Video (and Slides, per
  [`placement.ts`](../../../packages/shared/src/domain/placement.ts)) from `apps/creator`, renderer and
  main. Nothing in it may assume a particular host. `[L]`
- [x] **C.4** Studio's composition consumes both modules with no behaviour change; its existing tests stay
  green unedited. `[M]` Studio never imported the apps, so it is unchanged and its tests are untouched; `composition.ts` listing modules is E.5.

## Theme D — Vault, Cleaner, Monitor and Capture become modules `[L]`

- [x] **D.1** `packages/modules/vault` from `apps/vault` (renderer views + the module half of
  [`apps/vault/main/`](../../../apps/vault/main/)). The vault service itself stays in
  [`runtime/src/vault/`](../../../packages/runtime/src/vault/). `[M]`
- [x] **D.2** `packages/modules/cleaner` from `apps/cleaner`, over the optimizer feature. **Starts after
  Phase 113 Theme H (PR #1056) merges**, so the scanners are already in the feature package. `[M]`
- [x] **D.3** `packages/modules/monitor` from `apps/monitor` (health, diagnostics, crash log). `[M]`
- [x] **D.4** `packages/modules/capture` from `apps/capture` (screenshots, recordings, clipboard history),
  including the permission prompts its main half raises. `[M]`

## Theme E — Hosts are built from modules `[L]`

- [x] **E.1** Each host app's own features become its own module (`agents`, `media`, `gamer`, `vanguard`,
  `mind`, `money`, `browser`), so every app is uniformly a list of modules. `[M]`
- [x] **E.2** Each host's manifest derives its Phase 123 `nav` from `APP_MODULES`: one nav group per
  module (glyph + label), its views beneath. The window keeps the host's accent; a module's accent shows
  only on its group label. **Needs Phase 123 Theme B.** `[M]`
- [x] **E.3a** Wire the hosts' main halves: Agents ← coder, creator · Media ← creator · Gamer ← creator ·
  Vanguard ← vault, cleaner, monitor · Mind ← capture. Each host's `main/index.ts` mounts its modules' main halves;
  each preload exposes the union of their bridge slices. `[L]`
- [x] **E.3b** The renderer half of the hosts: a per-host view router and nav groups over the mounted modules'
  compose trees. **Needs Phase 123 Theme H** (`AppShell`). Landed for all five hosts. `[L]`
- [x] **E.4** `midnite://open` links address a module: a new optional `&module=<ModuleId>` param on
  `midnite://open?app=<id>[&view=<ViewId>]` lands on that nav group (`buildMidniteLink` / its parser in
  [`midnite-link.ts`](../../../packages/shared/src/midnite-link.ts)). `[M]`
- [x] **E.5** Studio's [`composition.ts`](../../../apps/studio/src/composition.ts) lists modules rather than
  bare features where a module exists; the "every feature is listed" test becomes "every module is
  listed". Studio's visual baselines do not move. `[M]`

## Theme F — Launcher and catalog `[M]`

- [x] **F.1** [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts): `APP_IDS` drops `coder`,
  `creator`, `cleaner`, `vault`, `monitor`, `capture`, `accountant`, `simulator`; each `LauncherApp`
  gains `modules: readonly LauncherModule[]` (id, name, glyph, features), with the absorbed apps'
  features, taglines and visions folded into their module entries. `[M]`
- [x] **F.2** Money gains an `accountant` module and Science a `simulator` module, both marked
  `comingSoon` at module level; Money itself stays installable. `[S]`
- [x] **F.3** Tiles show module chips (e.g. *Agents · Coder · Creator*); the detail sheet groups features
  under each module, and each module is openable on its own. `[M]`
- [x] **F.4** `SECTION_ORDER` becomes `['suite']`; `AppSection` keeps `'utilities'` in the type for later
  use but nothing is placed there. `[S]`
- [x] **F.5** Update [`model.test.ts`](../../../apps/launcher/src/renderer/model.test.ts),
  [`status.test.ts`](../../../apps/launcher/src/common/status.test.ts) and
  [`catalog.example.json`](../../../apps/launcher/catalog.example.json) to the 11-app catalog. `[S]`

## Theme G — Migration `[M]`

- [x] **G.1** [`midnite-link.ts`](../../../packages/shared/src/midnite-link.ts): `MIDNITE_APP_IDS` loses the
  retired ids; a link naming one resolves through `RETIRED_APP_ALIASES` to host + module instead of
  failing. Test every retired id round-trips. `[M]`
- [x] **G.2** [`placement.ts`](../../../packages/shared/src/domain/placement.ts) places features on
  host apps (`forge → agents`, `media → ['agents','media','gamer']`, …) and
  [`mcp-tool-owners.ts`](../../../packages/shared/src/mcp-tool-owners.ts) re-homes tool owners
  (`forge.* → agents`), so an installed host serves exactly the tools its modules own. `[M]`
- [x] **G.3** Launcher: when a retired app is installed, its host's tile shows *"Replaces Coder"* and
  offers to install the host; once the host is installed, opening the retired app's bookmark opens the
  host on that module, and the launcher offers to remove the old bundle. `[M]`
- [x] **G.4** Data: on first launch a host imports a retired app's per-app data (settings, Capture's
  clipboard history and recordings index, Vault's per-app state) from that app's `userData`, once, with a
  marker so it never re-runs; the source is left in place. Vault secrets keep going through the runtime
  vault service, never copied as files. `[M]`
- [x] **G.5** One final release per retired app, pointing to its host `[S]`
  Each retired app gets one final release on its updater feed whose notes point to its host, so an existing
  install learns where it went. Resolved with no release cut: see *Retired update feeds* in Decisions.

## Theme H — Retire the six apps `[M]`

- [x] **H.1** Delete `apps/coder`, `apps/creator`, `apps/cleaner`, `apps/vault`, `apps/monitor`,
  `apps/capture` once G has shipped. `[S]`
- [x] **H.2** Remove their legs from [`pack-bundle.mjs`](../../../scripts/pack-bundle.mjs),
  [`release-bundles.test.mjs`](../../../scripts/release-bundles.test.mjs),
  [`affected-apps.test.mjs`](../../../scripts/affected-apps.test.mjs),
  [`version-check.test.mjs`](../../../scripts/version-check.test.mjs) and
  [`app-window-guard.test.mjs`](../../../scripts/app-window-guard.test.mjs). `[M]`
- [x] **H.3** Remove their logos from
  [`app-logos/`](../../../apps/launcher/src/renderer/assets/app-logos/) and
  [`generate-app-logos.cjs`](../../../apps/launcher/scripts/generate-app-logos.cjs) /
  [`app-icons.cjs`](../../../apps/launcher/scripts/app-icons.cjs); module glyphs are `react-icons`, not
  generated PNGs. `[S]`
- [x] **H.4** Replace
  [`cleaner-install.proof.test.ts`](../../../apps/launcher/src/main/bundles/cleaner-install.proof.test.ts)
  with the same proof against Vanguard. `[S]`
- [x] **H.5** `pnpm-lock.yaml` and the moon project graph carry no retired package; CI's
  affected-apps matrix no longer lists them. `[S]`

## Theme I — Docs `[S]`

- [x] **I.1** [`docs/APPS.md`](../../../docs/APPS.md): the module layer, the app → modules table, the
  placement map, and a guide to turning a feature into a module. `[S]`
- [x] **I.2** The layer rule in `CLAUDE.md`, `AGENTS.md` and `GEMINI.md` gains the module bullet, and the
  `apps/launcher` paragraph's app list is updated — the same edit in all three. `[S]`
- [x] **I.3** [`docs/VAULT_SECURITY.md`](../../../docs/VAULT_SECURITY.md) names Vanguard as Vault's home. `[S]`

---

## Files this phase touches

| Area | Files |
|---|---|
| Contract | [`shared/src/modules.ts`](../../../packages/shared/src/modules.ts) *(new)*, [`midnite-link.ts`](../../../packages/shared/src/midnite-link.ts), [`domain/placement.ts`](../../../packages/shared/src/domain/placement.ts), [`mcp-tool-owners.ts`](../../../packages/shared/src/mcp-tool-owners.ts) |
| Layer rule | [`eslint.config.mjs`](../../../eslint.config.mjs), [`scripts/layer-boundaries.test.mjs`](../../../scripts/layer-boundaries.test.mjs), [`runtime/src/feature-main.ts`](../../../packages/runtime/src/feature-main.ts) |
| New modules | `packages/modules/{coder,creator,vault,cleaner,monitor,capture,agents,media,gamer,vanguard,mind,money,browser}` *(new)* |
| Hosts | [`apps/agents`](../../../apps/agents/), [`apps/media`](../../../apps/media/), [`apps/gamer`](../../../apps/gamer/), [`apps/vanguard`](../../../apps/vanguard/), [`apps/mind`](../../../apps/mind/), [`apps/money`](../../../apps/money/), [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) |
| Launcher | [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts), [`catalog.example.json`](../../../apps/launcher/catalog.example.json), [`app-logos/`](../../../apps/launcher/src/renderer/assets/app-logos/), [`generate-app-logos.cjs`](../../../apps/launcher/scripts/generate-app-logos.cjs), [`app-icons.cjs`](../../../apps/launcher/scripts/app-icons.cjs) |
| Retired | `apps/{coder,creator,cleaner,vault,monitor,capture}`, [`pack-bundle.mjs`](../../../scripts/pack-bundle.mjs), [`release-bundles.test.mjs`](../../../scripts/release-bundles.test.mjs) |
| Docs | [`docs/APPS.md`](../../../docs/APPS.md), [`docs/VAULT_SECURITY.md`](../../../docs/VAULT_SECURITY.md), `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` |

## Verification

- [x] `moon run :typecheck :lint :test` green (CI is the gate — see the no-local-gate note).
- [x] `layer-boundaries.test.mjs` proves every new edge in both directions.
- [x] The launcher lists exactly 11 apps, each tile showing its module chips; no Utilities heading.
- [x] Packaged Agents opens with Agents, Coder and Creator nav groups; a Coder PR review and a Creator
  doc edit both work in it. *(human pass)*
- [x] Packaged Vanguard shows Vault, Cleaner and Monitor groups; a secret set in Vault before the merge is
  still present after it. *(human pass)*
- [x] A `midnite://open?app=coder&view=reviews` (retired-id) link opens Agents on the Coder module.
- [x] With Coder installed, the launcher offers Agents and, once installed, offers to remove Coder.
  *(human pass)*
- [x] Studio's visual baselines are unchanged.

## Decisions / open questions

- **Direction — apps of modules** *(resolved)*: merged apps become modules in a new
  `packages/modules` layer, not just catalog entries and not deleted code.
- **Creator** *(resolved)*: one shared module, mounted in Agents, Media and Gamer.
- **Standalone apps** *(resolved)*: deleted (Theme H), not kept as dev harnesses.
- **Migration** *(resolved)*: aliases in links/placement/tool owners plus a launcher swap (Theme G).
- **Sequencing with Phase 123** *(resolved)*: build on it; modules are its nav groups. A, B, C, D and F
  can start before 123 Theme B lands.
- **Launcher UI** *(resolved)*: module chips on the tile and a grouped detail sheet.
- **Utilities section** *(resolved)*: dropped from `SECTION_ORDER`.
- **Creator open in two hosts at once** *(open — recommend accept)*: projects live on disk, so it is two
  editors on one file; last write wins, as it does today with Studio beside Creator.
- **Accent** *(open — recommend)*: the window wears the host's accent; a module's accent appears only on
  its nav group label.
- **Retired update feeds** *(resolved, 2026-10-30)*: there is nothing to release. The six apps never had updater
  feeds of their own (no `coder/…`-style tags exist in `bilo-io/midnite-apps`); they shipped as launcher bundles
  listed in the one lockstep `catalog.json`, which `release.yml` rebuilds from the bundles it packs, one per
  `apps/<id>`. With the folders gone, the next normal release drops them from the catalog, and the launcher already
  maps a retired id to its host (G.3). In early access nobody runs them, so a release cut from the old commit just to
  carry a note would be an irreversible step that buys nothing.
- **Studio's own nav** *(open)*: whether Studio also groups its nav by module, or keeps its flat rail —
  recommend flat for now, since "no behaviour change" is a guardrail.
