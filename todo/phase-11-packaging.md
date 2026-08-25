# Phase 11 — Packaging + docs

Installable macOS arm64 app; CI; repo docs complete.

Crib from `~/Dev/midnite/packages/desktop/`: `electron-builder.yml`, `scripts/afterpack.cjs`,
`scripts/install-local.mjs`.

## Deliverables

- [ ] `desktop/electron-builder.yml` — appId, dmg+zip, arm64; files globs include the built `app/dist` renderer; `asar: true` + `asarUnpack: '**/*.node'` (node-pty); `npmRebuild: false`
- [ ] `desktop/scripts/afterpack.cjs` — chmod 0755 every `spawn-helper`; prune dangling symlinks; ad-hoc `codesign --force --deep --sign -` on darwin
- [ ] `desktop/scripts/install-local.mjs` — build → package → quit running app → **`ditto`, never `cp -R`** (cp breaks the code seal → silent SIGKILL on launch) → `xattr -dr com.apple.quarantine`
- [ ] moon tasks `desktop:dist`, `desktop:install-local`
- [ ] `.github/workflows/ci.yml` — typecheck/lint/test via moon; `GITHUB_PACKAGES_TOKEN` secret wired into install
- [ ] `README.md` finalized (PAT setup, dev + packaging commands); `CLAUDE.md` current; `todo/` index statuses updated
- [ ] Auto-updater explicitly deferred → `outstanding.md` (electron-updater **named-import** gotcha recorded there)

## Verification

- [ ] `moon run desktop:dist` produces a dmg
- [ ] Install via `desktop:install-local`; **launch from Finder** (proves the shell-path fix)
- [ ] Open a repo, toggle the terminal and run a command (proves packaged node-pty + spawn-helper chmod)
- [ ] Graph renders in the packaged app
- [ ] Full end-to-end pass from INITIAL_PLAN.md → "Verification"
