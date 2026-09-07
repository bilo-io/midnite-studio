# Phase 76 — The renderer in a sandbox, and the headers it never sent

**Written directly** (no human in the loop — see Decisions) · 2026-09-08 · from a surface-layer
security audit of `desktop/src/main`, `desktop/src/preload`, `shared/src/ipc` and the renderer's
remote-content paths.

Midnite Studio's trust boundaries are, on the whole, unusually well drawn for an Electron app. The
IPC layer parses every `invoke` payload with zod at the boundary
([`ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts)); the read-only fs surface has
a real path jail with symlink resolution ([`fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts));
the write surface closes its own TOCTOU window by writing through descriptors
([`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts)); the embedded browser
runs every page in a `sandbox: true`, preload-less `WebContentsView` on its own partition and refuses
every permission, every non-http(s) navigation and every download
([`browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts)); database
passwords go through `safeStorage` ([`db/credential-vault.ts`](../../../packages/desktop/src/main/db/credential-vault.ts));
crash records are redacted on the way in ([`shared/src/redact.ts`](../../../packages/shared/src/redact.ts));
every markdown surface that renders somebody else's text declines `rehype-raw` and says why; and both
Unix sockets sit in `0o700` directories at `0o600`. None of that is what this phase is about.

This phase is about the five things the audit found *around* those boundaries — each one a place
where the app is one layer thinner than its own comments believe it is.

> **Five findings, in the order they matter. Read them before Theme A.**
>
> **1. Electron is `33.4.11`, and Electron 33 left support in 2025.** [`packages/desktop/package.json:33`](../../../packages/desktop/package.json)
> pins `^33.2.0`; the lockfile resolves `33.4.11`. Electron supports the latest three majors, and 33
> fell off that list when 36 shipped. Every Chromium and V8 security fix since then is absent from
> the binary this app ships — including the renderer that displays PR bodies, issue comments and
> arbitrary web pages. Renovate's `electron` bump is not in the open PR set, and the
> `midnite-studio` convention is that dependency bumps are reviewed by a human, never merged by an
> agent (see Decisions). This theme is that human-run upgrade, with the packaged-app verification
> list it needs.
>
> **2. `sandbox: false` on every app window, for a reason that is no longer true.**
> [`window.ts:63–75`](../../../packages/desktop/src/main/window.ts) explains the choice: "The
> preload requires `@midnite/studio-shared` for the channel constants, which a sandboxed preload
> cannot do." But [`scripts/bundle.mjs:37`](../../../scripts/bundle.mjs) builds the preload with
> `bundle: true` and `shared` is not in its `external` list (`:55`) — the shipped `preload.js` has
> no `require('@midnite/studio-shared')` in it at all. The **only** Node API the preload actually
> uses is `node:os` — `homedir()` and `hostname()` at
> [`preload/index.ts:157–158`](../../../packages/desktop/src/preload/index.ts) — and the file
> already carries the pattern that removes that need: `additionalArguments` for
> `WINDOW_FRAMELESS_ARG`, `APP_VERSION_ARG` and `WINDOW_ROLE_ARG`. [`window-manager.ts:265`](../../../packages/desktop/src/main/window-manager.ts)
> mirrors the same `sandbox: false` for popouts, "verbatim", so both flip together.
>
> **3. There is no Content-Security-Policy anywhere.** No `<meta http-equiv>` in
> [`app/index.html`](../../../packages/app/index.html), no `onHeadersReceived` in main. The renderer
> is `contextIsolation: true` / `nodeIntegration: false`, and it loads local content — but it also
> renders markdown from GitHub, highlights code with shiki into `dangerouslySetInnerHTML`
> ([`slide-code.tsx:82`](../../../packages/app/src/features/slides/slide-code.tsx)), and `fetch`es
> four third-party hosts directly. A CSP is the layer that turns "we believe no injection path
> exists" into "an injection could not load a script or exfiltrate if it did". The renderer window
> also has a `setWindowOpenHandler` ([`window.ts:101`](../../../packages/desktop/src/main/window.ts))
> but **no `will-navigate` guard** — only the browser views have one
> ([`browser-service.ts:235`](../../../packages/desktop/src/main/browser-service.ts)). A dropped
> link or a crafted anchor could navigate the app's own document.
>
> **4. One credential lives in plaintext `localStorage`, and one widget leaks the user's IP by
> default.** [`finance-store.ts:15–23`](../../../packages/app/src/features/finance/finance-store.ts)
> says so itself: the Twelve Data key is "stored in plaintext in this store's own `localStorage`
> entry, unlike every other credential this app handles". And
> [`titlebar-status/weather-api.ts:9`](../../../packages/app/src/features/titlebar-status/weather-api.ts)
> calls `https://ipwho.is` for IP geolocation on the title-bar weather's first load — a network
> request carrying the user's public IP to a third party, with no consent step and no setting.
>
> **5. Forty-five one-way channels still hand-roll their own validation.**
> [`ipc/handle.ts:78–84`](../../../packages/desktop/src/main/ipc/handle.ts) documents it: Phase 65
> Theme B added `handleSend` and migrated exactly one channel, leaving "forty one-way channels" to a
> mechanical sweep. The count today is **45 `ipcMain.on(` sites across ten files** — 13 in
> `browser-handlers.ts`, 8 in `update-service.ts`, 6 in `window-chrome.ts`, 5 in `pty-handlers.ts`,
> 4 in `window-handlers.ts`, 3 in `terminal-handlers.ts`, 2 in `metrics-handlers.ts`, one each in
> `workflow-`, `tests-` and `repo-handlers.ts` — plus two raw `ipcMain.handle(` calls that bypass
> `handle()` entirely. Some parse; some trust. The sweep is what makes the answer "all of them".

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Scope guardrails.** Nothing here changes what the app *does* — every theme is a boundary made
real, not a feature. The embedded browser's own policy (`browser-security.ts`) is out of scope: it
is already the strongest boundary in the app and the audit found nothing to add. Renovate's open
dependency PRs are not touched by any theme; Theme A is a *deliberate*, human-driven Electron
upgrade in its own PR, and it is the one theme that must not run unattended.

## Deliverables

### A — Electron off the end-of-life line (L) — **human-run, not for a swarm**

The one theme a human executes, because a Chromium major is the one dependency that can break the
packaged app in ways CI does not see (native ABI, notarisation, `spawn-helper`, the broker's build
fingerprint). Sequenced first because everything after it is tested against the runtime it produces.

- [ ] Bump `electron` in [`packages/desktop/package.json:33`](../../../packages/desktop/package.json)
      to the **oldest currently-supported major** (not the newest — the supported window is three
      majors; the oldest of the three has had the most patch releases), and `electron-builder` to the
      release that supports it. Record both versions and the Chromium/Node they carry in the PR body.
- [ ] `pnpm install`, then `electron-rebuild` for `node-pty` — the single-ABI constraint from
      [`INITIAL_PLAN.md:27`](../../../docs/INITIAL_PLAN.md). Confirm `scripts/fix-node-pty.cjs`'s
      `spawn-helper` chmod still applies to the rebuilt binary.
- [ ] Read the Electron breaking-changes notes for every major crossed and grep this repo for each
      removed/renamed API. Known suspects from the audit: `protocol.handle` semantics
      ([`fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts)), `WebContentsView`
      bounds behaviour ([`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts)),
      `safeStorage` availability at boot ([`credential-vault.ts`](../../../packages/desktop/src/main/db/credential-vault.ts)),
      `setWindowOpenHandler` return shape, and `session.setPermissionCheckHandler`'s signature.
- [ ] `moon run :typecheck :lint :test` green, then `moon run app:build desktop:bundle` and the
      **full** `scripts/perf/` suite (`startup-report --runs=5`, `bundle-report`, `idle-cpu
      --blurred`, `memory-report --action=terminal`) — a Chromium major moves every number in
      [`budgets.json`](../../../scripts/perf/budgets.json), and the PR body carries the before/after
      table. A regression past a budget is a finding for the PR, not a reason to rebaseline silently.
- [ ] `moon run desktop:dist` and `verify-dist.mjs` pass; install the built app beside the running
      one and confirm the broker handshake — the new build must find the old broker as a *legacy*
      peer with its sessions still reachable ([`main/broker-client.ts`](../../../packages/desktop/src/main/broker-client.ts)),
      then retire it. This is the one scenario no test covers and the one a Chromium bump is most
      likely to break.
- [ ] **Open, for a human:** one full day on the upgraded build before merge — terminal, browser
      tabs, a Monaco edit, a DB query, a council run. The `midnite-release-prep` skill's checklist is
      the shape of this pass.

### B — `sandbox: true`, because the reason for `false` no longer exists (M)

- [ ] Add `HOME_DIR_ARG` and `HOSTNAME_ARG` beside `WINDOW_FRAMELESS_ARG`/`APP_VERSION_ARG`/
      `WINDOW_ROLE_ARG` in `shared` (wherever those three are declared — `grep -rn WINDOW_ROLE_ARG
      packages/shared/src`), and pass `os.homedir()`/`os.hostname()` through `additionalArguments`
      from both [`window.ts`](../../../packages/desktop/src/main/window.ts) and
      [`window-manager.ts:266`](../../../packages/desktop/src/main/window-manager.ts). Main already
      imports `node:os` elsewhere; the preload stops.
- [ ] Delete `import { homedir, hostname } from 'node:os'` at
      [`preload/index.ts:1`](../../../packages/desktop/src/preload/index.ts) and read the two values
      from `process.argv` exactly the way `versionArg`/`roleArg` are read (`:49–60`). `process.argv`
      and `process.platform` remain available to a sandboxed preload; `node:os` does not.
- [ ] Flip `sandbox: false` → `sandbox: true` at [`window.ts:75`](../../../packages/desktop/src/main/window.ts)
      and [`window-manager.ts:265`](../../../packages/desktop/src/main/window-manager.ts) in the same
      commit, and **rewrite the comment** at `window.ts:63–68` to state the new fact: the preload is
      bundled by `scripts/bundle.mjs`, uses no Node builtin, and the only things it reads from the
      host are `contextBridge`, `ipcRenderer`, `process.argv` and `process.platform`.
- [ ] Grep the preload for every other Node touch a sandbox refuses: `Buffer`, `process.env`,
      `setImmediate`, `require(`. The audit found none beyond `node:os`, but the grep is the
      acceptance test, not the audit.
- [ ] A vitest under `packages/desktop/src/preload/` that imports the built `dist/preload.js` as
      text and asserts it contains no `require("node:` / `require('node:` — the guard that keeps a
      future contributor from silently reintroducing the dependency and getting a blank window in
      production only.
- [ ] *Acceptance:* the app boots, `window.midniteStudio.homeDir` and `.hostname` return the same
      values as before, a popout opens, and Playwright's existing `mock-bridge.ts` fixtures are
      untouched (they never ran under the real preload).

### C — A Content-Security-Policy, and a `will-navigate` guard for the app's own window (M)

- [ ] Add the policy in **main**, via `session.defaultSession.webRequest.onHeadersReceived`, not a
      `<meta>` tag — a header covers popouts and any future window for free, and a `<meta>` CSP
      cannot express `frame-ancestors` or be varied between dev and packaged. New module
      `packages/desktop/src/main/csp.ts` + `.test.ts` exporting a pure `buildCsp({ dev, hosts })`
      string builder (testable without Electron, like `browser-security.ts`) and an
      `installCsp(session, opts)` installer.
- [ ] The packaged policy, derived from the audit's inventory of what the renderer actually loads:
      `default-src 'self'` · `script-src 'self'` · `style-src 'self' 'unsafe-inline'` (Tailwind's
      runtime and Monaco both set inline styles — record this as the one accepted weakening) ·
      `img-src 'self' data: blob: mstudio-file: https:` (avatars come from the forge's own CDN
      hosts; `https:` is broad — see Decisions) · `media-src 'self' blob: mstudio-file:` ·
      `font-src 'self' data:` · `worker-src 'self' blob: data:` (Monaco's `?worker&inline` workers —
      [`vite.config.ts:57–73`](../../../packages/app/vite.config.ts)) · `connect-src 'self'
      mstudio-file: https://api.open-meteo.com https://geocoding-api.open-meteo.com
      https://api.twelvedata.com https://api.coingecko.com https://ipwho.is` · `object-src 'none'` ·
      `base-uri 'self'` · `frame-ancestors 'none'`. The `connect-src` host list is the *complete*
      set of renderer-side `fetch` targets found in `features/weather`, `features/finance` and
      `features/titlebar-status`; Theme D shrinks it.
- [ ] The dev policy: identical, plus `connect-src ws://localhost:5173 http://localhost:5173` and
      `script-src http://localhost:5173` for Vite's HMR client — gated on the same
      `DEV_SERVER_URL` branch [`window.ts:13,112`](../../../packages/desktop/src/main/window.ts)
      already takes, never on `NODE_ENV`.
- [ ] Scope the header to the app's own documents: match on the `mstudio-file:`/`file:`/dev-server
      URL of the main frame and **skip** the `persist:browser` partition entirely — an embedded
      page's CSP is its own site's business, and `browser-security.ts` is that partition's policy.
- [ ] `win.webContents.on('will-navigate', …)` on the app window in `window.ts` and
      `window-manager.ts`: allow only the app's own origin (the `file:`/`mstudio-file:` bundle or
      `DEV_SERVER_URL`); `event.preventDefault()` everything else and hand `http(s)` to
      `shell.openExternal` through the same http/https gate `setWindowOpenHandler` already uses at
      `window.ts:102`. Same for `will-redirect`.
- [ ] A Playwright e2e that loads the built renderer, injects `<img src="https://example.invalid/x">`
      and an `<a href="https://example.com">` click, and asserts via `page.on('console')` that the
      first is refused by CSP and the second is *not* a navigation (the document URL is unchanged).
- [ ] *Acceptance:* zero CSP violations in the console across the full `app:e2e` suite — the suite
      is the inventory of everything the renderer loads, and a violation it triggers is a resource
      the policy above forgot.

### D — Widget credentials leave `localStorage`, and the IP lookup asks first (M)

- [ ] Move the Twelve Data key out of [`finance-store.ts`](../../../packages/app/src/features/finance/finance-store.ts)'s
      persisted slice and into main behind two channels — `secretsGet`/`secretsSet` in
      [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) with a
      `{ key: z.enum(['finance.twelveData']) }` schema (an enum, so the vault can never become a
      general-purpose store by accident) — backed by a second `safeStorage` vault file that reuses
      `credential-vault.ts`'s encrypt/decrypt/degrade shape verbatim. `credential-vault.ts` stays
      DB-specific; extract its `safeStorage` plumbing into `main/secure-store.ts` and have both
      vaults call it.
- [ ] One-shot migration on first read: if the legacy `localStorage` entry still carries a
      non-empty `twelveDataApiKey`, write it to the vault, then blank the persisted field — through
      `persist-rename.ts`'s existing migration seam, not a new one.
- [ ] Drop `https://api.twelvedata.com` and `https://api.coingecko.com` from Theme C's
      `connect-src` by moving the two `fetch` calls in
      [`finance-api.ts`](../../../packages/app/src/features/finance/finance-api.ts) behind a
      `financeQuote` invoke in main — the key then never crosses back into the renderer at all,
      which is the stronger property, and it is the exact "proxy through main" the store's own
      comment names as the alternative it skipped.
- [ ] [`titlebar-status/weather-api.ts:9`](../../../packages/app/src/features/titlebar-status/weather-api.ts)'s
      `ipwho.is` lookup becomes **opt-in**: a `Settings ▸ Privacy ▸ Locate me by IP` switch,
      default **off**, with the title-bar weather showing a "Set a location" affordance instead of
      silently geolocating. The Open-Meteo calls (which take a lat/lon the user typed or chose) are
      unaffected. When the switch is off, `https://ipwho.is` leaves `connect-src` too.
- [ ] *Acceptance:* `localStorage` after a fresh boot with a saved key contains no string longer
      than 20 characters under `midnite-studio.finance`; the vault file exists at `0o600`; a fresh
      profile makes **zero** network requests until the user either sets a location or flips the
      switch (asserted with `page.on('request')` in e2e).

### E — Forty-five channels onto `handleSend`, and two onto `handle` (M)

The mechanical sweep Phase 65 Theme B described and left. Pure refactor: no channel changes shape,
no behaviour changes — the point is that after this theme, "does main validate that?" has one answer.

- [ ] Migrate every `ipcMain.on(` in the ten files listed in finding 5 onto
      [`handleSend`](../../../packages/desktop/src/main/ipc/handle.ts) with the channel's existing
      `shared` schema. Where a channel has **no** schema in `shared/src/ipc/` today, add one — that
      is the finding, and it goes in the PR body as a list. Payload-free channels use a
      `z.undefined()`/`z.null()` schema rather than staying on raw `ipcMain.on`.
- [ ] `onInvalid` for every migrated channel is `log.warn` through the one log seam
      ([`main/log.ts`](../../../packages/desktop/src/main/log.ts)) — Phase 65's own precedent, never
      a throw and never silent.
- [ ] Migrate the two raw `ipcMain.handle(` calls outside `handle.ts` onto `handle`/`handleBare`.
- [ ] An eslint `no-restricted-syntax` rule in [`eslint.config.mjs`](../../../eslint.config.mjs)
      for the `desktop` package: `ipcMain.on(` and `ipcMain.handle(` may appear only in
      `src/main/ipc/handle.ts`, with the message naming the four helpers. The rule is what keeps the
      count at zero; the sweep only gets it there.
- [ ] *Acceptance:* `grep -rn "ipcMain.on(\|ipcMain.handle(" packages/desktop/src/main | grep -v
      ipc/handle.ts` returns nothing; every existing handler test still passes; the e2e suite is
      unchanged.

## Files this phase touches

**A — no new files.** `packages/desktop/package.json`, `pnpm-lock.yaml`,
`scripts/perf/budgets.json` (`_measured` block only — see Decisions), the PR body.

**B**
- [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — drop `node:os`,
  read two more `additionalArguments`.
- [`packages/desktop/src/main/window.ts`](../../../packages/desktop/src/main/window.ts),
  [`window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts) — `sandbox: true`, two more args,
  corrected comment.
- `packages/shared/src/ipc/…` — `HOME_DIR_ARG`, `HOSTNAME_ARG` beside the existing three.
- New `packages/desktop/src/preload/preload-bundle.test.ts`.

**C — new**
- `packages/desktop/src/main/csp.ts` + `.test.ts`; wired from `main/index.ts` after `whenReady`.
- `packages/app/e2e/csp.spec.ts`.

**D**
- New `packages/desktop/src/main/secure-store.ts` (+ test), refactored out of
  [`db/credential-vault.ts`](../../../packages/desktop/src/main/db/credential-vault.ts).
- New `packages/desktop/src/main/ipc/secrets-handlers.ts`, `finance` proxy in a new
  `ipc/finance-handlers.ts`.
- [`features/finance/finance-store.ts`](../../../packages/app/src/features/finance/finance-store.ts),
  [`finance-api.ts`](../../../packages/app/src/features/finance/finance-api.ts),
  [`titlebar-status/weather-api.ts`](../../../packages/app/src/features/titlebar-status/weather-api.ts),
  a new `Settings ▸ Privacy` page under `features/settings/settings-pages/`.

**E** — the ten handler files in finding 5, [`ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts)
(unchanged API), [`eslint.config.mjs`](../../../eslint.config.mjs).

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme.
- [ ] **B:** packaged app boots with `sandbox: true`; `window.midniteStudio.homeDir` matches
      `os.homedir()`; the preload-bundle test fails if `node:os` is reintroduced (prove by mutating).
- [ ] **C:** the full `app:e2e` suite runs with zero `Refused to …` CSP console lines; the
      `will-navigate` spec shows the document URL unchanged after an external-link click and the
      link opened via `shell.openExternal` (mocked in e2e).
- [ ] **D:** `strings ~/Library/Application\ Support/midnite-studio/Local\ Storage/leveldb/*` shows
      no Twelve Data key after migration; a fresh profile makes no network request before consent.
- [ ] **E:** the eslint rule fails the build on a fresh `ipcMain.on(` outside `handle.ts` (prove by
      adding one, then remove it).
- [ ] **Open, for a human — A:** the day-long soak on the upgraded Electron, and the broker
      legacy-peer handshake against a live installed build.

## Not in this phase

- **The embedded browser's policy** (`browser-security.ts`) — already the strongest boundary here.
- **Peer authentication on the broker and MCP sockets.** Both are `0o600` in `0o700` dirs, which
  is the same-user boundary macOS offers; Node exposes no `getpeereid`, and a token handshake would
  only re-prove the file-permission check. Documented, not built.
- **A general secrets manager / keychain UI.** Theme D's vault key is an enum of one; widening it is
  a future phase's decision, not a side effect of this one.
- **Rotating the perf budgets after A.** The `_measured` block is updated; the budget numbers are
  not — `budgets.json`'s own header forbids editing a budget without the run that justifies it, and
  that run is Phase 77's.
- **Agent prompt injection.** A council member or loop agent runs a shell with the user's
  privileges by design; that is the product, and no boundary in this app can make an agent's own
  actions safe. Out of scope here and named so nobody expects Theme C to cover it.

## Decisions / open questions

- **Resolved — Theme A is human-run.** This repo's standing rule is that dependency bumps are
  reviewed and merged by the user, because they "can legitimately, and unexpectedly break things" in
  ways green CI does not catch. An Electron major is the most consequential bump there is. The
  theme is written to be *executed* by a human with the checklist, not fanned out to a swarm.
- **Resolved — oldest supported major, not newest.** The supported window is three majors; the
  oldest has the most patch releases behind it and the fewest surprises ahead. Re-evaluate at
  execution time against the live release table.
- **Resolved — CSP via header, not `<meta>`.** Popouts and future windows inherit it; `frame-ancestors`
  is expressible; dev/packaged can differ without touching `index.html`.
- **Open — `img-src https:` is broad.** Avatars load from whatever CDN the forge returns
  (`avatars.githubusercontent.com` today, but the forge layer is provider-shaped). Recommendation:
  ship `https:` in this phase, log every `img` host the e2e suite actually loads, and tighten to
  that list in a follow-up once the inventory is real rather than guessed.
- **Open — `style-src 'unsafe-inline'`.** Tailwind's arbitrary-value classes and Monaco's editor
  both write inline styles; nonce-ing them is a Monaco upstream question. Accepted weakening,
  recorded here so it is a decision and not an oversight.
- **Open — should Theme D also proxy the Open-Meteo calls through main?** They carry no credential,
  only a lat/lon. Recommendation: no — keep the renderer `fetch` and the two hosts in `connect-src`;
  the win of proxying is the secret, and there is none.
- **Open — Theme E's missing schemas.** The sweep will find channels with no `shared` schema. Each is
  a small contract addition; the recommendation is to add them *in* this theme rather than defer,
  since a channel without a schema is exactly the gap the theme exists to close.
