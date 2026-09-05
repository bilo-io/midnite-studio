# Phase 65 — Somewhere for a crash to go

[Phase 60](phase-60-view-registry-and-error-boundaries.md) builds the error boundaries. This phase
builds the place their reports go, because today there is nowhere: **the renderer has no logging
channel at all, and main's has no file.**

Phase 60 already reached this conclusion and wrote down what to do about it. From its Decision 3:

> *There is no renderer→main log channel; `CHANNELS` carries none, and the main-side seam
> ([`main/log.ts`](../../../packages/desktop/src/main/log.ts)'s `defaultLogger`) takes a single
> string with no levels and no file sink. Building a real report path means a channel, a schema, a
> handler and a sink — worth doing, and worth doing as its own thing rather than as a rider on a
> 26-item phase. **Recommendation for later:** fold it into whatever phase gives `main/log.ts`
> structured levels, so there is one sink rather than two.*

This is that phase. It is the successor P60 named, and it does the two halves together for the
reason P60 gave: a channel without a sink writes to a `console.warn` nobody reads, and a sink
without a channel cannot hear the renderer.

**Four things are true, and each is one grep.**

1. **The renderer cannot log.** `grep -rn "console.error" packages/app/src` returns **zero**, and so
   does `console.warn` — not by neglect but by rule: `no-console: 'error'` at
   [`eslint.config.mjs:59`](../../../eslint.config.mjs). There is no `window.onerror`
   (**0 hits**), no `unhandledrejection` listener (**0 hits**), and no `ErrorBoundary`,
   `componentDidCatch` or `getDerivedStateFromError` anywhere in `packages/app/src` **or**
   `packages/desktop/src` (**0 hits**, which is P60's Theme B). A renderer throw today reaches
   DevTools and nothing else — and a packaged user has no DevTools.
2. **Main's seam has no file, and its own docstring says otherwise.**
   [`log.ts:11`](../../../packages/desktop/src/main/log.ts) is `export type Logger = (message: string) => void`
   and `:14` is `console.warn`. That is the entire module — 14 lines. Its header at `:6-9` claims the
   broker "redirects this seam to `<userData>/broker/<version>.log`". **It does not.**
   [`broker-client.ts:153`](../../../packages/desktop/src/main/broker-client.ts) opens that path and
   `:181` hands the fd to the *detached child's* `stdio` — it redirects the broker process's stdout,
   never main's `defaultLogger`. Eight files import the seam, six call `defaultLogger` directly and
   roughly thirty-four more go through an injected `log: Logger` parameter; every one of those
   forty writes to a stderr that is discarded in a packaged app.
3. **Nothing rotates, anywhere.** `grep -rn "rotat\|maxSize\|truncateSync\|ftruncate" packages/desktop/src`
   → **0**. The one log file that does exist — the broker's — is opened `'a'`
   ([`broker-client.ts:507-511`](../../../packages/desktop/src/main/broker-client.ts)) and grows
   without bound for the life of a build. A new sink must not become the second such file.
4. **Main catches almost none of its own crashes.** `process.on('uncaughtException')` → **0**.
   `process.on('unhandledRejection')` in non-test source → **0**. `app.on('child-process-gone')` →
   **0**. `crashReporter` → **0**. What does exist is three per-`webContents` `render-process-gone`
   binds — [`index.ts:129-136`](../../../packages/desktop/src/main/index.ts) (called at `:455` and
   `:486`), [`window-manager.ts:172-179`](../../../packages/desktop/src/main/window-manager.ts) and
   [`browser-service.ts:139-141`](../../../packages/desktop/src/main/browser-service.ts) — each of
   which logs a good line into that same discarded stderr. The information is already being
   produced. It is only being thrown away.

The fifth fact is what makes the whole thing useful rather than merely tidy: **there is no way to
report a bug.** `grep -rni "report a bug\|report an issue\|file a bug"` over `packages` and `docs`
returns **0**. `CLAUDE.md` says the tracker lives in
[`bilo-io/midnite-apps`](https://github.com/bilo-io/midnite-apps) because this repo is private, and
[`shared/src/release.ts`](../../../packages/shared/src/release.ts) already holds four URLs into that
repo (`:21`, `:25`, `:29`, `:39`) — but none of them is an issue link, and a user who hits a blank
window has nothing to attach even if they find their way there.

**Builds on.**
- [`shared/src/perf.ts`](../../../packages/shared/src/perf.ts) — the shape to copy, end to end. `:19`
  the channel const, `:27-30` a capped zod schema, `:41`/`:44-45` the env gate; renderer sender at
  [`app/src/lib/perf.ts:28-38`](../../../packages/app/src/lib/perf.ts) (including the once-guard
  `Set` this phase reuses for report dedupe); preload at
  [`preload/index.ts:480-486`](../../../packages/desktop/src/preload/index.ts); main receiver at
  [`ipc/perf-handlers.ts:19-25`](../../../packages/desktop/src/main/ipc/perf-handlers.ts),
  registered from `index.ts:301`. **One divergence, deliberate:** perf is gated and drops invalid
  payloads; diagnostics is ungated and must not drop. See Decision 4.
- **The injected-`userData` convention.** `userData` is resolved exactly once, at
  [`index.ts:309`](../../../packages/desktop/src/main/index.ts), and passed into every store —
  [`repo-store.ts:45`](../../../packages/desktop/src/main/repo-store.ts),
  `windows-store.ts:41`, `councils-store.ts:43`, `terminal-store.ts:71`. **No store imports
  `electron`.** The new sink follows this exactly: it takes a directory and knows nothing about
  `app.getPath`.
- [`main/ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) — `handle` (`:21`),
  `handleOp` (`:40`), `handleBare` (`:48`), `handleFromSender` (`:60`), all of which resolve rather
  than reject on a validation failure (`:17-20`). There is **no equivalent for the `ipcMain.on`
  side**: all forty one-way channels hand-roll `safeParse`. Theme B fills that gap.
- [`settings-pages/monitor-page.tsx:96`](../../../packages/app/src/features/settings/settings-pages/monitor-page.tsx) —
  an `Accordion title="Diagnostics"` that already holds two real buttons (`:142`, `:150`). Theme E
  extends it rather than adding an eighteenth settings page; see Decision 6.
- [`version/version-notes-panel.tsx`](../../../packages/app/src/features/version/version-notes-panel.tsx) —
  the popover that already carries "two links that stand whether or not the notes arrived". The
  third link belongs there.

**Scope guardrails.**
- **No `ErrorBoundary` is built here.** [Phase 60](phase-60-view-registry-and-error-boundaries.md)
  Theme B owns that component. This phase ships the function its `componentDidCatch` will call and
  names it in P60's terms; whichever lands second wires them together. See Decision 8.
- **No new dependency.** In particular **not `electron-log`** (`grep` → 0 today). A 14-line seam
  with forty call sites does not need a logging framework, and adding one would put the sink outside
  the injected-`userData` convention every other store follows.
- **No telemetry, no network, no upload.** Nothing leaves the machine unless the user presses a
  button that puts text on their clipboard. `crashReporter` stays unreferenced — wiring an Electron
  minidump uploader is a consent question and a server, not a phase.
- **`mstudio:diag:*` is not available.** [`channels.ts:430-438`](../../../packages/shared/src/ipc/channels.ts)
  already uses it for the repo-lint runner in `main/diagnostics/`. This phase uses **`mstudio:report:*`**.
- **The forty existing one-way handlers are not migrated** onto the new `handleSend` helper. It is
  written here and used by this phase's own channel; converting the rest is a mechanical sweep with
  no behaviour change and belongs on its own.
- **`packages/app`'s eslint `no-console` rule stays `error`.** The renderer gets a logging channel,
  not permission to `console.log`.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Levels on the one seam, and a file under it (M) — ✅ DONE (PR #170, 2026-09-05)

- [x] Widen [`main/log.ts`](../../../packages/desktop/src/main/log.ts)'s `Logger` **without touching
      a single call site**: `export type Logger = ((message: string) => void) & { info(message: string): void; warn(message: string): void; error(message: string, err?: unknown): void }`.
      A callable type with methods, not an interface replacing the call signature — that is what
      keeps all forty existing `log('[browser] …')` invocations compiling unchanged. See Decision 1.
- [x] `defaultLogger` gains the three methods; the bare call stays exactly `warn`-equivalent so no
      existing line changes level by accident. Its `eslint-disable-next-line no-console` moves to
      cover the console fallbacks and nothing more.
- [x] **Correct the stale header at [`log.ts:6-9`](../../../packages/desktop/src/main/log.ts).** It
      states the broker redirects this seam to a file; `broker-client.ts:181` redirects the *child
      process's* stdio and this seam has never reached disk. The comment is the reason a reader
      would assume this phase's work already exists.
- [x] Add `packages/desktop/src/main/log-sink.ts` — **new.** `createFileSink({dir, name, maxBytes, generations, now}): { write(level, message): void; path: string; close(): void }`.
      It takes a **directory**, never `app.getPath` — the same shape as `repo-store.ts` and every
      other `userData` writer, and the reason it can be tested under bare vitest with a temp dir.
- [x] One line per record, NDJSON: `{t, level, msg}`. Not a human log format — Theme E's "Copy
      diagnostics" reads the tail back and needs to parse it, and a `[perf] renderer boot 812` line
      is not parseable.
- [x] **Rotation, because fact 3 says nothing in this repo has any.** Size-capped at `maxBytes` with
      `generations` kept (`main.log`, `main.1.log`, …); the rotate check runs on write, not on a
      timer. Defaults: 2 MB × 3.
- [x] The sink **never throws into its caller.** A full disk, a read-only volume or a missing
      directory degrades to console-only for the rest of the session and logs that fact once. A
      logger that can crash the process it exists to diagnose is worse than no logger.
- [x] Wire it at [`index.ts:309`](../../../packages/desktop/src/main/index.ts), where `userData` is
      already resolved: `<userData>/logs/main.log`. One call, beside the existing store
      constructions, so the injection convention is visibly the same one.
- [x] Lift `fingerprintFile` out of
      [`broker-client.ts:105-113`](../../../packages/desktop/src/main/broker-client.ts) into
      `packages/desktop/src/main/fingerprint.ts` and re-export it from `broker-client.ts` so
      `brokerSocketName` is untouched. It is a pure `sha1(size:mtime)` → 8 hex chars, but it
      currently lives beside `net` and `spawn`; importing it from a log module would drag that graph
      in. Note in its docstring that it fingerprints **whichever file it is given** — today's
      `buildId` is `broker.js`, which is the broker's build, not main's.
- [x] Cap the broker's own log on open at
      [`broker-client.ts:507-511`](../../../packages/desktop/src/main/broker-client.ts) — reuse
      `log-sink.ts`'s rotate helper for the one file in this repo that grows forever. This is the
      only broker change in the phase, and it is here because "one sink rather than two" is P60's
      instruction and an unbounded second file is what that phrase is about.
- [x] `packages/desktop/src/main/log.test.ts` and `log-sink.test.ts` — the callable-plus-methods
      type is exercised both ways (`log(x)` and `log.error(x, e)`); rotation at the boundary keeps
      exactly `generations` files; a write failure disables the sink without throwing and without
      spamming.

### B — The channel, and the helper it deserves (M) — ✅ DONE (PR #170, 2026-09-05)

- [x] Add `handleSend(channel, schema, fn)` to
      [`main/ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts), beside `handle`,
      `handleOp`, `handleBare` and `handleFromSender`. Forty `ipcMain.on` registrations hand-roll
      `safeParse` today because this helper does not exist. **Only this phase's channel is migrated
      onto it** — see the guardrails.
- [x] `mstudio:report:error` in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts),
      following the `mstudio:<domain>:<verb>` rule stated at `:1-8`, in the **one-way `send` group**
      — a crash report has no reply worth waiting for, and the renderer sending it may be seconds
      from being reloaded. Not `mstudio:diag:*`, which `:430-438` already owns.
- [x] `ErrorReportSchema` in [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), every
      string capped the way [`perf.ts:27-30`](../../../packages/shared/src/perf.ts) caps its two:
      `source` (`'boundary' | 'window-error' | 'unhandled-rejection'`), `name`, `message` (1 KB),
      `stack` (8 KB), `componentStack` (8 KB, optional), `view` (optional), `role`
      (`'main' | 'popout'`), `at` (epoch ms). A cap here is not tidiness — an unbounded string over
      IPC from a renderer that is already misbehaving is a second failure mode.
- [x] Three `invoke` channels for the user-facing half: `mstudio:report:log-path` (→ the sink's
      path), `mstudio:report:bundle` (→ the diagnostics text of Theme E), `mstudio:report:reveal`
      (→ `GitOpResult`). The last one is **a new channel and not a reuse**: `shellShowItemInFolder`
      ([`channels.ts:251`](../../../packages/shared/src/ipc/channels.ts)) takes `FsRepoScope`
      ([`schemas.ts:1532`](../../../packages/shared/src/ipc/schemas.ts)) and
      [`fs-handlers.ts:199-210`](../../../packages/desktop/src/main/ipc/fs-handlers.ts) confines it
      under a **repo** root. A file in `userData` is not under any repo, and widening that guard to
      reach it would be the wrong fix to the right check. See Decision 5.
- [x] `mstudio:report:reveal` takes **no path from the renderer.** It reveals the sink's own path,
      which main already knows. A channel that accepts a path is a channel that has to defend one.
- [x] Bridge type in [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) as a `report` group;
      preload wiring in [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) added
      to the `Pick<MidniteStudioBridge, …>` list at `:99`, so a half-wired group is a compile error
      exactly as the comment at `:96-99` intends.
- [x] Main handler registered from `index.ts` beside `registerPerfHandlers` (`:301`), taking
      `log: Logger` by injection like every other handler module. On a valid report it calls
      `log.error`; on an **invalid** one it logs the `safeParse` error rather than dropping —
      [`perf-handlers.ts:13-18`](../../../packages/desktop/src/main/ipc/perf-handlers.ts) explains
      why silent drop is correct for perf marks, and every clause of that reasoning inverts here.
- [x] **Redaction lives in `shared`, not in the renderer.** `redactPaths(text)` replaces the user's
      home directory with `~` in any message, stack or component stack before it is written or
      copied. Theme E's output is destined for a public issue tracker; a stack trace is full of
      absolute paths carrying a username and every repo name on the machine. Unit-tested with
      POSIX and Windows-shaped paths.
- [x] Schema round-trip tests beside the existing ipc schema tests, plus a `handleSend` test
      asserting an invalid payload is logged and not thrown.

### C — The renderer learns to report (S) — ✅ DONE (PR #170, 2026-09-05)

> **Landed note — the cap is per-signature, which overrides Decision 10.** The doc's recommendation
> was a flat 20-reports-per-session cap. What shipped is a **per-signature** cap: an FNV-1a hash
> over `name` + `message` + the first stack frame, **3 reports per signature**, then a single
> suppression record saying reporting for that signature has stopped. The failure mode Decision 10
> defends against — a render loop emitting thousands of reports a second — is fully covered by
> three-per-signature, and unlike a flat session cap it cannot let a noisy first bug silence a
> genuinely new second one, which is the objection Decision 10 raised against itself. Related:
> Decision 11's recommendation *was* taken as written — the sink is synchronous on the `error`
> level only, with `info`/`warn` buffered.

- [x] Add `packages/app/src/lib/report.ts` — **new**, in the shape of
      [`lib/perf.ts`](../../../packages/app/src/lib/perf.ts): `reportError(source, error, extra?)`,
      reading `bridge()?.report` and no-op'ing without it (a jsdom test has no bridge, and
      `window.midniteStudio` is declared optional at `bridge.ts:921-930` for exactly this).
- [x] **A reporter that cannot storm.** Dedupe by `name+message+first stack frame` using the same
      once-guard `Set` as [`perf.ts:28-38`](../../../packages/app/src/lib/perf.ts), plus a hard cap
      of 20 reports per session. A render loop that throws every frame must not turn into an IPC
      flood, and an error *inside* `reportError` is swallowed rather than re-reported.
- [x] `window.addEventListener('error', …)` and `'unhandledrejection'` installed once in
      [`main.tsx`](../../../packages/app/src/main.tsx) — before `createRoot` at `:23-25`, so a throw
      during the first render is caught. **Both roles get them**: that file is the shared entry for
      `App` and `DetachedRoot`, so popouts are covered by the same two lines, and `role` goes on the
      report.
- [x] The current `view` is stamped onto boundary reports so a report says *which* surface blanked.
      Read at send time from the ui-store, not held in a closure.
- [x] Export `reportError` under the exact name P60 Theme B's `componentDidCatch` will call, and say
      so in its docstring with a link to that phase. This is the seam, and it is one function.
- [x] `packages/app/src/lib/report.test.ts` — no bridge is a silent no-op; the same error twice
      sends once; the 21st distinct error does not send; a throwing bridge does not propagate.

### D — Main's own crashes reach the same sink (S) — ✅ DONE (PR #170, 2026-09-05)

- [x] `process.on('uncaughtException')` and `process.on('unhandledRejection')` in
      [`main/index.ts`](../../../packages/desktop/src/main/index.ts), installed **before**
      `app.whenReady()` — the boot path is where an unhandled rejection is both most likely and most
      invisible. Both `log.error`; neither exits, matching Electron's current default behaviour so
      this phase changes what is *recorded*, not what the app does.
- [x] `app.on('child-process-gone')` → `log.error` with `type` and `reason`. Zero hits today, and it
      is the only hook that reports a GPU or utility process dying — a class of failure that
      currently manifests as "the window went strange" with no record at all.
- [x] The three existing `render-process-gone` binds move from the bare seam to `log.error`:
      [`index.ts:129-136`](../../../packages/desktop/src/main/index.ts),
      [`window-manager.ts:172-179`](../../../packages/desktop/src/main/window-manager.ts),
      [`browser-service.ts:139-141`](../../../packages/desktop/src/main/browser-service.ts). Their
      message strings are already good; only the level changes, and with it whether they survive.
- [x] `webContents.on('unresponsive')` on the app's own windows. Today it is bound only for embedded
      browser tabs ([`browser-service.ts:145`](../../../packages/desktop/src/main/browser-service.ts)),
      so a hung Studio window — the failure a user is most likely to actually report — logs nothing.
- [x] A boot line at startup recording app version, Electron/Chrome/Node versions, platform, arch,
      `isPackaged` and the `fingerprint.ts` build id. Every log file's first line, so a pasted tail
      identifies its build without the reporter being asked.

### E — A user can get at it in two clicks (S)

> **Not built in the PR #170 batch — deliberately out of scope, and still ◻ TODO.** Themes A–D
> ship the whole machine (sink, channels, `reportError`, main's own crash hooks); this theme is the
> user-facing half — the two Diagnostics buttons, the `release.ts` issue URLs and the Report-a-bug
> link — and it is unstarted. The verification items that depend on it stay open with it.

- [ ] Extend the **existing** `Accordion title="Diagnostics"` at
      [`monitor-page.tsx:96`](../../../packages/app/src/features/settings/settings-pages/monitor-page.tsx)
      rather than adding an eighteenth settings page. A new page is four coupled edits
      ([`ui-store.ts:141-157`](../../../packages/app/src/store/ui-store.ts) union,
      `:181-199` `SETTINGS_PAGES`, [`settings-view.tsx:36-56`](../../../packages/app/src/features/settings/settings-view.tsx)
      `PAGE_CONTENT`, [`nav-icons.ts:36`](../../../packages/app/src/components/nav-icons.ts)
      `SETTINGS_PAGE_ICON`) for two buttons that belong next to the two already there. See Decision 6.
- [ ] **Reveal log** button, styled like [`cli-page.tsx:87-105`](../../../packages/app/src/features/settings/settings-pages/cli-page.tsx)'s
      (raw `<button type="button">`, `disabled={!hasBridge}`, inline error beneath), calling
      `mstudio:report:reveal`. The log path is shown beside it as text, because a user on a support
      thread needs to say where it is, not just open it.
- [ ] **Copy diagnostics** button → clipboard, from `mstudio:report:bundle`: the boot line of Theme
      D, plus the last 50 sink records, **through `redactPaths`**. One block a user can paste into
      an issue without being asked three follow-up questions.
- [ ] Add `issuesUrl` / `newIssueUrl` to [`shared/src/release.ts`](../../../packages/shared/src/release.ts)
      beside the four `bilo-io/midnite-apps` URLs it already holds (`:21`, `:25`, `:29`, `:39`), with
      the same comment at `:6` explaining why the mirror repo is the destination.
- [ ] **Report a bug** link in [`version-notes-panel.tsx`](../../../packages/app/src/features/version/version-notes-panel.tsx),
      as the third of the "two links that stand whether or not the notes arrived", opened through
      the existing `shellOpenExternal` ([`channels.ts:244`](../../../packages/shared/src/ipc/channels.ts),
      protocol-restricted to http/https/mailto at [`schemas.ts:884`](../../../packages/shared/src/ipc/schemas.ts)).
      This is the fifth fact's fix and it is one anchor.
- [ ] The version pill hides itself on `'0.0.0'` ([`version-pill.tsx:26`](../../../packages/app/src/features/version/version-pill.tsx))
      — confirm the bug link is still reachable in a dev build where that holds, or accept that it
      is a packaged-only affordance and say which in the docstring.

---

## Files this phase touches

| File | What |
|---|---|
| [`packages/desktop/src/main/log.ts`](../../../packages/desktop/src/main/log.ts) | callable `Logger` + `info`/`warn`/`error`; the stale `:6-9` header corrected |
| `packages/desktop/src/main/log-sink.ts` | **new** — NDJSON, size-capped, rotating, directory-injected, never throws |
| `packages/desktop/src/main/log-sink.test.ts` · `log.test.ts` | **new** — rotation boundary, write-failure degradation, both call forms |
| `packages/desktop/src/main/fingerprint.ts` | **new** — `fingerprintFile` lifted out of `broker-client.ts:105-113` |
| [`packages/desktop/src/main/broker-client.ts`](../../../packages/desktop/src/main/broker-client.ts) | re-export the lifted fn; cap the child log at `:507-511`. Nothing else — `brokerSocketName` is untouched |
| [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) | sink construction at `:309`; `uncaughtException`/`unhandledRejection`/`child-process-gone`; `:129-136` → `log.error`; handler registration by `:301` |
| [`packages/desktop/src/main/window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts) · [`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts) | `:172-179` and `:139-141` → `log.error`; `unresponsive` on app windows |
| [`packages/desktop/src/main/ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) | **`handleSend`** — the missing `ipcMain.on` counterpart |
| `packages/desktop/src/main/ipc/report-handlers.ts` | **new** — `error` (send), `log-path` / `bundle` / `reveal` (invoke) |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) | four `mstudio:report:*` channels — **not** `mstudio:diag:*`, taken at `:430-438` |
| [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) | `ErrorReportSchema` with every string capped |
| [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | the `report` group |
| `packages/shared/src/redact.ts` | **new** — `redactPaths`, home dir → `~`, POSIX + Windows tested |
| [`packages/shared/src/release.ts`](../../../packages/shared/src/release.ts) | the issue URLs, beside the four release ones |
| [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) | `report` added to the `Pick` at `:99` |
| `packages/app/src/lib/report.ts` · `report.test.ts` | **new** — dedupe, session cap, no-bridge no-op |
| [`packages/app/src/main.tsx`](../../../packages/app/src/main.tsx) | the two global listeners, before `createRoot` at `:23-25`, covering both roles |
| [`packages/app/src/features/settings/settings-pages/monitor-page.tsx`](../../../packages/app/src/features/settings/settings-pages/monitor-page.tsx) | two buttons + the path, inside the `:96` Diagnostics accordion |
| [`packages/app/src/features/version/version-notes-panel.tsx`](../../../packages/app/src/features/version/version-notes-panel.tsx) | the Report a bug link |
| [`packages/app/src/components/error-boundary.tsx`](../../../packages/app/src/components/error-boundary.tsx) | (**not built here**) — [Phase 60](phase-60-view-registry-and-error-boundaries.md) Theme B owns it; this phase ships the function it calls |
| [`eslint.config.mjs`](../../../eslint.config.mjs) | (**unchanged**) — `no-console: 'error'` at `:59` stays exactly as it is |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green, and `pnpm e2e` green with no new `KNOWN_RED` entry.
      **Half done:** typecheck, lint and every unit suite are green (`desktop` 1120, `shared` 475,
      `app` 2358, `git-engine` passing). The e2e half was **not executed** in this batch.
- [x] **The widening cost nothing:** the `Logger` change touches zero of the ~40 existing call
      sites. `git diff --stat` for Theme A shows `log.ts` and new files only — if any caller had to
      change, the type is wrong (Decision 1).
- [x] `grep -rn "mstudio:diag" packages/shared/src/ipc/channels.ts` still returns only the five
      repo-lint channels at `:430-438` — no collision with the new group.
- [ ] Throw in a view, and `<userData>/logs/main.log` gains one NDJSON record naming the view, the
      role and the stack. Then throw the *same* error four more times: still one record.
- [ ] `Promise.reject(new Error('x'))` unhandled in the renderer, and again in main, each produce
      exactly one record with the right `source`.
- [x] Write 3 MB through the sink: exactly `generations + 1` files exist, the newest is under
      `maxBytes`, and the oldest is gone.
- [x] Point the sink at a read-only directory and boot: the app starts normally, logs the failure
      once, and every later `log.error` still reaches console.
- [ ] **Copy diagnostics contains no home directory.** Run it on a path under
      `/Users/<name>/…` and assert the output has `~` and not the username — the redaction test that
      matters, because this is the one string designed to be pasted in public.
- [ ] Reveal log opens Finder on the real file, and `mstudio:report:reveal` rejects being handed a
      path at all (it takes none).
- [ ] Kill the renderer (`render-process-gone`) and hang it (`unresponsive`): both leave a record
      where previously both left a discarded stderr line.
- [ ] The Report a bug link opens `bilo-io/midnite-apps` issues and nothing else — the
      `shellOpenExternal` protocol restriction at `schemas.ts:884` is not bypassed.
- [ ] **Open, for a human:** cause a blank window in a *packaged* build, press Copy diagnostics, and
      check the clipboard is something you would actually be willing to paste into a public issue —
      complete enough to act on, with nothing in it you would not want a stranger to read.

---

## Not in this phase

- **The `ErrorBoundary` component.** [Phase 60](phase-60-view-registry-and-error-boundaries.md)
  Theme B. See Decision 8 for the seam.
- **Migrating the other 39 one-way handlers onto `handleSend`.** Mechanical, no behaviour change,
  and it would bury this phase's diff.
- **`crashReporter` / minidumps / any upload.** A consent model and a server, not a phase.
- **A log viewer inside the app.** Reveal + copy is the whole affordance; rendering a tailing NDJSON
  view is a surface, and this phase adds none.
- **Levels as a filter.** `log.error` vs `log.info` records a level; nothing reads it back to filter
  output yet. A `MSTUDIO_LOG_LEVEL` env gate is obvious, small, and better decided once there is a
  month of real records to look at.
- **The renderer's own `console` rule.** Still `error`. This phase gives the renderer somewhere to
  report, not permission to print.

---

## Decisions / open questions

1. **Resolved — a callable type with methods, not an interface, and not a migration.** `Logger`
   becomes `((message: string) => void) & { info; warn; error }`. The alternative — a plain
   `{info; warn; error}` interface — is cleaner on paper and costs a diff across eight files and
   ~40 call sites, in a phase whose entire point is that those call sites are already producing
   good lines. Keeping the bare call working means Theme A is additive and reviewable, and a caller
   opts into a level when it has a reason to. The bare call maps to `warn`, which is what
   `defaultLogger` does today, so nothing silently changes level.

2. **Resolved — the sink takes a directory, not `app.getPath`.** Every `userData` writer in main
   already works this way (`repo-store.ts:45`, `windows-store.ts:41`, `terminal-store.ts:71`),
   `userData` is resolved once at `index.ts:309`, and **no store imports `electron`**. Following it
   is what lets `log-sink.test.ts` run under bare vitest against a temp dir, and what keeps the sink
   out of the one module graph that cannot be tested that way.

3. **Resolved — NDJSON, not a human-readable log format.** Theme E's bundle reads the tail back and
   has to parse it. A pretty `[perf] renderer boot 812` line is not parseable, and writing both
   formats is the "two sinks" P60 Decision 3 said to avoid.

4. **Resolved — invalid reports are logged, not dropped.** [`perf-handlers.ts:13-18`](../../../packages/desktop/src/main/ipc/perf-handlers.ts)
   argues that dropping a malformed perf mark is right because the data is optional, high-frequency
   and dev-only. Every one of those clauses inverts for an error report: it is rare, it is the
   product's only record, and a payload malformed enough to fail `safeParse` is itself evidence of
   the bug being reported.

5. **Resolved — a new reveal channel, not a widened `FsRepoScope`.**
   [`fs-handlers.ts:199-210`](../../../packages/desktop/src/main/ipc/fs-handlers.ts) confines
   `shellShowItemInFolder` under a repo root via `resolveScopeRoot` + `confineToRoot`. A log in
   `userData` is under no repo. Relaxing that guard to reach it would weaken a check that is
   correct, to serve a case it was never about — so the new channel takes **no path at all** and
   reveals the one file main already knows.

6. **Resolved — extend the Diagnostics accordion, do not add a settings page.** A page is four
   coupled registrations (`ui-store.ts:141-157`, `:181-199`, `settings-view.tsx:36-56`,
   `nav-icons.ts:36`) plus two inherited consumers (`title-bar-nav.tsx:220` breadcrumbs,
   `services/palette/providers.ts:117` palette entries) for two buttons that belong beside the two
   already at `monitor-page.tsx:142` and `:150`. Note the contrast with
   [Phase 63](phase-63-settings-diff-and-orphan-preferences.md), which correctly *does* add a page —
   there the complaint is that four preferences have no home, and here the home already exists.

7. **Resolved — redaction lives in `shared`, and runs on the way in as well as the way out.**
   Records are redacted when written, not only when copied, so the file on disk is safe to hand over
   whole. `shared` is the right package because both the main-side writer and any future renderer
   display need the same function, and it depends on nothing but a home-dir string.

8. **Resolved — the seam with [Phase 60](phase-60-view-registry-and-error-boundaries.md), stated
   from both ends.** P60 Theme B builds `error-boundary.tsx` and its Decision 3 says it reports to
   `console.error` "for now". **Whichever lands second wires them together:** if P65 lands first,
   P60's `componentDidCatch` calls `reportError('boundary', error, {componentStack})` instead of
   `console.error` — which it must anyway, since `no-console: 'error'` would reject the console call
   in `packages/app`; if P60 lands first, this phase's Theme C adds that one line to the existing
   boundary. Neither blocks the other, and the interface is one exported function.

9. **Open — does the boot line carry the build fingerprint, given it fingerprints the wrong file?**
   `fingerprintFile` is pure and reusable, but today's `buildId` hashes `broker.js`
   (`broker-client.ts:146-150`), so stamping a log with it identifies the *broker* build.
   *Recommendation:* stamp it, labelled `brokerBuild`, and add nothing else. `app.getVersion()` plus
   `isPackaged` already identify the app build for every purpose a bug report has, and fingerprinting
   the main bundle is a build-system question, not a logging one.

10. **Open — should `report.ts`'s 20-per-session cap be per-session or per-signature?** A cap that is
    purely per-session means a genuinely new second bug can be silenced by a noisy first one.
    *Recommendation:* keep the flat session cap for v1 and log the fact that reporting stopped, as
    its own record. The failure mode being defended against is a render loop emitting thousands of
    reports per second; a scheme clever enough to distinguish that from twenty real bugs is more
    machinery than the first release of this needs.

11. **Open — does the sink flush synchronously?** An async append can lose the last record to the
    very crash it is recording, which is the record that matters most. *Recommendation:* synchronous
    `appendFileSync` on the `error` level only, buffered async for `info`/`warn`. Main already does
    synchronous fs work at boot (`openSync` at `broker-client.ts:507`), the volume at `error` level
    is by definition tiny, and a lost final line defeats the phase.
