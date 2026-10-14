# Phase 113 — Midnite Apps suite split

**Written with the user** (via `/midnite-ideate`) · 2026-10-14 · every open decision takes the
recommended option, at the user's request.

Midnite Studio is one Electron app holding every feature. [PR #842](https://github.com/bilo-io/midnite-studio/pull/842)–[#845](https://github.com/bilo-io/midnite-studio/pull/845)
added [`apps/launcher`](../../../apps/launcher/) — **Midnite Apps**, a launcher with 13 tiles whose
every tile still opens Studio on a view through `midnite-studio://view?id=…[&tab=…|&page=…]`. This
phase turns those tiles into real, separately installable apps, **without** shipping one Chromium
per app: one shared runtime (option **B**), small per-app bundles, a thin Dock stub per app, and
Studio kept as the superset build every feature is still composed into.

> **Builds on:** the launcher ([`catalog.ts`](../../../apps/launcher/src/common/catalog.ts), its
> install/feed/plist code in [`apps/launcher/src/main/`](../../../apps/launcher/src/main/)), the
> detached pty broker ([`broker-client.ts`](../../../packages/desktop/src/main/broker-client.ts),
> [`desktop/src/broker/`](../../../packages/desktop/src/broker/)), the three `safeStorage` vaults over
> [`secure-store.ts`](../../../packages/desktop/src/main/secure-store.ts), the `midnite` CLI/MCP
> installer ([`cli-handlers.ts`](../../../packages/desktop/src/main/ipc/cli-handlers.ts)), the deep-link
> parser ([`protocol-parse.ts`](../../../packages/desktop/src/main/protocol-parse.ts)), the namespaced
> release tags and `generic` update feeds in `bilo-io/midnite-apps`, and
> [`userdata-migration.ts`](../../../packages/desktop/src/main/userdata-migration.ts).

> **Scope guardrails:**
> - **macOS arm64 only**, like everything else. No Linux/Windows leg.
> - **No new Chromium per app.** An app is a bundle the runtime loads, never its own Electron build.
> - **Package boundaries still hold** — `shared` stays zod-only, `git-engine` stays electron-free,
>   the renderer reaches main only through the bridge. The new layers add rules; they relax none.
> - **Studio keeps working at every step.** Every theme leaves `moon run :typecheck :lint :test`
>   green and the Studio build feature-complete; an app is extracted *from* Studio, never forked.
> - **Apps land in order, simplest first** (Themes H–S). A later app may not start until the
>   runtime themes it depends on (A–G) have the pieces it needs; it does not wait for all of them.

> **Effort tags:** `[S]` ≤ half a day · `[M]` 1–2 days · `[L]` 3+ days.

## Headlines

*One runtime, many small apps, Studio as the superset.* Planned 2026-10-14.

**Theme A — Placement map and vocabulary.** ◻ Every Studio feature assigned to the frame or one app; `runtime` / `frame` / `app` / `feature` named; the Phase 83 `apps` rail renamed `web-apps`.
**Theme B — Process model and Dock identity spike.** ◻ Prove how a small app gets its own Dock icon without its own Chromium, and pick the mechanism.
**Theme C — Package extraction scaffolding.** ◻ `packages/runtime`, `packages/frame`, the feature-package template and the eslint/moon rules that keep `app ← feature ← frame ← shared`.
**Theme D — Shared runtime services.** ◻ One vault, one broker, one CLI/MCP owner with app-contributed tools, one link router for every app.
**Theme E — Launcher becomes the runtime host.** ◻ `catalog.json`, per-app bundle install/update/uninstall, Dock stubs, its own Dock icon, launcher-owned updates, lockstep versions.
**Theme F — CI and release.** ◻ Affected-only bundle builds, one notarized runtime job, the release skills taught about bundles, the website installs the launcher.
**Theme G — Studio as superset, and the migration.** ◻ `apps/studio` composes every feature; existing Studio users move to the runtime with nothing lost.
**Theme H — App 1: Cleaner (pilot).** ◻ The first real bundle, end to end.
**Theme I — App 2: Monitor.** ◻ A Monitor view built from the status-bar readouts, System Health, Diagnostics and the crash log.
**Theme J — App 3: Vault.** ◻ The UI over the runtime's single vault.
**Theme K — App 4: Capture.** ◻ The first app built new rather than extracted.
**Theme L — App 5: Browser.** ◻ The browser plus the web-apps rail, with a reason to exist beyond the frame's browser panel.
**Theme M — App 6: Mind.** ◻ Notes, the Review feature and the notes quick-capture.
**Theme N — App 7: Agents.** ◻ Chats, councils, workflows, automation, models and MCP tools.
**Theme O — App 8: Coder.** ◻ Sessions, tasks, forge, reviews, actions, tests, API client and database.
**Theme P — App 9: Money.** ◻ Finance dashboard and markets, read-only first.
**Theme Q — App 10: Creator.** ◻ Docs, slides, images, audio, music and video.
**Theme R — App 11: Media.** ◻ A local media library server, mostly new.
**Theme S — App 12: Gamer.** ◻ Maps, terrains, models, sprites and games.

---

## The placement map (the contract Theme A writes down)

**The rule:** the **frame** holds tools every app wants; an **app** owns one area of work. The
**runtime** holds services no window owns.

| Layer | Holds |
|---|---|
| **runtime** (main, headless) | vault (all credentials), pty broker, `midnite` CLI + MCP server, link router, updater, app registry, window/Dock identity, `version` |
| **frame** (renderer chrome every app wears) | layout · `titlebar-status` · `status-bar` (incl. `battery`, `monitor` and `diagnostics` *segments*) · `terminal` · `companion` · `loops` · `quick-access` · `palette` · `browser` *panel* · `files` · `search` · `markdown` (renderer) · `themes` · `setup` · `settings` (frame pages + the running app's pages) · `activity` · `screensaver` (lock screen) · `weather` + `geo` (widget services) · **`knowledge`** (user decision) · the git **graph** and its write ops (`graph`, `commit`, `changes`, `diff`, `status`, `stash`, `rebase`, `conflicts`, `history`, `repos`) · `landing` (each app's home) · `dashboard` (widget grid; widgets belong to apps) |

| # | App | Studio features it takes |
|---|---|---|
| 1 | **Cleaner** | `optimizer` |
| 2 | **Monitor** | `monitor` (full view), `diagnostics` (problem list, crash log), System Health, token spend |
| 3 | **Vault** | secrets, forge accounts, DB credentials, LLM keys, web-app sign-ins |
| 4 | **Capture** | new: screenshots, recordings, clipboard history (builds on `clipboard-handlers`, `capture.ts`) |
| 5 | **Browser** | `browser` (full app), `apps` → **`web-apps`** rail |
| 6 | **Mind** | `notes`, Review (new) |
| 7 | **Agents** | `chats`, `councils`, **`workflows`** (user decision), `automate`, `agent`, `models` (Ollama), MCP tools |
| 8 | **Coder** | `sessions`, **`tasks`** (user decision), `forge`, `reviews`, `actions`, `tests`, `api-client`, `database` |
| 9 | **Money** | `finance`, `finance-dashboard`, markets |
| 10 | **Creator** | `media` doc/image/audio/video tabs, `slides`, the music editor |
| 11 | **Media** | new library server; reuses the media players |
| 12 | **Gamer** | `media` map/terrain/model/sprite/game tabs, games |
| — | **Studio** | everything above, composed — internal superset and dev harness |

---

## Deliverables

### Theme A — Placement map and vocabulary `[S]`
- [ ] Write `docs/APPS.md`: the layer rule, the placement map above (one row per folder in [`packages/app/src/features/`](../../../packages/app/src/features/)), and the runtime / frame / app / feature vocabulary.
- [ ] Rename the Phase 83 third-party rail from `apps` to `web-apps` — [`features/apps/`](../../../packages/app/src/features/apps/), [`domain/apps.ts`](../../../packages/shared/src/domain/apps.ts), [`apps-service.ts`](../../../packages/desktop/src/main/apps-service.ts), the `apps` settings page id — with a persisted-state migration in [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) so nobody loses an enabled web app.
- [ ] Use "frame" in code and docs for the cross-app chrome, never "shell", so it cannot be confused with `@bilo-io/shell`.
- [ ] Update the launcher catalog so each tile's features match the map (Coder gains Tasks; Agents keeps Graphs = workflows; Knowledge leaves Mind for the frame).
- [ ] A vitest that fails when a folder in `features/` is missing from the map in `docs/APPS.md`'s machine-readable twin (`apps/placement.json` or similar).

### Theme B — Process model and Dock identity spike `[M]`
- [ ] Spike 1: one runtime process, app windows inside it, a stub `.app` that forwards to it. Measure whether macOS shows the *stub's* icon and name in the Dock and ⌘-Tab.
- [ ] Spike 2: one process per app from a stub `.app` whose `Frameworks/` symlinks to the runtime's Electron framework, with shared services reached over a socket. Measure Dock identity, disk per app, and idle memory per running app (`scripts/perf/idle-cpu.mjs`-style, from outside).
- [ ] Check code signing and notarization for each spike: does a stub with a symlinked framework pass `codesign --verify --deep` and Gatekeeper?
- [ ] Pick one and record it in Decisions with the measured numbers. Recommended default if both work: **Spike 2** (own Dock icon, crash isolation), with services in a runtime daemon.

### Theme C — Package extraction scaffolding `[L]`
- [ ] Create `packages/runtime` (main-only, may import `electron`) and `packages/frame` (renderer chrome, bridge-only), and move the first frame pieces out of [`app.tsx`](../../../packages/app/src/app.tsx) behind them.
- [ ] Define the feature-package template: `packages/features/<name>/` with `renderer/`, `main/` and a `manifest.ts` (views, settings pages, IPC handlers, MCP tools, rail entries) the app composer reads.
- [ ] Extend [`eslint.config.mjs`](../../../eslint.config.mjs): an app may import features and the frame; a feature may import the frame and `shared` but never an app or another feature; the frame never imports a feature.
- [ ] Add moon tags and `.moon/workspace.yml` globs so `moon run :typecheck :lint :test` covers the new packages and `moon query projects --affected` can say which apps a change touches.
- [ ] Split `VIEW_IDS` and `SETTINGS_PAGE_IDS` ([`view.ts`](../../../packages/shared/src/domain/view.ts)) into per-feature registrations that the Studio build still unions into today's exact lists (no persisted id changes).

### Theme D — Shared runtime services `[L]`
- [ ] Move the three vaults ([`secrets-vault.ts`](../../../packages/desktop/src/main/secrets-vault.ts), [`forge-account-vault.ts`](../../../packages/desktop/src/main/forge/forge-account-vault.ts), [`credential-vault.ts`](../../../packages/desktop/src/main/db/credential-vault.ts)) behind one runtime vault service, so `safeStorage` is keyed to the runtime's identity and every app reads through it — the wire still says only `hasToken`.
- [ ] The pty broker becomes a runtime service every app attaches to; keep the build-fingerprinted socket naming in [`broker-client.ts`](../../../packages/desktop/src/main/broker-client.ts) so a runtime update still finds the previous broker as a legacy peer.
- [ ] The runtime owns the `midnite` CLI and MCP server ([`cli-handlers.ts`](../../../packages/desktop/src/main/ipc/cli-handlers.ts), [`mcp/`](../../../packages/desktop/src/main/mcp/)); each app's manifest contributes its tools, and a tool whose app is not installed is not listed.
- [ ] A link router: `midnite://open?app=<id>&view=…[&tab=…|&page=…]` opens the right app (installing nothing, launching it if installed, falling back to Studio, then to the launcher's tile). `midnite-studio://` keeps working by forwarding.
- [ ] Cross-app hand-off ("open this commit in Coder" from Agents) goes through the router, never a direct import.
- [ ] Tests for vault access from two apps, broker attach from two apps, tool listing per installed set, and every router fallback.

### Theme E — Launcher becomes the runtime host `[L]`
- [ ] Publish `catalog.json` in `bilo-io/midnite-apps` (apps, bundle URLs, sizes, checksums, minimum runtime version); the launcher reads it instead of the hard-coded `version.json` path in [`feed.ts`](../../../apps/launcher/src/main/feed.ts) and keeps [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts) only as copy and fallback.
- [ ] Install, update and uninstall per app bundle, reusing [`install.ts`](../../../apps/launcher/src/main/install.ts)'s verify-then-swap, and writing/removing that app's Dock stub (Theme B's mechanism) in `/Applications`.
- [ ] The launcher owns updates: one electron-updater in the runtime ([`update-service.ts`](../../../packages/desktop/src/main/update-service.ts)'s `generic` feed), app bundles updated with it. No app runs its own updater.
- [ ] Lockstep versions: runtime and every bundle share one version; the launcher refuses a bundle whose version does not match the runtime.
- [ ] The tile states (Installed / Update / Not installed) come from installed bundles, not from detecting Studio; "Move to Trash…" removes one app, not the suite.
- [ ] The launcher keeps its **own Dock icon and name** (`Midnite Apps`, [`resources/icon.icns`](../../../apps/launcher/resources/icon.icns)), distinct from every app stub, packaged and in `moon run launcher:start` (no stock Electron icon in dev either).

### Theme F — CI and release `[M]`
- [ ] One notarized macOS `dist` job for the runtime; app bundles built as artifacts only when `moon query projects --affected` names them. Count the macOS jobs against the cap of 5 before adding any.
- [ ] Teach [`/midnite-release-complete`](../../../.claude/skills/midnite-release-complete/SKILL.md) and `/midnite-release-prep` to publish bundles and `catalog.json` beside the existing namespaced tags, keeping lockstep.
- [ ] The launcher and every public app keep Damion, never Quick Kiss; add a check that no app bundle ships `quick-kiss.ttf`.
- [ ] The website's install link installs **the launcher**, not Studio: a launcher DMG and install script published in `bilo-io/midnite-apps`, [`download-page.tsx`](../../../packages/website/src/pages/download-page.tsx) and [`use-latest-version.ts`](../../../packages/website/src/pages/use-latest-version.ts) pointed at it, and the verbatim `public/install.sh` copy plus [`website-sync-install.mjs`](../../../scripts/website-sync-install.mjs) guard following the new script.

### Theme G — Studio as superset, and the migration `[M]`
- [ ] `apps/studio` composes every feature and the frame and replaces today's direct [`packages/app`](../../../packages/app/) entry; it is the dev harness (`moon run studio:start`) and stays installable for power users.
- [ ] Extend [`userdata-migration.ts`](../../../packages/desktop/src/main/userdata-migration.ts) so a current Studio user's settings, vault entries, sessions and windows move to the runtime's data directory on first launch, with a one-time backup.
- [ ] Existing installs keep updating: the last Studio-only release's updater points at the runtime build.
- [ ] Update `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` (identical edits) with the new boundaries and the layer rule.

### Theme H — App 1: Cleaner (pilot) `[M]`
- [ ] Extract `optimizer` into `packages/features/optimizer` and compose `apps/cleaner`: manifest, accent `#14b8a6`, its own home view.
- [ ] Ship it end to end through Themes B–F: build, catalog entry, launcher install, Dock stub, open from the tile, uninstall.
- [ ] Write down every friction point in this doc's Headlines before Theme I starts.

### Theme I — App 2: Monitor `[M]`
- [ ] Give Monitor a real view (not Settings pages) built from [`features/monitor/`](../../../packages/app/src/features/monitor/), [`features/diagnostics/`](../../../packages/app/src/features/diagnostics/), [`system-health.ts`](../../../packages/desktop/src/main/system-health.ts) and [`metrics/`](../../../packages/desktop/src/main/metrics/).
- [ ] Add a broker and sessions readout (what is running, for how long) and token spend per agent.
- [ ] The status-bar segments stay in the frame and deep-link into Monitor when it is installed.

### Theme J — App 3: Vault `[M]`
- [ ] A Vault app over Theme D's service: list, add, rotate and remove secrets, forge accounts, DB logins, LLM keys and web-app sign-ins; never show a stored value back.
- [ ] Per-app grants: which installed apps may read which entries.
- [ ] Move the matching Studio settings pages into the Vault feature; Studio keeps them through composition.

### Theme K — App 4: Capture `[M]`
- [ ] Region, window and full-screen screenshots and screen recordings, with the macOS Screen Recording permission requested and explained in-app.
- [ ] A global shortcut and clipboard history (building on [`clipboard-handlers.ts`](../../../packages/desktop/src/main/ipc/clipboard-handlers.ts)).
- [ ] Send a capture to an agent chat, a PR comment or a Creator project through the link router.

### Theme L — App 5: Browser `[S]`
- [ ] Compose `apps/browser` from the `browser` feature and the `web-apps` rail.
- [ ] Settle what the app adds over the frame's browser panel (full-window browsing, agent-driven sessions, web apps) and write it in `docs/APPS.md`.

### Theme M — App 6: Mind `[M]`
- [ ] Extract `notes` into a feature; compose `apps/mind` with Notes and the frame's Knowledge.
- [ ] Build Review: notes turned into cards and scheduled for spaced practice.
- [ ] The frame's quick-access "N" capture writes into Mind's store when Mind is installed, and into a local inbox otherwise.

### Theme N — App 7: Agents `[L]`
- [ ] Extract `chats`, `councils`, `workflows`, `automate`, `agent` and `models` into features; compose `apps/agents`.
- [ ] MCP tools management (today Settings ▸ MCP Server) becomes Agents' Tools view.
- [ ] Agent sessions launched from Agents appear in Coder's Sessions when both are installed, through the shared broker.

### Theme O — App 8: Coder `[L]`
- [ ] Extract `sessions`, `tasks`, `forge`, `reviews`, `actions`, `tests`, `api-client` and `database`; compose `apps/coder` on the frame's git graph.
- [ ] Move the forge-poll and forge-project handlers with their features; forge credentials come only from the runtime vault.
- [ ] Coder's Tasks keeps the agent hand-off from [Phase 92](phase-92-agentic-execution-from-projects.md), routing to Agents when installed.

### Theme P — App 9: Money `[L]`
- [ ] Extract `finance`, `finance-dashboard` and markets into features; compose `apps/money` with its own home instead of Studio's dashboard.
- [ ] Brokerage and exchange accounts are read-only: balances, positions, allocation and performance. Keys live in the vault.
- [ ] Record trading (placing orders) as deferred in [`outstanding.md`](../outstanding.md).

### Theme Q — App 10: Creator `[L]`
- [ ] Extract the media doc, image, audio and video tabs, `slides` and the music editor into features; compose `apps/creator`.
- [ ] The media MCP tools for those tabs register through Creator's manifest.
- [ ] Shared media plumbing (providers, players, caches) moves to a feature Creator, Media and Gamer can all compose.

### Theme R — App 11: Media `[L]`
- [ ] A library: point at folders, scan films, shows, music and photos, fetch artwork and metadata, and keep watch progress.
- [ ] Local playback through the shared media players; LAN streaming to other devices with ffmpeg transcoding as the stretch item.
- [ ] Compose `apps/media`; nothing leaves the local network unless the user turns it on.

### Theme S — App 12: Gamer `[L]`
- [ ] Extract the map, terrain, model, sprite and game tabs and the games main-process code into features; compose `apps/gamer` on the shared media feature.
- [ ] The map, terrain, model and game MCP tools register through Gamer's manifest.
- [ ] Finish the play-test loop that [Phase 107](phase-107-games.md) left open, inside Gamer.

---

## Files this phase touches

- [`apps/launcher/`](../../../apps/launcher/) — becomes the runtime host: catalog, bundle install/update, Dock stubs.
- `apps/<app>/` (new) — one composition per app: Cleaner, Monitor, Vault, Capture, Browser, Mind, Agents, Coder, Money, Creator, Media, Gamer, Studio.
- `packages/runtime/`, `packages/frame/`, `packages/features/*` (new) — the runtime services, the cross-app chrome and the extracted features.
- [`packages/app/`](../../../packages/app/) and [`packages/desktop/`](../../../packages/desktop/) — shrink as features move out; end as the Studio composition's internals.
- [`packages/shared/src/domain/view.ts`](../../../packages/shared/src/domain/view.ts), [`domain/apps.ts`](../../../packages/shared/src/domain/apps.ts), [`studio-link.ts`](../../../packages/shared/src/studio-link.ts) — per-feature view registration, the `web-apps` rename, the `midnite://` link builders.
- [`packages/desktop/src/main/protocol-parse.ts`](../../../packages/desktop/src/main/protocol-parse.ts) — the router's parser.
- [`eslint.config.mjs`](../../../eslint.config.mjs), [`.moon/workspace.yml`](../../../.moon/workspace.yml), [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) — boundaries, project discovery, affected-only builds.
- [`packages/desktop/electron-builder.yml`](../../../packages/desktop/electron-builder.yml) — the runtime's build; per-app stubs.
- `docs/APPS.md` (new), `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` — the layer rule and placement map.

---

## Verification

- [ ] `moon run :typecheck :lint :test` passes after every theme, with Studio still feature-complete.
- [ ] The eslint boundary rules reject a feature importing an app, a feature importing another feature, and the frame importing a feature (one fixture each).
- [ ] Every folder in `packages/app/src/features/` appears in the placement map (Theme A's test).
- [ ] Cleaner installs from the launcher, opens from its own Dock icon, and uninstalls, on a clean macOS user account.
- [ ] With two apps open, one login is seen by both, a terminal opened in one is reachable from the other, and `midnite` lists only installed apps' MCP tools.
- [ ] A current Studio install migrates to the runtime with settings, vault entries and sessions intact (human pass on a copy of a real profile).
- [ ] Disk and idle memory for runtime + two apps measured and recorded against Studio alone.
- [ ] Each app's launcher tile installs that app's bundle rather than opening Studio.

---

## Decisions / open questions

1. **Option A or B?** Resolved: **B**, one shared runtime, small app bundles, thin Dock stubs.
2. **Launcher stack?** Resolved: **Electron**; the launcher is the runtime host, so its ~100 MB is the runtime itself.
3. **Shared or isolated state?** Resolved: **shared**. Credentials, the broker, the CLI and the MCP server belong to the runtime; apps reach them through it.
4. **Frame or app?** Resolved: the frame holds tools every app wants; an app owns one area of work. User placements: **tasks → Coder**, **workflows → Agents**, **knowledge → the frame**.
5. **What is Studio?** Resolved: the **internal superset and dev harness**, still installable for power users, with a migration path for current users.
6. **Who owns updates?** Resolved: **the launcher/runtime**; no app runs its own updater.
7. **Versioning?** Resolved: **lockstep**, matching today's release skills.
8. **CI?** Resolved: **affected-only** bundle builds, one notarized runtime job, within the 5-concurrent-macOS-job cap.
9. **Naming?** Resolved: **runtime / frame / app / feature**; the Phase 83 rail becomes **`web-apps`**; "shell" is never used for our own layer.
10. **Dock identity mechanism?** Open until Theme B: recommended **one process per app from a stub with a symlinked Electron framework**, services in a runtime daemon, if signing and notarization allow it.
11. **Notes quick-capture?** Recommended: stays in the frame and writes into Mind when Mind is installed.
12. **Money trading?** Recommended: deferred; this phase ships read-only accounts.
13. **Media streaming?** Recommended: local playback in scope; LAN streaming with transcoding is the stretch item.
14. **Home, Learn and Connect?** Resolved: not separate apps in this phase — Learn became Mind's Review, Connect became Agents' Models and Tools, Home waits for something real to open.
