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
| `src/main/` | Window, IPC (zod-validated), Studio detection, the release feed, install |
| `src/preload/` | `window.midniteLauncher` |
| `src/renderer/` | The UI; `mock-bridge.ts` stands in outside Electron |

It is ~100 MB packaged, not the 17 MB of a native/Tauri launcher: that is the Electron framework,
kept so the launcher can share a runtime with the apps later.
