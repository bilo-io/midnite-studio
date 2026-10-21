# Dock identity for per-app bundles on a shared runtime

Phase 113 Theme B. Reproduce with
[`scripts/spikes/dock-identity/dock-identity.mjs`](../../scripts/spikes/dock-identity/dock-identity.mjs)
(macOS arm64, Electron 33.4.11, macOS 26 / Darwin 25.6, APFS). Plan context:
[phase 113, Theme B](../../.midnite/tasks/phases/phase-113-midnite-apps-suite-split.md#theme-b--process-model-and-dock-identity-spike-m).

## Question

Option B is one shared runtime plus small per-app bundles. Each app (Cleaner, Monitor, ...) must
show **its own icon and name in the Dock and Cmd-Tab** without shipping its own Chromium. Which
process model gives that?

## Mechanisms

**Spike 1, one runtime process, stub forwards.** `Cleaner.app` is a 20 KB shell-script stub with its
own `Info.plist`, bundle id and icon. It writes `open cleaner` to a Unix socket; the already-running
`Midnite Runtime.app` (the Electron app) opens the window.

**Spike 2, one process per app, shared framework.** `Cleaner.app` has its own `Info.plist`, icon and
a copy of the Electron main binary; `Contents/Frameworks/` reuses the runtime's
`Electron Framework.framework`, helper apps, Mantle, ReactiveObjC and Squirrel, linked three ways
(symlink, APFS clone `cp -c`, hardlink `cp -l`). `Resources/app` is a hello-world main that sets its
window title and connects to a fake runtime daemon over a Unix socket.

## Results

|                                                       | Spike 1 stub forwards                                                    | Spike 2 symlink                                              | Spike 2 clone                                                                            | Spike 2 hardlink                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Disk per app, `du`                                    | 0.02 MB (runtime 233 MB, once)                                           | ~0 MB (does not run)                                         | 232 MB by `du`; ~0 MB extra on disk (`df` delta 0 MB)                                    | 232 MB by `du` (counts a hardlink once per tree); ~0 MB extra |
| Launches                                              | stub yes; window lives in the runtime                                    | **No: SIGTRAP (exit 133), no output**                        | Yes                                                                                      | Yes                                                           |
| Own Dock icon and name                                | **Only while the stub process lives**, never for the window (below)      | n/a                                                          | Yes: `lsappinfo` shows `Cleaner`, own bundle id and path, Foreground                     | Yes, same                                                     |
| Cmd-Tab entry                                         | Runtime's (windows belong to the runtime pid)                            | n/a                                                          | Own entry per app                                                                        | Same                                                          |
| Idle RSS (10 s, process tree)                         | 406 MB, 5 processes: runtime plus two windows                            | n/a                                                          | 319 MB, 4 processes, per app                                                             | 319 MB, 4 processes                                           |
| Two apps at once                                      | one process for both                                                     | n/a                                                          | **Yes: separate pids (319 + 323 MB = 642 MB), both registered, both reached the daemon** | not run                                                       |
| Launch to window (`open -n` to hello over the socket) | runtime cold start about 2.3 s to check-in; forward is instant once warm | n/a                                                          | 2.3 s                                                                                    | 2.3 s                                                         |
| `codesign --force --deep --sign -`                    | ok                                                                       | ok, but...                                                   | ok                                                                                       | ok                                                            |
| `codesign --verify --deep --strict`                   | valid                                                                    | **fails: `invalid destination for symbolic link in bundle`** | valid                                                                                    | valid (runtime still verifies afterwards)                     |
| `spctl --assess --type execute -vv`                   | `rejected`                                                               | `rejected`                                                   | `rejected`                                                                               | `rejected`                                                    |

RSS is summed from `ps` outside the app. It double-counts shared framework pages across processes, so
it overstates the true marginal cost of a second app; `footprint` was not measured. Disk for clones
is the `du` apparent size; actual extra blocks were read as a `df` delta, which is noisy at this size
and only says "not hundreds of MB".

### Spike 1: why it cannot work

While a stub process is alive it registers with Launch Services as its own app (name `Cleaner`,
`io.bilo.midnite.spike.cleaner`, `type="Foreground"`) and gets a Dock tile with its icon. But it has
no window server connection (`!cgsConnection`) and owns no windows. The window is created by the
runtime's pid, so Cmd-Tab and Mission Control show **Midnite Runtime** for it, and clicking the stub's
tile has nothing to raise. When the stub exits its tile disappears and only the runtime remains
(`observations/spike1-after-stubs-exit.txt`). Keeping the stub alive gives two Dock tiles per app, one
of them inert. Setting the Dock icon from the runtime (`app.dock.setIcon`) is per process, so N apps
inside one runtime still collapse to one tile. Spike 1 is ruled out as predicted.

### Spike 2: symlink is out, clone and hardlink work

With a symlinked `Frameworks/` the Electron binary aborts at startup (SIGTRAP, nothing on stderr even
with `ELECTRON_ENABLE_LOGGING=1`); it does not accept a framework that lives outside its own bundle.
Independently, `codesign --verify --strict` rejects any symlink pointing out of the bundle. Either
alone rules it out, so the framework has to be physically inside each stub.

APFS clone (`cp -cR`) and hardlink both pass strict verification, launch, and run two apps as
separate processes. The clone is a copy-on-write copy, so the stub costs only the blocks that differ
(the main binary's signature, `Info.plist`, `Resources`). Differences that matter:

- **Clone** works only within one APFS volume, and diverges from the runtime the moment either side
  changes: a runtime update does not reach existing stubs, so the launcher must re-clone (and re-sign)
  each stub on update. That fits Theme E, which already owns install, update and the stub.
- **Hardlink** shares inodes, so an in-place write to the runtime would change every stub, and
  `codesign` on a hardlinked file can mutate shared state. In this run the runtime still verified after
  signing, but that is not something to build on. Clone is the safer of the two.

## Recommendation

Choose **Spike 2 with APFS clones**: each app is its own process with its own Dock tile and Cmd-Tab
entry, crash isolation, and about zero extra disk, with shared services (vault, broker, CLI/MCP, link
router) in a headless runtime daemon reached over a socket (proven reachable from two apps at once).
The price is memory: about 320 MB RSS per running app against roughly 200 MB marginal per window in a
single runtime, so running many apps at once is linear; Theme D should keep the daemon thin and the
apps' main processes small. This confirms Decision 10's recommended default.

## Signing and notarization

Ad-hoc signed, every bundle is `rejected` by Gatekeeper (`spctl ... rejected`, no source line), as
expected for a signature with no identity; it still launches locally when started by `open` because
nothing quarantined it. Implications for Theme F (not done here, notarization was out of scope):

- The runtime is signed with Developer ID, hardened runtime, and notarized once. Cloned framework and
  helper bytes are identical, so their signatures stay valid in the stub.
- Each stub's outer seal (main binary, `Info.plist`, icon) is new. If stubs are created on the user's
  machine by the launcher, the files carry no quarantine attribute and are signed locally (ad-hoc, or
  with a stable local identity); this is the cheapest path and **must be confirmed on a clean machine**
  with a downloaded runtime. If stubs ship inside the downloaded bundle instead, each needs its own
  Developer ID signature and notarization, and clone-at-install is lost for them.
- A hardened-runtime Electron main binary needs the same entitlements as
  `packages/desktop/electron-builder.yml` today; the spike used none.

## Risks

- Quarantine and notarization of locally created stubs is reasoned, not measured (needs a clean Mac).
- Clones go stale on runtime update; the launcher needs a "re-clone all stubs" step and a version
  check (lockstep versions, Theme E).
- Helper processes keep their stock `Electron Helper` names and `com.github.Electron.helper` ids; they
  are background-only and did not appear as Dock apps, but Activity Monitor names are not branded.
- Memory per running app (about 320 MB RSS) is the real cost of this model.
- `safeStorage`, user-data dirs and single-instance locks key on the app's identity: each app now has a
  distinct one, which is why the vault must live in the runtime (Theme D).
- Not exercised: auto-update of a running stub, login items, `app.dock` badge, Handoff.

## Human pass (about 2 minutes)

Screen capture was deliberately not used, so Dock and Cmd-Tab rendering is confirmed by `lsappinfo`
and System Events only. To look at it:

1. `node scripts/spikes/dock-identity/dock-identity.mjs /tmp/dock-spike --keep --idle=60`
2. While it runs the spike 2 clone phase (about 3 to 5 minutes in), look at the Dock: expect a teal
   tile named **Cleaner** (and later **Monitor**, indigo) with flat-colour icons, not the Electron atom.
3. Press Cmd-Tab: expect one entry per app, with that name and icon.
4. During the spike 1 phase (earlier), expect a **Midnite Runtime** tile for the windows and a brief
   inert Cleaner tile that disappears when the stub exits.
5. Quit via `pkill -f '/tmp/dock-spike'`.
