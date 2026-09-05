# Phase 71 — Links that open in place, and the dev server they point at

**Refined: x1** · 2026-09-05 · functionality & edge cases, data model & IPC contract, persistence & migration, accessibility & keyboard, testing & verification, file-map precision, out-of-scope tightening

[Phase 32](phase-32-browser-engine-and-tabs.md) built a browser. Twenty-five places in this app still
open a link somewhere else.

`grep -rn "openExternal" packages/app/src` returns **twenty-five production call sites** across
Reviews, Actions, the Dashboard, the repos sidebar, the terminal, rendered markdown, the version
panel and two settings pages. Every one of them hands the URL to
[`openExternal(url: string): void`](../../../packages/app/src/services/queries.ts) at `:437–439`,
which fires `shell.openExternal` and returns nothing. A PR you are reviewing in the app opens in
Safari; a workflow run you are watching opens in Safari; a preview deployment a check just posted
opens in Safari. The pane sits behind all of it with an engine in it.

**This phase is Phase 32's Themes H and I, lifted out.** They were written into that doc, never
started, and were the half of it that touches the *rest* of the app rather than the browser's own
surface — twenty-five files Phase 32's remaining work never opens. Splitting them out is what lets
both ship. Phase 32 keeps occlusion, the new-tab page and the chrome; this one is everything that
learns to use them.

**The plumbing it needs already exists and has never been called.**
[`browser-store.ts:123`](../../../packages/app/src/store/browser-store.ts) declares
`openTab: (url?: string, originRepoId?: string) => string`, `effectiveGroupId` at `:83` derives
`` `repo:${originRepoId}` `` groups from that second argument, and `browser-store.test.ts:55–90`
covers it — but **no production caller has ever passed it**. Phase 32 Theme D built the derived-group
machinery and left the one field that feeds it unset. This phase supplies it.

**There is exactly one precedent to copy, and it is three lines.**
[`video-studio-pane.tsx:106–118`](../../../packages/app/src/features/video/video-studio-pane.tsx) is
the only place in the app that opens a URL *inside* the pane:

```ts
useUiStore.getState().setBrowserOpen(true);
useBrowserStore.getState().openTab(currentStatus.url);
```

No `originRepoId`, no layout choice, no setting, no modifier handling. It is the de-facto prototype of
`openInMidnite` and it becomes the first call site migrated onto it rather than the twenty-sixth
special case.

**Three of the old doc's bullets named things that do not exist, and the audit that found them is
the reason this phase can be executed at all.**

1. **`graph-view.tsx` has no remote links.** `grep -n "url|link|openExternal"` over
   [`features/graph/graph-view.tsx`](../../../packages/app/src/features/graph/graph-view.tsx) returns
   zero. The forge link the old bullet meant lives in
   [`repos-panel.tsx:1429`](../../../packages/app/src/features/repos/repos-panel.tsx) and
   [`use-repo-actions.ts:223`](../../../packages/app/src/features/repos/use-repo-actions.ts), both
   through [`forgeProjectUrl(forge)`](../../../packages/shared/src/domain/remote.ts) at `:77`, and
   [`e2e/remote-links.spec.ts`](../../../packages/app/e2e/remote-links.spec.ts) drives the **sidebar**
   to prove it.
2. **`details_url` does not exist in this repo.** `grep -rn "details_url\|detailsUrl" packages` is
   empty. [`gh-parse.ts:336,385`](../../../packages/desktop/src/main/forge/gh-parse.ts) maps GitHub's
   `html_url` onto `ForgeRun.url` / `ForgeIssue.url`, and
   [`forge.ts:77`](../../../packages/shared/src/domain/forge.ts) documents it as *"The run's page on
   the forge. Always https; opened through `shell.openExternal`."* Every bullet that said
   `details_url` now says `run.url` / `job.url`, and Theme D's preview matcher gets a **new** field
   rather than pretending one is there.
3. **`OPEN_EXTERNAL_PROTOCOLS` is not in main.** It is
   [`schemas.ts:867`](../../../packages/shared/src/ipc/schemas.ts) — `['http:', 'https:', 'mailto:']`
   — with `normalizeExternalUrl` at `:876` and `isOpenableExternally` at `:890` beside it, enforced
   once by `OpenExternalRequest`'s `.refine()` at `:892` and again in
   [`remote-handlers.ts:52–57`](../../../packages/desktop/src/main/ipc/remote-handlers.ts). Shared, not
   main. The distinction matters because this phase adds a **second** classifier ("in-app or not") and
   it must sit beside the first, not opposite it.

**Builds on.** Phase 17 (the `gh`-backed forge, `ForgeRun`/`ForgeIssue`), Phase 19 (the Actions view
and `run-detail.tsx`), Phase 20 (the Reviews view and `pr-detail.tsx`), Phase 23 (the palette and
`PALETTE_SAFE`), Phase 32 (the whole browser: `browser-store`, `openTab`, `originRepoId`, the derived
groups, `preview-deploy.ts`), Phase 39 (the status-bar rail), Phase 44 (`video-studio-pane.tsx`, the
one existing in-place opener), Phase 55 (multi-window; a link opened from a popout page window has to
reach the browser somewhere).

**Scope guardrails.** **No new IPC channel for link routing.** The decision of *where* a link opens is
renderer state; `shell.openExternal` and `mstudio:browser:*` both already exist, and this phase picks
between them. **`openExternal` stays.** It remains the only path for `mailto:` and for anything the
user has deliberately sent to the system browser; `OPEN_EXTERNAL_PROTOCOLS` is unchanged. **Only
`http:`/`https:` are ever eligible for in-app.** Theme B of Phase 32 already blocks everything else at
`will-navigate`, so routing a `mailto:` into a tab would produce a blocked-navigation error page
instead of an email client. **No git command, no git-engine change.** **`packages/app` never imports
`electron`.**

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — One entry point, and the setting that steers it (M)

Lands first; B and D both call into it. Nothing in this theme changes a single existing call site —
that is Theme B — so it can land and be tested on its own.

- [ ] `packages/app/src/services/open-in-midnite.ts` — the single entry point:
      `openInMidnite(url: string, options?: { originRepoId?: string; target?: LinkTarget; background?: boolean }): void`,
      where `type LinkTarget = 'in-app' | 'system'`.
  - With `target` omitted it reads `linkTarget` from the store (below). With `target: 'system'`, or
    with a URL whose protocol is not `http:`/`https:` per `normalizeExternalUrl`, it delegates to
    `openExternal(url)` and returns — one function, two outcomes, so no caller ever has to branch.
  - In-app: `useUiStore.getState().setBrowserOpen(true)` then
    `useBrowserStore.getState().openTab(url, originRepoId)`, then `activateTab` on the returned id
    unless `background` is true.
  - Store access via `getState()`, not hooks: the function is called from click handlers and from
    non-component code (`terminal-links.ts` hands a bare callback), and a hook would exclude half its
    callers.
  - Verified by a colocated `open-in-midnite.test.ts`: a `mailto:` URL reaches `openExternal` and never
    `openTab`, even with `target: 'in-app'`; an `https:` URL with `target: 'system'` reaches
    `openExternal`; the default reads the store.
- [ ] `linkTarget: LinkTarget` in [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts),
      defaulting to `'in-app'`, added to `PersistedUi` (`:1199–1208`) and `partialize` (`:1745`), with
      the persist `version` bumped **9 → 10** and a `migrate` arm (`:1841`) defaulting any older payload
      to `'in-app'`.
  - `ui-store`, not `browser-store`: it governs behaviour outside the browser feature — a markdown link
    in a commit message, a terminal hyperlink — and `browser-store` is scoped to tabs.
  - Verified: a seeded v9 payload migrates to v10 with `linkTarget: 'in-app'`.
- [ ] A **Link handling** section on
      [`browser-page.tsx`](../../../packages/app/src/features/settings/settings-pages/browser-page.tsx),
      above the existing **Data** section: *Open links in — **Midnite browser** (default) | System
      browser*, as a two-option radio group reusing
      [`controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx)'s
      existing primitives rather than a new one.
  - Help text names the escape hatches verbatim, because a modifier nobody is told about is a modifier
    nobody uses: *"`Cmd`-click opens a link in the other one. `Shift`-click always uses your system
    browser. Middle-click opens a background tab."*
- [ ] Modifier resolution as a **pure** exported function, not inline in a handler:
      `resolveLinkTarget(event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; button: number }, preference: LinkTarget): { target: LinkTarget; background: boolean }`.
  - Rules, in precedence order: `shiftKey` → `{ target: 'system', background: false }`; `button === 1`
    (middle) → `{ target: preference, background: true }`; `metaKey || ctrlKey` → the *opposite* of
    `preference`, foreground; otherwise `{ target: preference, background: false }`.
  - Shift wins over Cmd deliberately: "always leave the app" must be one unambiguous gesture, and a
    user holding both is asking for the stronger of the two.
  - Exhaustively unit-tested — this is the piece every call site depends on and the only piece with a
    combinatorial input space.
- [ ] A palette command `link.toggleTarget` ("Toggle where links open") in
      [`keybindings.ts`](../../../packages/shared/src/keybindings.ts) with **no chord**, an icon in
      [`command-icons.ts`](../../../packages/app/src/features/palette/command-icons.ts), and a place in
      `PALETTE_SAFE` — it flips a preference and destroys nothing. A chord-free command's label must
      come from `COMMANDS`, not `DEFAULT_KEYMAP`, or it renders as the raw id.

### B — Twenty-five call sites, routed (L)

Mechanical, but it is the theme that makes the phase visible. **Enumerate from
`grep -rn "openExternal" packages/app/src`, not from this list** — the list below is what the grep
returned on 2026-09-05 and exists to size the work, not to bound it.

- [ ] [`external-link.tsx`](../../../packages/app/src/features/markdown/external-link.tsx) — the widest
      blast radius, because every rendered markdown link in the app goes through it (commit messages,
      PR bodies, release notes, notes, slides).
  - Its `onClick` currently `preventDefault()`s unconditionally, which swallows `Cmd`, `Shift` and
    middle-click identically. Add an `onAuxClick` for `button === 1` and pass the event through
    `resolveLinkTarget`.
  - Its existing comment at `:5–21` explaining why `preventDefault` is used at all (the renderer is a
    `file://` origin; a real navigation replaces the whole app with no back button) stays and is
    **extended**, not replaced — that reasoning is still exactly why the handler exists.
  - Correct the same comment's claim that protocols are "enforced in main": they are enforced in
    `packages/shared/src/ipc/schemas.ts` and re-checked in `remote-handlers.ts`.
- [ ] Reviews — [`pr-detail.tsx:337`](../../../packages/app/src/features/reviews/pr-detail.tsx)
      (`pull.url`) and [`pr-files.tsx:105`](../../../packages/app/src/features/reviews/pr-files.tsx)
      (`pullUrl`, the truncated-patch escape). Both pass the PR's repo as `originRepoId` so the tabs
      land in that repo's derived group.
- [ ] Actions — [`run-detail.tsx:206`](../../../packages/app/src/features/actions/run-detail.tsx)
      (`run.url`), `:235` (the workflow YAML file), `:316` (`job.url`), and
      [`log-pane.tsx:113`](../../../packages/app/src/features/actions/log-pane.tsx) (`runUrl`). A CI log
      you are reading and the run page it came from belong in the same window; this is the strongest
      single argument for the whole phase.
- [ ] Repos sidebar — [`repos-panel.tsx:1429`](../../../packages/app/src/features/repos/repos-panel.tsx),
      [`use-repo-actions.ts:223`](../../../packages/app/src/features/repos/use-repo-actions.ts), and
      [`forge-sections.tsx`](../../../packages/app/src/features/repos/forge-sections.tsx) `:223`, `:314`
      and the generic `forgeRowMenu(url, what)` at `:454`. **These are the ones the old Phase 32 bullet
      wrongly attributed to `graph-view.tsx`.** `forgeRowMenu` is one function feeding several menus, so
      it is one edit covering three of the six.
  - Each of these knows its repo, so each passes `originRepoId`. This is the theme's payoff: open three
    PRs from three repos and the strip groups them without being asked.
- [ ] Dashboard — [`forge-widgets.tsx`](../../../packages/app/src/features/dashboard/widgets/forge-widgets.tsx)
      `:70`, `:120`, `:203`; forge detail —
      [`forge-detail.tsx`](../../../packages/app/src/features/forge/forge-detail.tsx) `:61`, `:131`.
- [ ] Terminal — [`terminal-view.tsx:573`](../../../packages/app/src/features/terminal/terminal-view.tsx)
      passes `openExternal` as a bare callback into
      [`attachTerminalLinks(term, open)`](../../../packages/app/src/features/terminal/terminal-links.ts).
      Swap the callback for one that calls `openInMidnite`. `terminal-links.ts` itself is
      **unchanged** — its whole design is that the opener is injected (`:211` says so), and a test
      already hands it a fake.
- [ ] [`video-studio-pane.tsx:106–118`](../../../packages/app/src/features/video/video-studio-pane.tsx)
      — replace the hand-rolled two-liner with `openInMidnite(url, { target: 'in-app' })`. It stays
      forced in-app regardless of the preference: a Remotion studio on localhost is the one link in the
      app whose entire point is the embedded pane.
- [ ] **Deliberately left on `openExternal`**, each with the one-line reason in the code:
      [`monitor-page.tsx:267`](../../../packages/app/src/features/settings/settings-pages/monitor-page.tsx)
      (filing a bug — the user is leaving to type into GitHub, and an in-app tab has no password
      manager), [`health-page.tsx:36`](../../../packages/app/src/features/settings/settings-pages/health-page.tsx)
      and [`version-notes-panel.tsx:85`](../../../packages/app/src/features/version/version-notes-panel.tsx)
      (release notes — read once, never returned to).
- [ ] `window.open` from an already-open page is **not** part of this theme.
      [`window.ts:100–104`](../../../packages/desktop/src/main/window.ts) and
      [`window-manager.ts:280–283`](../../../packages/desktop/src/main/window-manager.ts) both hold a
      `setWindowOpenHandler` using a `url.startsWith('http://')` prefix test — weaker than
      `normalizeExternalUrl`'s exact-protocol check, and duplicated verbatim in two files. Note it here,
      fix it in its own slice; it guards the *host* renderer, not the browser tabs (which have their
      own handler at `browser-service.ts:206–211`).
- [ ] An e2e case in a new `packages/app/e2e/link-routing.spec.ts`: with the preference on **Midnite
      browser**, clicking the "Open on GitHub" control in Reviews opens a browser tab and reaches
      `shell.openExternal` **zero** times; with the preference flipped, the reverse. The mock bridge
      already records `shell.openExternal` calls (`remote-links.spec.ts` asserts on them), so the
      assertion has a home.

### C — The dev server, detected but never assumed (M)

Phase 32 Theme H's unbuilt half. A dev server is the one URL a developer types most and the one the
app can work out for itself.

- [ ] `packages/app/src/features/browser/dev-server.ts` —
      `detectDevServer(pkgJson: unknown, probe: (port: number) => Promise<boolean>): Promise<DevServerHint | null>`
      where `DevServerHint = { port: number; source: 'script' | 'probe'; script?: string }`.
  - Read the repo's `package.json` `scripts` for a `dev` or `start` entry and extract an explicit
    `--port <n>` / `--port=<n>` / `-p <n>`. That is `source: 'script'` and needs no probe.
  - Otherwise probe `[3000, 4200, 5173, 8000, 8080]` in that order and take the first that answers.
    `source: 'probe'`.
  - `probe` is **injected**, so the unit test needs no network and no listening socket. This is the same
    shape `terminal-links.ts` uses for its opener and the reason that module is testable.
  - Prior art to imitate rather than invent:
    [`repo-lifecycle.ts:89`](../../../packages/app/src/features/repos/repo-lifecycle.ts) already reads a
    repo's `package.json` scripts looking for conventional dev-server script names. Reuse its read path.
- [ ] **Detection is a hint, never a navigation.** Nothing auto-opens. Say so in the module's doc
      comment, because the next reader's first instinct will be to open it.
- [ ] The probe itself needs main: a renderer cannot open a TCP socket. Add
      `devServerProbe: 'mstudio:browser:dev-server-probe'` alongside the browser channels
      ([`channels.ts:373–391`](../../../packages/shared/src/ipc/channels.ts)) taking
      `{ port: z.number().int().min(1).max(65535) }` and answering `{ listening: boolean }` — a
      `net.connect` to `127.0.0.1:<port>` with a 250 ms deadline, destroyed either way.
  - Loopback only, and the port range validated in the schema: this is the one channel in the phase that
    could otherwise be talked into scanning a host.
  - Verified in a `desktop` unit test against a fake `net` module: a refused connection answers
    `{listening: false}` without throwing, and a hung connection answers within the deadline.
- [ ] A detected server appears as a tile on the new-tab page, labelled with the port
      (*"Dev server · 5173"*), and as a palette command `browser.openDevServer` ("Open dev server").
      Absent — no tile, no command in the list — when nothing is listening or no repo is active. A
      disabled tile teaches nothing that an absent one does not.
- [ ] Persist the viewport preset. Phase 32 shipped the Mobile/Tablet/Laptop/Full `<select>` as
      component-local `useState` at
      [`browser-pane.tsx:149`](../../../packages/app/src/features/browser/browser-pane.tsx), so it
      resets every time the pane closes. Move it into `browser-store` under `partialize` — per tab, not
      global: one tab checking a mobile layout should not narrow the others.
- [ ] **Write the emulation limit down where a user sees it**, not only in a comment. The preset changes
      **width only**: `devicePixelRatio` and the user-agent string are untouched, so a page that branches
      on either is not fooled. True device emulation needs
      `Emulation.setDeviceMetricsOverride` through the debugger protocol and is out of scope. Put one
      muted line under the `<select>` saying so, and the same sentence in the code comment.
- [ ] Unit-test the port extraction (`--port 3001`, `--port=3001`, `-p 3001`, a `dev` script with no
      port, a `start` script only, no scripts block at all, a `package.json` that is not an object) and
      the preset bounds arithmetic as a pure function of the pane rect and the preset width.

### D — Preview deployments, found and offered (M)

The one feature in this phase that could not exist without the browser: a check run posts a URL, and
the app opens it beside the diff.

- [ ] Give `preview-deploy.ts` a real shape. It is currently ten lines and one regex with the six hosts
      inlined in an alternation:
      `matchPreviewDeploy(text: string): string[]`.
  - Export the allowlist as `PREVIEW_DEPLOY_HOSTS: readonly string[]` and build the pattern from it, so
    the list is readable, testable and settable. Match on **suffix boundaries** — the existing test's
    `https://myvercel.app.com` negative is the case that matters and must survive the refactor.
  - Make it a setting, seeded with `vercel.app`, `netlify.app`, `pages.dev`, `surge.sh`, `render.com`,
    `fly.dev`, `onrender.com`, in `browser-store` under `partialize` and edited from the Browser
    settings page. Self-hosted preview domains are the common case in private repos, and a constant
    makes that a code change. *(Resolved from Phase 32's open question.)*
- [ ] Replace the two inline test strings with fixtures. Add a real GitHub check-run payload and a real
      PR-comment payload under [`packages/app/src/test/fixtures/`](../../../packages/app/src/test) — the
      shape the ticked Phase 32 item claimed and never delivered — and assert against them, keeping both
      existing negatives.
- [ ] Feed the matcher something to read. Check runs render in
      [`pr-checks.tsx`](../../../packages/app/src/features/reviews/pr-checks.tsx), which today has **zero**
      `url` matches — the domain type carries no per-check URL at all.
  - Add `url: z.string().optional()` to the check-run schema in
    [`domain/forge.ts`](../../../packages/shared/src/domain/forge.ts) and map GitHub's `details_url`
    onto it in [`gh-parse.ts`](../../../packages/desktop/src/main/forge/gh-parse.ts) beside the existing
    `html_url` mappings at `:336`/`:385`. Optional, because a check run genuinely may not have one.
  - This is the item the old doc assumed was already done. It is the prerequisite for everything else in
    this theme.
- [ ] An **Open preview** affordance in the Reviews view: absent for zero candidates, a single button for
      exactly one, a small [`ContextMenu`](../../../packages/app/src/components/context-menu.tsx) for
      several. It calls `openInMidnite(url, { originRepoId: pull.repoId, target: 'in-app' })` — forced
      in-app, because a preview deployment beside the diff that produced it is the entire feature.
- [ ] Say in the code comment that this is a **heuristic over an allowlist** and will miss self-hosted
      preview hosts. A false negative is an absent button, which is the right failure; a false positive
      would be a button that opens a marketing page.
- [ ] Verified: `preview-deploy.test.ts` against the new fixtures; an RTL case in `pr-detail.test.tsx`
      asserting no button for zero candidates, a button for one, and a menu for three.

## Files this phase touches

**New — app (renderer)**
- `packages/app/src/services/open-in-midnite.ts` + `.test.ts` — the entry point and `resolveLinkTarget`.
- `packages/app/src/features/browser/dev-server.ts` + `.test.ts` — detection.
- `packages/app/e2e/link-routing.spec.ts` — the preference, both ways.
- `packages/app/src/test/fixtures/` — a check-run payload and a PR-comment payload for the matcher.

**Edited — shared**
- [`packages/shared/src/domain/forge.ts`](../../../packages/shared/src/domain/forge.ts) — the check
  run's optional `url`.
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts),
  [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts),
  [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — `devServerProbe`.
- [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) —
  `link.toggleTarget`, `browser.openDevServer`.

**Edited — desktop (main)**
- [`packages/desktop/src/main/forge/gh-parse.ts`](../../../packages/desktop/src/main/forge/gh-parse.ts)
  — `details_url` → the check run's `url`.
- [`packages/desktop/src/main/ipc/browser-handlers.ts`](../../../packages/desktop/src/main/ipc/browser-handlers.ts)
  — the loopback probe handler.

**Edited — app (renderer)**
- [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `linkTarget`, `version: 10`, its
  `migrate` arm.
- [`browser-store.ts`](../../../packages/app/src/store/browser-store.ts) — per-tab viewport preset, the
  preview-host allowlist.
- [`preview-deploy.ts`](../../../packages/app/src/features/browser/preview-deploy.ts) +
  [`.test.ts`](../../../packages/app/src/features/browser/preview-deploy.test.ts) — exported allowlist,
  fixtures.
- [`browser-page.tsx`](../../../packages/app/src/features/settings/settings-pages/browser-page.tsx) —
  Link handling, the preview-host list.
- [`browser-pane.tsx`](../../../packages/app/src/features/browser/browser-pane.tsx) — the preset moves
  to the store; the emulation-limit line.
- [`new-tab-page.tsx`](../../../packages/app/src/features/browser/new-tab-page.tsx) — the dev-server
  tile.
- [`external-link.tsx`](../../../packages/app/src/features/markdown/external-link.tsx),
  [`pr-detail.tsx`](../../../packages/app/src/features/reviews/pr-detail.tsx),
  [`pr-files.tsx`](../../../packages/app/src/features/reviews/pr-files.tsx),
  [`pr-checks.tsx`](../../../packages/app/src/features/reviews/pr-checks.tsx),
  [`run-detail.tsx`](../../../packages/app/src/features/actions/run-detail.tsx),
  [`log-pane.tsx`](../../../packages/app/src/features/actions/log-pane.tsx),
  [`repos-panel.tsx`](../../../packages/app/src/features/repos/repos-panel.tsx),
  [`use-repo-actions.ts`](../../../packages/app/src/features/repos/use-repo-actions.ts),
  [`forge-sections.tsx`](../../../packages/app/src/features/repos/forge-sections.tsx),
  [`forge-widgets.tsx`](../../../packages/app/src/features/dashboard/widgets/forge-widgets.tsx),
  [`forge-detail.tsx`](../../../packages/app/src/features/forge/forge-detail.tsx),
  [`terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx),
  [`video-studio-pane.tsx`](../../../packages/app/src/features/video/video-studio-pane.tsx) — routed
  through `openInMidnite`.
- [`command-icons.ts`](../../../packages/app/src/features/palette/command-icons.ts),
  [`safety.ts`](../../../packages/app/src/features/palette/safety.ts),
  [`use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts) —
  the two new commands.

**Unchanged and load-bearing**
- [`packages/app/src/services/queries.ts`](../../../packages/app/src/services/queries.ts)
  (**unchanged**) — `openExternal` stays exactly as it is and remains the only path for `mailto:` and
  for a deliberate hand-off to the system browser.
- [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts)'s
  `OPEN_EXTERNAL_PROTOCOLS` (`:867`), `normalizeExternalUrl` (`:876`), `isOpenableExternally` (`:890`)
  (**unchanged**) — this phase reads them, never widens them.
- [`terminal-links.ts`](../../../packages/app/src/features/terminal/terminal-links.ts) (**unchanged**) —
  its opener is injected by design; only the injection at the call site changes.
- [`window.ts`](../../../packages/desktop/src/main/window.ts) and
  [`window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts) (**unchanged**) — their
  duplicated `setWindowOpenHandler` prefix test is noted in Theme B and fixed elsewhere.
- `packages/git-engine` (**unchanged**) — no git command, no parser, no layout change.

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Unit: `resolveLinkTarget` across the full modifier matrix — plain, Cmd, Ctrl, Shift, Shift+Cmd,
      middle-click, middle+Cmd — against both preference values.
- [ ] Unit: `openInMidnite` sends `mailto:` to `openExternal` even with `target: 'in-app'`, and never
      calls `openTab` for a non-http(s) URL.
- [ ] Unit: `ui-store` v9 → v10 migration defaults `linkTarget` to `'in-app'`.
- [ ] Unit: `detectDevServer` — `--port 3001`, `--port=3001`, `-p 3001`, a `dev` script with no port, a
      `start`-only scripts block, no scripts block, a non-object `package.json`; and the probe order
      `3000, 4200, 5173, 8000, 8080` with an injected fake.
- [ ] Unit: the loopback probe handler answers `{listening:false}` on a refused connection and inside
      250 ms on a hung one, and rejects a port outside `1..65535` at the schema.
- [ ] Unit: `preview-deploy` against the new check-run and PR-comment fixtures, keeping both
      suffix-boundary negatives; and against a user-edited allowlist.
- [ ] Unit: the viewport preset is per tab and survives a close/reopen of the pane.
- [ ] RTL: Reviews shows no Open-preview button for zero candidates, a button for one, a menu for three.
- [ ] e2e: `link-routing.spec.ts` — with **Midnite browser** selected, the Reviews "Open on GitHub"
      control opens a tab and `shell.openExternal` is called zero times; with **System browser**
      selected, the reverse; `Shift`-click always reaches `shell.openExternal`.
- [ ] e2e: a PR opened from the Reviews view of repo A and one from repo B land in two different derived
      groups in the tab strip.
- [ ] **Open, for a human:** work a real PR review for ten minutes with the preference on Midnite
      browser and confirm nothing unexpectedly escapes to the system browser — the failure mode of this
      phase is a call site the grep missed.
- [ ] **Open, for a human:** run a dev server in a repo, open a new tab, and confirm the tile appears
      with the right port; stop the server and confirm it disappears rather than 404ing.

## Not in this phase

- **Everything Phase 32 still owns** — occlusion, the new-tab page's own residue, the browsing chrome,
  zoom, the error page. See [Phase 32](phase-32-browser-engine-and-tabs.md).
- **Fixing the duplicated `setWindowOpenHandler` prefix test** in `window.ts` / `window-manager.ts`. It
  is a real weakness and it guards the host renderer, not the browser; folding a security fix into a
  link-routing phase is how the fix gets reviewed as an afterthought.
- **Per-origin or per-repo link preferences.** One global preference plus three modifiers. A rules
  engine for "GitHub in-app, everything else out" is a settings surface of its own and nobody has asked
  for it.
- **A history or back-stack for in-app links.** A link opens a tab; the browser's own back button is the
  history. Giving the app a global navigation stack is Phase 42's `panel-stack`, not this.
- **Deep-linking *into* the app from a URL.** [`deep-link.ts`](../../../packages/app/src/services/deep-link.ts)
  exists and is the opposite direction.
- **True device emulation.** Width presets only — see Theme C.
- **Auto-opening a detected dev server.** Detection is a hint. An app that navigates somewhere because a
  port answered is an app that navigates somewhere you did not ask for.
- **Preview-deploy detection for anything but GitHub check runs and PR comments.** No deployment API, no
  webhook, no polling.

## Decisions / open questions

- **Resolved — this phase exists because Phase 32 was two phases.** Phase 32 stood at 99 items across
  nine themes. Its Themes H and I are the half that touches the rest of the app rather than the
  browser's own surface, and they share no file with what Phase 32 keeps. Split on 2026-09-05 during
  Phase 32's `x1` refinement; the two docs cross-link.
- **Resolved — the default is in-app.** A browser nobody's links reach is a browser nobody uses, and the
  three modifier escapes plus a one-click setting make the default cheap to reject. *(Chosen without the
  human on 2026-09-05.)*
- **Resolved — `linkTarget` lives in `ui-store`, not `browser-store`.** It governs behaviour in
  markdown, the terminal and the forge views — surfaces that exist with the browser closed — and
  `browser-store` is scoped to tabs.
- **Resolved — `Shift` beats `Cmd`.** "Always leave the app" must be one unambiguous gesture; a user
  holding both is asking for the stronger of the two.
- **Resolved — the preview-host allowlist is a setting, not a constant.** Self-hosted preview domains
  are the common case in private repos, which is exactly the repo this app is written in. Seeded with
  the seven public hosts. *(Resolves Phase 32's open question of the same name.)*
- **Resolved — the check run gets a new optional `url` field rather than reusing `html_url`.** Phase
  32's doc assumed a `details_url` this repo has never carried; `gh-parse.ts` maps only `html_url`, and
  a check run's *details* page and its *forge* page are genuinely different URLs.
- **Resolved — the dev-server probe is a main-process channel, loopback-only, port-validated.** A
  renderer cannot open a TCP socket, and the alternative — a `fetch` against `http://127.0.0.1:<port>`
  — is both slower and reachable by any page-side redirect. The schema's `1..65535` bound and the
  hard-coded `127.0.0.1` are what keep one narrow channel from becoming a scanner.
- **Resolved — `video-studio-pane.tsx` is forced in-app.** A Remotion studio on localhost is the one
  link in the app whose entire point is the embedded pane, and honouring a "system browser" preference
  there would break Phase 44's timeline editor for no gain.
- **Open — whether a middle-click background tab should reveal the pane.** *Recommendation:* no. Middle-
  click means "keep me where I am"; opening the pane over the view you are reading contradicts the
  gesture. The tab is there when you next press `Mod+b`, and a toast naming it would be enough if the
  silence turns out to feel broken.
- **Open — whether the Actions log's own in-line URLs should route too.** *Recommendation:* not in this
  phase. `log-pane.tsx` renders raw CI output and any linkifying it does is a separate surface from the
  "Open on GitHub" button this phase routes; doing both at once conflates a routing change with a
  parsing one.
