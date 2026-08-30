# Phase 33 — Application Installation, CLI Tool & Desktop Integration

> **Builds on**: [Phase 11 · Packaging + docs](phase-11-packaging.md), [Phase 16 · Folder explorer, preview pane + settings pages](phase-16-explorer-and-settings-pages.md), and [Phase 27 · Status bar & browser panel](phase-27-status-bar-and-browser-panel.md).
> **Scope guardrails**: macOS arm64/Apple Silicon distribution focus. Delivers a production-grade DMG installer with background layout, system `midnite-studio` CLI tool installer + shell completion, custom `midnite-studio://` deep-linking protocol scheme, auto-updater pipeline, and first-run setup onboarding. Windows `.msi` and Linux `.deb`/`.rpm` packages are explicitly deferred.

---

## Deliverables

### Theme A — Polished DMG Package & macOS Desktop Integration (S/M/L: M)
- [ ] Configure `packages/desktop/electron-builder.yml` with custom DMG window layout (`660x400`), drag-to-`/Applications` symlink, icon coordinates, and background artwork path.
- [ ] Add `resources/dmg-background.png` or SVG template asset matching Midnite dark design aesthetic.
- [ ] Create `packages/desktop/scripts/notarize.cjs` and `packages/desktop/scripts/sign-check.cjs` helper scripts for macOS Developer ID code signing & Apple notarization verification.
- [ ] Register macOS file association & protocol handles in `package.json` / `electron-builder.yml` bundle info properties.
- [ ] Add `moon run desktop:dist` verification script to validate output `.dmg` and `.zip` bundle integrity in `release/`.

### Theme B — `midnite-studio` CLI Binary & System PATH Symlinking (S/M/L: M)
- [ ] Create standalone executable shell wrapper script `packages/desktop/resources/bin/midnite-studio` forwarding arguments (e.g. `midnite-studio .` or `midnite-studio open <path>`) to the running desktop app via IPC socket or `midnite-studio://` protocol.
- [ ] Define IPC channels in `packages/shared/src/ipc-channels.ts`: `CLI_CHECK_STATUS`, `CLI_INSTALL`, `CLI_UNINSTALL`.
- [ ] Implement main process handlers in `packages/desktop/src/main/ipc/cli-handlers.ts` to manage `/usr/local/bin/midnite-studio` or `~/.local/bin/midnite-studio` symlinks.
- [ ] Generate shell completion scripts (`zsh`, `bash`, `fish`) for `midnite-studio` commands and options in `packages/desktop/resources/completions/`.
- [ ] Add **"CLI Integration"** settings card in `packages/app/src/features/settings/cli-settings.tsx` displaying install status, path indicator, and single-click install/uninstall buttons.

### Theme C — `midnite-studio://` Custom Protocol Handler & Single-Instance Dispatcher (S/M/L: S)
- [ ] Call `app.setAsDefaultProtocolClient('midnite-studio')` in Electron main process (`packages/desktop/src/main/index.ts`).
- [ ] Implement single-instance lock (`app.requestSingleInstanceLock()`) handling `second-instance` events to bring the main window to focus when deep links are clicked.
- [ ] Implement protocol URL parser (`packages/desktop/src/main/protocol.ts`) supporting `midnite-studio://open?repo=<path>` and `midnite-studio://clone?url=<repo-url>`.
- [ ] Wire renderer deep link dispatcher in `packages/app/src/services/protocol-dispatcher.ts` to switch active workspace tab or open clone dialog upon deep-link arrival.

### Theme D — Auto-Updater Service & Update Status Banner (S/M/L: M)
- [ ] Configure `electron-updater` client in `packages/desktop/src/main/update-service.ts` pointing to GitHub Releases repository feed.
- [ ] Define update IPC channels in `packages/shared/src/ipc-channels.ts`: `UPDATE_CHECK`, `UPDATE_DOWNLOAD`, `UPDATE_QUIT_AND_INSTALL`.
- [ ] Dispatch live update events (`update-available`, `update-downloaded`, `download-progress`) across preload bridge (`packages/desktop/src/preload/index.ts`).
- [ ] Add **"App Updates"** preference panel in `packages/app/src/features/settings/updates-settings.tsx` with auto-check toggle, update channel selector (stable/beta), and manual "Check for Updates" button.
- [ ] Add update notification pill / banner in status bar (`packages/app/src/features/statusbar/statusbar.tsx`) when a new version is ready to install.

### Theme E — First-Run Installation Onboarding & System Setup Checklist (S/M/L: S)
- [ ] Build first-run onboarding dialog (`packages/app/src/features/onboarding/first-run-modal.tsx`) triggered on initial app boot when configuration is uninitialized.
- [ ] Include system diagnostic checks: git binary location (`which git`), default shell detection, SSH key agent status, and CLI command installation prompt.
- [ ] Add system health check overview tab under Settings (`packages/app/src/features/settings/system-health.tsx`).

---

## Files this phase touches

- [`packages/desktop/electron-builder.yml`](file:///Users/bilolwabona/Dev/midnite-studio/packages/desktop/electron-builder.yml)
- [`packages/desktop/package.json`](file:///Users/bilolwabona/Dev/midnite-studio/packages/desktop/package.json)
- [`packages/desktop/src/main/index.ts`](file:///Users/bilolwabona/Dev/midnite-studio/packages/desktop/src/main/index.ts)
- [`packages/desktop/src/main/ipc/cli-handlers.ts`](file:///Users/bilolwabona/Dev/midnite-studio/packages/desktop/src/main/ipc/cli-handlers.ts)
- [`packages/desktop/src/main/protocol.ts`](file:///Users/bilolwabona/Dev/midnite-studio/packages/desktop/src/main/protocol.ts)
- [`packages/desktop/src/main/update-service.ts`](file:///Users/bilolwabona/Dev/midnite-studio/packages/desktop/src/main/update-service.ts)
- [`packages/desktop/resources/bin/midnite-studio`](file:///Users/bilolwabona/Dev/midnite-studio/packages/desktop/resources/bin/midnite-studio)
- [`packages/shared/src/ipc-channels.ts`](file:///Users/bilolwabona/Dev/midnite-studio/packages/shared/src/ipc-channels.ts)
- [`packages/app/src/features/settings/cli-settings.tsx`](file:///Users/bilolwabona/Dev/midnite-studio/packages/app/src/features/settings/cli-settings.tsx)
- [`packages/app/src/features/settings/updates-settings.tsx`](file:///Users/bilolwabona/Dev/midnite-studio/packages/app/src/features/settings/updates-settings.tsx)
- [`packages/app/src/features/onboarding/first-run-modal.tsx`](file:///Users/bilolwabona/Dev/midnite-studio/packages/app/src/features/onboarding/first-run-modal.tsx)
- [`packages/app/src/features/statusbar/statusbar.tsx`](file:///Users/bilolwabona/Dev/midnite-studio/packages/app/src/features/statusbar/statusbar.tsx)

---

## Verification

- [ ] `moon run :typecheck :lint :test` passes green across all workspace packages.
- [ ] `moon run desktop:dist` builds valid `midnite-studio-0.1.0-arm64.dmg` and `.zip` packages in `packages/desktop/release/`.
- [ ] Installing CLI tool creates executable symlink in `/usr/local/bin/midnite-studio` and `midnite-studio .` opens current folder in desktop app.
- [ ] Deep link `midnite-studio://open?repo=...` focuses app window and opens target repository.
- [ ] Settings "CLI Integration" and "App Updates" tabs function correctly with live status indicators.

---

## Decisions / open questions

1. **CLI Binary Privileges**: Symlink target attempts `/usr/local/bin/midnite-studio` first; if permission denied, prompts user to install in `~/.local/bin/midnite-studio` (with instructions to add to `PATH`).
2. **Distribution Target**: macOS arm64 DMG + ZIP artifact lockstep build.
