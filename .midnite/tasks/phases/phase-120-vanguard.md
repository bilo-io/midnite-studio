# Phase 120 — Vanguard: antivirus and agentic self-defense

**Planned unattended** (swarm subagent, via `/midnite-ideate` house style) · 2026-10-22

Vanguard is the one suite app that exists only as a catalog tile. The launcher's
[`catalog.ts`](../../../apps/launcher/src/common/catalog.ts) lists it (`id: 'vanguard'`, "Antivirus and
agentic self-defense", "Like CrowdStrike, Little Snitch and SentinelOne", three features — Antivirus,
Agentic Self-Defense, Network Monitor — every one targeting `view('landing')`, `comingSoon: true`). A
read of the tree on 2026-10-22 finds no `packages/features/vanguard`, no `apps/vanguard`, and no
`vanguard` anywhere under `packages/shared`. What the tree *does* have is most of the raw material: a
repo-tooling trust store ([`trust-store.ts`](../../../packages/desktop/src/main/diagnostics/trust-store.ts)),
a process-table reader ([`agent-process.ts`](../../../packages/desktop/src/main/agent-process.ts)), a
path jail and an allowlist jail ([`fs-jail.ts`](../../../packages/runtime/src/fs-jail.ts),
[`confine-allowlist.test.ts`](../../../packages/runtime/src/confine-allowlist.test.ts)), a no-shell
process runner with group kill ([`process-runner.ts`](../../../packages/runtime/src/process-runner.ts)),
the bounded MCP audit ring ([`audit.ts`](../../../packages/desktop/src/main/mcp/audit.ts)), the
secret patterns ([`redact.ts`](../../../packages/shared/src/redact.ts)), and an installer that already
runs `codesign --verify --deep --strict` and `spctl --assess` before it swaps a bundle (Phase 91 H).

This phase builds the app. Its job is the *always-on* half of the suite's security story: sensors that
watch the machine, the repo and the agents while they run, a ledger every finding lands in, and the
response actions — pause, kill, quarantine, revoke — that a finding can carry. The *recurring* half,
scheduled sweeps that produce findings on a cadence, is [Phase 122](phase-122-guard-loop-upgrade.md),
and the *policy* half for agents — what an agent may call, what it may see, where it may write — is
[Phase 121](phase-121-agents-security.md). The three share one contract (Theme A) and the split is
stated in each doc.

Scope guardrails:
- **No kernel or system extension.** Apple's Endpoint Security framework needs the restricted
  `com.apple.developer.endpoint-security.client` entitlement, granted on request, plus a system
  extension the user approves and Full Disk Access ([Apple docs](https://developer.apple.com/documentation/endpointsecurity)).
  Vanguard reads what an unprivileged, notarised app can read — `ps`, `lsof`, `codesign`, `spctl`,
  `xattr`, `launchctl`, the unified log through `log show`, and `fs.watch` on a short list of
  directories — and names the entitlement as a recorded, deferred decision.
- **No GPL code is linked.** YARA is BSD 3-Clause ([COPYING](https://github.com/VirusTotal/yara/blob/master/COPYING))
  and may be bundled; ClamAV is GPLv2 ([README](https://github.com/Cisco-Talos/clamav/blob/main/README.md))
  and is only ever *invoked* as a separate program the user installed, never linked or shipped.
- **Nothing phones home.** Vanguard itself makes no network call. Threat feeds and CVE lookups are
  Phase 122's, behind [Phase 115](phase-115-privacy-egress-and-at-rest.md) A's registry and switches.
- **Every destructive response goes through the blast-radius confirm** the rest of the app uses.
  Kill, unload, quarantine and revoke each show what they touch before they touch it.
- **Features never import each other.** Vanguard reads the agent audit trail (Phase 121 G) and the
  Guard findings (Phase 122 A) through the runtime ledger and `shared` ids, never through a
  `features/chats` or `features/*` import ([`docs/APPS.md`](../../../docs/APPS.md), the layer rule).

> **Effort tags:** S ≈ ≤ 2h · M ≈ half-day to a day · L ≈ 1–2 days. A lands first — B, C, D, E, F
> and G all write into it. B needs A. C, D, E and F are independent of each other and need only A.
> G needs A and Phase 121 G's audit trail. H needs A and at least one of C–G to act on. Suggested
> swarm: A, then B+C+D, then E+F, then G+H.

> **Threat landscape this phase answers to, read on 2026-10-22.** macOS infostealers now arrive by
> *ClickFix* — a cloaked fake-CAPTCHA or "bot protection" page that talks a Mac user into pasting a
> Terminal command, which mounts a DMG and installs Atomic Stealer (AMOS) or MacSync; Microsoft
> tracked one cluster of over 250 fingerprinting domains in August 2026, and Apple added a Terminal
> paste warning in macOS 26.4 ([BleepingComputer](https://www.bleepingcomputer.com/news/security/new-macos-clickfix-attack-silently-mounts-dmgs-to-push-infostealer/),
> [Microsoft](https://www.microsoft.com/en-us/security/blog/2026/08/05/macos-clickfix-campaign-learned-hide/),
> [Malwarebytes on Infiniti Stealer](https://www.malwarebytes.com/blog/threat-intel/2026/03/infiniti-stealer-a-new-macos-infostealer-using-clickfix-and-python-nuitka)).
> The "Odyssey" AMOS variant persists through LaunchAgents and trojanises local wallets
> ([Broadcom](https://www.broadcom.com/support/security-center/protection-bulletin/amos-atomic-macos-stealer-malware-deployed-in-latest-clickfix-campaign-targeting-macos-users)).
> A coding agent is a ClickFix victim that never hesitates: it pastes what a page tells it to. On the
> agent side, indirect prompt injection turned Cursor's agent into an RCE primitive by having it write
> `.cursor/mcp.json` (CVE-2025-54135) and a once-approved MCP config into a rug-pull
> (CVE-2025-54136, "MCPoison"), the GitHub MCP "toxic agent flow" exfiltrated private repos through a
> public PR, and `mcp-remote` took a CVSS 9.6 command injection from an untrusted server
> (CVE-2025-6514) ([Sysdig](https://www.sysdig.com/learn-cloud-native/prompt-injection),
> [CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-security-crisis-20260504-csa-styled/)).
> The May 2026 Five Eyes guidance on agentic AI names prompt injection as a core technique and says
> no single safeguard is enough. Vanguard is the safeguard that watches the *effects* — a new
> LaunchAgent, a new outbound host, a write outside the repo — when every upstream one has failed.

## Headlines

*The suite gets a watcher that sees the effects of a compromise — a new persistence item, an
unexpected outbound connection, a file changed under a running agent — and can stop it, with one
ledger every security finding in the suite lands in.* Born from a catalog tile with nothing behind
it and a threat landscape in which the coding agent is the new ClickFix victim. (22% · 10/46) —
**Planned 2026-10-22.**

**Theme A — One finding, one ledger.** ✅ `SecurityFindingSchema` in `shared` (source, severity,
category, evidence, remediation actions, status) and a runtime findings ledger — append-only NDJSON
at 0600, deduplicated by fingerprint — that Vanguard, the Guard loop (Phase 122) and the agent
policy layer (Phase 121) all write into. Channels and events for the renderer.

**Theme B — The feature and the app.** ✅ `packages/features/vanguard` (renderer + main halves) with a
sensor host that owns every sensor's timer and state: a sensor is a plain-string id plus a definition
added to `BUILTIN_SENSORS` in `main/sensors.ts`, so C-F add no shared constant. The view has Findings,
Sensors and Network tabs; Settings ▸ Vanguard persists per-sensor switches, cadence and quarantine
retention main-side in `vanguard.json`. Studio composes it (autostart after the view is first opened);
`apps/vanguard` (port 5192, composes vanguard, report and a sessions guest, no vault) autostarts always.
`'vanguard'` is a new placement/link app id; the launcher tile's three features point at the view's
tabs and `comingSoon` stays true. Only the `mute` action is enabled in the UI until Theme H. Also fixed
`typecheck-node.test.mjs`'s project count (37 to 38), broken since Theme A.

**Theme C — Integrity of the repo and the bundle.** ◻ A hash baseline over the files that decide
what runs — the app's own bundle (`codesign --verify` at launch), `.claude/`, `.mcp.json`,
`.cursor/`, `.githooks/`, `package.json` scripts, lockfiles — with a change attributed to the
session that was live when it happened.

**Theme D — Persistence and process sensors.** ◻ LaunchAgents, LaunchDaemons, login items, cron,
shell rc files and `~/.ssh` watched for change; the process table diffed for new executables,
each checked with `codesign`, `spctl` and the quarantine xattr; XProtect version and Gatekeeper
denials read from the unified log.

**Theme E — Network behaviour.** ◻ `lsof` snapshots of outbound connections per process, diffed
against Phase 115's egress registry for the suite's own processes and against a per-session baseline
for agent processes; a new destination from an agent session is a finding.

**Theme F — Malware scanning.** ◻ A bundled YARA ruleset for the shapes this landscape actually has
— ClickFix command lines, Shai-Hulud markers, poisoned `postinstall` scripts, AMOS droppers — run
through a YARA binary when present; `clamscan` invoked, never linked, when installed. On-demand and
on-change scans; browser downloads scanned through Phase 117's download hook.

**Theme G — Rogue agent behaviour.** ◻ Vanguard subscribes to Phase 121's audit trail and raises
findings for the behaviours a compromised agent shows: reads under `~/.ssh`/`~/.aws`, `curl | sh`
shapes, writes outside the scope jail, git writes that bypass the write queue, bursts past the rate
limits, a persistence item appearing while a session is live.

**Theme H — Response and quarantine.** ◻ Per-finding actions — pause the session, kill the process
group, `launchctl bootout` the item, quarantine the file to `<userData>/quarantine` with a manifest
and a restore path, revoke the MCP server, report the issue — each behind the blast-radius confirm,
each written back to the ledger.

## Deliverables

### A — One finding, one ledger [M · ~1d]

- [x] **`SecurityFindingSchema` in `shared`.** New `packages/shared/src/security-findings.ts`: `id`,
      `fingerprint` (stable across re-detections), `source: 'vanguard' | 'guard' | 'agents'`,
      `severity: 'critical' | 'high' | 'medium' | 'low' | 'info'`, `category` (`persistence`,
      `process`, `network`, `integrity`, `malware`, `agent`, `vulnerability`, `config`, `secret`,
      `supply-chain`, `site`), `title`, `detail`, `evidence: EvidenceItem[]` (path, pid, host, hash,
      command — each typed, none free-form), `remediation: RemediationAction[]` (an action id from a
      closed enum plus its arguments, so the renderer renders a button, never a shell string),
      `firstSeen`, `lastSeen`, `count`, `status: 'open' | 'acknowledged' | 'resolved' | 'muted'`,
      `sessionId?`, `repoId?`. zod only, in the barrel. [S]
- [x] **The ledger in the runtime.** New `packages/runtime/src/security/findings-ledger.ts`: one
      append-only NDJSON file per month under `<userData>/security/findings-<yyyy-mm>.ndjson`, dir
      0700, file 0600 (Phase 115 B's modes), every record through `redactRecord` on write (Phase 115
      C). `record(finding)` dedupes by `fingerprint` within the open set — a re-detection bumps
      `lastSeen`/`count` rather than adding a row. `list({status, severity, source, since})`,
      `setStatus(id, status)`, `prune(retention)`. Serialised through one `withLock` queue, the
      pattern [`loop-runs.ts`](../../../packages/desktop/src/main/loop-runs.ts) uses. No `electron`
      import; the host injects `userData`. [M]
- [x] **Channels and events.** `CHANNELS.securityFindingsList`, `securityFindingsSetStatus`,
      `securityFindingsAct` (Theme H) and `EVENT_CHANNELS.securityFindingsChanged` (carries nothing;
      the renderer re-fetches, as `loopRunsChanged` does) in
      [`channels.ts`](../../../packages/shared/src/ipc/channels.ts); request/response schemas in
      `shared/src/ipc`. Handlers in `packages/features/vanguard/main/findings-handlers.ts`, bound by
      the composer. [S]
- [x] **Tests.** Schema round-trips, dedupe-by-fingerprint, redaction on write (a vault-shaped token
      in `detail` never reaches disk), mode 0600 on a fresh and an upgraded profile, prune. [S]

### B — The feature and the app [M · ~1d]

- [x] **`packages/features/vanguard`.** `manifest.ts` (`defineFeatureManifest`, `owner: 'vanguard'`,
      one global `vanguard` view with a rail entry and a `shield` status-bar slot), `renderer/`
      (`vanguard-view.tsx`: findings list grouped by severity with filters by source/category/status,
      a finding detail pane with evidence and action buttons, a Sensors tab showing each sensor's last
      run and state), `main/` (the sensor host that starts/stops sensors and owns their timers; no
      `electron` — the composer injects `userData`, the window thunk and a `runProcess`). Copy the
      template [`monitor/manifest.ts`](../../../packages/features/monitor/manifest.ts) describes. [M]
- [x] **Studio composes it.** `vanguard` added to `STUDIO_FEATURES` in
      [`composition.ts`](../../../apps/studio/src/composition.ts) (the composition test demands it),
      wired in `packages/app/src/compose/` the way `monitor` is, `vanguard` in the `ViewId` vocabulary
      and in [`nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts) (chord-free). [S]
- [x] **`apps/vanguard`.** Copied from `apps/monitor` — `main/{bridge,context,identity,index,preload}.ts`,
      `src/{vanguard-app.tsx,vanguard-manifest.ts,compose/,views/}`, `moon.yml`, the esbuild/Vite
      configs — composing `vanguard`, `report` and `sessions` (so a finding's "pause the session" has
      a broker to talk to, as a guest: [`guest-sessions.ts`](../../../packages/features/sessions/main/guest-sessions.ts)).
      `scripts/app-vault-grants.test.mjs` holds that it composes no vault. [M]
- [x] **The catalog tile.** `catalog.ts`'s three features point at `view('vanguard')` with a `tab`
      each (`findings`, `sensors`, `network`); `comingSoon` stays `true` until C, D and H are checked
      off — the item that flips it is in H. [S]
- [x] **Settings ▸ Vanguard.** One page: each sensor on/off (all on by default once the app is
      installed, all off in Studio until the user opens the view once — a sensor the user never
      asked for must not start polling `lsof`), scan cadence, quarantine retention, "Open
      quarantine folder". Persisted main-side the way [`mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts)
      is, since sensors start before any window. [S]

### C — Integrity of the repo and the bundle [M · ~1d]

- [ ] **The watched set.** Per open repo: `.claude/**`, `.codex/**`, `.agents/**`, `.cursor/**`,
      `.mcp.json`, `.githooks/**`, `.git/hooks/**`, `.vscode/settings.json`, `.vscode/tasks.json`,
      `package.json` (`scripts` only), every lockfile (`pnpm-lock.yaml`, `package-lock.json`,
      `yarn.lock`, `Cargo.lock`, `poetry.lock`, `go.sum`), `.env*`, `.npmrc`. Per user: `~/.claude/settings.json`,
      `~/.claude/plugins/installed_plugins.json`, `~/.claude.json`, `~/.codex/config.toml`,
      `~/.npmrc`, `~/.gitconfig`. The list is a `shared` constant with a reason per entry, so the
      Sensors tab can say why each is watched. [S]
- [ ] **Baseline and diff.** `packages/features/vanguard/main/integrity-sensor.ts`: SHA-256 per file,
      baseline persisted under `<userData>/security/integrity/<repoId>.json`, `fs.watch` with a
      debounce plus a slow full re-hash on the cadence; a change outside a git commit (the file is
      dirty, or the HEAD it was committed in is newer than the last baseline) is a finding of category
      `integrity`, severity `high` for hooks/MCP/agent config, `medium` for the rest. [M]
- [ ] **Attribution.** A change is attributed to the agent session live at that moment: the pty
      sessions' `agentId`/`sessionId` (the write-side fingerprint
      [`pty-env.ts`](../../../packages/desktop/src/main/pty-env.ts) already puts in the environment)
      and the processes descended from them. The evidence names the session; Phase 121 G's audit
      trail, when present, names the tool call. Best-effort, stated as such in the finding. [S]
- [ ] **The bundle verifies itself.** At launch, `codesign --verify --deep --strict` on
      `process.execPath`'s bundle and `spctl --assess --type execute`; an ad-hoc or unsigned result
      is `info` (dev builds) unless the build is a release, in which case `critical`. The same check
      Phase 91 H's installer runs, reused rather than rewritten. [S]
- [ ] **Tests.** The watched-set constant has a reason per entry; a hook rewritten under a fake
      session yields one `integrity` finding naming that session; a committed change yields none. [S]

### D — Persistence and process sensors [L · 1–2d]

- [ ] **Persistence locations.** `~/Library/LaunchAgents`, `/Library/LaunchAgents`,
      `/Library/LaunchDaemons`, login items (`osascript -e 'tell application "System Events" to get
      the name of every login item'` or `sfltool dumpbtm` where readable), `crontab -l`,
      `~/.zshrc`/`~/.zprofile`/`~/.bashrc`/`~/.bash_profile`/`~/.profile`, `~/.ssh/authorized_keys`
      and `~/.ssh/config`, `/etc/periodic`. Baseline + `fs.watch`; a new or changed item is a
      `persistence` finding whose evidence carries the plist's `ProgramArguments` and the signature
      state of what it launches. `high` by default, `critical` when the target is unsigned or
      quarantined. [M]
- [ ] **Process table.** `ps -axo pid,ppid,uid,comm,args` on the cadence (the reader in
      [`agent-process.ts`](../../../packages/desktop/src/main/agent-process.ts) generalised into the
      runtime), diffed; each new executable path gets `codesign -dv --verbose=2` (team id, ad-hoc or
      not), `spctl --assess`, and `xattr -p com.apple.quarantine`. Unsigned + quarantined + spawned
      from a shell under an agent session is `critical`; unsigned from a known dev tool path
      (`node_modules/.bin`, `~/.cargo/bin`, `/opt/homebrew/bin`) is `info`. [M]
- [ ] **Apple's own signals.** XProtect version from
      `/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/Info.plist` (stale beyond
      30 days is `medium`), Gatekeeper and XProtect denials from
      `log show --last <cadence> --predicate 'subsystem == "com.apple.syspolicy"'` and
      `'process == "XProtectRemediator"'` — each denial is a finding with the log line as evidence.
      Gatekeeper off (`spctl --status`) and SIP off (`csrutil status`) are `high` config findings
      shared with Phase 122 D (same fingerprint, so they dedupe). [M]
- [ ] **Terminal paste shapes.** A command line in an agent pty that matches the ClickFix grammar —
      `curl`/`wget` piped to `sh`/`bash`/`zsh`, `base64 -d | sh`, `osascript -e` with a
      `do shell script`, `hdiutil attach` of a freshly downloaded DMG, `xattr -d com.apple.quarantine`
      — is a `process` finding at `high` the moment it is seen in scrollback (the broker's output
      stream, read-only; Phase 121 B is where it can be *blocked*). [M]
- [ ] **Tests.** Fixture plists (a benign Homebrew agent, an AMOS-shaped one with a hidden
      `~/Library/Application Support/.x/x` target) classify as expected; the `ps` diff with a fixture
      table; the ClickFix grammar against a corpus of benign dev commands (`curl | jq`, `pnpm dlx`)
      with zero false positives. [S]

### E — Network behaviour [M · ~1d]

- [ ] **Connection snapshots.** `lsof -i -nP -F pcnPT` on the cadence (10 s while a session is
      live, 60 s otherwise, nothing while the window is blurred and no agent runs — the visibility
      gate from Phase 76), parsed into `{pid, command, remote host, port, state}`. The parser is pure
      and fixture-tested. [M]
- [ ] **Our own processes against the registry.** A connection from a suite process (the app, its
      broker, its helpers) to a host outside Phase 115 A's `EGRESS_HOSTS` is a `network` finding at
      `high` — it is exactly the leak the registry test cannot see, since the test covers `fetch` and
      not a native module. [S]
- [ ] **Agent sessions against a baseline.** For processes under an agent session, the first
      connection to each `(host, port)` is recorded; a destination not seen in that repo's last 30
      days is `medium`, and `high` when the process is unsigned or the host is a raw IP, a
      paste-site, a tunnel service (`ngrok`, `*.trycloudflare.com`, `*.loca.lt`) or a known
      exfiltration shape (`webhook.site`, `requestbin`, `*.burpcollaborator.net`). The list is a
      `shared` constant Phase 122 C's threat feed can extend. [M]
- [ ] **The Network tab.** The catalog's "Network Monitor" feature: live connections grouped by
      process, the suite's processes first, each row with the registry entry that allows it or the
      finding that flags it. Read-only; blocking is a deferred decision (see Decisions). [S]

### F — Malware scanning [M · ~1d]

- [ ] **Engines.** `probeBinary` (the monitor feature's probe) finds `yara` and `clamscan` on the
      login-shell PATH; each engine is a `ScanEngine` with `available()`, `scan(paths)`, and a
      parser for its output. Neither is linked; both run through `runProcess` with a deadline and
      group kill. No engine installed means the bundled ruleset still runs through a small pure
      matcher for the string/regex subset it uses — the ruleset is written to that subset so
      detection does not depend on Homebrew. [M]
- [ ] **The ruleset.** `packages/features/vanguard/rules/*.yar`, each rule with a source comment and
      a test fixture: ClickFix one-liners, the Shai-Hulud family's markers (a `bundle.js`
      `postinstall` that reads `~/.npmrc`, `.github/workflows/*shai-hulud*`, the TruffleHog download
      line, `setup_bun.js`), the Mini Shai-Hulud npm+PyPI dual-registry shape, AMOS/MacSync dropper
      strings, credential-file readers in `postinstall`/`preinstall`. Refreshed by Phase 122 C's
      signed feed, never by Vanguard itself. [M]
- [ ] **What gets scanned, when.** On change: a new file under a watched persistence location, a
      new executable in the process table, a new `node_modules/*/package.json` with an install
      script, anything Theme C flags. On demand: a repo, a folder, `~/Downloads`, a browser download
      (Phase 117's `will-download` hook hands the path over; Vanguard never touches `webContents`).
      Never the whole disk by default — a full scan is a button with a time estimate. [S]
- [ ] **Tests.** Every rule has a positive fixture that matches and the benign corpus that does not;
      the engine parsers against captured `yara`/`clamscan` output; the no-engine matcher agrees
      with `yara` on the fixtures. [S]

### G — Rogue agent behaviour [M · ~1d]

- [ ] **Subscribe to the trail.** Vanguard's main half tails Phase 121 G's audit NDJSON (the
      runtime's `security/agent-audit.ts` reader, shared with the Guard loop) and the broker output
      stream for agent ptys; both are read-only. [S]
- [ ] **Behaviour rules.** Each a pure function over a window of trail records returning findings:
      a read under `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/Library/Keychains`, the suite's vault files or
      `~/.claude.json` (`high`); a write outside the session's scope jail (`high`); a `git push
      --force`, `git reset --hard`, `git clean -fdx`, branch delete or history rewrite not issued
      through the app's write queue (`high`; the queue's own ops are known by their envelope); a
      `security find-generic-password`/`find-internet-password` call (`critical`); a burst past
      Phase 121 F's limits (`medium`); a persistence item (Theme D) or new outbound host (Theme E)
      appearing while a session is live, correlated by time (`high`, evidence names the session). [M]
- [ ] **Auto-pause.** A `critical` agent finding sends the interrupt byte to the session's pty
      (the `INTERRUPT` [`use-loop-session.ts`](../../../packages/app/src/features/loops/use-loop-session.ts)
      already sends, now from main through the broker) and raises a modal in every suite window;
      the user resumes or kills. Opt-out per severity in Settings ▸ Vanguard, default on for
      `critical` only. [S]
- [ ] **Tests.** A trail fixture for each rule; a benign trail (a normal `/midnite-create` run) yields
      nothing; auto-pause writes the interrupt and nothing else. [S]

### H — Response and quarantine [M · ~1d]

- [ ] **Action enum.** `RemediationActionSchema` (Theme A) closed set: `pause-session`,
      `kill-process-group`, `bootout-launch-item`, `quarantine-file`, `restore-file`,
      `revoke-mcp-server` (Phase 121 C's allowlist), `chmod-600`, `report-issue`, `open-in-agents`
      (compose an investigation prompt into a Chats thread with the finding as an attachment, tagged
      untrusted per Phase 121 A), `mute`. Each has a handler in
      `packages/features/vanguard/main/actions.ts` and a blast-radius description. [M]
- [ ] **Quarantine.** `<userData>/security/quarantine/<findingId>/` holding the file at 0000 plus
      `manifest.json` (original path, hash, mode, xattrs, when, which finding); `restore-file` puts
      it back only after re-scanning. Retention from Settings; "Open quarantine folder" reveals it.
      [S]
- [ ] **Confirm and record.** Every action except `mute` and `report-issue` shows the confirm
      dialog (what dies, what moves, which sessions pause) through the app's existing dialog host;
      the outcome is appended to the finding's ledger row (`actions: [{id, at, ok, error?}]`). [S]
- [ ] **The tile goes live.** With C, D and H checked, `catalog.ts`'s `vanguard` entry drops
      `comingSoon`, and the launcher's install bundle list gains the app. [S]
- [ ] **Tests.** Each action against a temp dir and a fake process; the confirm text names the
      right blast radius; a failed `bootout` leaves the finding open with the error recorded. [S]

## Files this phase touches

| Area | Files |
|---|---|
| Contract and ledger | `packages/shared/src/security-findings.ts` (new), `packages/runtime/src/security/findings-ledger.ts` (new), [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`redact.ts`](../../../packages/shared/src/redact.ts) |
| Feature | `packages/features/vanguard/` (new: `manifest.ts`, `renderer/`, `main/`, `rules/`), [`monitor/manifest.ts`](../../../packages/features/monitor/manifest.ts) (template) |
| Apps | `apps/vanguard/` (new, from `apps/monitor`), [`composition.ts`](../../../apps/studio/src/composition.ts), [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts), [`nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts) |
| Sensors' prior art | [`agent-process.ts`](../../../packages/desktop/src/main/agent-process.ts), [`process-runner.ts`](../../../packages/runtime/src/process-runner.ts), [`fs-jail.ts`](../../../packages/runtime/src/fs-jail.ts), [`system-health.ts`](../../../packages/features/monitor/main/system-health.ts), [`pty-env.ts`](../../../packages/desktop/src/main/pty-env.ts) |
| Response | [`use-loop-session.ts`](../../../packages/app/src/features/loops/use-loop-session.ts) (the interrupt), [`guest-sessions.ts`](../../../packages/features/sessions/main/guest-sessions.ts), [`broker/server.ts`](../../../packages/desktop/src/broker/server.ts), [`report/main/app-issue.ts`](../../../packages/features/report/main/app-issue.ts) |
| Settings | `packages/features/vanguard/main/vanguard-store.ts` (new, after [`mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts)), [`settings-pages/`](../../../packages/app/src/features/settings/settings-pages/) |
| Docs | [`SECURITY.md`](../../../SECURITY.md), [`docs/APPS.md`](../../../docs/APPS.md) (the placement map gains the app), `docs/PRIVACY.md` once Phase 115 G creates it |

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme (CI is the gate; no local full run).
- [x] **A:** two detections with one fingerprint produce one open row with `count: 2`; a token in a
      finding's detail is redacted on disk; `stat` shows 0700/0600.
- [ ] **B:** the composition test passes with `vanguard` listed; `apps/vanguard` boots in a smoke run
      and `app-vault-grants` holds; the layer-boundary test proves the feature imports no sibling.
- [ ] **C:** rewriting `.githooks/pre-commit` under a fake agent session yields one `high` integrity
      finding naming the session; committing the change clears it on the next baseline.
- [ ] **D:** dropping a fixture plist into a temp `LaunchAgents` yields a `persistence` finding
      within one cadence; the ClickFix grammar has zero hits on the benign-command corpus.
- [ ] **E:** a fixture `lsof` output with one unregistered host from the app's own pid yields one
      `high` network finding; the parser handles IPv6 and `->` forms.
- [ ] **F:** every rule's positive fixture matches under both `yara` and the built-in matcher; the
      benign corpus matches nothing.
- [ ] **G:** a trail fixture with `cat ~/.ssh/id_ed25519` yields `high`; auto-pause writes `\x03`
      to the right session and nothing to any other.
- [ ] **H:** quarantine + restore round-trips a file byte-for-byte with its mode and xattrs; a
      `bootout` of a fixture agent in a temp domain succeeds and is recorded.
- [ ] **Open, for a human:** a packaged-app pass on a real Mac — install a benign test LaunchAgent,
      open a tunnel with `ngrok`, run an agent session that `cat`s a fake key — and confirm each
      lands as a finding with a working action; then `idle-cpu.mjs --blurred` shows the sensors cost
      nothing while blurred.

## Decisions / open questions

1. **No Endpoint Security client in this phase.** *Decided (recommended option, unattended).* The
   entitlement is restricted and Apple-reviewed, needs a system extension and Full Disk Access, and
   would make Vanguard the one suite app with a privileged daemon. Polling `ps`/`lsof`/`fs.watch`
   covers the landscape in the framing (persistence, droppers, exfiltration) at second-scale
   latency, which is enough for "see and stop", not for "prevent the exec". **Deferred:** request
   the entitlement once Vanguard has shipped and a user needs `AUTH_EXEC`-grade blocking.
2. **Vanguard is a feature package plus a thin app, not code in `packages/desktop`.** *Decided.*
   That is the layer rule: the sensors are plain Node in the feature's main half, the composer
   injects `userData` and `runProcess`, and Studio and `apps/vanguard` both compose it.
3. **The split with the Guard loop.** *Decided, stated in both docs.* Vanguard is always-on
   sensors plus response; Guard (Phase 122) is scheduled sweeps — CVEs, threat feeds, system
   config, visited sites — that write into the same ledger. Guard never kills anything; Vanguard
   never calls the network. The ledger (Theme A) is the only coupling.
4. **The split with Agents security.** *Decided.* Phase 121 decides what an agent *may* do (policy,
   approval, sandbox) and records what it *did* (the audit trail); Vanguard reads that trail and
   watches the effects. A behaviour Phase 121 blocks never reaches Vanguard; one it allows and
   that turns out rogue does.
5. **YARA bundled, ClamAV invoked only.** *Decided.* BSD-3 versus GPLv2; linking libclamav would
   put the app under GPL, invoking `clamscan` as a separate program does not. Verified against the
   two licence files on 2026-10-22.
6. **Network *blocking* is deferred.** *Decided.* A per-process firewall on macOS is a Network
   Extension (content filter) with its own entitlement and system extension — the same cost as
   Decision 1. The Network tab is read-only; a finding's remediation is "kill the process".
7. **Open: sensors in Studio by default, or only in `apps/vanguard`?** Recommendation: off in Studio
   until the user opens the Vanguard view once, on by default in the Vanguard app. A sensor that
   polls `lsof` every 10 s in an app the user opened to look at a git graph is a surprise.
8. **Open: should a `critical` agent finding kill rather than pause?** Recommendation: pause. A
   false positive that kills a two-hour `/midnite-create` run is worse than one that interrupts it
   for a confirm; the kill is one click away in the modal.
