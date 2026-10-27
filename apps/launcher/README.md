# Midnite Apps — the launcher

The installable front door to the midnite app suite: a grid (or table) of every app, what it is
for, whether it is installed, and one button to install or open it.

```sh
moon run launcher:start   # build, then run it in Electron
moon run launcher:dev     # the renderer alone in a browser, on a mock bridge (?studio=installed|update|missing)
moon run launcher:dist    # macOS arm64 dmg + zip
```

**Every app runs inside Midnite Studio today.** The catalog (`src/common/catalog.ts`) describes each
one as it is meant to ship — name, accent, vision, features — and points each feature at the Studio
view it lives in now. *Install* installs Studio (the same steps as `install.sh`, in-process, with
the same verify-then-swap guards); *Open* opens Studio on the app's view through
`midnite-studio://view?id=…`. When an app ships on its own, its `runsIn` changes and its tile installs
that instead.

Layout:

| Path | What |
| --- | --- |
| `src/common/` | The catalog, the bridge contract, version + status helpers — shared by main and renderer |
| `src/main/` | Window, IPC (zod-validated), Studio detection, the release feed, install, the suite's one updater (`updater.ts`) |
| `src/main/bundles/` | Per-app bundles (Phase 113 Theme E): install/update/uninstall, the Dock stub, `installed.json` |
| `src/preload/` | `window.midniteLauncher` |
| `src/renderer/` | The UI; `mock-bridge.ts` stands in outside Electron |

It is ~100 MB packaged, not the 17 MB of a native/Tauri launcher: that is the Electron framework,
kept so the launcher can share a runtime with the apps later.

## Per-app bundles and updates (Phase 113 Theme E)

`src/main/bundles/` installs one app as a **bundle** (its own code, never an Electron build) plus a
**Dock stub**: `Midnite <Name>.app`, whose Electron framework, main binary and helpers are APFS-cloned
(`cp -c`) from the running launcher, with its own `Info.plist` name, bundle id
(`io.bilo.midnite-<id>`) and icon, ad-hoc signed — the mechanism `docs/spikes/dock-identity.md` chose.
The download is checked against `catalog.json`'s size and SHA-256 before anything is touched, and the
bundle and stub swap in together or not at all (`swap.ts`, shared with Studio's install).
`installed.json` under the bundle root records what is installed; uninstall removes exactly one
app's bundle, stub and record. Both roots are parameters — only `bundles/production.ts` names
`/Applications` and userData, and every test runs on temp dirs.

The launcher owns updates: `updater.ts` runs electron-updater on its own `generic`,
namespaced feed (`midnite-launcher/feed`), then `bundles/updates.ts` re-clones stubs left on an
older runtime and reinstalls bundles the catalog has moved past. No app runs an updater —
`eslint.config.mjs` (`NO_APP_UPDATER`) and `scripts/single-updater.test.mjs` keep electron-updater
to this launcher and Studio's own (until Phase 113 Theme G).

An ad-hoc-signed launcher cannot swap itself in place (Squirrel.Mac refuses a build whose signature
does not match the running one), so `updater.ts` only checks. **Update launcher** — a banner when
`midnite-launcher/version.json` is newer, and always in the status bar — runs `self-update.ts`
instead: the website's `install.sh`, detached, which quits this app, replaces the bundle and
reopens it. Its output lands in `~/Library/Logs/Midnite Apps/self-update.log`.
