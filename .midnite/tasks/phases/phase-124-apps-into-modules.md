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
three of them. Planned 2026-10-29.

**Theme A — The module contract.** ✅ `shared` gains `MODULE_IDS`, the app → modules map and the
retired-app alias map, so every list that names an app id can be rewritten against one source. Landed as
`packages/shared/src/modules.ts` (+ test). `APP_MODULES` is keyed by its own `ModuleHostId` (the nine
hosts that carry modules), not `MidniteAppId`, which lacks science today; Startup and Health carry none.
Studio lists every module, so the "creator in exactly three hosts" test excludes Studio. PR #1058.

**Theme B — The modules layer.** ◻ `packages/modules/<id>` with a renderer and a main half, a new eslint
group, proven case by case in `layer-boundaries.test.mjs`, and the layer added to `docs/APPS.md`.

**Theme C — Coder and Creator become modules.** ◻ Their compose code, views and main bridges move out of
`apps/coder` and `apps/creator` into `packages/modules/{coder,creator}`.

**Theme D — Vault, Cleaner, Monitor and Capture become modules.** ◻ The same move for the four utility
apps, into `packages/modules/{vault,cleaner,monitor,capture}`.

**Theme E — Hosts are built from modules.** ◻ Every suite app (its own features included, e.g. a `gamer`
module) is a list of modules rendered as nav groups in Phase 123's `AppShell`; Studio composes all of them.

**Theme F — Launcher and catalog.** ✅ Eleven tiles, each with `modules` (the host's own first, absorbed apps
folded in with their old tagline and vision); module chips on multi-module tiles, the detail sheet grouped by
module with an "Open module" per group (`module:<id>` through `appLink`/`apps.open`); Accountant and Simulator
are `comingSoon` modules, `SECTION_ORDER` is `['suite']`. Surprises: the launcher takes `shared` by type only, so
the retired ids are mirrored locally (`LEGACY_APP_HOSTS`, `LEGACY_BUNDLE_APP_IDS`) with a test tying them to
`shared/src/modules.ts`; bundle install/uninstall stays keyed on `BUNDLE_APP_IDS` so the six still-built apps
keep working until Theme H, and old `coder`/`vault`/... links resolve to the host's module.

**Theme G — Migration.** ◻ Old ids alias to host + module in links, placement and MCP tool owners; a
launcher with a retired app installed offers its host and opens it on that module; the retired app's data
moves into the host's.

**Theme H — Retire the six apps.** ◻ `apps/{coder,creator,cleaner,vault,monitor,capture}` and their pack,
release, icon and test legs are deleted.

**Theme I — Docs.** ◻ `docs/APPS.md` and the layer rule in `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`.

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

- [ ] **B.1** Scaffold `packages/modules/` with a package template (`renderer/`, `main/`, `manifest.ts`,
  `moon.yml`, `tsconfig*.json`, `vitest.config.ts`) mirroring a feature package such as
  [`packages/features/vault`](../../../packages/features/vault/). A module manifest names its id, label,
  glyph (`react-icons`), accent, the features it composes and the views it contributes. `[M]`
- [ ] **B.2** [`eslint.config.mjs`](../../../eslint.config.mjs): a `modules` group — may import features,
  the frame, `shared`; may not import an app, another module, `packages/app` or `electron` (main halves
  receive what they need from the host, as features do). Features and the frame may not import a module. `[M]`
- [ ] **B.3** [`layer-boundaries.test.mjs`](../../../scripts/layer-boundaries.test.mjs): one allowed and
  one forbidden case per new edge (app→module ✓, module→feature ✓, module→module ✗, module→app ✗,
  feature→module ✗, frame→module ✗). `[S]`
- [ ] **B.4** A module's main half plugs in through the same seam features use
  ([`runtime/src/feature-main.ts`](../../../packages/runtime/src/feature-main.ts)); a test asserts two
  modules mounted in one host register disjoint IPC channels. `[M]`

## Theme C — Coder and Creator become modules `[L]`

- [ ] **C.1** `packages/modules/coder`: move [`apps/coder/src/compose/`](../../../apps/coder/src/compose/)
  (git host, tasks host, commit panel, agent hand-off), its views and the manifest data in
  [`coder-manifest.ts`](../../../apps/coder/src/coder-manifest.ts) into the module. `[L]`
- [ ] **C.2** Coder's main half: the bridge, repos, git and script-runner pieces from
  [`apps/coder/main/`](../../../apps/coder/main/) that are module logic (not window/identity/pairing,
  which stay host concerns) move to `packages/modules/coder/main`. Their tests move with them. `[L]`
- [ ] **C.3** `packages/modules/creator`: Docs, Images, Audio, Video (and Slides, per
  [`placement.ts`](../../../packages/shared/src/domain/placement.ts)) from `apps/creator`, renderer and
  main. Nothing in it may assume a particular host. `[L]`
- [ ] **C.4** Studio's composition consumes both modules with no behaviour change; its existing tests stay
  green unedited. `[M]`

## Theme D — Vault, Cleaner, Monitor and Capture become modules `[L]`

- [ ] **D.1** `packages/modules/vault` from `apps/vault` (renderer views + the module half of
  [`apps/vault/main/`](../../../apps/vault/main/)). The vault service itself stays in
  [`runtime/src/vault/`](../../../packages/runtime/src/vault/). `[M]`
- [ ] **D.2** `packages/modules/cleaner` from `apps/cleaner`, over the optimizer feature. **Starts after
  Phase 113 Theme H (PR #1056) merges**, so the scanners are already in the feature package. `[M]`
- [ ] **D.3** `packages/modules/monitor` from `apps/monitor` (health, diagnostics, crash log). `[M]`
- [ ] **D.4** `packages/modules/capture` from `apps/capture` (screenshots, recordings, clipboard history),
  including the permission prompts its main half raises. `[M]`

## Theme E — Hosts are built from modules `[L]`

- [ ] **E.1** Each host app's own features become its own module (`agents`, `media`, `gamer`, `vanguard`,
  `mind`, `money`, `browser`), so every app is uniformly a list of modules. `[M]`
- [ ] **E.2** Each host's manifest derives its Phase 123 `nav` from `APP_MODULES`: one nav group per
  module (glyph + label), its views beneath. The window keeps the host's accent; a module's accent shows
  only on its group label. **Needs Phase 123 Theme B.** `[M]`
- [ ] **E.3** Wire the hosts: Agents ← coder, creator · Media ← creator · Gamer ← creator · Vanguard ←
  vault, cleaner, monitor · Mind ← capture. Each host's `main/index.ts` mounts its modules' main halves;
  each preload exposes the union of their bridge slices. `[L]`
- [ ] **E.4** `midnite://open` links address a module: a new optional `&module=<ModuleId>` param on
  `midnite://open?app=<id>[&view=<ViewId>]` lands on that nav group (`buildMidniteLink` / its parser in
  [`midnite-link.ts`](../../../packages/shared/src/midnite-link.ts)). `[M]`
- [ ] **E.5** Studio's [`composition.ts`](../../../apps/studio/src/composition.ts) lists modules rather than
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

- [ ] **G.1** [`midnite-link.ts`](../../../packages/shared/src/midnite-link.ts): `MIDNITE_APP_IDS` loses the
  retired ids; a link naming one resolves through `RETIRED_APP_ALIASES` to host + module instead of
  failing. Test every retired id round-trips. `[M]`
- [ ] **G.2** [`placement.ts`](../../../packages/shared/src/domain/placement.ts) places features on
  host apps (`forge → agents`, `media → ['agents','media','gamer']`, …) and
  [`mcp-tool-owners.ts`](../../../packages/shared/src/mcp-tool-owners.ts) re-homes tool owners
  (`forge.* → agents`), so an installed host serves exactly the tools its modules own. `[M]`
- [ ] **G.3** Launcher: when a retired app is installed, its host's tile shows *"Replaces Coder"* and
  offers to install the host; once the host is installed, opening the retired app's bookmark opens the
  host on that module, and the launcher offers to remove the old bundle. `[M]`
- [ ] **G.4** Data: on first launch a host imports a retired app's per-app data (settings, Capture's
  clipboard history and recordings index, Vault's per-app state) from that app's `userData`, once, with a
  marker so it never re-runs; the source is left in place. Vault secrets keep going through the runtime
  vault service, never copied as files. `[M]`
- [ ] **G.5** Each retired app gets one final release on its updater feed whose notes point to its host,
  so an existing install learns where it went. `[S]`

## Theme H — Retire the six apps `[M]`

- [ ] **H.1** Delete `apps/coder`, `apps/creator`, `apps/cleaner`, `apps/vault`, `apps/monitor`,
  `apps/capture` once G has shipped. `[S]`
- [ ] **H.2** Remove their legs from [`pack-bundle.mjs`](../../../scripts/pack-bundle.mjs),
  [`release-bundles.test.mjs`](../../../scripts/release-bundles.test.mjs),
  [`affected-apps.test.mjs`](../../../scripts/affected-apps.test.mjs),
  [`version-check.test.mjs`](../../../scripts/version-check.test.mjs) and
  [`app-window-guard.test.mjs`](../../../scripts/app-window-guard.test.mjs). `[M]`
- [ ] **H.3** Remove their logos from
  [`app-logos/`](../../../apps/launcher/src/renderer/assets/app-logos/) and
  [`generate-app-logos.cjs`](../../../apps/launcher/scripts/generate-app-logos.cjs) /
  [`app-icons.cjs`](../../../apps/launcher/scripts/app-icons.cjs); module glyphs are `react-icons`, not
  generated PNGs. `[S]`
- [ ] **H.4** Replace
  [`cleaner-install.proof.test.ts`](../../../apps/launcher/src/main/bundles/cleaner-install.proof.test.ts)
  with the same proof against Vanguard. `[S]`
- [ ] **H.5** `pnpm-lock.yaml` and the moon project graph carry no retired package; CI's
  affected-apps matrix no longer lists them. `[S]`

## Theme I — Docs `[S]`

- [ ] **I.1** [`docs/APPS.md`](../../../docs/APPS.md): the module layer, the app → modules table, the
  placement map, and a guide to turning a feature into a module. `[S]`
- [ ] **I.2** The layer rule in `CLAUDE.md`, `AGENTS.md` and `GEMINI.md` gains the module bullet, and the
  `apps/launcher` paragraph's app list is updated — the same edit in all three. `[S]`
- [ ] **I.3** [`docs/VAULT_SECURITY.md`](../../../docs/VAULT_SECURITY.md) names Vanguard as Vault's home. `[S]`

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

- [ ] `moon run :typecheck :lint :test` green (CI is the gate — see the no-local-gate note).
- [ ] `layer-boundaries.test.mjs` proves every new edge in both directions.
- [ ] The launcher lists exactly 11 apps, each tile showing its module chips; no Utilities heading.
- [ ] Packaged Agents opens with Agents, Coder and Creator nav groups; a Coder PR review and a Creator
  doc edit both work in it. *(human pass)*
- [ ] Packaged Vanguard shows Vault, Cleaner and Monitor groups; a secret set in Vault before the merge is
  still present after it. *(human pass)*
- [ ] A `midnite://open?app=coder&view=reviews` (retired-id) link opens Agents on the Coder module.
- [ ] With Coder installed, the launcher offers Agents and, once installed, offers to remove Coder.
  *(human pass)*
- [ ] Studio's visual baselines are unchanged.

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
- **Retired update feeds** *(open — recommend)*: one final release per retired app that points to its
  host (G.5), then the feed is frozen rather than deleted.
- **Studio's own nav** *(open)*: whether Studio also groups its nav by module, or keeps its flat rail —
  recommend flat for now, since "no behaviour change" is a guardrail.
