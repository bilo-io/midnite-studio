# Phase 33 — Application Installation, CLI Tool & Desktop Integration

**Refined: x1** · 2026-08-30 · functionality, persistence, security, testing, signing & release, observability, sequencing, acceptance criteria, file-map, out-of-scope

> **Builds on**: [Phase 11 · Packaging + docs](phase-11-packaging.md), [Phase 16 · Folder explorer, preview pane + settings pages](phase-16-explorer-and-settings-pages.md), and [Phase 27 · Status bar & browser panel](phase-27-status-bar-and-browser-panel.md).
>
> **Hard prerequisite — the Midnite Studio rename.** Every user-facing identifier this phase
> creates is a name: the CLI binary, the URL scheme, the bundle id, the completion filenames. The
> app is being renamed from *Midnite Git* to **Midnite Studio** (repo folder `midnite-studio`,
> package names, `appId`, `productName`), and this phase is written against the **new** names
> throughout. That rename is its own phase and its own PR — it is a repo-wide identifier sweep
> that also has to migrate the persisted `midnite-git.ui` localStorage key, and it must land
> before Theme A. **The internal IPC channel prefix stays `mgit:`** and is swept by the rename
> phase, not by this one; do not invent a `mstudio:` prefix here, or the new channels will
> disagree with the 456-line registry they live in.
>
> **Scope guardrails**: macOS arm64/Apple Silicon distribution focus. Delivers a production-grade
> DMG installer with background layout, a system `midnite-studio` CLI tool installer + shell
> completion, a custom `midnite-studio://` deep-linking protocol scheme, an auto-updater pipeline,
> and first-run setup onboarding. Windows `.msi` and Linux `.deb`/`.rpm` packages are explicitly
> deferred — the app is macOS-arm64-first and an Intel or Windows build would need `node-pty`
> rebuilt on its own runner to be correct.
>
> **Sequencing**: **C before B** — the CLI is a thin shell wrapper over the protocol, so it has
> nothing to talk to until the scheme is registered and parsed. **A and D are independent** of
> both and of each other, and can go in parallel. **E lands last**: its checklist reuses
> `bridge().cli.install` from B and the `version < 5` store bump from D, so building it first
> means writing the migrate arm twice. A partial landing of C alone is safe (a registered scheme
> that focuses the window); a partial landing of B without C ships a binary that silently does
> nothing.
>
> **Effort tags**: `S` ≈ half a day, `M` ≈ a day, `L` ≈ two days or more.

---

## Deliverables

### Theme A — Polished DMG Package & macOS Desktop Integration (S/M/L: M)

- [ ] Add a `dmg:` block to [`packages/desktop/electron-builder.yml`](../../../packages/desktop/electron-builder.yml) laying out the installer window.
  - `dmg: { window: { width: 660, height: 400 }, background: resources/dmg-background.png,
    title: '${productName} ${version}', contents: [{ x: 180, y: 210, type: 'file' },
    { x: 480, y: 210, type: 'link', path: '/Applications' }] }`.
  - The asset path is `resources/…`, **not** `build/…`: `directories.buildResources` is already
    set to `resources` and no `build/` directory exists in this package.
  - *Acceptance*: `moon run desktop:dist` emits `packages/desktop/release/midnite-studio-0.1.0-arm64.dmg`;
    mounting it shows the app icon left of an `/Applications` alias, both vertically centred.
- [ ] Add `packages/desktop/resources/dmg-background.png` **and** `dmg-background@2x.png` (net-new).
  - **PNG, not SVG** — the dmg background is composited by Finder as a raster and an SVG is
    silently ignored, which is why the pre-refinement "PNG or SVG" wording had to be settled.
  - Exactly `660×400` and `1320×800`; electron-builder picks the `@2x` file automatically when
    both are present.
  - Dark ground `#09090b` (the `INITIAL_BACKGROUND` constant in
    [`window.ts`](../../../packages/desktop/src/main/window.ts)), the midnite crescent, and an
    arrow spanning the two icon coordinates from the item above.
  - *Acceptance*: `sips -g pixelWidth` reports `660` and `1320` respectively.
- [ ] Add `packages/desktop/resources/entitlements.mac.plist` and `entitlements.mac.inherit.plist` (net-new), referenced by `mac.entitlements` / `mac.entitlementsInherit`.
  - `hardenedRuntime: true` is **already set** in the yml. Under a hardened runtime with no
    entitlements the bundle cannot spawn `node-pty`'s `spawn-helper` or dugite's git, so a signed
    build launches and then fails at the first terminal or git call.
  - Required keys: `com.apple.security.cs.allow-jit`,
    `com.apple.security.cs.allow-unsigned-executable-memory`,
    `com.apple.security.cs.disable-library-validation`,
    `com.apple.security.cs.allow-dyld-environment-variables`; the inherit file carries
    `com.apple.security.inherit`.
- [ ] Register the URL scheme via a `protocols:` block in `electron-builder.yml`.
  - `protocols: [{ name: 'Midnite Studio', schemes: ['midnite-studio'], role: 'Viewer' }]`.
  - **Protocol only.** File associations (`.git`, `.patch`) were bundled into this item before and
    are now out of scope — see *Not in this phase*.
  - *Acceptance*: after installing the built app, `/usr/bin/open 'midnite-studio://open?repo=/tmp'`
    launches or focuses it.
- [ ] Create `packages/desktop/scripts/notarize.cjs` (net-new) as an **`afterSign`** hook, env-gated.
  - `exports.default = async function notarize(context)`; returns early with a
    `[notarize] skipped` line unless all of `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
    `APPLE_TEAM_ID` are set; otherwise calls `notarize({ appBundleId, appPath, ... })` from
    `@electron/notarize` (add to `devDependencies` — it is not currently a dependency).
  - **`afterSign`, not `afterPack`**: `afterPack` runs *before* signing, and notarization requires
    an already-signed bundle. The existing
    [`afterpack.cjs`](../../../packages/desktop/scripts/afterpack.cjs) ad-hoc signer stays exactly
    as it is — it is what makes an unsigned local build launch at all.
  - *Acceptance*: with no Apple env vars set, `moon run desktop:dist` still exits 0.
- [ ] Create `packages/desktop/scripts/verify-dist.mjs` (net-new) — a bundle integrity gate, and wire it as a moon task.
  - Exits non-zero naming the failing check. Asserts: both
    `release/midnite-studio-${version}-arm64.dmg` and `.zip` exist and exceed 50 MB;
    `codesign --verify --deep --strict 'release/mac-arm64/Midnite Studio.app'` exits 0;
    `hdiutil verify <dmg>` exits 0; the bundle's `Info.plist` `CFBundleURLSchemes` contains
    `midnite-studio`.
  - **`spctl --assess` is deliberately not asserted** — it fails by design on an ad-hoc-signed
    build, which is every build without a Developer ID cert.
  - Task `verify-dist` in [`packages/desktop/moon.yml`](../../../packages/desktop/moon.yml) with
    `deps: ['~:dist']`, `options: { runInCI: false, cache: false }` — matching `dist`, which sets
    no `outputs` because the ~200 MB artifacts break moon's CAS with `cas::read_failed`.
- [ ] Rename the bundle identity constants to Midnite Studio.
  - `appId: io.bilo.midnite-studio`, `productName: Midnite Studio`,
    `artifactName: midnite-studio-${version}-${arch}.${ext}` in the yml;
    `app.setName('Midnite Studio')` in [`main/index.ts`](../../../packages/desktop/src/main/index.ts);
    `APP_NAME` and `LEGACY_APP_NAME` in
    [`scripts/install-local.mjs`](../../../packages/desktop/scripts/install-local.mjs).
  - `LEGACY_APP_NAME` must become `'Midnite Git.app'` so the old bundle is removed from
    `/Applications` rather than left beside the new one for Spotlight to launch.
- [ ] Run `verify-dist` in CI after packaging.
  - Add a step to the `package` job in [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)
    running `pnpm exec moon run desktop:verify-dist` between `desktop:dist` and the artifact upload,
    so a bundle that cannot pass `codesign --verify` never becomes a downloadable artifact.

### Theme B — `midnite-studio` CLI Binary & System PATH Symlinking (S/M/L: L)

- [ ] Create the executable wrapper `packages/desktop/resources/bin/midnite-studio` (net-new), a POSIX `sh` script.
  - **Grammar** (the whole surface): `midnite-studio [path]`, `midnite-studio open <path>`,
    `midnite-studio clone <url>`, `midnite-studio --version`, `midnite-studio --help`.
  - Resolves a relative path with `cd "$1" && pwd`; stock macOS has no `realpath` for files.
  - Percent-encodes the resolved path and execs
    `/usr/bin/open "midnite-studio://open?repo=<encoded>"`.
  - **Dispatch is one-way**: the wrapper exits 0 once `open` succeeds and cannot report what the
    app did with the request. See *Decisions* for why a socket was rejected.
  - `--version` prints the version substituted at build time; `--help` prints the grammar above.
- [ ] Create `packages/desktop/src/main/cli-path.ts` (net-new) — pure and electron-free.
  - `export type CliInstallState = { installed: boolean; path: string | null; target: string | null; managed: boolean }`
  - `export function preferredTargets(home: string): string[]` →
    `['/usr/local/bin/midnite-studio', join(home, '.local/bin/midnite-studio')]`
  - `export function pathExportLine(dir: string): string` → `export PATH="<dir>:$PATH"`
  - Electron-free on purpose so it unit-tests under desktop's vitest, whose config comments
    "Only electron-free modules are unit-tested here".
- [ ] Define the CLI channels in [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts).
  - In `CHANNELS`: `cliStatus: 'mgit:cli:status'`, `cliInstall: 'mgit:cli:install'`,
    `cliUninstall: 'mgit:cli:uninstall'`.
  - camelCase keys, `mgit:<domain>:<verb>` values —
    [`ipc.test.ts`](../../../packages/shared/src/ipc/ipc.test.ts) already asserts both the prefix
    and uniqueness, so a `CLI_CHECK_STATUS`-style name fails the suite.
- [ ] Add the CLI schemas to [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) under a `// --- cli (Phase 33) ---` banner.
  - `export const CliStatusResponse = z.object({ installed: z.boolean(), path: z.string().nullable(), target: z.string().nullable(), managed: z.boolean() });`
  - `export const CliInstallRequest = z.object({ target: z.enum(['auto', 'user']).default('auto') });`
  - `export const CliInstallResponse = GitOpResultOf(CliStatusResponse);` and the same for
    `CliUninstallResponse`.
  - **Reuse `GitOpResultOf`, do not invent an envelope**: a permission denial is a normal outcome
    the UI renders as `{ok:false, kind:'error'}`, never a thrown error across IPC.
- [ ] Create `packages/desktop/src/main/ipc/cli-handlers.ts` (net-new) — `export function registerCliHandlers(): void`.
  - `handleBare(CHANNELS.cliStatus, …)` and `handleOp(CHANNELS.cliInstall, schemas.CliInstallRequest, …)`
    from [`ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts).
  - Install symlinks `Contents/Resources/bin/midnite-studio` to the first writable entry of
    `preferredTargets(homedir())`; on `EACCES`/`EPERM`/`EROFS` from `/usr/local/bin` it retries
    `~/.local/bin`, creating the directory with `mkdir -p`.
  - **Never `sudo`, never `osascript`** — see *Decisions*.
  - `managed: true` only when `readlink(target)` resolves inside the app bundle. A `midnite-studio`
    on `PATH` that someone else put there is reported but **never overwritten and never deleted**.
  - Registered with one line in the `app.whenReady()` block of `main/index.ts`, beside
    `registerFsHandlers()`.
- [ ] Expose the `cli` group on the preload bridge and its type.
  - [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts):
    `cli: { status: () => call(CHANNELS.cliStatus), install: (req) => call(CHANNELS.cliInstall, req), uninstall: () => call(CHANNELS.cliUninstall) }`.
  - Add `| 'cli'` to the `Pick<MidniteGitBridge, …>` union in the same file — that union is what
    makes a half-wired group a compile error rather than a runtime `undefined`.
  - Matching `cli` group on `MidniteGitBridge` in
    [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), using
    `In<typeof S.CliInstallRequest>`.
- [ ] Generate shell completions in `packages/desktop/resources/completions/` (net-new): `_midnite-studio` (zsh), `midnite-studio.bash`, `midnite-studio.fish`.
  - They complete **exactly** the grammar above and nothing else: the subcommands `open` and
    `clone`, and the flags `--version` and `--help`. `open` completes directories; `clone`
    completes nothing.
  - Shipped through `extraResources` so they land in `Contents/Resources/completions`.
  - Install surfaces the `fpath+=(…)` / `source …` line as copyable text; **this phase never edits
    the user's shell rc** — an installer that rewrites `.zshrc` is a support burden and a
    surprise.
- [ ] Add `packages/app/src/features/settings/settings-pages/cli-page.tsx` (net-new) — `export function CliPage()`.
  - **Four registration edits, all required** (two are `Record<SettingsPageId, …>` maps, so a
    miss is a type error): the `SettingsPageId` union and
    `{ id: 'cli', label: 'CLI Integration', group: 'system' }` in `SETTINGS_PAGES`
    ([`ui-store.ts`](../../../packages/app/src/store/ui-store.ts)); `cli: LuTerminal` in
    `SETTINGS_PAGE_ICON` ([`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts));
    `cli: () => <CliPage />` in `PAGE_CONTENT`
    ([`settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx)).
  - Layout follows `graph-page.tsx`: root `<div className="flex flex-col gap-3">`, one
    `<Accordion title="Command line" icon={<LuTerminal className="h-4 w-4" />} defaultOpen>`, body
    `<div className="flex flex-col gap-4 p-3">` built from `Field` in
    [`controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx).
  - Icons must come from `react-icons` — `SETTINGS_PAGE_ICON` is typed `Record<SettingsPageId, IconType>`.
- [ ] Specify every state the CLI page can be in.
  - **No bridge** (`hasBridge() === false` — jsdom and any browser context): render the field with
    the button disabled and the hint `Available in the desktop app.` The house rule is that
    `bridge()` returns `undefined` and components degrade rather than crash.
  - **Installed**: the resolved path in `text-xs text-muted-foreground`, plus an *Uninstall* button.
  - **Installed but unmanaged**: show the path and disable *Uninstall*, with the hint
    `Managed outside Midnite Studio.`
  - **Fell back to `~/.local/bin` and it is not on `PATH`**: render `pathExportLine(dir)` in a
    selectable `<code>` block.
  - **Error**: the `{ok:false}` arm's `message` inline in `text-destructive`, and one
    `addToast({ message, status: 'error' })`.
- [ ] Stub the `cli` group in [`packages/app/e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts).
  - Add to the object assigned to `window.midniteGit`, returning
    `{ installed: false, path: null, target: null, managed: false }`.
  - Without this, every existing spec that mounts Settings (`settings-pages.spec.ts`) fails —
    `installMockBridge` is serialised through `addInitScript` and replaces the bridge wholesale.

### Theme C — `midnite-studio://` Custom Protocol Handler & Deep-Link Dispatch (S/M/L: M)

- [ ] Call `app.setAsDefaultProtocolClient('midnite-studio')` in [`main/index.ts`](../../../packages/desktop/src/main/index.ts).
  - Inside the existing single-instance `else` block, before `app.whenReady()`.
  - In development (`!app.isPackaged`) it must be the three-argument form —
    `setAsDefaultProtocolClient('midnite-studio', process.execPath, [resolve(process.argv[1])])` —
    or the scheme registers against the Electron binary itself and a deep link opens a blank
    Electron app instead of Midnite Studio.
- [ ] Extend the **existing** single-instance handler with a payload path — do not add a second one.
  - `app.requestSingleInstanceLock()` and the `second-instance` restore/focus handler **already
    exist** at `main/index.ts:122-129`. This item only adds the URL forwarding after the existing
    focus call.
  - `second-instance` gains its `argv` parameter and forwards the first member matching
    `midnite-studio://`.
  - Add `app.on('open-url', (event, url) => { event.preventDefault(); … })` — on macOS a
    **warm-start** deep link arrives through `open-url` and never appears in `argv`, so handling
    only `second-instance` silently drops every link that arrives while the app is already running.
  - **Cold start**: a URL already present in `process.argv` at boot is held and dispatched once the
    renderer has subscribed (see the buffering item below).
- [ ] Create `packages/desktop/src/main/protocol-parse.ts` (net-new) — pure and electron-free.
  - `export type DeepLink = { kind: 'open'; repo: string } | { kind: 'clone'; url: string }`
  - `export function parseDeepLink(raw: string): DeepLink | null`
  - Built on `new URL()`; note `midnite-studio://open?repo=…` puts `open` in `.hostname`, not
    `.pathname`.
  - **Returns `null`, never throws**, for every one of: a scheme that is not `midnite-studio:`; an
    unknown host; a missing or empty parameter; a `repo` that is not absolute; a `repo` containing
    a NUL byte; and a `clone` url whose scheme is not `https:`, `ssh:` or `git:`. A malformed URL
    is a normal outcome — anyone can type one.
- [ ] Enforce the deep-link jail in main before anything is opened.
  - A parsed `open` whose resolved path is **already registered** in `repos.json` (via
    [`repo-registry.ts`](../../../packages/desktop/src/main/repo-registry.ts)) is dispatched
    silently — that is the `midnite-studio .` case and it must stay one gesture.
  - Any other path is dispatched as a **proposal** and is never opened by main directly.
  - The reason, stated so nobody relaxes it later: a URL is remote-triggerable — any web page can
    issue one — so a deep link may not add a repository to the app without consent.
- [ ] Add the deep-link event channel and its preload subscriber.
  - `EVENT_CHANNELS.deepLink: 'mgit:protocol:deep-link'`, payload
    `{ link: DeepLink; known: boolean }`.
  - Pushed behind the `const win = getWindow(); if (!win || win.isDestroyed()) return;` guard,
    exactly as [`metrics-handlers.ts`](../../../packages/desktop/src/main/ipc/metrics-handlers.ts) does.
  - Preload: `protocol: { onDeepLink: (h) => subscribe(EVENT_CHANNELS.deepLink, h) }` returning
    `Unsubscribe`, plus `| 'protocol'` on the `Pick<>` union and the matching `bridge.ts` entry.
- [ ] Create `packages/app/src/services/deep-link.ts` (net-new) — `export function useDeepLinks(): void`.
  - Mounted once from [`app.tsx`](../../../packages/app/src/app.tsx), modelled on
    [`watch-invalidation.ts`](../../../packages/app/src/services/watch-invalidation.ts) — the
    existing subscribe-inside-a-hook service, whose teardown returns the `Unsubscribe`.
  - `known: true` → select that repo and switch to the graph view.
  - `known: false` → `useDialogs().confirm({ title: 'Open this repository?', body: <the absolute
    path>, confirmLabel: 'Open', onConfirm })` from
    [`dialog-host.tsx`](../../../packages/app/src/components/dialog-host.tsx).
  - `kind: 'clone'` → open the existing clone dialog prefilled with the url.
- [ ] State the concurrency rule for overlapping links.
  - A deep link arriving while a previous proposal's confirm is still open **replaces** it; only
    the newest is ever acted on, because a queue of stacked confirm dialogs is unreadable.
  - A link arriving before the renderer has subscribed is buffered in main in a **single slot,
    newest wins**, and flushed on the first `onDeepLink` subscription. This is what makes cold
    start work.
- [ ] Drop links whose target no longer exists.
  - Main `stat`s the path before pushing; a missing directory pushes nothing and writes one line
    through [`main/log.ts`](../../../packages/desktop/src/main/log.ts).
  - Silent by design: a stale link in someone's notes should not raise a dialog on launch.

### Theme D — Auto-Updater Service & Update Status Banner (S/M/L: L)

- [ ] Add `electron-updater` to `dependencies` (not `devDependencies`) in [`packages/desktop/package.json`](../../../packages/desktop/package.json).
  - Import it as the **named** binding: `import { autoUpdater } from 'electron-updater'`. The
    default import is `undefined` under `module: commonjs` and crashes main at boot — recorded in
    [`outstanding.md`](../outstanding.md) and worth repeating here because it is a boot crash,
    not a type error.
- [ ] Create `packages/desktop/src/updates/update-state.ts` (net-new) — pure and electron-free.
  - `export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'`
  - `export type UpdateState = { phase: UpdatePhase; version: string | null; percent: number | null; error: string | null; manualInstall?: boolean }`
  - Constructors `checkingState()`, `availableState(info)`, `notAvailableState()`,
    `downloadingState(progress, version)`, `downloadedState(info)`, `errorState(err, version)`,
    plus `IDLE_STATE`.
  - `downloadingState` clamps: `Math.max(0, Math.min(100, Math.round(progress.percent ?? 0)))` —
    electron-updater reports fractional and occasionally out-of-range percentages.
- [ ] Create `packages/desktop/src/updates/feed-channel.ts` (net-new) — pure.
  - `export type UpdateChannel = 'stable' | 'beta'`
  - `export function feedChannelFor(c: UpdateChannel): { channel: string; allowPrerelease: boolean; allowDowngrade: boolean }`
    — `stable → { channel: 'latest', allowPrerelease: false, allowDowngrade: false }`,
    `beta → { channel: 'beta', allowPrerelease: true, allowDowngrade: true }`.
  - **Our channel name is not the feed's channel name.** Setting `autoUpdater.channel = 'stable'`
    makes electron-updater fetch a `stable-mac.yml` that electron-builder never publishes (it
    always emits `latest-mac.yml`), producing `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND`. In the sibling
    app that 404 was swallowed by fail-soft and the update banner never appeared at all.
  - Assign `autoUpdater.channel` **before** `allowDowngrade`: the channel setter force-sets
    `allowDowngrade`, so assigning in the other order silently discards the value.
- [ ] Create `packages/desktop/src/main/update-service.ts` (net-new) — `export function registerUpdater(getWindow: () => BrowserWindow | null): void`.
  - `autoUpdater.autoDownload = false` and `autoInstallOnAppQuit = false` — every download is
    user-initiated; an app that updates itself behind your back during a rebase is a bug.
  - Maps `checking-for-update`, `update-available`, `update-not-available`, `download-progress`,
    `update-downloaded` and `error` onto a single `push(state)`.
  - **Unpackaged (`!app.isPackaged`)**: register the IPC surface as safe no-ops and never touch
    `autoUpdater` — `checkForUpdates()` throws when there is no feed, which in dev is always.
  - Registered from the `app.whenReady()` block in `main/index.ts`.
  - Reference implementation to crib: `~/Dev/midnite/packages/desktop/src/main/updater.ts` and
    `src/updates/` — same registrar shape, same `getWindow` injection.
- [ ] Detect an unsigned build and set `manualInstall`.
  - Run `codesign -dv --verbose=2` against the app path; an authority of `-` (ad-hoc) or no
    signature at all sets `manualInstall: true`, merged into **every** pushed state.
  - This is what lets Theme D ship before Developer ID signing exists: version *detection* is a
    plain HTTPS fetch and works fine, but Squirrel.Mac refuses to install across an unsigned
    build, so the UI must not offer download→restart on one.
- [ ] Define the update channels.
  - `CHANNELS.updateCheck: 'mgit:update:check'`, `updateDownload: 'mgit:update:download'`,
    `updateRestart: 'mgit:update:restart'`, `updateSetChannel: 'mgit:update:set-channel'`.
  - `EVENT_CHANNELS.updateState: 'mgit:update:state'` — **one coalesced `UpdateState`**, replacing
    the three raw `update-available`/`update-downloaded`/`download-progress` events the
    pre-refinement doc specified. A single state object cannot render a half-updated UI, and it
    lets a late subscriber be handed the current phase immediately instead of waiting for the next
    event.
- [ ] Expose the `update` group on the preload bridge and its type.
  - `update: { check: () => ipcRenderer.send(CHANNELS.updateCheck), download: …, restart: …,
    setChannel: (req) => ipcRenderer.send(CHANNELS.updateSetChannel, req),
    onState: (h) => subscribe(EVENT_CHANNELS.updateState, h) }`.
  - `ipcRenderer.send`, not `invoke` — these are fire-and-forget commands whose result arrives as
    a pushed state, matching how `metrics.start`/`stop` are wired.
  - `| 'update'` on the `Pick<>` union, plus the `bridge.ts` group.
- [ ] Add a `publish:` block to `electron-builder.yml`.
  - `publish: [{ provider: github, owner: <owner>, repo: midnite-studio, releaseType: release }]`,
    so a packaged build emits `latest-mac.yml` beside the dmg and zip. The `.blockmap` files
    differential download needs are already produced today.
  - The feed is **inert until a remote and a tagged release exist** — the repo currently has
    neither. That is fine and must stay fail-soft: the `error` handler pushes an error state and
    the banner, which hides on an error with no known version, simply never appears.
- [ ] Persist the update preferences in two places, for a reason.
  - [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) gains
    `updatesAutoCheck: boolean` (default `true`) and `updateChannel: UpdateChannel` (default
    `'stable'`), added to `UiState`, to the `PersistedUi` type **and** to `partialize` — all three,
    or the value is kept in memory and silently lost on reload.
  - Bump `version: 4 → 5` and add an `if (version < 5)` arm seeding both, beside the existing
    `< 2`, `< 3` and `< 4` arms.
  - Main additionally keeps its own `updates.json` under `app.getPath('userData')`, written through
    a small store mirroring `createTrustStore(userData)`. **Main cannot read renderer
    localStorage**, and the boot check has to know whether auto-check is on before any window
    exists.
- [ ] Add `packages/app/src/features/settings/settings-pages/updates-page.tsx` (net-new) — `export function UpdatesPage()`.
  - Same four registration edits: `{ id: 'updates', label: 'App Updates', group: 'system' }`,
    `updates: LuDownload`, `updates: () => <UpdatesPage />`.
  - The auto-check control is a raw `<input type="checkbox" className="accent-[hsl(var(--primary))]">`
    inside `<label className="flex cursor-pointer items-center gap-2 text-xs">`, and the channel
    picker is `Choice<UpdateChannel>` from `./controls`. **There is no Switch component and no
    `<select>` anywhere in this renderer** — inventing one here would be the first.
  - Shows the running version, the current phase, and a *Check for Updates* button.
  - When `manualInstall` is true the *Download* button is replaced by the copyable manual install
    command and the hint `This build isn't signed, so it can't update itself.`
- [ ] Add `packages/app/src/features/status-bar/update-pill.tsx` (net-new) and register it as a segment.
  - `{ id: 'app-update', zone: 'right', priority: 45, label: 'Update', El: UpdatePill }` in
    `STATUS_SEGMENTS` ([`segments.ts`](../../../packages/app/src/features/status-bar/segments.ts));
    priorities are gapped by 10.
  - Returns `null` unless the phase is `available`, `downloading` or `downloaded` — a segment with
    nothing to say renders nothing, as `agent-count.tsx` does.
  - Must fit the bar's `h-6` / `text-xs`, and its text span carries `className="status-label"` so
    it collapses correctly under the `data-density` overflow rule.
  - On entering `downloaded`, fire `addToast({ message: 'Update ready — restart to install',
    status: 'success' })` exactly once. This is the **first real consumer** of
    [`toast-store.ts`](../../../packages/app/src/store/toast-store.ts), which nothing calls today;
    the bell in the status bar already renders whatever it holds.

### Theme E — First-Run Onboarding & System Health (S/M/L: M)

- [ ] Add `onboardedAt: string | null` to `ui-store`.
  - Added to `UiState`, `PersistedUi` and `partialize`; default `null`.
  - The **same** `if (version < 5)` migrate arm Theme D adds sets it to
    `new Date().toISOString()`, so nobody who already uses the app is shown a first-run modal on
    upgrade. This is why E lands after D — writing the arm twice is the failure mode.
- [ ] Create `packages/app/src/features/onboarding/first-run-modal.tsx` (net-new) — `export function FirstRunModal()`.
  - Mounted from `app.tsx`; renders `null` whenever `onboardedAt !== null`.
  - **Not** `ConfirmDialog` — that component's `ConfirmRequest` is a confirm/cancel pair and this
    has a checklist body. Follow
    [`rebase-modal.tsx`](../../../packages/app/src/features/rebase/rebase-modal.tsx) for the
    overlay classes (`fixed inset-0 z-dialog flex items-center justify-center bg-background/70`)
    and use the existing `useFocusTrap`.
  - Dismissing sets `onboardedAt` to now; the modal never returns.
- [ ] Define one system-health channel — the renderer cannot run these checks itself.
  - `CHANNELS.systemHealth: 'mgit:system:health'`, response
    `z.object({ git: z.object({ path: z.string().nullable(), version: z.string().nullable() }),
    shell: z.string().nullable(), sshAgent: z.object({ running: z.boolean(), keys: z.number() }),
    cli: CliStatusResponse })`.
  - The renderer has no node builtins and no `child_process` — eslint's `no-restricted-imports`
    blocks `node:*`, `fs`, `path` and `child_process` outright — so `which git` has to run in main.
- [ ] Create `packages/desktop/src/main/system-health.ts` (net-new) — `export async function readSystemHealth(): Promise<SystemHealth>`.
  - git resolves through dugite's bundled binary first, then `PATH`, and reports both the path and
    `git --version`.
  - Shell is `process.env.SHELL`, matching the fallback already used in
    [`login-shell.ts`](../../../packages/desktop/src/main/login-shell.ts).
  - ssh-agent is `SSH_AUTH_SOCK` presence plus the exit code of `ssh-add -l`: `0` = agent with
    keys, `1` = agent running but no keys, `2` = no agent. Reporting "no keys" as "no agent" is the
    easy mistake.
  - Every probe is independently fallible — one failure yields `null` for that field and never
    rejects the whole call.
- [ ] Extract the checklist as `packages/app/src/features/onboarding/health-checklist.tsx` (net-new), used by both surfaces.
  - `export function HealthChecklist({ compact }: { compact?: boolean })`.
  - One row per check: a `LuCheck` / `LuX` glyph, the label, and the resolved value in
    `text-xs text-muted-foreground`.
  - In flight → `<Spinner />` from
    [`skeleton.tsx`](../../../packages/app/src/components/skeleton.tsx); a failed probe renders
    `Couldn't detect` rather than an error, because a missing ssh-agent is not a fault.
  - The CLI row carries the same install button as `CliPage`, calling the same
    `bridge().cli.install`.
  - This component exists because the pre-refinement doc specified the same checks twice, once in
    the modal and once in a settings tab, with no stated relationship.
- [ ] Add `packages/app/src/features/settings/settings-pages/health-page.tsx` (net-new) — `export function HealthPage()`.
  - Renders `<HealthChecklist />` inside one `Accordion`, and nothing else.
  - Registered as `{ id: 'health', label: 'System Health', group: 'system' }` with
    `health: LuStethoscope`, plus the `PAGE_CONTENT` arm.
- [ ] Stub `systemHealth` and the `update` group in `packages/app/e2e/mock-bridge.ts`.
  - Same reason as the `cli` stub: `installMockBridge` replaces `window.midniteGit` wholesale, so
    any view reaching a group that isn't stubbed throws inside the page.

---

## Files this phase touches

| File | Change | Why it is load-bearing |
|------|--------|------------------------|
| [`packages/desktop/electron-builder.yml`](../../../packages/desktop/electron-builder.yml) | edited | `dmg:`, `protocols:`, `publish:`, entitlements, `afterSign`, renamed identity |
| [`packages/desktop/package.json`](../../../packages/desktop/package.json) | edited | adds `electron-updater` (dep) and `@electron/notarize` (devDep) |
| [`packages/desktop/moon.yml`](../../../packages/desktop/moon.yml) | edited | new `verify-dist` task; `dist` sets no `outputs` on purpose |
| [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) | edited | `package` job runs `desktop:verify-dist` before upload |
| `packages/desktop/resources/dmg-background.png` + `@2x` | **net-new** | dmg window artwork; PNG only |
| `packages/desktop/resources/entitlements.mac.plist` + `.inherit` | **net-new** | hardened runtime cannot spawn pty/git without them |
| `packages/desktop/resources/bin/midnite-studio` | **net-new** | the CLI wrapper; execs `open` on the URL scheme |
| `packages/desktop/resources/completions/*` | **net-new** | zsh/bash/fish completions for the B1 grammar |
| `packages/desktop/scripts/notarize.cjs` | **net-new** | `afterSign`, env-gated |
| `packages/desktop/scripts/verify-dist.mjs` | **net-new** | dmg/zip/codesign/Info.plist assertions |
| [`packages/desktop/scripts/afterpack.cjs`](../../../packages/desktop/scripts/afterpack.cjs) | **unchanged** | already ad-hoc signs so unsigned builds launch — do not fold notarization into it |
| [`packages/desktop/scripts/install-local.mjs`](../../../packages/desktop/scripts/install-local.mjs) | edited | `APP_NAME` / `LEGACY_APP_NAME` for the rename |
| [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) | edited | `setAsDefaultProtocolClient`, `open-url`, argv forwarding, three new registrars |
| `packages/desktop/src/main/protocol-parse.ts` | **net-new** | pure `parseDeepLink`; electron-free so it unit-tests |
| `packages/desktop/src/main/cli-path.ts` | **net-new** | pure target/PATH helpers |
| `packages/desktop/src/main/ipc/cli-handlers.ts` | **net-new** | `registerCliHandlers()`; symlink install/uninstall |
| `packages/desktop/src/main/update-service.ts` | **net-new** | `registerUpdater(getWindow)` |
| `packages/desktop/src/updates/update-state.ts` | **net-new** | pure `UpdateState` + constructors |
| `packages/desktop/src/updates/feed-channel.ts` | **net-new** | pure `feedChannelFor`; the `latest` vs `stable` trap |
| `packages/desktop/src/main/system-health.ts` | **net-new** | `readSystemHealth()` |
| [`packages/desktop/src/main/ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) | **unchanged** | `handle`/`handleOp`/`handleBare` are the required wrappers |
| [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) | edited | `cli`, `update`, `protocol` groups **and** the `Pick<>` union |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) | edited | `mgit:cli:*`, `mgit:update:*`, `mgit:system:health`, `mgit:protocol:deep-link` |
| [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) | edited | `Cli*`, `Update*`, `SystemHealth*` request/response pairs |
| [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | edited | the three new bridge groups |
| [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | edited | 3 new page ids, `updatesAutoCheck`, `updateChannel`, `onboardedAt`, `version 4 → 5` |
| [`packages/app/src/components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) | edited | `SETTINGS_PAGE_ICON` arms for `cli`, `updates`, `health` |
| [`packages/app/src/features/settings/settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx) | edited | `PAGE_CONTENT` arms |
| `packages/app/src/features/settings/settings-pages/cli-page.tsx` | **net-new** | CLI Integration page |
| `packages/app/src/features/settings/settings-pages/updates-page.tsx` | **net-new** | App Updates page |
| `packages/app/src/features/settings/settings-pages/health-page.tsx` | **net-new** | System Health page |
| [`packages/app/src/features/settings/settings-pages/controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx) | **unchanged** | `Field` + `Choice<T>` are the only form primitives |
| `packages/app/src/features/onboarding/first-run-modal.tsx` | **net-new** | first-run modal |
| `packages/app/src/features/onboarding/health-checklist.tsx` | **net-new** | shared by the modal and the settings page |
| `packages/app/src/features/status-bar/update-pill.tsx` | **net-new** | the update segment |
| [`packages/app/src/features/status-bar/segments.ts`](../../../packages/app/src/features/status-bar/segments.ts) | edited | one `STATUS_SEGMENTS` entry |
| `packages/app/src/services/deep-link.ts` | **net-new** | `useDeepLinks()` |
| [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) | edited | mounts `useDeepLinks()` and `<FirstRunModal />` |
| [`packages/app/e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) | edited | stubs for `cli`, `update`, `protocol`, `systemHealth` |
| [`packages/app/src/store/toast-store.ts`](../../../packages/app/src/store/toast-store.ts) | **unchanged** | gains its first caller; the bell already renders it |

---

## Verification

- [ ] `moon run :typecheck :lint :test` passes green across `shared`, `git-engine`, `app` and `desktop`.
- [ ] `packages/shared/src/ipc/ipc.test.ts` still passes — every new channel is unique and `mgit:`-prefixed.
- [ ] `packages/desktop/src/main/protocol-parse.test.ts` (net-new): `parseDeepLink` returns the right
      `DeepLink` for `midnite-studio://open?repo=/abs/path` and `…//clone?url=https://…`, and returns
      **`null`** for each of a foreign scheme, an unknown host, a missing param, a relative `repo`, a
      `repo` containing `\0`, and a `clone` url with a `file:` scheme.
- [ ] `packages/desktop/src/main/cli-path.test.ts` (net-new): `preferredTargets('/Users/x')` yields
      `/usr/local/bin` before `~/.local/bin`; `pathExportLine` emits the quoted `export PATH=` form.
- [ ] `packages/desktop/src/updates/update-state.test.ts` (net-new): `downloadingState` clamps `-5 → 0`,
      `140 → 100` and rounds `41.6 → 42`; `notAvailableState()` is `IDLE_STATE`.
- [ ] `packages/desktop/src/updates/feed-channel.test.ts` (net-new): `feedChannelFor('stable').channel`
      is **`'latest'`** (not `'stable'`), and `feedChannelFor('beta')` sets both `allowPrerelease` and
      `allowDowngrade`.
- [ ] `packages/desktop/src/main/ipc/cli-handlers.test.ts` (net-new): reaches the handlers through the
      recorded `ipcMain.handle` calls with `vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))`,
      exactly as `fs-handlers.test.ts` does. Asserts that an `EACCES` on `/usr/local/bin` falls back to
      `~/.local/bin` and returns `{ok:true}`, and that a symlink resolving outside the bundle reports
      `managed: false` and is never unlinked.
- [ ] `packages/app/src/store/ui-store.test.ts`: the existing "every page files into a group that exists"
      and "every group has at least one page" invariants still pass with `cli`, `updates` and `health`
      added; a new case asserts the `version < 5` migration seeds `updatesAutoCheck`, `updateChannel`
      and a non-null `onboardedAt`.
- [ ] `packages/app/src/features/status-bar/update-pill.test.ts` (net-new): the pill renders `null` for
      phase `idle`, `checking` and `error`, and renders text for `available`, `downloading`, `downloaded`.
- [ ] `packages/app/e2e/settings-pages.spec.ts` still passes with the three new pages present, proving the
      `mock-bridge.ts` stubs are complete.
- [ ] `moon run desktop:dist` builds `midnite-studio-0.1.0-arm64.dmg` and `.zip` into
      `packages/desktop/release/`, and `moon run desktop:verify-dist` exits 0 on the result.
- [ ] With no Apple credentials in the environment, `desktop:dist` still exits 0 and logs `[notarize] skipped`.

**Open, for a human:** the following cannot be asserted in CI — Playwright drives the Vite dev server
against a mocked bridge and never loads Electron, main or the preload.

- [ ] **Open, for a human:** mount the built dmg and confirm the 660×400 window, the background artwork
      at both 1× and 2×, and the app icon sitting left of the `/Applications` alias.
- [ ] **Open, for a human:** install the CLI from Settings → CLI Integration on a machine where
      `/usr/local/bin` is not writable, and confirm it falls back to `~/.local/bin` and shows the
      `export PATH=` line.
- [ ] **Open, for a human:** run `midnite-studio .` inside a repo the app already knows and confirm it
      focuses the window and selects that repo with no dialog; run it in an unknown directory and
      confirm the confirm dialog names the absolute path.
- [ ] **Open, for a human:** with the app **closed**, run `/usr/bin/open 'midnite-studio://open?repo=…'`
      and confirm cold start buffers and then dispatches the link once the window is up.
- [ ] **Open, for a human:** confirm the ad-hoc-signed build reports `manualInstall` and offers the manual
      command rather than a Download button.
- [ ] **Open, for a human:** with a real Developer ID cert (`CSC_LINK` + `CSC_KEY_PASSWORD`) and Apple
      credentials, confirm the notarized dmg passes `spctl --assess --type execute`.

---

## Not in this phase

- **Windows `.msi` and Linux `.deb`/`.rpm`** — the app is macOS-arm64-first and `node-pty` would need
  rebuilding on a matching runner for either to be correct.
- **macOS file associations (`.git`, `.patch`, `.diff`)** — Theme A registers the URL scheme only.
  Claiming file types is a separate decision about what double-clicking a file should do, and it does
  not need to be made to ship a CLI.
- **A richer CLI surface (`status`, `log`, `diff`)** — every extra verb needs its own protocol route and
  its own renderer destination, roughly doubling Themes B and C for commands the terminal already answers.
- **A tag-triggered release workflow** — the `publish:` block lands so packaged builds emit a manifest,
  but the repo has no remote and zero tags, so a workflow would have nothing to publish to. It belongs
  with the release infrastructure, not with packaging.
- **The Midnite Studio rename itself** — a repo-wide identifier sweep including a persisted-store key
  migration. It is this phase's prerequisite, not part of it.
- **Any privileged (`sudo` / `osascript`) write** — see the symlink decision below.

---

## Decisions / open questions

1. **Resolved — the CLI reaches the app through `midnite-studio://`, not a socket.** The wrapper execs
   `/usr/bin/open` on the URL scheme. It reuses Theme C wholesale, needs no listener in main, no stale
   socket cleanup and no second surface to secure, and macOS launches the app when it is not running.
   The cost is accepted deliberately: dispatch is one-way, so the CLI cannot report the app's result and
   always exits 0 once `open` succeeds. A socket would buy real exit codes and is the natural upgrade if
   a future verb ever needs to print something.
2. **Resolved — Theme D ships now, on `manualInstall`, rather than waiting for Developer ID signing.**
   Version detection is a plain HTTPS fetch and works on an ad-hoc-signed build; only *installation*
   requires a real signature. Carrying a `manualInstall` flag on every pushed state lets the UI offer a
   manual command instead of download→restart, so the whole updater can be built and tested before a
   cert exists. Signing and notarization stay best-effort and env-gated in Theme A.
3. **Resolved — a `publish:` block lands, the release workflow does not.** The block makes packaged
   builds emit `latest-mac.yml`, which is what electron-updater reads. The repo has no remote and no
   tags, so the feed stays inert and the updater fail-softs to a hidden banner — which is already the
   correct behaviour for an unreachable feed and needs no extra code.
4. **Resolved — the CLI grammar is `[path]`, `open <path>`, `clone <url>`, `--version`, `--help`.**
   Small enough that hand-written zsh/bash/fish completions stay in sync with it, and large enough that
   the completions are worth shipping at all. Anything more needs a protocol verb per command.
5. **Resolved — a deep link may open a known repo silently, but proposing a new one requires consent.**
   A path already in `repos.json` is dispatched straight through, because `midnite-studio .` has to stay
   one gesture. Any other path becomes a proposal rendered as a `ConfirmDialog` naming the absolute
   path. A URL is remote-triggerable — any web page can issue one — so silently adding a repository from
   one would let a page choose what the app reads from disk.
6. **Resolved — the symlink tries `/usr/local/bin`, then falls back to `~/.local/bin`; never `sudo`.**
   On `EACCES`/`EPERM`/`EROFS` the handler writes the user-local target and surfaces the exact
   `export PATH=` line instead. An `osascript` admin prompt would always land on `PATH`, but a
   privileged write is a much larger blast radius than a developer-tools convenience justifies. A
   `midnite-studio` on `PATH` that the app did not create is reported as `managed: false` and is never
   overwritten or deleted.
7. **Resolved — update preferences live in `ui-store`, with a small `updates.json` in main.** The UI
   toggles belong beside `forgeWritesEnabled` and `autoFetchIntervalMs` in the persisted `ui-store`
   (`version 4 → 5`). But every persisted store in this app is renderer localStorage, which main cannot
   read, and the boot check has to know whether auto-check is enabled before a window exists — hence the
   main-side mirror, following `createTrustStore(userData)`.
8. **Resolved — first run is `onboardedAt: string | null` in `ui-store`, seeded by the v5 migration.**
   The migrate arm sets a non-null timestamp for existing installs, so nobody who already uses the app
   sees a first-run modal on upgrade. Triggering off "the repo list is empty" was rejected: it
   reappears every time someone closes their last repository, which makes it a nag rather than onboarding.
9. **Resolved — one coalesced `UpdateState` event, not three raw ones.** `mgit:update:state` carries the
   whole phase. Three independent events can render a half-updated UI, and a late subscriber would have
   to wait for the next event to learn anything; a single state can be re-pushed on demand.
10. **Resolved — logic lives in electron-free modules so plain vitest can assert it.** `protocol-parse.ts`,
    `cli-path.ts`, `update-state.ts` and `feed-channel.ts` import no `electron`, matching the desktop
    vitest config's stated rule. Handler wiring is tested through the recorded `ipcMain.handle` calls with
    `vi.mock('electron', …)`, as `fs-handlers.test.ts` already does.
11. **Resolved — failures surface inline plus a toast.** The settings pages own the durable state
    (installed path, last error); transient outcomes call `addToast`, making the updater the first real
    consumer of `toast-store`, whose bell already renders whatever it holds. Main-side detail goes through
    `main/log.ts` — `no-console` is an error rule across `**/*.{ts,tsx}`.
12. **Resolved — user-facing identifiers become `midnite-studio`; the internal `mgit:` channel prefix
    stays.** The binary, URL scheme, `appId`, `productName` and artifact names all take the new name. The
    IPC prefix is internal, appears in 456 lines of registry plus two invariant tests, and is swept by the
    rename phase — introducing `mstudio:` channels here would leave the registry disagreeing with itself.
13. **Resolved — distribution target is macOS arm64 dmg + zip in lockstep**, unchanged from Phase 11.
    Both targets are already configured; the zip is what electron-updater consumes and the dmg is what a
    human downloads.
