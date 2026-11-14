# Phase 148 — Performance widget recovery actions

Planned 2026-11-15 by a midnite-swarm Plan stage · grounded against `origin/main` `c30d6d193` plus PR #1259 (`fix/detached-broker-sessions`, head `a6e45ac1f`).

**Model:** themes A, C, D and E are spec'd builds for sonnet. Theme B needs `Model: opus` because it widens the kill guard, and that is a safety boundary.

The status bar's system monitor (the CPU/RAM/GPU/disk cluster) can show that the machine is struggling, but it gives the user nothing to do about it. On 2026-11-14 two orphaned pty brokers from an old build held about 12 GB RSS across 6 agent sessions. No sidebar listed them, and the Optimizer could not kill them: `isOurProcess` only accepts the main pid, live pty roots and their descendants, and a detached broker has ppid 1. This phase adds four actions to the monitor flyout:

- **Clean system:** the optimizer's consent-gated system-cache sweep, plus the broker dir's dead pid, token and log files.
- **Manage resources:** opens the Optimizer's Memory tab filtered to *lost* processes, meaning brokers from old builds, brokers no socket reaches, and ptys with no sidebar row. Each one gets a kill action that shows its blast radius.
- **Free RAM:** a single confirm that ends previous-build sessions and lost brokers, discards hidden browser tabs and clears renderer caches. It then reports the MB it actually freed, measured from before-and-after process snapshots.
- **Full recovery:** re-adopts every reachable detached session into its repo group, then lists the sessions it brought back, the previous-build sessions and the brokers it could not reach. Each group comes with the next action.

> **Builds on PR #1259. These pieces exist there and are not rebuilt here:**
> - **Main ops:** `recoverDetachedSessions()` (`features/terminal/main/terminal-service.ts:307`). It rescans the broker dir (`rescanPeers` → `probeLegacyBrokers`, `runtime/src/broker/client.ts:771`), runs `ensureLoaded()`, gives every rowless live pty a recovered row grouped by its cwd's repo, and returns `{recovered: DetachedSession[], live, previousBuild}`. Also `endSessions(ids)` (`:325`) and `endPreviousBuildSessions()` (`:340`).
> - **IPC channels:** `mstudio:terminal:recover-detached`, `…:end-sessions`, `…:end-previous-build` (`shared/src/ipc/channels.ts`, schemas `DetachedSessionSchema`, `TerminalRecoverDetachedResponse`, `TerminalEndSessions*`). Bridge methods: `terminal.recoverDetached()`, `endSessions()`, `endPreviousBuild()`. All of them return the envelope.
> - **Renderer helpers:** `recoverDetachedSessions(dialogs)` (`features/terminal/renderer/recover-detached.ts`) calls the op, `refresh()`es the store and shows a toast. `previousBuildSessions()`, `describeSession()` and `endSessionsWithConfirm()` live in `renderer/end-sessions.ts`; the last one is the blast-radius confirm.
> - **Palette command:** the chord-free `terminal.recoverDetached` "Recover Detached Agents" (`shared/src/keybindings.ts:125`), with its handler at `app/src/services/keybindings/use-command-handlers.ts:226`.
> - **Sidebar:** a previous-build marker, per-row End session, End all previous-build, and the legacy notice (`terminal-session-list.tsx`, `terminal-notices.tsx`).
> - **Broker housekeeping:** `staleBrokerFiles()` / `isPidAlive()` (`runtime/src/broker/stale-files.ts`), run once at boot (`client.ts:695`). The broker also self-heals its socket ownership: it re-binds to `-retired-<pid>` or exits once empty (`desktop/src/broker/server.ts`).
>
> **Depends on:** PR #1259 merged. It is a draft and its CI is blocked by the Actions billing lock. Theme A alone can start before it lands. **Unlocks:** a single recovery path for detached agents after a rebuild or crash.
>
> **Scope guardrails:**
> - The layers stay as they are: the frame and the monitor feature import neither `terminal` nor `optimizer`. The actions are composed in the **host** (`packages/app` for Studio) and passed down as data and callbacks.
> - No new chorded keybinding.
> - Never kill the current primary broker or the main pid.
> - Never kill a session another app owns (`BrokerSessionInfo.owner` ≠ the host app's id).
> - Never run a destructive step without the blast-radius confirm (CLAUDE.md, "Destructive ops need a confirm dialog").
> - Icons come from `react-icons/lu` only.
> - Perf claims cite a number from `scripts/perf/`.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

**Theme A — Monitor flyout actions slot (`PR-1`, S).** ✅ Landed. Studio shows four actions in the flyout (suite apps none) and an amber dot while previous-build sessions exist. Seams: Clean system and Manage resources open the Optimizer; Free RAM and Full recovery render disabled until Themes C/D (and PR #1259) supply their entry points; the badge counts the terminal store's `legacy` map and swaps to `previousBuildSessions()` with #1259. Gives the frame's monitor segment an optional `actions` list, which the monitor feature's flyout renders as a 2×2 grid above "Open Monitor". Studio's host passes the four actions; suite apps pass none or a subset. Adds a quiet badge on the cluster while previous-build sessions exist, read from the terminal store's `legacy` map with no extra sampling.

**Theme B — Lost-process inventory and Manage resources (`PR-2`, L, opus).** ✅ Landed. `desktop/src/main/optimizer/broker-inventory.ts` joins the broker dir's `*.sock.pid` files (plus an argv scan for brokers whose pid file is gone) with the `ps` snapshot and the client's connected peers (new optional `BrokerClient.peerPaths()`, read through `connectedBrokerSockets()`). Identity is a `broker.js --socket <userData>/broker/…` argv rather than the bundle path, which reinstalls and dev worktrees move; a recycled pid or a foreign `--socket` dir is ignored. Reasons are `unreachable` (no `.sock` or no peer; it wins over the build check), `previous-build` and `no-row`; the primary is protection-biased (its pid file, or the primary path unless visibly `-retired-<own pid>`) and never lost. `getProcessTableResult` stamps `lost`/`brokerPid` on every tree, widens `ours` to non-primary brokers, keeps another app's sessions unkillable and labels agent ptys `<repo> · <agent>`. `killProcess` refuses the primary broker and foreign sessions explicitly and routes a lost broker to `killTree` (SIGTERM to the broker; the second, force confirm SIGKILLs the tree deepest first). No new IPC. The Memory tab's filter moved into the store (`memoryFilter`, `openOptimizerAt`), with a Lost pill and count, reason badges, a tree confirm listing `pid · RSS · argv` with a `sessions` blast-radius line, and "End all lost (N · X)". Manage resources lands on Memory ▸ Lost.

**Theme C — Free RAM (`PR-3`, M).** ◻ TODO. Two new IPC ops, `resources:free-ram-plan` (a dry run) and `resources:free-ram` (execute). They gather previous-build sessions, lost brokers, hidden browser tabs and renderer caches behind one confirm, then report the RSS freed, measured from two `ps` snapshots and the `vm_stat` free-memory delta. A zero result is reported as zero.

**Theme D — Full recovery (`PR-4`, M).** ◻ TODO. Runs #1259's `recoverDetachedSessions`, then reads Theme B's inventory for anything still unreachable. It shows one summary grouped by repo (recovered rows with Reveal, previous-build rows with End…, unreachable brokers with Manage resources). `terminal.recoverDetached` is repointed to this flow, so the palette and the widget run the same thing and no second command is added.

**Theme E — Clean system (`PR-5`, S).** ◻ TODO. Runs the optimizer's existing consent-gated system-cache scan and clean (`runSystemScan`, `runSystemClean`) from the widget, plus an on-demand broker-dir sweep. The sweep reuses #1259's `staleBrokerFiles` and adds log files of versions with no live broker. One confirm lists entries and sizes, and the result reports bytes reclaimed.

## Deliverables

### Theme A — Monitor flyout actions slot (`S`)

- [x] **148.A.1** In `packages/frame/src/shell/status-bar/monitor/monitor-cluster.tsx:23-30`, add `export type MonitorAction = { id: string; label: string; description: string; Icon: IconComponent; run: () => void; disabled?: boolean }`. Add `actions?: readonly MonitorAction[]` to `MonitorSegmentOptions` and `MonitorFlyoutProps`, and thread it through `createMonitorSegment` (`:40`) into `<Flyout>` (`:73`). Running an action closes the popover first, the same way `onOpenMonitor` does (`:74-77`). Export the type from `packages/frame/src/index.ts`.
- [x] **148.A.2** In `packages/features/monitor/renderer/monitor-flyout.tsx:30`, accept `actions` and render an `Actions` section (`role="group" aria-label="Recovery actions"`) above the Open Monitor button (`:141`). It is a 2×2 grid of buttons, each with an icon, a label and its `description` as the tooltip. With no actions, it renders nothing.
- [x] **148.A.3** Studio host: add a new `packages/app/src/features/monitor/recovery-actions.ts` that builds the four actions in this order: Clean system `LuSparkles` · Manage resources `LuGauge` · Free RAM `LuMemoryStick` · Full recovery `LuLifeBuoy`. Pass them from `packages/app/src/features/monitor/monitor-cluster.tsx:10`. Each `run` starts as a call into the theme that owns it: A ships them wired to existing entry points (Manage resources → `requestHandoff({app:'cleaner', view:'optimizer'})`, Full recovery → #1259's `recoverDetachedSessions(dialogs)`), and later themes replace them.
- [x] **148.A.4** Badge: while `previousBuildSessions().length > 0` (#1259, `end-sessions.ts`), the cluster trigger shows a small amber dot. Its tooltip reads "N sessions from a previous build", so the 12 GB case stops being invisible. Wire it through a host-supplied `attention?: () => string | null` option, so the frame stays ignorant of terminals.
- [x] **148.A.5** Suite apps (`packages/features/monitor/renderer/suite-monitor-segment.tsx:22`) pass no actions in this phase. That is recorded in `outstanding.md` as cross-process deep links, which need a launcher link param.
- [x] **148.A.6** Tests (vitest):
  - `monitor-cluster.test.tsx`: actions render, clicking one closes the popover and calls `run`, `attention` shows the dot.
  - `monitor-flyout.test.tsx`: no section when `actions` is empty.
  - `icon-names.test.ts`: covers the four `Lu*` names.

**Acceptance:** opening the cluster shows four labelled actions in Studio and none in suite apps. With a previous-build session present the dot shows, and it clears once the session ends.

### Theme B — Lost-process inventory and Manage resources (`L`, opus)

- [x] **148.B.1** Shared: extend `ProcessInfoSchema` (`packages/shared/src/domain/optimizer.ts:119`) with optional `lost: z.enum(['previous-build','unreachable','no-row']).nullable()` and `brokerPid: z.number().int().positive().nullable()`, which is the broker whose tree the process sits in. Both are optional, so older payloads still parse.
- [x] **148.B.2** New `packages/desktop/src/main/optimizer/broker-inventory.ts`. It has a pure `classifyBrokers({ pidFiles, rows, connectedPeers, primarySocket, sessionRows })` and an impure reader over `<userData>/broker`, reusing #1259's `isPidAlive`. The rules:
  - A live pid named by a `*.sock.pid` file whose `ps` argv carries `--socket <brokerDir>/` is a broker.
  - Its socket name's build id ≠ current → `previous-build`.
  - Its `.sock` is missing, or the client has no peer for it → `unreachable`.
  - A pty root under a reachable broker whose `sessionId` has no `terminals.json` row → `no-row`. After #1259 this should be rare, but it covers a recover that has not run yet.
  - The current primary broker is never lost.
- [x] **148.B.3** In `getProcessTableResult` (`kill-service.ts:133`), stamp `lost` and `brokerPid` on each broker and every descendant (`descendantsOf`, `agent-process.ts:224`). Also set `owner` to `"<repo> · <agent>"` where `matchRunningAgent` (`agent-process.ts:431`) names an agent.
- [x] **148.B.4** Kill guard: `isOurProcess` (`agent-process.ts:499`) accepts a broker the inventory lists, plus its descendants. `killProcess` (`kill-service.ts:193-226`) still refuses the main pid, the **current primary broker** (new explicit check), `PROTECTED_PROCESS_NAMES` (`:49`), and any argv mismatch. Add `killTree(brokerPid, expectArgv)`, which sends SIGTERM to the broker; its own shutdown takes its ptys. Escalating to SIGKILL is an explicit second confirm, as `memory-tab.tsx:240` already does.
- [x] **148.B.5** In the optimizer store (`optimizer-store.ts:22,44,107`), move the Memory tab's local `ownOnly` (`memory-tab.tsx:139`) to `memoryFilter: 'all' | 'ours' | 'lost'` in the store. Export `openOptimizerAt({ tab, memoryFilter })` from `@midnite/studio-feature-optimizer/renderer`.
- [x] **148.B.6** In `memory-tab.tsx:194`, add a `Lost` pill next to Own only, with a count. On a lost row, show a reason badge (`previous build`, `unreachable broker`, `no sidebar row`). On a broker row, the Kill confirm's `warnings` lists every process in its tree as `pid · RSS · argv`, and its `blastRadius` line gives the total RSS and session count. Add an "End all lost (N · X GB)" bulk button with the same confirm.
- [x] **148.B.7** Manage resources (`recovery-actions.ts`): call `openOptimizerAt({ tab:'memory', memoryFilter:'lost' })`, then `requestHandoff({ app:'cleaner', view:'optimizer' })` (`app/src/services/handoff.ts:82`).
- [x] **148.B.8** Tests (vitest):
  - `broker-inventory.test.ts`: each reason; the primary is never lost; a dead pid file is ignored; a foreign `--socket` path is not ours.
  - `kill-service.test.ts`: a ppid-1 legacy broker is killable; the primary and main are refused; PID reuse is refused.
  - `memory-tab.test.tsx`: the Lost filter and badges; the tree confirm lists RSS and commands.
  - `optimizer-store.test.ts`: `openOptimizerAt`.

**Acceptance:** with a fixture of two `-retired-<pid>` brokers (ppid 1, old build id, 4 and 2 ptys), Manage resources lands on Memory ▸ Lost showing both brokers and their trees. Killing one lists all 5 processes with RSS before confirming, and the primary broker has no kill button.

### Theme C — Free RAM (`M`)

- [ ] **148.C.1** Shared: add channels `resourcesFreeRamPlan` / `resourcesFreeRam` (`mstudio:resources:free-ram-plan|free-ram`), with zod schemas for `FreeRamCandidate = { id, kind: 'previous-build-session'|'lost-broker'|'hidden-tab'|'renderer-cache', label, command: string|null, rssBytes: number|null, destructive: boolean }`. The plan response is `{ candidates, totalRssBytes }`. The execute request is `{ candidateIds }` and its response is `{ ended: string[], measured: { beforeRssBytes, afterRssBytes, freedRssBytes, machineFreeDeltaBytes|null }, failures: {id,message}[] }`. Both return the envelope, and the bridge namespace is `resources`.
- [ ] **148.C.2** Main: add `packages/desktop/src/main/ipc/resources-handlers.ts` over a new `desktop/src/main/resources/free-ram.ts`.
  - The plan gathers candidates in this order: previous-build sessions (#1259 `studioPtys().filter(legacy)`), lost brokers (Theme B), hidden eligible browser tabs (reuse the eligibility at `features/browser/main/browser-service.ts:218`, then `discardBrowserTab` `:1043`), and renderer caches.
  - Execution order: `endSessions` (#1259) → `killTree` (B) → `discardBrowserTab` → tell the renderer to run `webFrame.clearCache()` through a preload method. Then wait until every killed pid is gone (at most 5 s), and re-snapshot.
- [ ] **148.C.3** Measurement is the Σ RSS of Midnite-classified processes (main, renderers, gpu, utility, every broker and its pty trees), using the same `ps` join as `getProcessTableResult`, before and after, plus the `vm_stat` free+inactive delta (`features/monitor/main/metrics/memory.ts:39` parser). Report `freedRssBytes` as `max(0, before − after)`, and never an estimate.
- [ ] **148.C.4** Renderer: the Free RAM action calls the plan and opens one confirm (`danger: true`).
  - Destructive candidates come pre-checked, with label, command and RSS. Non-destructive ones (tabs, caches) are listed as "also".
  - The total line reads "≈X GB held".
  - After execution, a toast reads "Freed 11.8 GB · Midnite processes 14.2 → 2.4 GB". A zero result reads "Nothing to free".
- [ ] **148.C.5** Add a chord-free command `system.freeRam` "Free RAM" (group `system`) to `COMMANDS`, with its handler in `use-command-handlers.ts` and its icon in `command-icons.ts`.
- [ ] **148.C.6** Tests (vitest):
  - `free-ram.test.ts`: planning order; the primary broker and other apps' sessions are excluded; measurement arithmetic; a failure in one step does not stop the rest.
  - `ipc.test.ts`: schemas.
  - A renderer test for the confirm contents and the toast copy.
- [ ] **148.C.7** Perf number: add `--action=free-ram` to `scripts/perf/memory-report.mjs`, reusing `classify-process.mjs`. It spawns a fake legacy broker that holds N idle shells, runs the op, and prints the per-class RSS before and after. The PR body quotes that output.

**Acceptance:** on the fixture above, Free RAM lists 6 sessions and 2 brokers with RSS. After confirming, both brokers are gone, the toast's figure matches the perf script's after-minus-before within 5%, and the primary broker's sessions survive.

### Theme D — Full recovery (`M`)

- [ ] **148.D.1** Add `packages/app/src/features/monitor/full-recovery.ts`. It calls #1259's `bridge.terminal.recoverDetached()` and then `useTerminalStore.refresh()`, as `recover-detached.ts` does, but returns the result instead of showing a toast. It then calls `optimizer.processes()` and keeps the rows with `lost === 'unreachable'` (Theme B). With B not yet landed, that section is skipped.
- [ ] **148.D.2** Summary dialog (frame dialog, not a toast), in three sections, each hidden when empty:
  - **Recovered (N):** grouped by `DetachedSession.repoId`, each row with title, cwd and **Reveal**. Reveal reuses `reveal-session.ts`, which switches the selected repo and focuses the row.
  - **Still on a previous build (N):** **End…** → #1259's `endSessionsWithConfirm`.
  - **Unreachable (N · X GB):** **Manage resources** → B.7.
  - The footer reads "N sessions running".
- [ ] **148.D.3** Repoint the `terminal.recoverDetached` handler (`use-command-handlers.ts:226`) to `runFullRecovery(dialogs)`, so the palette, the widget and any MCP caller share one flow. Keep the command id and label. Do **not** add a second command.
- [ ] **148.D.4** Sessions owned by another app (`owner` ≠ `studio`) are counted under "Belongs to <app>" and never adopted, matching #1259's `studioPtys()` filter.
- [ ] **148.D.5** Tests (vitest), in `full-recovery.test.ts` with mock-bridge:
  - grouping by repo
  - empty-state copy ("Everything is attached")
  - the unreachable section only when B data is present
  - Reveal calls `revealSession`
  - an error envelope shows a notify and no dialog

**Acceptance:** after killing the renderer, wiping `terminals.json` and relaunching against the fixture, Full recovery lists all 6 sessions under their repos. Reveal lands on each one in the sidebar, and running it again reports "Everything is attached".

### Theme E — Clean system (`S`)

- [ ] **148.E.1** Main: add `brokerSweepPlan` / `brokerSweep` (`mstudio:resources:broker-sweep-plan|broker-sweep`) in `resources-handlers.ts`. The plan lists `staleBrokerFiles(...)` (#1259 `runtime/src/broker/stale-files.ts`) plus `<version>[-dev].log*` files whose version has no live broker pid, with their sizes. The sweep unlinks only paths the plan returned that still match the same rule.
- [ ] **148.E.2** Renderer action:
  - If system-cache consent is not given (Phase 73's consent, `use-optimizer.ts:200` catalogue), open that consent first.
  - Otherwise run `runSystemScan()` (`use-optimizer.ts:107`) and the broker sweep plan together, and show one confirm with each entry's label and size, the "Broker leftovers (N files · X MB)" line, and the total.
  - On confirm, run `runSystemClean(entryIds)` (`:131`, which moves items to the Trash) and `brokerSweep`.
  - The toast reports bytes reclaimed.
- [ ] **148.E.3** Add a chord-free command `system.cleanSystem` "Clean System".
- [ ] **148.E.4** Tests (vitest):
  - the broker sweep plan: logs of a live version are kept; a young file is kept, per `STALE_FILE_MIN_AGE_MS`
  - the action's consent-first branch
  - confirm contents

**Acceptance:** with 130 dead `*.sock.pid` files and old logs present, Clean system lists them as one line with a size. After confirming they are gone, and a live broker's files are untouched.

## Parallelism and order

| Theme | Depends on | Parallel with |
|---|---|---|
| A | — (can start before #1259) | B, E |
| B | #1259 merged | A, E |
| C | A, B, #1259 | D |
| D | A, #1259 (B soft: adds the Unreachable section) | C, E |
| E | A, #1259 | B, C, D |

Wave 1 is A ∥ B ∥ E's main half. Wave 2 is C ∥ D. A is small on purpose, so the others can rebase onto its `actions` slot early. C and E both add `resources-handlers.ts` and channels: whichever lands second rebases onto the first, or the first PR creates the file with both namespaces stubbed.

## Verification

- [ ] CI gate green (`moon run :typecheck :lint :test` on CI. The local full gate is not run on this machine), with zero boundary violations. The frame and monitor feature import no terminal or optimizer code.
- [ ] `memory-report.mjs --action=free-ram` number quoted in Theme C's PR.
- [ ] Manual: reproduce the incident with a previous build's broker left running → badge shows → Full recovery lists its sessions → Free RAM frees the measured amount → Clean system clears the leftovers.

## Decisions / open questions

- **Idle sessions in Free RAM.** Should Free RAM also offer ending current-build sessions that sit idle at a prompt, aren't visible, and haven't been touched for 30 minutes or more? Default assumption: no for this phase. Idle shells cost little RSS, and ending them loses scrollback. Revisit if a measurement shows otherwise.
- **The attention badge (A.4).** It defaults to on. If the user finds it noisy, the alternative is a Settings ▸ Monitor toggle.
- **Suite apps' actions.** Agents, Media and the other suite apps get Manage resources and Full recovery only once `midnite://open` can carry an optimizer tab/filter and a "recover" verb. That is deferred to `outstanding.md`.
