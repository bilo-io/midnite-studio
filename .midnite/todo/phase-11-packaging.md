# Phase 11 — Packaging + docs

Installable macOS arm64 app; CI; repo docs complete.

Crib from `~/Dev/midnite/packages/desktop/`: `electron-builder.yml`, `scripts/afterpack.cjs`,
`scripts/install-local.mjs`.

## Deliverables

- [x] `desktop/electron-builder.yml` — appId, dmg+zip, arm64; files globs include the built `app/dist` renderer; `asar: true` + `asarUnpack: '**/*.node'` (node-pty); `npmRebuild: false`
- [x] `desktop/scripts/afterpack.cjs` — chmod 0755 every `spawn-helper`; prune dangling symlinks; ad-hoc `codesign --force --deep --sign -` on darwin
- [x] `desktop/scripts/install-local.mjs` — build → package → quit running app → **`ditto`, never `cp -R`** (cp breaks the code seal → silent SIGKILL on launch) → `xattr -dr com.apple.quarantine`
- [x] moon tasks `desktop:dist`, `desktop:install-local`
- [x] `.github/workflows/ci.yml` — typecheck/lint/test via moon; `GITHUB_PACKAGES_TOKEN` secret wired into install
- [x] `README.md` finalized (PAT setup, dev + packaging commands); `CLAUDE.md` current; `todo/` index statuses updated
- [x] Auto-updater explicitly deferred → `outstanding.md` (electron-updater **named-import** gotcha recorded there)

## Verification

- [x] `moon run desktop:dist` produces a dmg
- [x] Install via `desktop:install-local`; **launch from Finder** (proves the shell-path fix)
- [x] Open a repo, toggle the terminal and run a command (proves packaged node-pty + spawn-helper chmod)
- [x] Graph renders in the packaged app
- [x] Full end-to-end pass from INITIAL_PLAN.md → "Verification"

Screenshot: [the packaged app](../docs/screenshots/phase-11-packaged-app.png).

Verified against the **installed** `/Applications/midnite-git.app`, launched with `env -i` and
`PATH=/usr/bin:/bin:/usr/sbin:/sbin` — i.e. the bare environment a Finder launch gets:

| Check | Result |
|---|---|
| dmg + zip built | `midnite-git-0.1.0-arm64.dmg` (116MB), zip, blockmaps |
| `install-local` via `ditto` | installs; `codesign -dv` reports a valid ad-hoc signature |
| Repo opens, graph renders | 3 rows — dugite's git resolves from `app.asar.unpacked` |
| Integrated terminal | live zsh with the user's own prompt — proves both node-pty and the login-shell PATH fix |
| Executables chmod'd by afterPack | 197 (node-pty's spawn-helper + dugite's git tree) |

## Findings while landing this phase

- **Bundling main + preload with esbuild is what makes pnpm packageable.** electron-builder
  resolves `dependencies` by walking `node_modules`, follows pnpm's workspace symlinks into
  sibling directories, and dies with `<sibling>/dist/.tsbuildinfo must be under
  packages/desktop/`. Inlining `shared` and `git-engine` removes them from the runtime graph
  entirely; moving them to `devDependencies` (via `scope: 'development'` in moon.yml) is the other
  half of the fix, and the negation pattern `!node_modules/@midnite/**` alone is not enough.
- **dugite must be a DIRECT dependency of `desktop`.** It reached the package transitively through
  `git-engine`; once that moved to devDependencies the packaged app shipped without git and the
  afterPack hook chmod'd 3 files instead of 197. The build succeeded and the app was broken.
- **dugite already handles asar** — it rewrites an `app.asar` path segment to `app.asar.unpacked`
  itself — so `asarUnpack: '**/node_modules/dugite/git/**'` is the whole integration.
- **One entry point, dev and packaged.** `main` points at the esbuild bundle and the dev tasks
  build it too (~25ms). Two layouts meant `resolvePreload()` probing for a file, which is exactly
  the sort of thing that works until it doesn't.
- **moon cannot cache a ~200MB artifact** (`cas::read_failed`), so `desktop:dist` sets
  `cache: false` — and caching a release build buys nothing.
- **A stale dev Electron instance silently blocks the packaged app.** They share an appId, so the
  single-instance lock makes the second one `app.quit()` with no window and no output. This cost
  real time twice; worth knowing before debugging a "packaged app does nothing" report.
- `ELECTRON_RUN_AS_NODE` from an Electron-based editor's terminal breaks the *packaged* binary the
  same way it breaks the dev one.
