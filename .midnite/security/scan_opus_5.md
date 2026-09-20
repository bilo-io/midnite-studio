# Opus 5 Security Scan — midnite-studio

Date: 2026-09-19

## Critical

### 1. Rebase plan fields are interpolated into a generated `/bin/sh` script
- File: `packages/git-engine/src/commands/rebase.ts`
- Lines: 34-38
- Issue: `startInteractiveRebase` writes a mode-`0o755` shell script whose body is `` `#!/bin/sh\ncat << 'EOF' > "$1"\n${todoContent}EOF\n` `` and hands it to git as `GIT_SEQUENCE_EDITOR` (line 41-47), so git executes it. `todoContent` comes from `formatRebaseTodo`, which concatenates the caller's `sha`, `subject` and `execCommand` verbatim with no newline stripping, so a `subject` containing a line that is exactly `EOF` terminates the quoted heredoc early and every following line becomes live shell in a script git is about to run. The result is arbitrary code execution as the desktop user, triggered by one IPC message.

- File: `packages/git-engine/src/exec/rebase-editor.ts`
- Lines: 93-109
- Issue: `formatRebaseTodo` is the function that builds the interpolated string. It does no escaping of any kind — `` lines.push(`${entry.action} ${entry.sha || ''} ${entry.subject || ''}`.trim()) `` — and the schema behind those fields (`packages/shared/src/domain/rebase.ts:19-21`) is three bare `z.string().optional()`, so the zod boundary in `ipc/handle.ts` accepts multi-line values unchanged. Reachability is honest: `mstudio:rebase:start` is registered (`main/ipc/rebase-handlers.ts:13-18`) and exposed on the preload bridge (`preload/index.ts:195`), but no renderer code calls it today — the channel is a live, unused entry point, so the exposure is "any renderer compromise becomes RCE", not "a user can trip over it".

### 2. `ops.rebase` passes a renderer string into git's option position, reaching `--exec=`
- File: `packages/git-engine/src/commands/sequencer.ts`
- Lines: 84
- Issue: `rebase()` builds `['rebase', options.onto]` with no `--end-of-options` and no leading-dash check, and `RebaseRequest.onto` is `z.string().min(1)` (`packages/shared/src/ipc/schemas.ts:1046-1049`). A renderer that sends `onto: "--exec=<command>"` makes git parse it as an option rather than a revision, and `git rebase --exec` runs `<command>` through `sh` after each replayed commit. Unlike finding 1 this channel is wired to real UI — the graph's drag-to-rebase calls it (`packages/app/src/features/graph/use-graph-actions.ts:113`) — so it is the shortest renderer-to-RCE path in the engine.

### 3. fetch, pull and push accept an arbitrary string in git's `<repository>` position
- File: `packages/git-engine/src/commands/sync.ts`
- Lines: 38, 63-64, 103-104
- Issue: `['fetch', options.remote ?? '--all']`, and the matching `args.push(options.remote)` in pull and push, put a caller-supplied string where git expects "a URL or the name of a remote"; the schemas are `remote: z.string().default('origin')` and `remote/branch: z.string().optional()` (`packages/shared/src/ipc/schemas.ts:1096-1104`) with no dash guard and no scheme check. A value of `ext::sh -c <command>` makes git's `ext` remote helper execute `<command>` — and `BASE_ENV` in `exec/git-exec.ts:52-58` never sets `GIT_PROTOCOL_FROM_USER=0`, so git treats the invocation as user-initiated and permits the `ext` transport. `--upload-pack=<command>` in the same field is the second form, executing locally whenever the repo's default remote is a local path.

---

## High

### 4. No `will-navigate` handler on the app's own windows, which carry the full preload bridge
- File: `packages/desktop/src/main/window.ts`
- Lines: 76-122
- Issue: `createWindow` installs a `setWindowOpenHandler` (119-122) but never a `will-navigate` or `will-redirect` listener, so a top-level navigation in the app's own renderer is allowed to proceed. That window runs with `sandbox: false` (line 93) and a preload that exposes git writes, pty spawn, scoped filesystem read/write and `shell.openExternal`, and `contextBridge` re-exposes that object on whatever origin the window ends up on. Dropping a file or a URL onto the window is enough to trigger such a navigation — Chromium navigates on drop by default and nothing in `packages/app/src` calls `preventDefault` on a window-level `drop`/`dragover` — so a `file://` or remote page can end up holding the bridge.

- File: `packages/desktop/src/main/window-manager.ts`
- Lines: 314-337
- Issue: `createRoleWindow` copies the same `webPreferences` and the same window-open handler, and likewise has no `will-navigate` guard, so every detached popout has the identical hole. The embedded-content paths are policed correctly by comparison (`browser-service.ts:377-393`, `apps-service.ts:100-105`), which is what makes the app's own windows the odd ones out rather than a deliberate exception.

### 5. The renderer ships with no Content-Security-Policy
- File: `packages/app/index.html`
- Lines: 1-46
- Issue: There is no `<meta http-equiv="Content-Security-Policy">` in the renderer's HTML, and no `session.webRequest.onHeadersReceived` anywhere in `packages/desktop/src` adds one (grep for `Content-Security-Policy` and `onHeadersReceived` across the repo returns nothing outside comments). The renderer therefore has no restriction on where it may load scripts, fetch, connect or embed from, so any injection that does land — and the app renders PR bodies, review comments, issue text, commit messages and agent output — has an unrestricted egress channel, and the loaded document can reach any origin with the preload bridge in scope. This is the mitigation that would have contained findings 1-4 at the renderer end; it is absent.

### 6. The screen lock is renderer-only state that a reload or devtools walks straight past
- File: `packages/app/src/store/ui-store.ts`
- Lines: 2078-2082
- Issue: `screensaverOpen` and `screensaverLocked` are initialised to `false` and are not in the store's `partialize` list, so they are runtime-only and reset on every rehydrate. The window's own reload IPC (`packages/desktop/src/main/window-chrome.ts:97-102`) is a bare `ipcMain.on` with no locked-state check, and `Mod+R` is bound to `app.reload` in the global keymap — so pressing it at a locked screen reloads the renderer, `screensaverLocked` comes back `false`, and the lock is gone without the passcode ever being asked for.

- File: `packages/desktop/src/main/menu.ts`
- Lines: 151
- Issue: `{ role: 'toggleDevTools' }` sits in the View menu unconditionally, not behind an `app.isPackaged` check, so a packaged build ships Cmd+Alt+I. Someone at an unattended, locked machine opens devtools and removes the overlay node or calls the store's setter directly — and, past that, holds the whole preload bridge. Given that the lock's entire threat model is "someone walks up to the machine", both of these are inside it rather than outside.

### 7. The shipped Electron major is outside the supported window
- File: `packages/desktop/package.json`
- Lines: 39
- Issue: The dependency is `"electron": "^33.2.0"` and the installed runtime is 33.4.11. Electron backports security fixes only to its three most recent majors, so a 33.x runtime receives no Chromium or Electron patches. That matters more here than in a typical Electron app because this one is a browser: `browser-service.ts` loads arbitrary remote origins into `WebContentsView`s in the same process tree, and `fs-protocol.ts` registers a privileged custom scheme with `supportFetchAPI` — exactly the two subsystems that context-isolation-bypass and custom-protocol CORS advisories target.

### 8. `install.sh` installs the app with no integrity check and then strips the quarantine bit
- File: `packages/website/public/install.sh`
- Lines: 44-54, 88, 141, 146
- Issue: The script downloads the release zip over `curl -fL` (88) and the only "verification" before it replaces `/Applications/Midnite Studio.app` is `verify_bundle` (44-54), which checks that `Info.plist` exists, the executable bit is set, and the Electron Framework is larger than 100 MB — a truncation check, not an integrity check. There is no sha256/sha512 comparison against the feed, no detached signature, and no `codesign --verify` or `spctl --assess`; the script then runs `xattr -dr com.apple.quarantine` (141) and `open`s the bundle (146), so Gatekeeper never assesses it either. Anyone who can alter the release asset on the public `bilo-io/midnite-apps` repo, or intercept the download, gets code execution on every machine that runs the documented `curl … | sh`.

---

## Medium

### 9. The remaining ref and path positionals have no end-of-options guard
- File: `packages/git-engine/src/commands/refs-ops.ts`
- Lines: 27, 42-43, 111-113
- Issue: `checkout <target>`, `checkout -b <name> <startPoint>` / `branch <name> <startPoint>`, and `tag [-a -F -] <name> <target>` all push renderer-supplied strings as bare positionals with no `--` before them, and the matching schemas are plain `z.string().min(1)` (`packages/shared/src/ipc/schemas.ts:1017-1040`). A value beginning with `-` is read by git as a flag instead of a ref, so the operation the user confirmed is not the operation that runs. None of these subcommands exposes an `--exec`-class flag, so this is behaviour subversion rather than direct execution — but it is the same missing guard that makes findings 2 and 3 exploitable, and the engine already does it correctly elsewhere (`log.ts:211-218` and `stash.ts:129` both pass `--end-of-options`).

- File: `packages/git-engine/src/commands/worktree-ops.ts`
- Lines: 26-35, 58-60
- Issue: `worktree add <path> [<branch>]` and `worktree remove <path>` have the same shape, with `WorktreeAddRequest`/`WorktreeRemoveRequest` unconstrained. `git worktree add --detach`-style values in the `path` position change where the worktree lands, and `worktree remove` reaching `--force` through its positional turns a refused removal into a completed one.

### 10. `browser.create` loads any URL scheme, while `browser.navigate` refuses all but http/https
- File: `packages/desktop/src/main/browser-service.ts`
- Lines: 422
- Issue: `createBrowserTab` ends in a bare `void wc.loadURL(url)` with no scheme check, while every other entry into the same pane is gated — `navigateBrowserTab` calls `checkNavigationUrl` at line 471, and `will-navigate`, `will-redirect` and `setWindowOpenHandler` are all policed at 377-414. `BrowserCreateRequest` (`packages/shared/src/ipc/schemas.ts:1932-1935`) is `{tabId, url: z.string().min(1)}` with no refinement, so `file:///Users/<you>/.ssh/config` typed into the new-tab omnibox loads in the `persist:browser` view, while typing the identical string into an existing tab's URL bar is correctly refused. The view has no preload and `sandbox: true`, so the impact is local-file disclosure into a web view rather than an escape, and the asymmetry is the defect.

### 11. The updater's four IPC channels have no sender check
- File: `packages/desktop/src/main/update-service.ts`
- Lines: 79-104
- Issue: `updateCheck`, `updateDownload`, `updateRestart` and `updateSetChannel` are raw `ipcMain.on` listeners that never resolve `event.sender`, unlike `browser-handlers.ts`'s `isFromOwningWindow` or the `handleFromSender` wrapper the rest of the app uses. Any webContents that can reach IPC can silently flip the feed channel (which turns on `allowDowngrade`, finding 12) or call `quitAndInstall`. Embedded views carry no preload, so today only the app's own renderer can reach these — this is a missing lock rather than an open door, and it is the lock every other stateful channel in the repo has.

### 12. The beta update channel enables `allowDowngrade`
- File: `packages/desktop/src/updates/feed-channel.ts`
- Lines: 18-20
- Issue: `feedChannelFor('beta')` returns `allowDowngrade: true`, applied to `autoUpdater` at `main/update-service.ts:52` and again at `:103`. With downgrade allowed, electron-updater accepts a `beta-mac.yml` advertising a version older than the one running and installs it, so whoever can write `midnite-studio/feed/` on the public `bilo-io/midnite-apps` `main` branch can pin every beta user back to a known-vulnerable prior release instead of only pushing forward. The stable channel is correct (`allowDowngrade: false`, line 21).

### 13. The logger's console arm bypasses redaction
- File: `packages/desktop/src/main/log.ts`
- Lines: 74-82
- Issue: `emit()` writes the raw `message` to `console.error`/`console.warn` at lines 78-79 and only then hands the same string to `sink?.write` at line 82. Redaction lives entirely in the sink (`log-sink.ts:226`, whose `serialise` calls `redactPaths`), so the NDJSON file on disk is clean while stderr is not. `redact.ts:37-59` covers the shapes that actually turn up here — `gh[pousr]_`, `github_pat_`, `sk-ant-`, `Bearer …`, and URL userinfo — which means a git remote error carrying `https://user:token@host` is scrubbed in the log file and printed verbatim to any terminal or parent process capturing the app's stdio.

### 14. A third-party API key is persisted in plaintext renderer storage and sent in the query string
- File: `packages/app/src/features/finance/finance-store.ts`
- Lines: 21, 41, 43
- Issue: `twelveDataApiKey` is a field of a zustand `persist()` store named `midnite.finance`, so it is written unencrypted into the renderer's LevelDB under `<userData>/Local Storage/` — readable by any local process running as the user and by anything that gets execution in the renderer. The repo already has the right mechanism twice over (`main/db/credential-vault.ts` and `main/companion/stt/credentials.ts` both go through `safeStorage`), and the file's own docstring at lines 14-20 records the asymmetry as a known consequence of fetching from the renderer instead of main.

- File: `packages/app/src/features/finance/finance-api.ts`
- Lines: 99, 111, 120
- Issue: The same key is appended to the request URL as `&apikey=${apiKey}` — in the query string rather than a header, and not `encodeURIComponent`'d. It therefore rides in the URL of every quote, search and history request, where it lands in any proxy or CDN access log on the path, and a key containing a reserved character is silently mangled rather than rejected.

### 15. Opening an untrusted repository directory honours that repository's own `.git/config`
- File: `packages/git-engine/src/exec/git-exec.ts`
- Lines: 52-64
- Issue: `BASE_ENV`/`WRITE_ENV` set four variables and deliberately do not override `HOME` or add any `-c` hardening — documented as the point of shelling out, since it is what inherits credential helpers and signing. The consequence is that git runs with the target repository's local config in force, so a repo *directory* an attacker supplies (an archive containing `.git/`, a shared volume, a downloaded sample) can set `core.fsmonitor`, `core.sshCommand` or `diff.external` and get a command executed by nothing more than browsing it. A repo cloned from a URL is unaffected, because clone does not copy config.

- File: `packages/desktop/src/main/repo-registry.ts`
- Lines: 62-80
- Issue: `openRepo` registers any path for which `rev-parse --show-toplevel` succeeds, with no prompt about trust and no `safe.directory`-style check, and the first reads that follow — status, log, `for-each-ref`, `config --get-regexp` — all run in that directory. `RepoOpenRequest.path` is `z.string().min(1)` (`packages/shared/src/ipc/schemas.ts:175-178`), so the root is chosen by the renderer rather than by a native dialog, and whatever it registers becomes a root the whole `fs*` jail then trusts.

---

## Minor / Hardening

### 16. Hardened-runtime entitlements disable library validation and allow DYLD environment variables
- File: `packages/desktop/resources/entitlements.mac.plist`
- Lines: 9-12
- Issue: `com.apple.security.cs.disable-library-validation` and `com.apple.security.cs.allow-dyld-environment-variables` are both true, and the inherit plist repeats them. Together they undo most of what `hardenedRuntime: true` buys: a local process that can write a dylib and set `DYLD_INSERT_LIBRARIES` can inject code into the signed bundle and inherit its TCC grants, which here include Apple Events automation (used to empty the Trash) and the microphone. Library validation is genuinely needed for the unsigned `.node` addons in an ad-hoc-signed build; the DYLD entitlement is not used by anything in this repo.

### 17. `isAdHocSigned` interpolates the bundle path into a shell command string
- File: `packages/desktop/src/main/update-service.ts`
- Lines: 20
- Issue: `` execSync(`codesign -dv --verbose=2 "${app.getPath('exe')}" 2>&1`) `` runs through `/bin/sh`, and double quotes do not neutralise backticks or `$( )`. A bundle sitting at a path containing `$(...)` — a Finder rename is enough — executes that substitution at every launch. The value is the user's own path rather than remote input, so this needs someone who can already place or rename the bundle; `afterpack.cjs:82` uses `execFileSync` with an argv array and is the shape this should be.

### 18. The screen-lock passcode is stored in the clear and compared in the renderer
- File: `packages/app/src/store/ui-store.ts`
- Lines: 2680-2681
- Issue: `passcode` is in the store's `partialize` list, so the user's chosen code is written verbatim into the renderer's persisted `midnite.settings` blob, unhashed and unencrypted. It sits next to the finance key in the same LevelDB directory, and the repo already routes real credentials through `safeStorage` in main.

- File: `packages/app/src/features/screensaver/passcode-pad.tsx`
- Lines: 159
- Issue: The check is `if (code === expected) onSuccess(code)`, with `expected` passed down from the store as a prop — so the correct value is present in renderer memory and in the React tree while the lock is displayed, and a devtools user reads it rather than guessing it. Combined with finding 6 this means the lock is an overlay, not a gate; that is defensible for a screensaver, but it should not be described to users as protecting anything.

### 19. Untrusted PR, issue and comment bodies load remote images directly
- File: `packages/app/src/features/reviews/pr-detail.tsx`
- Lines: 343-344
- Issue: The `img` component passes the body's `src` through `resolveGithubImageSrc` and straight into a real `<img>`, and every other markdown surface (`issue-detail.tsx`, `issue-conversation.tsx`, `pr-conversation.tsx`, `comment-thread.tsx`) uses react-markdown's default `img`. With no CSP (finding 5) and no image proxy, `![](https://attacker.example/beacon.png)` in a PR body fires the moment a reviewer opens the item, leaking the reviewer's IP, user-agent and an accurate read timestamp — including for private repositories. GitHub's own web UI proxies body images through camo for exactly this reason.

### 20. `ci.yml` has no workflow-level `permissions:` block
- File: `.github/workflows/ci.yml`
- Lines: 896
- Issue: `release.yml:29` and `website.yml:35` both pin `contents: read` / `packages: read` at the top of the file; `ci.yml` has no top-level block at all, and line 896 is the only `permissions:` in it — scoped to the `package` job. Every other job therefore inherits whatever the repository's default `GITHUB_TOKEN` scope is, and those jobs run `pnpm install --frozen-lockfile` with `GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_TOKEN }}` in the step environment, so a dependency's install script executes with that token available. If the repo default is read/write, a poisoned transitive dependency in a PR gets a write-capable token.

### 21. The Pages deploy token is written into a git remote URL on the runner
- File: `.github/workflows/website.yml`
- Lines: 174
- Issue: `git clone --depth 1 "https://x-access-token:${DEPLOY_TOKEN}@github.com/${repo}.git" pages` embeds the secret in the remote, so it is persisted into `pages/.git/config` on the runner and stays there for the `git push` at line 205. Actions masks the value in log output and the runner is ephemeral, so nothing leaks today — but any later step that archives or uploads the workspace, or any git error that echoes the remote, carries it out. `git config http.extraheader` keeps the token out of the on-disk config.
