# Phase 91 — Security hardening and CVE readiness

**Written unattended** (no human in the loop — see Decisions) · 2026-09-20 · the second and third
passes over [`.midnite/security/scan_opus_5.md`](../../security/scan_opus_5.md), re-grounded against
the tree at `2d8b4e53`.

The first pass already exists. `scan_opus_5.md` (2026-09-19) is a 21-finding audit with file:line
evidence and honest reachability analysis, and this phase does not repeat it. What this phase adds
is the two passes the scan did not do: a **sweep for the classes it never looked at** — dependency
CVEs, `shell.openExternal` targets, the `mstudio-file:` scheme, socket permissions, redaction
coverage, the build pipeline, the release signature story, CI's token scope — and a **rewrite of
every finding into a deliverable specific enough to execute without judgement**.

> **This doc's own standard, and the reason it reads the way it does.** Every item below names
> **the file, the symbol, the exact guard, and the test that proves it**. A fast model — Sonnet 5,
> a Flash-class model, a swarm worker with no context beyond this file — must be able to open the
> named file, make the named change, and write the named test without deciding anything. Where a
> real decision remains, it is *not* in a checklist item: it is in **Decisions**, already resolved,
> with the answer stated. An item that reads "harden X" or "review Y" is a defect in this doc, not
> a task. If you find one, it is a bug — fix the doc first.

> **What this phase does NOT own, because [Phase 76](phase-76-the-renderer-in-a-sandbox.md) already
> does.** Phase 76 (`◻ TODO`, 0/35) is written to the same executable depth and owns five things
> outright. Do not duplicate them here, and do not let a swarm worker "helpfully" add them:
>
> | Owned by 76 | Theme | Scan finding it closes |
> |---|---|---|
> | The Electron major bump off EOL 33.4.11 | 76 A | 7 |
> | `sandbox: true` on both real windows | 76 B | part of 4 |
> | A Content-Security-Policy, and `will-navigate` on the app's own windows | 76 C | 4, 5, 19 |
> | The Twelve Data key out of `localStorage`, `ipwho.is` behind consent | 76 D | 14 |
> | 45 `ipcMain.on` channels onto `handleSend` | 76 E | part of 11 |
>
> Phase 91 owns everything else, and **the two phases have exactly three seams**, all noted at the
> item that touches them: Theme E's `web-contents-created` net subsumes 76 C's per-window
> `will-navigate` (whichever lands second deletes the other's duplicate); Theme G's redaction work
> guards the vault 76 D extracts; Theme I's Electron-freshness check is what stops 76 A's outcome
> silently ageing back out of support.

> **Scope guardrails.** No feature ships in this phase. Every theme is a boundary made real, a
> guard added, or a gate that fails a build — the app does the same things afterwards, with fewer
> ways to be made to do something else. **Agent prompt injection stays out of scope**: a council
> member or loop agent runs a shell with the user's privileges *by design*, that is the product,
> and no boundary here can make an agent's own actions safe — Phase 76 already named this and the
> position is unchanged. **Peer authentication on the broker and MCP sockets also stays out**, for
> Phase 76's stated reason (Node exposes no `getpeereid`; a token handshake re-proves the
> file-mode check) — Theme E fixes only the chmod-vs-bind *race*, which is a real defect rather
> than the deferred design. And no theme rewrites `browser-security.ts`: it is the strongest
> boundary in the repo and the audit found nothing to add to it.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

---

## Deliverables

### A — The rebase editor stops generating a shell script (L)

Scan finding **1**, the highest-severity item in the repo. [`rebase.ts:30-38`](../../../packages/git-engine/src/commands/rebase.ts)
writes a mode-`0o755` `/bin/sh` script whose body interpolates `todoContent`, and hands it to git as
`GIT_SEQUENCE_EDITOR`. The heredoc delimiter *is* quoted (`<< 'EOF'`), so `$`/backtick expansion is
inert — but a `subject` or `execCommand` containing a line that is exactly `EOF` closes the heredoc
early and every following line is live shell in a script git is about to execute. Commit subjects
are attacker-authored in any fetched repository.

- [ ] **Stop interpolating anything into the script.** In [`startInteractiveRebase`](../../../packages/git-engine/src/commands/rebase.ts)
      (`rebase.ts:12`), write `todoContent` to its own file — `path.join(dotGitPath, 'midnite-rebase-todo')`,
      `{ mode: 0o600 }` — and make the helper script's body the *constant* string
      `'#!/bin/sh\nexec cat "$MIDNITE_REBASE_TODO" > "$1"\n'`, passing the todo path through the env
      as `MIDNITE_REBASE_TODO` alongside `GIT_SEQUENCE_EDITOR`. The script then contains **zero**
      caller-derived bytes — not the plan, not even the path. Helper script mode becomes `0o700`,
      not `0o755`.
- [ ] **Delete both files in a `finally`.** `rebase.ts` currently leaves `.git/midnite-seq-editor.sh`
      on disk at `0o755` after every rebase, at a predictable path. Wrap the `execGit` call in
      `try`/`finally` and `fs.rmSync(helperScriptPath, { force: true })` +
      `fs.rmSync(todoPath, { force: true })` in the `finally`.
- [ ] **Harden `formatRebaseTodo` regardless** ([`exec/rebase-editor.ts:93-109`](../../../packages/git-engine/src/exec/rebase-editor.ts)).
      Before building each line, replace `/[\r\n]/g` with `' '` in `entry.sha`, `entry.subject` and
      `entry.execCommand`, and `.slice(0, 512)` the subject. A todo file is line-oriented; a value
      carrying a newline was always going to mean something other than what the caller intended,
      independent of the shell bug.
- [ ] **Constrain the schema** in [`shared/src/domain/rebase.ts:16-22`](../../../packages/shared/src/domain/rebase.ts).
      `RebaseEntrySchema` is five unconstrained fields today. Make `sha` `z.string().regex(/^[0-9a-f]{4,40}$/)`,
      make `subject` `z.string().max(512).refine((s) => !/[\r\n\0]/.test(s), 'subject must be a single line')`,
      and cap `entries` at `.max(1000)` in `RebaseSequencePlanSchema` (`:26-29`).
- [ ] **Remove `exec` from the renderer-reachable schema.** `formatRebaseTodo:98` emits
      `exec <execCommand>` and git runs it through `sh` — that is arbitrary shell by design, and
      **no renderer code sends it** (grep `execCommand` under `packages/app/src`). Drop `'exec'`
      from `RebaseActionSchema` and delete `execCommand` from `RebaseEntrySchema`; keep
      `parseRebaseTodo`'s ability to *read* an `exec` line from a todo git itself wrote, mapping it
      to a read-only display entry. Record the removal in the PR body as a deliberate capability cut.
- [ ] **Stop `process.env` clobbering the hardened env.** [`git-exec.ts:86-89`](../../../packages/git-engine/src/exec/git-exec.ts)
      is `{ ...(opts.write ? WRITE_ENV : BASE_ENV), ...opts.env }` — caller-supplied `env` wins.
      `rebase.ts:40-43` passes `{ ...process.env, GIT_SEQUENCE_EDITOR }` and `rebase.ts:90` passes
      `{ ...process.env, GIT_EDITOR: 'true' }`, so the whole ambient environment is reinstated over
      `WRITE_ENV`. Change both call sites to pass only the delta — `{ GIT_SEQUENCE_EDITOR: … }`,
      `{ GIT_EDITOR: 'true' }` — which is the shape [`sequencer.ts:165`](../../../packages/git-engine/src/commands/sequencer.ts)
      already uses. `buildEnv` keeps its current precedence; the fix is at the callers, and a
      comment on `buildEnv` records that `opts.env` is a deliberate override reserved for deltas.
- [ ] **Tests** in [`parsers/__tests__/rebase-editor.test.ts`](../../../packages/git-engine/src/parsers/__tests__/rebase-editor.test.ts)
      (2 cases today, neither adversarial): `formatRebaseTodo` with a subject of `"x\nEOF\nid\n"`
      produces a single line containing no `\n` inside the subject; with a 5,000-character subject
      it truncates; with a `sha` of `"--exec=touch /tmp/pwn"` the schema rejects before it reaches
      the formatter.
- [ ] **A test that the script is constant.** New `commands/rebase-editor-script.test.ts`: call
      `startInteractiveRebase` against a `TempRepo` ([`testing/temp-repo.ts`](../../../packages/git-engine/src/testing/temp-repo.ts))
      with a plan whose subject is `"EOF\nrm -rf /tmp/mstudio-canary"`, and assert the written
      helper script's bytes `toBe` the constant literal — a byte-for-byte equality, so any future
      interpolation fails the test rather than being merely "not exploitable this time".
- [ ] *Acceptance:* `.git/` contains neither `midnite-seq-editor.sh` nor `midnite-rebase-todo`
      after a rebase completes **or** aborts; the helper script test passes; `moon run :test` green.

### B — Every git positional gets an end-of-options guard (L)

Scan findings **2** and **9**, widened. The engine already knows the answer —
[`log.ts:215`](../../../packages/git-engine/src/commands/log.ts), `log.ts:281`, `log.ts:296`,
[`diff.ts:159`](../../../packages/git-engine/src/commands/diff.ts), `stash.ts:129/131/134` all pass
`--end-of-options`, and `log.ts:202-204` carries the reason verbatim ("belt to the schema's hex-only
braces, because this function is exported and the next caller may not validate as tightly"). The
grounding found **eight further command modules** that do not, plus the schemas behind them.

- [ ] **Export the two guards that already exist.** [`schemas.ts:246-251`](../../../packages/shared/src/ipc/schemas.ts)
      declares `SafeArgvString` (`!v.startsWith('-')`) and `SafePathspecString`, both
      **module-private**, both used by exactly two search schemas. Export them from
      `shared/src/ipc/schemas.ts` and re-export from the package index.
- [ ] **Add `SafeRefString` beside them**, modelled on the one existing allowlist —
      [`isSafeBlobRev`](../../../packages/shared/src/fs.ts) at `fs.ts:183`, whose docblock already
      argues the case. `z.string().min(1).max(256).refine(isSafeBlobRev)` is the whole
      implementation; do not write a second alphabet.
- [ ] **Apply them, schema by schema**, in [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts).
      This is a mechanical table — every one of these is `z.string().min(1)` today with no refine:
      `RepoOpenRequest.path` (`:175`), `WorktreeAddRequest.path`/`.branch`/`.startPoint` (`:191-198`),
      `WorktreeRemoveRequest.path` (`:199-202`), `CheckoutRequest.target` (`:1015`),
      `BranchCreateRequest.name`/`.startPoint` (`:1021`), `BranchDeleteRequest.name` (`:1026`),
      `BranchRenameRequest.from`/`.to` (`:1031`), `TagCreateRequest.name`/`.target` (`:1035`),
      `MergeRequest.source` (`:1041`), `RebaseRequest.onto` (`:1046`), `CherryPickRequest.shas`
      (`:1050`), `ResetRequest.target` (`:1051`), `StashSelector` (`:1183`),
      `RebaseStartRequest.targetRef` (`:2036`). Refs get `SafeRefString`; paths get
      `SafeArgvString`. `StageRequest`/`UnstageRequest`/`DiscardRequest.paths` (`:1056-1060`) become
      `z.array(SafePathspecString)` — they are `z.array(z.string())` today, which is the same gap
      one type further out.
- [ ] **Add `--end-of-options` at each argv site.** Also mechanical, and the list is complete:
      [`sequencer.ts`](../../../packages/git-engine/src/commands/sequencer.ts) `:61` (`merge`),
      `:84` (`rebase` — this is scan finding 2, the drag-to-rebase path), `:110` (`cherryPick`);
      [`refs-ops.ts`](../../../packages/git-engine/src/commands/refs-ops.ts) `:27`, `:42-43`, `:71`,
      `:94`, `:112-113`, `:144`;
      [`worktree-ops.ts`](../../../packages/git-engine/src/commands/worktree-ops.ts) `:27-34`, `:60`;
      [`stash.ts`](../../../packages/git-engine/src/commands/stash.ts) `:104`, `:120`, `:194`,
      `:218`, `:235` (note `:129-134` in the same file already does it — copy the neighbour);
      [`blame.ts:21`](../../../packages/git-engine/src/commands/blame.ts);
      [`reflog.ts:33`](../../../packages/git-engine/src/commands/reflog.ts);
      [`diff.ts:130`](../../../packages/git-engine/src/commands/diff.ts) (`show`, unlike `:159` in
      the same file); [`grep.ts:54`](../../../packages/git-engine/src/commands/grep.ts);
      [`log.ts:84`](../../../packages/git-engine/src/commands/log.ts) (`buildLogArgs` pushes
      `options.revisions` bare, and `LogStartRequest.revisions` is `z.array(z.string()).default([])`
      with no guard — the one high-traffic path the scan missed).
- [ ] **Extract a pure `buildXArgs` per command module.** Only `log.ts` (`buildLogArgs`) and
      `grep.ts` (`buildGrepArgs`) export one today; every other command inlines its array inside
      the async function that also calls `execGit`, so **there is nothing to assert against** —
      no `GitProcess` spy exists anywhere in the repo. Extract `buildCheckoutArgs`,
      `buildBranchArgs`, `buildTagArgs`, `buildResetArgs`, `buildMergeArgs`, `buildRebaseArgs`,
      `buildCherryPickArgs`, `buildWorktreeAddArgs`, `buildWorktreeRemoveArgs`, `buildStashArgs`,
      `buildFetchArgs`, `buildPullArgs`, `buildPushArgs` as named exports beside their callers.
      Pure functions, no I/O — this is the prerequisite for the next two items, not a refactor for
      its own sake.
- [ ] **Per-builder argv tests**, in the shape [`search.integration.test.ts:14-34`](../../../packages/git-engine/src/commands/search.integration.test.ts)
      already established (`expect(args).toEqual([...])` against the literal array). One
      `toEqual` per builder for the happy path.
- [ ] **One table-driven injection test** — new `commands/argv-injection.test.ts` — that
      enumerates every exported builder, feeds `'--exec=touch /tmp/mstudio-pwn'` and
      `'--upload-pack=touch /tmp/mstudio-pwn'` into each of its string fields in turn, and asserts
      for each that the value appears **after** the `--end-of-options` element in the returned
      array (`args.indexOf(value) > args.indexOf('--end-of-options')`). This single test is what
      makes the guard a property of the engine rather than 25 remembered call sites; adding a
      builder without a guard fails it.
- [ ] *Acceptance:* `grep -rn "args.push(options\.\|args.push(target\|args.push(path" packages/git-engine/src/commands`
      returns no line whose command array lacks an `--end-of-options` above it; the injection test
      passes with every builder enumerated (assert the enumerated count, so a new builder that is
      not registered fails).

### C — The remote field stops being a transport (M)

Scan finding **3**. [`sync.ts:38`](../../../packages/git-engine/src/commands/sync.ts) is
`['fetch', options.remote ?? '--all']`, with `args.push(options.remote)` in `pull` (`:63-64`) and
`push` (`:103-104`), and the schemas are `remote: z.string().default('origin')` /
`z.string().optional()`. That field is git's `<repository>` position, which accepts a URL —
including `ext::sh -c <command>`, which git's `ext` remote helper executes. Theme B's
`--end-of-options` closes `--upload-pack=`; it does **not** close `ext::`, because `ext::…` is a
legitimate value for that positional. This theme closes the transport itself.

- [ ] **Set `GIT_PROTOCOL_FROM_USER: '0'` in both `BASE_ENV` (`git-exec.ts:52-57`) and `WRITE_ENV`
      (`:60-64`).** Neither sets it today, so git treats every invocation as user-initiated and
      permits the `ext` transport. This one line is the highest-value change in the theme.
- [ ] **Add `GIT_ALLOW_PROTOCOL: 'file:git:ssh:http:https'` to both**, as the positive allowlist
      beside it — `ext`, `ftp`, and anything a future git adds are then refused by name rather than
      by the `FROM_USER` heuristic alone. Put the four-line rationale in a comment above `BASE_ENV`;
      the existing comment at `git-exec.ts:48-50` (on deliberately not overriding `HOME`) is the
      house shape for it.
- [ ] **Make `--all` a field, not a sentinel.** `FetchRequest` (`schemas.ts:1096-1099`) gains
      `all: z.boolean().default(false)`, and `sync.ts:38` becomes
      `['fetch', ...(options.all ? ['--all'] : []), '--end-of-options', options.remote ?? 'origin']`.
      A string field whose value may be a flag is the bug; removing the sentinel removes it.
- [ ] **Validate remote names against the repository's actual remotes.** `FetchRequest.remote`,
      `PullRequest.remote` and `PushRequest.remote` become `SafeArgvString` at the schema
      (Theme B), and in `sync.ts` each of `fetch`/`pull`/`push` resolves the name through
      [`listRemotes`](../../../packages/git-engine/src/commands/remotes.ts) first and returns
      `{ ok: false, kind: 'error' }` when it is not a known remote name. A URL in that field is
      then impossible rather than merely awkward: the app never asks the user to type one.
- [ ] **Validate the lease pair.** `sync.ts:101` builds `` `--force-with-lease=${ref}:${expect}` ``
      by string concatenation. Constrain `PushRequest.forceWithLease.ref` to `SafeRefString` and
      `.expect` to `z.string().regex(/^[0-9a-f]{7,40}$/)` in `schemas.ts`. The
      [`CLAUDE.md`](../../../CLAUDE.md) rule that only the explicit `ref:expect` form is ever built
      is unchanged — this is the guard that makes the built string match its own type.
- [ ] **Tests:** a `git-exec.test.ts` case asserting both env maps contain
      `GIT_PROTOCOL_FROM_USER: '0'` and `GIT_ALLOW_PROTOCOL`; a `sync.test.ts` case asserting
      `buildFetchArgs({ remote: 'ext::sh -c id' })` is rejected by the remote-name resolution (not
      merely escaped); a schema test that `PushRequest` rejects `expect: 'HEAD'`.
- [ ] *Acceptance:* a manual probe against a scratch repo — `fetch` with a remote named
      `ext::sh -c 'touch /tmp/mstudio-pwn'` configured in `.git/config` fails with a protocol
      error, and `/tmp/mstudio-pwn` does not exist. Record the probe's exact output in the PR body.

### D — DevTools, the release bundle, and the lock screen (M)

The human's explicit ask, plus scan finding **6**. Read [Decisions](#decisions--open-questions)
before starting: **minification does not make client-side code uncopyable**, and this theme does not
pretend it does.

- [ ] **Gate the DevTools menu role.** [`menu.ts:151`](../../../packages/desktop/src/main/menu.ts)
      is a bare `{ role: 'toggleDevTools' }` in the View menu, so a packaged build ships
      `Cmd+Opt+I` on the window that carries the whole preload bridge. Wrap it:
      `...(app.isPackaged && process.env['MSTUDIO_DEVTOOLS'] !== '1' ? [] : [{ role: 'toggleDevTools' }])`.
      The env escape hatch is deliberate — support needs a way in, and an env var is one a user
      cannot trip over.
- [ ] **Set `devTools: false` in `webPreferences` when packaged**, at both
      [`window.ts:76-102`](../../../packages/desktop/src/main/window.ts) and
      [`window-manager.ts:314-322`](../../../packages/desktop/src/main/window-manager.ts), behind
      the same `app.isPackaged && !MSTUDIO_DEVTOOLS` condition. The menu role is one door;
      `webContents.openDevTools()` from anywhere is another, and `devTools: false` closes both.
      `window.ts:131`'s dev-branch `openDevTools({ mode: 'detach' })` is already correctly gated
      behind `!app.isPackaged` — leave it.
- [ ] **Leave the browser pane's DevTools alone, and say why in the code.**
      [`browser-service.ts:499`](../../../packages/desktop/src/main/browser-service.ts)
      (`toggleBrowserDevTools`, reachable in production via `ipc/browser-handlers.ts:117`) opens
      DevTools on a `persist:browser` `WebContentsView` that has **no preload** and `sandbox: true`
      — it is a browser feature on a page that holds nothing. Add a three-line comment at `:493`
      recording that this is deliberate and what makes it safe, so the next audit does not
      re-raise it.
- [ ] **Make minification explicit rather than defaulted.** [`vite.config.ts`](../../../packages/app/vite.config.ts)
      sets no `build.minify` (Vite's default is `'esbuild'`, so it is on by accident) and no
      `esbuild` block. Add `build.minify: 'esbuild'`, `build.target: 'chrome130'` (the renderer only
      ever runs in one bundled Chromium — the default `'modules'` baseline is looser than needed and
      costs bytes), and `esbuild: { legalComments: 'none', drop: ['debugger'] }`. **Do not drop
      `console`**: the log seam is the support path, and Phase 65 built a diagnostics bundle that
      depends on it. `packages/desktop/scripts/bundle.mjs:71` already sets `minify: true`
      unconditionally with `keepNames: true` — no change there.
- [ ] **Stop shipping the build's own metadata.** `vite.config.ts:98` sets `manifest: true`, and
      [`electron-builder.yml:30-31`](../../../packages/desktop/electron-builder.yml) copies
      `../app/dist` wholesale into `renderer`, so `.vite/manifest.json` ships to users. It is read
      by `scripts/perf/bundle-report.mjs` from the *build* directory, never at runtime. Add
      `'!**/.vite'`, `'!**/*.map'` and `'!**/stats.html'` to the `extraResources` filter for that
      entry and `'!**/*.map'` to `files:` (`:20-25`).
- [ ] **Make the no-sourcemaps property structural.** Today it holds only because nobody sets
      `MSTUDIO_SOURCEMAP=1` — grepped across `.github/`, zero occurrences. Add an assertion to
      [`verify-dist.mjs`](../../../packages/desktop/scripts/verify-dist.mjs) (263 lines, already
      checks `codesign`, `hdiutil verify`, `Info.plist`, the blockmap) that walks the mounted
      bundle and fails on any `.map`, any `.vite/` directory, or any `stats.html`. The exclusion
      lines above are the fix; this is what proves it every release.
- [ ] **The lock screen stops being renderer state.** `screensaverLocked` lives in
      [`ui-store.ts:2078-2082`](../../../packages/app/src/store/ui-store.ts), outside `partialize`,
      so `Mod+R` (`app.reload`) rehydrates it to `false` and the lock is gone. Move the *authority*
      to main: a new `main/lock-state.ts` holding a module-level `locked: boolean`, two channels
      (`mstudio:lock:set`, `mstudio:lock:get`) declared in
      [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) and registered
      through `handleSend`/`handle`, and a guard in
      [`window-chrome.ts:97-102`](../../../packages/desktop/src/main/window-chrome.ts) that makes
      the reload IPC a no-op while `locked` is true. The renderer keeps its overlay state and
      hydrates it from `lock:get` on mount.
- [ ] **The passcode stops being plaintext, and stops being compared in the renderer.**
      `ui-store.ts:2714` persists `passcode` raw (set at `:2098`), and
      [`passcode-pad.tsx:159`](../../../packages/app/src/features/screensaver/passcode-pad.tsx)
      compares `code === expected` with `expected` passed down as a prop — the correct value is in
      the React tree while the lock is displayed. Move both: `mstudio:lock:set-passcode` takes the
      code, main stores `scryptSync(code, randomBytes(16), 64)` + the salt in the same
      `safeStorage` vault Theme G hardens, and `mstudio:lock:verify` takes a candidate and returns
      a boolean. Remove `passcode` from `partialize` and add a one-shot migration in
      `persist-rename.ts` that forwards any existing plaintext code to main and blanks the field.
- [ ] **Tests:** a `menu.test.ts` case asserting the View menu contains no `toggleDevTools` item
      when `app.isPackaged` is mocked `true`; a `lock-state.test.ts` case asserting the reload
      channel is refused while locked; a `passcode` test asserting the store's persisted blob
      contains no substring equal to the passcode after `setPasscode`.
- [ ] *Acceptance:* in a packaged build, `Cmd+Opt+I` does nothing on the main window and the View
      menu has no DevTools item; `strings` over the packaged asar finds no `.map`; pressing
      `Mod+R` at a locked screen leaves the lock up.

### E — The Electron security checklist, item by item (L)

Every item on [Electron's official checklist](https://www.electronjs.org/docs/latest/tutorial/security)
that Phase 76 does not own, plus the four `shell.*` and permission gaps the grounding found. The
repo scores well here — `mstudio-file:`'s privileges object is minimal and its jail fails closed,
`remote-handlers.ts:57` is a textbook double-checked `openExternal`, and the default session's
permissions *are* policed at `main/index.ts:337`. These are the remainder.

- [ ] **One global navigation net: `app.on('web-contents-created')`.** It does not exist (zero
      hits in `packages/desktop/src`), so navigation policy is remembered per construction site —
      and the two sites that forgot are `window.ts` and `window-manager.ts`, the two windows
      running `sandbox: false` with the full preload. Add it in a new
      `packages/desktop/src/main/web-contents-policy.ts` (+ `.test.ts`, pure like
      `browser-security.ts`), installed once from `main/index.ts` after `whenReady`: on every
      `web-contents-created`, attach `will-navigate`, `will-redirect` and `setWindowOpenHandler`
      that allow only the app's own origin and hand `http(s)` to `shell.openExternal`. **Seam with
      Phase 76 Theme C:** 76 C adds the same guard per-window. Whichever lands second deletes the
      other's duplicate and keeps the global one — note it in that PR's body.
- [ ] **Replace the two `startsWith('http://')` tests with the parsed-scheme one.**
      [`window.ts:120`](../../../packages/desktop/src/main/window.ts) and
      [`window-manager.ts:335`](../../../packages/desktop/src/main/window-manager.ts) both do
      `if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)`
      — a string-prefix test on the raw URL. Every other site in the repo parses:
      `normalizeExternalUrl` (`schemas.ts:944-962`) or `checkNavigationUrl`
      (`browser-security.ts:225-234`). Use `normalizeExternalUrl` at both, and open the
      **normalised `href`** it returns, not the input — that is the property `schemas.ts:944-962`
      exists for (`new URL` strips leading control characters, so `\njavascript:` and `javascript:`
      validate identically and only one is the string the OS would have received).
- [ ] **Delete `openInSystemBrowser`.** [`browser-service.ts:603-604`](../../../packages/desktop/src/main/browser-service.ts)
      is `export function openInSystemBrowser(url: string) { void shell.openExternal(url); }` with
      **zero callers** and **no guard**. Delete the function; do not "fix" it.
- [ ] **Confine the one unconfined `shell.*` path.** [`claude-handlers.ts:16`](../../../packages/desktop/src/main/ipc/claude-handlers.ts)
      calls `shell.showItemInFolder` on a raw renderer-supplied absolute path
      (`AgentRevealPathRequest = z.object({ path: z.string().min(1) })`, `schemas.ts:1562`) — the
      only shell-API site that does. Route it through `resolveScopeRoot` + `confineToRoot` exactly
      as [`fs-handlers.ts:203-208`](../../../packages/desktop/src/main/ipc/fs-handlers.ts) does,
      scoped to the Claude home root the channel is actually for.
- [ ] **Install the two missing permission handlers.** `setDevicePermissionHandler` and
      `setDisplayMediaRequestHandler` are unset on *every* session — the `denyAllPermissions` pair
      in [`browser-security.ts:58-59`](../../../packages/desktop/src/main/browser-security.ts)
      does not cover WebUSB/WebHID/serial device *selection* or `getDisplayMedia`. Add
      `denyAllDevices(session)` to `browser-security.ts` (deny-all for both) and install it on
      `session.defaultSession` (`main/index.ts:337`, beside the existing audio carve-out), on
      `persist:browser` (`browser-service.ts:220`) and on `persist:app-*`
      (`apps-service.ts:62`). Extend `browser-security.test.ts` with a case per session kind.
- [ ] **Give `mstudio-file:` a second lock.** [`fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts)'s
      handler validates the path perfectly but ignores the requester entirely; the isolation rests
      on `protocol.handle` binding to `session.defaultSession` alone (docblock `:19-25`). That
      holds only while nothing else is ever loaded into the default session. Add a
      `request.referrer` check to `resolveRequestPath` that refuses any referrer whose origin is
      not the app's own (`isAppOrigin`, `browser-security.ts:119-125`), returning the existing
      `invalid` → 404 arm. Extend `fs-protocol.test.ts` with a foreign-referrer case.
- [ ] **Fix the socket chmod race.** [`broker/server.ts:432`](../../../packages/desktop/src/broker/server.ts)
      and [`mcp/server.ts:198`](../../../packages/desktop/src/main/mcp/server.ts) both
      `chmodSync(path, 0o600)` **inside the `listen` callback** — between bind and chmod the inode
      exists at the process umask. The `0o700` parent (`broker-client.ts:597`, `mcp/server.ts:76`)
      is what actually closes the window, so this is belt not braces, but the fix is two lines:
      `const prev = process.umask(0o177)` before `listen`, restored in the callback. Assert the
      mode in the existing `broker/server.test.ts:209-213`. **Peer authentication stays deferred**
      per Phase 76's "Not in this phase" — this is the race only.
- [ ] **One `webPreferences` audit test.** New `main/web-preferences.test.ts` that imports the four
      construction sites' option objects (`window.ts:76`, `window-manager.ts:314`,
      `browser-service.ts:270`, `apps-service.ts:82`) and asserts, per site, the expected value of
      `contextIsolation`, `nodeIntegration`, `sandbox`, `webSecurity`, `allowRunningInsecureContent`,
      `experimentalFeatures`, `webviewTag` and the presence/absence of `preload`. Nobody weakens a
      default today; this is what keeps it that way, and it is the test that will catch Phase 76
      Theme B flipping `sandbox` (update it, do not delete it).
- [ ] *Acceptance:* `grep -rn "shell.openExternal" packages/desktop/src` returns only call sites
      whose preceding line parses the URL; the `web-contents-created` policy test covers a
      `file:`, a `javascript:` and an `https:` navigation; all four permission handler kinds are
      installed on all three session kinds.

### F — Teardown, listeners, and the leak test that proves them (M)

Memory management, the second half of the "Electron hygiene" ask. The grounding found teardown is
**already disciplined** — `closeBrowserTab` (`browser-service.ts:426-443`) does
`removeChildView` + `removeAllListeners` + `close()` with a comment explaining that the ~13 per-tab
closures are references too, and `discardBrowserTab` (`:460-463`), `apps-service.ts:140-143` and
`:265-268` all repeat the shape. Two real gaps and one missing proof.

- [ ] **Resolve the duplicate updater registrations.** [`update-service.ts:40-43`](../../../packages/desktop/src/main/update-service.ts)
      registers no-op handlers on four channels and `:79-97` registers real ones on **the same
      four**. If both paths run in one process those channels carry two listeners and both fire.
      Read the two call sites in `main/index.ts`, determine whether they are mutually exclusive,
      and either make it structurally impossible (one registration function with a branch) or add
      `ipcMain.removeAllListeners(channel)` before the real registration. State which in the PR body.
- [ ] **Write the leak test the teardown contract deserves.** `browser-service.test.ts:261` asserts
      `removeAllListeners` was called once — a contract test, not a leak test. Add
      `browser-service.leak.test.ts`: open 20 tabs, close all 20, and assert the module's `tabs`,
      `lastBounds`, `hiddenSince`, `keepAwakeTabIds` and `visibleTabIds` maps are all `size === 0`,
      and that the mock `win.contentView.removeChildView` call count equals the open count. Assert
      the map names from a single exported list so a sixth map added later fails the test.
- [ ] **Raise the listener ceiling where it is shared, and only there.** `setMaxListeners` has zero
      hits in `packages/desktop/src`. The ~13 listeners per tab are per-`webContents`, so no shared
      emitter is near Node's default 10 today — but `ipcMain` carries ~55 registrations. Add
      `ipcMain.setMaxListeners(100)` once in `main/index.ts` with a comment stating the count and
      the date it was measured, so the eventual `MaxListenersExceededWarning` is a deliberate
      signal rather than noise in a user's log.
- [ ] **Assert Phase 84's visibility gates actually stop work.** [Phase 84](phase-84-live-everywhere-lighter-when-hidden.md)
      added the blur/hide gates; `window-visibility-gate.ts` is the module. Add a test that drives
      the gate to `hidden` and asserts the registered tickers report stopped — and record the
      `idle-cpu --blurred` number from `scripts/perf/idle-cpu.mjs` in the PR body, since
      [`CLAUDE.md`](../../../CLAUDE.md)'s rule is that a perf claim comes with a number.
- [ ] *Acceptance:* the leak test passes and fails when `closeBrowserTab`'s `delete` calls are
      commented out (prove it, then restore); no channel has two listeners.

### G — Redaction that covers the secrets we actually hold, and a lint that stops new ones (M)

Scan finding **13**, widened considerably by the grounding. `redact.ts` is good work — it
deliberately refuses a generic-entropy rule so commit SHAs survive (`:31-34`) — but its output feeds
a diagnostics bundle designed to be pasted into the **public** `bilo-io/midnite-apps` tracker, and
the pattern list has real holes. Separately, the scan named `finance-store.ts` as *the* plaintext
credential; it is the smallest of three.

- [ ] **Redact the console arm.** [`log.ts:72-86`](../../../packages/desktop/src/main/log.ts)'s
      `emit()` writes the raw `message` to `console.error`/`console.warn` at `:74-76` and only then
      hands it to `sink?.write` at `:82`, where `log-sink.ts:226`'s `redactPaths` runs. Move the
      redaction up: compute `const safe = redactPaths(message, homeDir)` once in `emit` and use it
      for both arms. The sink keeps its own call (it is also reached directly); the double pass is
      idempotent.
- [ ] **Add the missing patterns** to `SECRET_PATTERNS` in [`redact.ts:36-49`](../../../packages/shared/src/redact.ts).
      Each is one regex; the list is exhaustive for what this app can plausibly hold:
      GitLab `/\bglpat-[A-Za-z0-9_-]{20,}/g` and `/\bgloas-[A-Za-z0-9_-]{20,}/g`;
      AWS `/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g`;
      Google `/\bAIza[0-9A-Za-z_-]{35}\b/g`;
      Stripe `/\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/g`;
      npm `/\bnpm_[A-Za-z0-9]{36}\b/g`;
      Slack app `/\bxapp-[0-9]-[A-Za-z0-9-]{10,}/g`;
      PEM `/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g`;
      and the query/env form `/\b(?:api[_-]?key|apikey|access[_-]?token|token|password|passwd|secret)=[^&\s'"]{8,}/gi`,
      which `:46`'s `(?:Bearer|Basic|token)\s+…` misses because it requires whitespace. Every new
      pattern gets a positive **and** a negative case in `redact.test.ts`; the negative case for
      the `=` form must include a 40-hex commit SHA in a `?rev=` URL, which must survive.
- [ ] **Make `redactRecord` recurse.** [`redact.ts:141`](../../../packages/shared/src/redact.ts) is
      one level deep and its own docstring admits it; a nested object's string leaves pass through
      untouched. Recurse with a depth cap of 8 and an array arm, and add a test with a
      three-level-deep secret.
- [ ] **`agentApiKeys` leaves `localStorage`.** [`ui-store.ts:2682`](../../../packages/app/src/store/ui-store.ts)
      persists `agentApiKeys` — a `Record<string,string>` (declared `:1350`, written `:1977`)
      holding `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`,
      `CURSOR_API_KEY`, `KILO_API_KEY` and `GITHUB_TOKEN`-shaped values, in plaintext under
      `midnite-studio.ui`; `persisted-keys.ts:35` classes it an ordinary preference and
      `agent-page.test.tsx:145` asserts `agentApiKeys['claude'] === 'sk-ant-test-key-12345'`, so
      the shape is not hypothetical. **This is a larger leak than the finance key the scan named,
      and no other phase owns it.** Move it behind the `safeStorage` vault (see the next item) with
      a write-only IPC surface — `agentApiKeySet(provider, value)`, `agentApiKeysConfigured()`
      returning `Record<provider, boolean>` — mirroring `companion/stt/credentials.ts:135`'s
      `configured()`, which answers "is a key stored" without decrypting. Remove it from
      `partialize` and add the one-shot migration through `persist-rename.ts`.
- [ ] **Vault files get a mode, and one degrade behaviour.** [`db/credential-vault.ts:86`](../../../packages/desktop/src/main/db/credential-vault.ts)
      and [`companion/stt/credentials.ts:80`](../../../packages/desktop/src/main/companion/stt/credentials.ts)
      both `writeFile(file, …, 'utf8')` with **no `mode`** → 0644, while `broker/server.ts:433` and
      `mcp/server.ts:198` both use `0o600`. Add `{ mode: 0o600 }` to both writes. They also degrade
      *differently* when `safeStorage.isEncryptionAvailable()` is false — `credential-vault.ts:115`
      silently no-ops and drops the secret, `stt/credentials.ts:117` keeps it in a process-memory
      `Map` and reports `encryptionAvailable: false` to the UI. Standardise on the `stt` behaviour
      (degrade loudly, session-only) in both. **Coordination:** [Phase 90](phase-90-multi-forge-integration.md)
      and Phase 76 Theme D both extract this into one module; whichever lands first owns the file
      and this theme amends it rather than forking a third.
- [ ] **A lint that fails on the next one.** New `packages/app/src/store/persisted-secrets.test.ts`:
      parse every `persist(` config under `packages/app/src` (the 12 stores are enumerable — see
      `store/persisted-keys.ts`), collect every key named in a `partialize`, and fail on any
      matching `/key|token|secret|password|passcode|credential|apikey/i` unless it is in an
      explicit `ALLOWED_WITH_REASON` map in the test file. Seed that map with `finance-store.ts`'s
      `twelveDataApiKey` and the reason "Phase 76 Theme D owns the migration" — so the allowlist is
      a visible debt register, and removing the last entry is the goal state.
- [ ] **Test the diagnostics bundle end to end.** `ipc/report-handlers.ts:86` is the one path whose
      output a user pastes in public. Add a `report-handlers.test.ts` case that seeds a log with one
      instance of **every** pattern in `SECRET_PATTERNS` and asserts none survives `formatBundle` —
      iterate the exported pattern list so a pattern added without a bundle test fails.
- [ ] *Acceptance:* `strings "$HOME/Library/Application Support/midnite-studio/Local Storage/leveldb/"*`
      contains no `sk-ant-`/`sk-`/`ghp_` string after migration; both vault files are `0600`; the
      persisted-secrets test fails when a credential-shaped key is added to any `partialize`
      (prove by adding one, then remove it).

### H — The install path, the update feed, and the signature story (M)

Scan findings **8**, **11**, **12**, **16** and **17**, plus the release-pipeline gaps. This is the
one theme whose failure mode is *everyone's* machine at once: `install.sh` is the documented
`curl … | sh` install, and it has no integrity check of any kind.

- [ ] **Publish a checksum.** [`release.yml`](../../../.github/workflows/release.yml) generates no
      `sha256` anywhere (grepped `sha256`/`shasum`/`checksum`/`attest`/`provenance` across all three
      workflows: zero hits). In the `release` job, after artifacts are downloaded and before the
      `softprops/action-gh-release@v2` step at `:225`, run
      `shasum -a 256 artifacts/**/*.dmg artifacts/**/*.zip > SHA256SUMS` and add `SHA256SUMS` to
      the `files:` list at `:234-238`.
- [ ] **Put the zip's digest in `version.json`** so the installer can reach it without a second
      round trip. `version.json` is written by `bilo-io/midnite-apps`'s own `release-feed.yml`
      (`release.yml:246-248`); this phase adds a `sha256` field to the shape and a matching change
      in [`/midnite-release-complete`](../../../.claude/skills/midnite-release-complete/SKILL.md)
      §4's checklist. Record in the PR body that the sibling repo's workflow needs the paired edit —
      it is outside this repo and cannot be landed here.
- [ ] **Verify it in `install.sh`.** [`packages/website/public/install.sh`](../../../packages/website/public/install.sh)
      downloads at `:87` (`curl -fL`) and its only check is `verify_bundle` (`:43-54`), which
      confirms `Info.plist` exists, the exe bit is set, and the Electron Framework exceeds 100 MB —
      a truncation check, not an integrity check. After the download, parse `sha256` out of the
      already-fetched `$feed` with the same `sed` idiom used for `version` (`:67`), compute
      `shasum -a 256`, and `fail` on mismatch. When the feed carries no `sha256` (an older release),
      warn and continue — not fail, or the installer breaks for every already-published version.
- [ ] **Assess the signature before installing, not never.** Add, after extraction and before the
      swap: `codesign --verify --deep --strict "$tmp/extracted/$APP"` and
      `spctl --assess --type execute "$tmp/extracted/$APP"`. Gate the existing
      `xattr -dr com.apple.quarantine` (`:141`) on both having passed — today it runs
      unconditionally, so Gatekeeper never assesses the bundle at all. When the build is ad-hoc
      signed (the current default, see the next item), `spctl` will refuse: print the refusal and
      require `MIDNITE_STUDIO_ALLOW_UNSIGNED=1` to continue, so the insecure path is opt-in and
      visible rather than silent.
- [ ] **Resolve the notarisation contradiction.** [`electron-builder.yml:140-148`](../../../packages/desktop/electron-builder.yml)
      has `hardenedRuntime: true` and `gatekeeperAssess: false` and **`notarize: false`**, while
      `afterSign: scripts/notarize.cjs` (`:160`) is wired, and `release.yml:94` only configures
      signing when `CSC_LINK` is present — otherwise `afterpack.cjs` ad-hoc signs. Determine which
      of the two notarisation paths is live, make the config say so, and write the answer into
      [`docs/RELEASING.md`](../../../docs/RELEASING.md). An ad-hoc-signed, un-notarised build with
      `hardenedRuntime: true` buys nothing from Gatekeeper, and the previous item's `spctl` gate
      makes that visible rather than theoretical.
- [ ] **Turn on the Electron fuses that apply.** No `@electron/fuses` usage exists anywhere. Add it
      to the `afterPack` hook ([`scripts/afterpack.cjs`](../../../packages/desktop/scripts/afterpack.cjs))
      with `EnableEmbeddedAsarIntegrityValidation: true`, `OnlyLoadAppFromAsar: true`,
      `EnableNodeOptionsEnvironmentVariable: false`, `EnableNodeCliInspectArguments: false`.
      **`RunAsNode` must stay enabled** — `electron-builder.yml:64-66` records that `broker.js` is
      launched via `ELECTRON_RUN_AS_NODE`, so disabling that fuse breaks the terminal broker.
      Write that constraint as a comment beside the fuse config, not just in this doc.
- [ ] **Drop the entitlement nothing uses.** [`entitlements.mac.plist`](../../../packages/desktop/resources/entitlements.mac.plist)
      and `entitlements.mac.inherit.plist` both declare
      `com.apple.security.cs.allow-dyld-environment-variables`, which is what makes
      `DYLD_INSERT_LIBRARIES` work against the signed bundle. Nothing in this repo sets a `DYLD_*`
      variable (grep). Remove it from **both** plists and confirm the packaged app still launches,
      the terminal spawns, and a DB query runs. Keep `disable-library-validation` — the unpacked
      native trees (`onnxruntime-node`, `sherpa-onnx`, `sharp`) genuinely need it; record that in a
      plist comment so the next audit does not re-raise it.
- [ ] **`allowDowngrade` stops being on.** [`feed-channel.ts:18-20`](../../../packages/desktop/src/updates/feed-channel.ts)
      returns `allowDowngrade: true` for `beta` (stable is correctly `false` at `:21`), applied at
      `update-service.ts:52` and `:103`. With it on, whoever can write `midnite-studio/feed/` on the
      public sibling repo can pin every beta user back to a known-vulnerable release. Set it
      `false` and add a test in `feed-channel.test.ts` asserting both channels.
- [ ] **Sender-check the four updater channels.** `update-service.ts:79-104` registers
      `updateCheck`, `updateDownload`, `updateRestart` and `updateSetChannel` as raw `ipcMain.on`
      listeners that never resolve `event.sender`, unlike `browser-handlers.ts`'s
      `isFromOwningWindow`. Migrate all four onto `handleSend` with an `isFromOwningWindow` check.
      **Seam with Phase 76 Theme E**, which sweeps these same four onto `handleSend` for schema
      validation — if 76 E has landed, this item is only the sender check.
- [ ] **`isAdHocSigned` stops using a shell.** [`update-service.ts:20`](../../../packages/desktop/src/main/update-service.ts)
      is `` execSync(`codesign -dv --verbose=2 "${app.getPath('exe')}" 2>&1`) `` — double quotes do
      not neutralise `$(…)` or backticks, so a bundle at a path containing them executes the
      substitution at every launch. Rewrite with `execFileSync('codesign', ['-dv', '--verbose=2',
      exePath], { stdio: ['ignore','pipe','pipe'] })`, which is the shape `afterpack.cjs:82`
      already uses.
- [ ] **Re-sync the website's copy.** `install.sh` changes must be mirrored byte-for-byte:
      `moon run website:sync-install -- --write`, then confirm `moon run website:sync-install`
      exits clean. [`CLAUDE.md`](../../../CLAUDE.md) explains why the copy exists.
- [ ] *Acceptance:* a real `curl … | sh` against the published feed installs and prints the
      verified digest; the same run with a deliberately corrupted local zip refuses and leaves
      `/Applications` untouched; `codesign -d --entitlements - "/Applications/Midnite Studio.app"`
      shows no `allow-dyld-environment-variables`.

### I — CI gates so none of this regresses (M)

Scan finding **20**, plus the largest single gap the grounding found: **a 1,695-entry lockfile with
no vulnerability scanner on any trigger**. Grepped `pnpm audit`, `npm audit`, `osv-scanner`, `snyk`,
`trivy`, `dependency-review`, `codeql`, `semgrep`, `gitleaks`, `sbom`, `syft`, `grype`, `attest`,
`provenance` across `.github/workflows/`, `moon.yml`, every `packages/*/moon.yml` and every
`package.json` — zero hits for all fourteen.

- [ ] **A top-level `permissions:` block in [`ci.yml`](../../../.github/workflows/ci.yml).** The
      file has none; the only `permissions:` in it is job-level at `:896-898` on `package`. The
      other seven jobs inherit the repo default token scope while running
      `pnpm install --frozen-lockfile` with `GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_TOKEN }}` in
      the step env, so a poisoned transitive dependency's install script gets whatever that default
      is. Add `permissions: { contents: read }` at the top, matching `release.yml:29-31` and
      `website.yml:35`. Note the comment those two files carry: a job-level block **replaces**
      rather than merges, so `package`'s own block stays as-is.
- [ ] **A `root:audit` moon task.** Add to [`moon.yml`](../../../moon.yml) beside `version-check`
      (`:48-55`), in the same shape — `command:`, `options.cache: false`, and **no `inputs`**, the
      convention `tracker-check`/`visual-budget`/`e2e-budget` follow for tasks that inspect on-disk
      state (see the comment at `moon.yml:71-77`). New `scripts/audit.mjs` runs
      `pnpm audit --json --audit-level=high`, filters against a committed
      `scripts/audit-suppressions.json`, and exits non-zero on anything unsuppressed.
- [ ] **Suppressions expire.** Each entry in `audit-suppressions.json` is
      `{ advisory, package, reason, expires }` with `expires` an ISO date, and `scripts/audit.mjs`
      fails on an expired entry rather than an unsuppressed one. A suppression with no end date is
      how a scanner becomes decorative. `scripts/audit.test.mjs` covers: unsuppressed high → exit 1;
      suppressed, unexpired → exit 0; suppressed, expired → exit 1 with the advisory named.
- [ ] **A `gate-audit` job in `ci.yml`** on `ubuntu-24.04` (this exercises no platform behaviour, so
      [`CLAUDE.md`](../../../CLAUDE.md)'s macOS rule does not apply, and the 5-concurrent-macOS cap
      is the reason to keep it off macOS). Steps: checkout, pnpm/node setup, install,
      `moon run root:audit`. Add it to whatever aggregate `needs:` gate the branch protection uses.
- [ ] **Renovate gets a security fast lane.** [`renovate.json`](../../../renovate.json) has no
      `vulnerabilityAlerts`, no `osvVulnerabilityAlerts`, no `minimumReleaseAge` — so a CVE patch
      queues behind `"schedule": ["before 9am on monday"]` (`:7-9`) with every cosmetic devDep bump.
      Add `"vulnerabilityAlerts": { "enabled": true, "schedule": ["at any time"] }`,
      `"osvVulnerabilityAlerts": true`, and `"minimumReleaseAge": "3 days"` (which blunts the
      classic compromised-release window that a Monday schedule otherwise walks into). Leave
      `automerge` absent — every bump stays a manual merge, per the repo's standing rule.
- [ ] **Allow-list install scripts.** The root [`package.json`](../../../package.json) `pnpm` block
      (`:18-31`) has `overrides`, `peerDependencyRules` and `patchedDependencies` but no
      `onlyBuiltDependencies`, so every one of ~1,695 transitive packages may run lifecycle scripts.
      Add `onlyBuiltDependencies` listing exactly the native packages that need it — `node-pty`,
      `better-sqlite3`, `dugite`, `electron`, `esbuild`, `onnxruntime-node`, `sharp`,
      `sherpa-onnx-node` — derived from `electron-builder.yml`'s `asarUnpack` list (`:61-114`) plus
      `esbuild`. Run a clean `pnpm install` and fix the list from the resulting warnings rather than
      guessing; record the final list in the PR body.
- [ ] **SHA-pin the two third-party actions.** All 43 `uses:` lines across the three workflows are
      tag-pinned; 0 are SHA-pinned. First-party `actions/*` (32 of 43) can stay on tags. Pin
      `pnpm/action-setup@v4` (10 uses, runs during install on every job) and — first —
      `softprops/action-gh-release@v2` (`release.yml:227`), which is handed
      `secrets.RELEASES_REPO_TOKEN`, a cross-repo **write** credential, behind a mutable tag. Use
      `uses: owner/repo@<40-hex> # v2.x.y` so Renovate can still bump them.
- [ ] **An Electron-freshness check.** New `scripts/electron-freshness.mjs`, wired as a
      `root:electron-freshness` moon task and a step in `gate-audit`: read the `electron` major from
      [`packages/desktop/package.json:39`](../../../packages/desktop/package.json), fetch the
      supported majors from the Electron releases endpoint, and **warn** (exit 0 with an annotation)
      when the pinned major is outside the supported three. Warn, not fail — a network call must
      never redden the gate, and the decision to bump is Phase 76 Theme A's human-run one. This is
      the item that stops 76 A's outcome silently ageing back out of support.
- [ ] *Acceptance:* `gate-audit` is green on `main` and red on a branch that adds a package with a
      known high advisory (prove it, then revert); `moon run root:audit` runs locally with no
      network container and no `pnpm install`; the expired-suppression test passes.

### J — A disclosure route, and the audit of record (S)

The repo has **no `SECURITY.md`**, no `.github/SECURITY.md`, no `docs/security/`, no issue
templates, no `CODEOWNERS`. It ships publicly through `bilo-io/midnite-apps` — so there are external
users and no documented way for one of them to report a vulnerability privately.

- [ ] **Write `SECURITY.md` at the repo root.** Content: supported versions (latest release only,
      macOS arm64); the private reporting route — GitHub private vulnerability reporting on
      `bilo-io/midnite-apps` (the public-facing repo, per
      [`CLAUDE.md`](../../../CLAUDE.md)), with an email fallback; a 5-working-day acknowledgement
      target and a 90-day disclosure window; and an explicit **out-of-scope** list naming the two
      deliberate positions this repo holds — agent prompt injection (an agent runs a shell with the
      user's privileges by design) and same-user access to the broker/MCP sockets (file modes are
      the boundary macOS offers). Both are already argued in Phase 76; `SECURITY.md` is where a
      reporter can find them before spending a weekend on one.
- [ ] **Commit the audits of record under `docs/security/`.** Move
      [`.midnite/security/scan_opus_5.md`](../../security/scan_opus_5.md) and
      `.midnite/security/scan_kilo.md` (both untracked today) to `docs/security/`, unchanged. See
      Decisions for why this is safe **and** for the standing rule that goes with it.
- [ ] **Add `docs/security/README.md` as the finding index** — one row per finding:
      `| # | Severity | Summary | Owning phase/theme | Status |`, seeded from `scan_opus_5.md`'s 21
      findings mapped onto Phase 76's themes and this phase's A–I. Status is `open` for all of them
      at write time; a theme's PR flips its rows. This is the artefact that answers "which of these
      are still live", which neither scan file can.
- [ ] **Record the visibility discrepancy.** `gh api repos/bilo-io/midnite-studio -q .visibility`
      returns **`private`** (verified 2026-09-20, `private: true`), but
      [`CLAUDE.md`](../../../CLAUDE.md)'s CI/billing bullet asserts the repo is public and prices
      macOS runners on that basis, while the downloads bullet asserts it is private. Both cannot be
      true, and the disclosure policy depends on the answer. Fix the CI bullet to match reality —
      and if the repo *is* meant to go public, the macOS-billing argument is sound but
      `docs/security/README.md` must be triaged to zero open criticals first. Apply the same edit to
      [`AGENTS.md`](../../../AGENTS.md) and [`GEMINI.md`](../../../GEMINI.md), per the sync rule.
- [ ] **Add the pre-publish gate to the security README**: before this repo's visibility is ever
      flipped, every `open` row in the finding index must be `fixed`, `wont-fix` with a reason, or
      moved to a private tracker. One paragraph, at the top of the file, where whoever flips the
      switch will read it.
- [ ] *Acceptance:* `SECURITY.md` renders in GitHub's Security tab; `docs/security/README.md`'s row
      count equals `scan_opus_5.md`'s finding count; the three convention files agree on visibility.

---

## Files this phase touches

**A — the rebase editor**
- [`packages/git-engine/src/commands/rebase.ts`](../../../packages/git-engine/src/commands/rebase.ts) — constant helper script, todo file, `finally` cleanup, env delta.
- [`packages/git-engine/src/exec/rebase-editor.ts`](../../../packages/git-engine/src/exec/rebase-editor.ts) — newline/length stripping in `formatRebaseTodo`.
- [`packages/shared/src/domain/rebase.ts`](../../../packages/shared/src/domain/rebase.ts) — hex `sha`, single-line `subject`, `exec` removed.
- [`packages/git-engine/src/exec/git-exec.ts`](../../../packages/git-engine/src/exec/git-exec.ts) — comment on `buildEnv` precedence only.
- New `packages/git-engine/src/commands/rebase-editor-script.test.ts`; existing [`parsers/__tests__/rebase-editor.test.ts`](../../../packages/git-engine/src/parsers/__tests__/rebase-editor.test.ts).

**B — argv guards**
- [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) — export `SafeArgvString`/`SafePathspecString`, add `SafeRefString`, apply to ~20 schemas.
- [`packages/shared/src/fs.ts`](../../../packages/shared/src/fs.ts) — `isSafeBlobRev` reused, unchanged.
- The eight command modules named in the theme, each gaining `--end-of-options` and an exported `buildXArgs`: [`sequencer.ts`](../../../packages/git-engine/src/commands/sequencer.ts), [`refs-ops.ts`](../../../packages/git-engine/src/commands/refs-ops.ts), [`worktree-ops.ts`](../../../packages/git-engine/src/commands/worktree-ops.ts), [`stash.ts`](../../../packages/git-engine/src/commands/stash.ts), [`blame.ts`](../../../packages/git-engine/src/commands/blame.ts), [`reflog.ts`](../../../packages/git-engine/src/commands/reflog.ts), [`diff.ts`](../../../packages/git-engine/src/commands/diff.ts), [`log.ts`](../../../packages/git-engine/src/commands/log.ts).
- New `packages/git-engine/src/commands/argv-injection.test.ts`.

**C — transports**
- [`packages/git-engine/src/exec/git-exec.ts`](../../../packages/git-engine/src/exec/git-exec.ts) — two env vars in both maps.
- [`packages/git-engine/src/commands/sync.ts`](../../../packages/git-engine/src/commands/sync.ts) — `--all` as a field, remote-name resolution, lease validation.
- [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) — `FetchRequest.all`, lease refinements.

**D — devtools, bundle, lock**
- [`packages/desktop/src/main/menu.ts`](../../../packages/desktop/src/main/menu.ts), [`window.ts`](../../../packages/desktop/src/main/window.ts), [`window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts), [`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts) (comment only), [`window-chrome.ts`](../../../packages/desktop/src/main/window-chrome.ts).
- [`packages/app/vite.config.ts`](../../../packages/app/vite.config.ts), [`packages/desktop/electron-builder.yml`](../../../packages/desktop/electron-builder.yml), [`packages/desktop/scripts/verify-dist.mjs`](../../../packages/desktop/scripts/verify-dist.mjs).
- New `packages/desktop/src/main/lock-state.ts` (+ test); [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts), [`features/screensaver/passcode-pad.tsx`](../../../packages/app/src/features/screensaver/passcode-pad.tsx), [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts).

**E — Electron checklist**
- New `packages/desktop/src/main/web-contents-policy.ts` (+ test), new `packages/desktop/src/main/web-preferences.test.ts`.
- [`browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts) (`denyAllDevices`), [`fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts), [`ipc/claude-handlers.ts`](../../../packages/desktop/src/main/ipc/claude-handlers.ts), [`broker/server.ts`](../../../packages/desktop/src/broker/server.ts), [`main/mcp/server.ts`](../../../packages/desktop/src/main/mcp/server.ts), `main/index.ts`, `window.ts`, `window-manager.ts`, `browser-service.ts`, `apps-service.ts`.

**F — teardown**
- [`packages/desktop/src/main/update-service.ts`](../../../packages/desktop/src/main/update-service.ts), `main/index.ts`, [`window-visibility-gate.ts`](../../../packages/desktop/src/main/window-visibility-gate.ts).
- New `packages/desktop/src/main/browser-service.leak.test.ts`.

**G — secrets**
- [`packages/shared/src/redact.ts`](../../../packages/shared/src/redact.ts) (+ its test), [`packages/desktop/src/main/log.ts`](../../../packages/desktop/src/main/log.ts), [`db/credential-vault.ts`](../../../packages/desktop/src/main/db/credential-vault.ts), [`companion/stt/credentials.ts`](../../../packages/desktop/src/main/companion/stt/credentials.ts), [`ipc/report-handlers.ts`](../../../packages/desktop/src/main/ipc/report-handlers.ts).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts), `store/persisted-keys.ts`, `store/persist-rename.ts`; new `packages/app/src/store/persisted-secrets.test.ts`.

**H — install and update**
- [`packages/website/public/install.sh`](../../../packages/website/public/install.sh) (+ the synced copy), [`.github/workflows/release.yml`](../../../.github/workflows/release.yml), [`packages/desktop/electron-builder.yml`](../../../packages/desktop/electron-builder.yml), [`packages/desktop/scripts/afterpack.cjs`](../../../packages/desktop/scripts/afterpack.cjs), [`resources/entitlements.mac.plist`](../../../packages/desktop/resources/entitlements.mac.plist) + `entitlements.mac.inherit.plist`, [`src/updates/feed-channel.ts`](../../../packages/desktop/src/updates/feed-channel.ts), [`main/update-service.ts`](../../../packages/desktop/src/main/update-service.ts), [`docs/RELEASING.md`](../../../docs/RELEASING.md).

**I — CI**
- [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml), [`release.yml`](../../../.github/workflows/release.yml), [`renovate.json`](../../../renovate.json), [`package.json`](../../../package.json), [`moon.yml`](../../../moon.yml).
- New `scripts/audit.mjs` + `scripts/audit.test.mjs` + `scripts/audit-suppressions.json`, new `scripts/electron-freshness.mjs`.

**J — disclosure**
- New `SECURITY.md`, new `docs/security/README.md`; `docs/security/scan_opus_5.md` and `scan_kilo.md` moved from `.midnite/security/`.
- [`CLAUDE.md`](../../../CLAUDE.md), [`AGENTS.md`](../../../AGENTS.md), [`GEMINI.md`](../../../GEMINI.md) — the visibility bullet, all three in one commit.

---

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme.
- [ ] **A:** the helper-script byte-equality test passes; no `.git/midnite-*` file survives a rebase or an abort; a plan whose subject is `"EOF\ntouch /tmp/mstudio-pwn"` completes the rebase and leaves no such file.
- [ ] **B:** `argv-injection.test.ts` enumerates every exported builder (assert the count) and every one places an injected value after `--end-of-options`.
- [ ] **C:** the manual `ext::` probe fails with a protocol error and its output is in the PR body.
- [ ] **D:** a packaged build has no DevTools menu item and no `.map`/`.vite`/`stats.html` in the artifact; `Mod+R` at a locked screen leaves the lock up.
- [ ] **E:** all four permission-handler kinds installed on all three session kinds; the `web-contents-created` policy test covers `file:`, `javascript:` and `https:`.
- [ ] **F:** the leak test fails when `closeBrowserTab`'s map deletes are removed (prove, then restore); the `idle-cpu --blurred` number is in the PR body.
- [ ] **G:** every pattern in `SECRET_PATTERNS` has a positive and a negative test; the 40-hex-SHA negative case survives; the persisted-secrets test fails on a new credential-shaped key (prove, then remove).
- [ ] **H:** a corrupted-zip install refuses and leaves `/Applications` untouched; `codesign -d --entitlements -` shows no `allow-dyld-environment-variables`; `moon run website:sync-install` exits clean.
- [ ] **I:** `gate-audit` red on a deliberately-vulnerable branch (prove, then revert); the expired-suppression test passes; the freshness script warns rather than fails with the network unreachable.
- [ ] **J:** `moon run root:tracker-check` exits 0; the three convention files agree on repo visibility.
- [ ] **Open, for a human — D and H:** one packaged-build pass on a real Mac. DevTools genuinely unreachable, a real `curl … | sh` install from the published feed, and an update from the previous version. No test covers the installer end to end, and it is the one path that runs on every user's machine.

---

## Not in this phase

- **Anything Phase 76 owns** — the Electron bump, `sandbox: true`, the CSP, the finance key, the `ipcMain.on` sweep. See the table in the framing.
- **Peer authentication on the broker and MCP sockets.** Deferred by Phase 76 for a stated reason that still holds; Theme E fixes only the chmod-vs-bind race.
- **Agent prompt injection.** The product runs agents with the user's privileges on purpose. Named in `SECURITY.md`'s out-of-scope list so a reporter knows before they start.
- **A general secrets manager or keychain UI.** Theme G moves `agentApiKeys` into the existing vault; the vault's shape is [Phase 90](phase-90-multi-forge-integration.md)'s to generalise.
- **`sk-`-shaped entropy detection in `redact.ts`.** The file argues against a generic high-entropy rule at `:31-34` because commit SHAs are the app's most common string; Theme G adds named patterns only, and that position is unchanged.
- **Migrating `finance-store.ts`'s key.** Phase 76 Theme D owns it; Theme G's lint carries it as the seed entry in the debt register instead.
- **CodeQL, Semgrep, gitleaks, SBOM generation, build provenance attestation.** Real gaps, all of them, but Theme I's dependency gate is the one with a live 1,695-package exposure behind it. Logged in [`outstanding.md`](../outstanding.md) rather than built.
- **Un-deferring Linux or Windows.** `gate-audit` runs on `ubuntu-24.04` because it exercises no platform behaviour — the same reasoning `CLAUDE.md` applies to `gate-node`.

---

## Decisions / open questions

- **Resolved — this phase is the second and third pass, not a re-audit.** The human asked for three
  passes: an Opus audit, a refinement, and a rewrite for a fast executor.
  [`scan_opus_5.md`](../../security/scan_opus_5.md) is pass one and is not repeated. This doc is
  passes two and three fused, because they produce the same artefact: a refinement that is not
  executable is just a longer list.
- **Resolved — minification does not make client-side code uncopyable, and this doc will not imply
  it does.** The ask was "minify/uglify the code when compiling for releases, so it cannot be easily
  copied — or at all copied." The honest answer: **"at all" is not achievable.** The renderer's
  JavaScript is executed by a Chromium the user controls; anyone can open the asar, extract the
  bundle, and read it — minified or not, and prettifiers plus an LLM make minified code readable in
  minutes. What minification actually buys is smaller bytes and a higher cost to *casually* lift a
  component. So Theme D does the things that genuinely help and skips the thing that does not:
  minify explicitly rather than by Vite's default, ship no sourcemaps and *assert* it, ship no build
  manifest, gate DevTools behind `app.isPackaged`, turn on ASAR integrity so the bundle cannot be
  swapped, and — the only real protection — **keep anything that must stay secret out of the
  renderer entirely**, which is what Theme G's vault work and Phase 76 Theme D's fetch-proxying are.
  No obfuscator (`javascript-obfuscator` and friends) is proposed: it costs startup time and bundle
  size, breaks stack traces the support path depends on, and delays a determined reader by an hour.
- **Resolved — commit the audit of record, under `docs/security/`.** Both scan files are untracked
  today, which means they exist on exactly one machine and vanish with it. `docs/security/` over
  `.midnite/security/` because `.midnite/` is the *tracker's* namespace and these are reference
  documents, and because `docs/` is where `TESTING.md` and `RELEASING.md` already live. The index
  (`docs/security/README.md`) is the part that matters: a raw scan goes stale the moment a theme
  lands, and a finding list with a per-row status does not.
- **Resolved — and this is the part the brief got wrong: the repo is PRIVATE.**
  `gh api repos/bilo-io/midnite-studio -q .visibility` returns `private` (`private: true`, verified
  2026-09-20), so committing unpatched findings exposes them to nobody outside the account today.
  That makes Theme J safe as written. But **`CLAUDE.md` asserts both**: the CI/billing bullet says
  "this repo is public" and prices macOS runners on it, the downloads bullet says "This repo is
  private". A disclosure policy cannot rest on a contradiction, which is why fixing the bullet is a
  checklist item and not a footnote. **If the repo is ever made public**, a committed file listing
  live, unpatched criticals with file:line reachability is a working exploitation guide — so the
  pre-publish gate in Theme J is the standing rule: triage every `open` row first. The alternative —
  never writing findings down — was considered and rejected: an audit nobody can find is an audit
  that gets redone, and this is the second scan file in `.midnite/security/` already.
- **Resolved — Theme A removes the `exec` rebase action rather than gating it.** `exec` is
  arbitrary shell by design, no renderer code sends it, and a settings toggle (the shape
  force-push uses) would be a switch whose only function is to re-enable an RCE for a feature
  nobody uses. Removing it from the schema costs nothing today and can be added back deliberately,
  with a confirm dialog, if an interactive-rebase UI ever wants it.
- **Resolved — Theme C validates remote *names* against `listRemotes` rather than allow-listing URL
  schemes in the field.** A scheme allowlist has to anticipate `ext::`, `ftp::`, future helpers and
  every `<transport>::<address>` form git may add. Resolving the name against the repository's own
  remotes makes a URL in that position impossible instead of merely filtered — and it matches what
  the UI actually does, which is offer a list.
- **Resolved — `gate-audit` on `ubuntu-24.04`, not macOS.** `CLAUDE.md`'s rule is that jobs
  exercising platform behaviour run on macOS and that the scarce resource is the 5-concurrent-macOS
  cap. A `pnpm audit` over a lockfile exercises nothing platform-specific, and adding a ninth macOS
  job to a queue already at the cap would slow every other gate.
- **Resolved — the freshness check warns, it does not fail.** A gate that makes a network call to a
  third-party endpoint is a gate that goes red on a plane, during an outage, and on a fork. The
  bump itself is Phase 76 Theme A's human-run decision; this only stops it being *forgotten*.
- **Resolved — `agentApiKeys` is this phase's, `finance` is Phase 76's.** Both are plaintext
  credentials in renderer `localStorage`, but 76 Theme D was written believing finance was the only
  one, and `agentApiKeys` is strictly worse (seven provider keys including a `GITHUB_TOKEN` slot,
  against one quote-API key). Splitting them by phase rather than merging avoids a merge conflict in
  `ui-store.ts`'s `partialize` between two in-flight phases; Theme G's lint carries finance as a
  dated allowlist entry so neither is forgotten.
- **Open — does `docs/security/README.md` belong in the app's Knowledge view?** Phase 87 built a
  panel over the repo's own graph, and a live finding index is exactly the kind of thing it could
  surface. Recommendation: no, not in this phase — it would be the first time the Knowledge view
  had a *curated* source rather than a generated one, and that is a design decision with its own
  consequences. Worth a line in [`outstanding.md`](../outstanding.md).
- **Open — should Theme H's `spctl --assess` gate be a hard failure once signing is configured?**
  It cannot be today, because the default build is ad-hoc signed and would refuse every install.
  Recommendation: ship it as the opt-in-to-continue form now, and flip it to a hard failure in the
  same PR that resolves the notarisation contradiction — one release cycle later, so a user on the
  current unsigned build can still upgrade to the signed one.
- **Open — `disable-library-validation` stays, and that is a real cost.** Together with
  `allow-unsigned-executable-memory` it means a local process that can write a dylib beside the
  unpacked native trees can inject into the signed bundle and inherit its TCC grants (Apple Events,
  microphone). The entitlement is genuinely needed by `onnxruntime-node`/`sherpa-onnx`/`sharp` in an
  ad-hoc-signed build. The real fix is signing those `.node`/`.dylib` files with the same identity
  as the app, at which point the entitlement can go. Recommendation: out of scope here, logged in
  [`outstanding.md`](../outstanding.md), and revisited when Theme H's notarisation question is
  answered — the two are the same piece of work.
