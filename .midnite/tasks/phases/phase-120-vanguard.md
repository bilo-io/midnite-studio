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
  One carve-out, agreed for Theme E: the network sensor resolves the app's own *fixed* name lists
  (`EGRESS_HOSTS` and `NETWORK_THREAT_HOSTS`) forward, through the system resolver, because `lsof -n`
  prints addresses and those lists are names. That sends no observed destination anywhere. Reverse
  lookups of observed destinations are out: they would tell a DNS server every address an agent
  reached, which is exactly the data this sensor exists to keep private.
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
it and a threat landscape in which the coding agent is the new ClickFix victim. (76% · 35/46) —
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

**Theme C — Integrity of the repo and the bundle.** ✅ The watched set is `INTEGRITY_WATCHED` in
`shared/src/vanguard-integrity.ts`, 24 entries each with a reason for the Sensors tab. The integrity sensor
(`features/vanguard/main/integrity-sensor.ts` and its `integrity/` helpers) keeps a SHA-256 baseline per
open repo and one for the home dir under `<userData>/security/integrity/` (dir 0700, file 0600). It
re-scans on a debounced `fs.watch` (750 ms) and does a slow full re-hash every 5 minutes, a fixed interval
because the 30 s cadence is not slow. A change is "committed" when `git --no-optional-locks status -z
--ignored=matching` lists nothing for the path. Anything else is a `high` (hooks, MCP, agent config) or
`medium` finding, reported once, and the finding resolves when the change is committed or reverted.
`.git/hooks` and the home-dir files have no commit to vouch for them, so every change to them is reported.
Only `package.json`'s `scripts` and `~/.claude.json`'s MCP and allowed-tools parts are hashed; Claude Code
rewrites the rest of that file every session. Attribution names the agent ptys (the `pty-env.ts`
fingerprint) that were live in the repo when the change was seen. The finding says this is best-effort,
and the slot for Phase 121 G's tool call is in place but not yet wired. At launch the bundle self-check
runs Phase 91 H's `codesign --verify --deep --strict`, `spctl --assess --type execute` and `codesign -dv`
with the same argv, pinned by tests. Those checks live in `install.sh` and the off-graph launcher, so they
cannot be imported. On an installed build a broken seal is `critical`. An ad-hoc signature is `info`
until `RELEASES_ARE_NOTARISED` flips, because every release ships ad hoc today and a `critical` on each
launch would be noise. Sensors take composer deps through `builtinSensors(deps)`, and Studio passes its
repos, live ptys, the ledger's resolve and `process.execPath`. The Vanguard app passes only the resolve, so
there it watches the home-dir files.

**Theme D — Persistence and process sensors.** ✅ Four sensors added to `BUILTIN_SENSORS` through one
spread (`createPersistenceProcessSensors`), each over a pure, fixture-tested parser. *Persistence*
baselines LaunchAgents/Daemons, shell rc files, `~/.ssh/authorized_keys`/`config`, `/etc/periodic` and the
crontab (SHA-256 each, `<userData>/vanguard/baselines/persistence.json`); the first scan is silent, then a
new or changed item is a `persistence` finding, `high`, or `critical` when what a plist launches (read
with `plutil -convert json`) is unsigned, quarantined or in a hidden/temp path. *Processes* diffs
`ps -axo pid,ppid,uid,comm,args` for new executable paths and checks each with `codesign`, `spctl` and the
quarantine xattr; the severity ladder is `critical` (unsigned + quarantined + shell under an agent session),
`high`, `medium`, `info` (unsigned in a dev-tool path). *Apple signals* reads XProtect's age (stale beyond 30
days), Gatekeeper and XProtectRemediator denials from `log show`, and Gatekeeper/SIP status, the last two
under shared fingerprints in `CONFIG_FINDING_FINGERPRINTS` so Phase 122 D dedupes with them. *Terminal paste
shapes* matches the ClickFix grammar against a corpus of benign commands with zero false positives. Decisions:
login items are read through `sfltool dumpbtm` only (best-effort, root-gated on current macOS) because the
AppleScript route raises a "control System Events" consent prompt; the process parser lives in the feature,
not generalised into the runtime, since the desktop reader carries fields this one does not. **Wired in Studio:** the paste sensor reads
agent-pty output through a new read-only `observePtyOutput` fan-out in `pty-service.ts` (fed by both the
broker and in-proc paths; no write path), and the process sensor gets the live agent shells' pids from
`listTerminals`; both reach the sensors through `VanguardSensorDeps.persistenceProcess`
(`desktop/src/main/ipc/vanguard-sensor-wiring.ts`, tested with a fake pty source). `apps/vanguard` has no
ptys, so it leaves both unset: its paste sensor idles and its process findings carry no session
attribution (no `critical` rung). Phase 121 B is where a paste can be blocked.

**Theme E — Network behaviour.** ✅ The network sensor (`features/vanguard/main/network-sensor.ts`, parsers in
`main/network/`) runs `/usr/sbin/lsof -i -nP -F pcnPT` through the sensor host's `runProcess` with a deadline and
the host's abort signal, and parses it with a pure parser (`lsof.ts`) that handles the `->` and IPv6 forms and, since
`-F` here carries no `f` field, splits file sets on a repeated field; a test also runs the real `lsof` against a socket
it opens. Cadence is the doc's: the host ticks every 10 s and the sensor drops the passes that are not due, so it reads every
10 s while an agent session is live, every 60 s otherwise and not at all while the window is blurred with no agent
running; "Run now" and the first pass after start bypass the gate (a new `SensorTrigger` argument to `run`). The
sensor ignores the cadence setting. A connection from the app or its broker (found by its script path in `ps`) to an
address no `EGRESS_HOSTS` entry resolves to is a finding rated `info`, through one constant
(`NETWORK_UNREGISTERED_SUITE_SEVERITY`): the registry lists three hosts today, so `high` would flag every ordinary forge,
database or LLM call and teach people to mute the sensor; it goes back to `high` once Phase 115 A's registry is complete
(Decision 9, `outstanding.md`). Electron's helper processes are not counted as the suite because Chromium's network
service carries the embedded browser. Agent processes are the pty roots' `ps` subtrees: the first connection to each
`(address, port)` per repo is recorded in `<userData>/vanguard/network-baseline.json` (0600), and one not seen for 30 days is
`medium`, or `high` when the process is unsigned (`codesign --verify`) or the address is one a `NETWORK_THREAT_HOSTS` name
(paste sites, tunnels, request catchers) resolves to. DNS is forward only and only for the app's own fixed lists
(`EGRESS_HOSTS`, `NETWORK_THREAT_HOSTS`) through the system resolver; no observed destination is ever looked up, so no
reverse lookups, and the "raw IP" rung is dropped (it needs reverse DNS, and "no reverse name" flags CDN addresses),
deferred to Phase 122's threat feed (Decision 10, `outstanding.md`). Tests assert the resolver is only ever asked names from
those two lists. The Network tab shows live connections grouped by process, suite first, each with its registry entry or
flag, above the network findings; rows show the address lsof printed, never a resolved name. The snapshot is a new
`vanguardConnections` channel. Wired in Studio (app pid, broker script, live agent pty pids through a new
`liveAgentSessions`, window focus) and in `apps/vanguard` (its own pid, agent sessions from the shared broker plus the
host's records, window focus). Blocking stays deferred.

**Theme F — Malware scanning.** ✅ Fourteen rules in `features/vanguard/rules/*.yar` (ClickFix command lines
and lure pages, the Shai-Hulud family incl. `setup_bun.js` and the dual npm/PyPI publisher, AMOS-style
password-phish and collector shapes, install scripts that read credentials or pipe a download to a shell),
each with a source comment, a positive fixture and a shared benign corpus. They are written to a subset
(text and regex strings, `nocase`, boolean and `N of them` conditions) that a small pure matcher
(`main/malware/yara-subset.ts`) also runs, so detection needs no install; a test checks the matcher against
output captured from real yara 4.5.8 and, when `yara` is present, live. The `.yar` files are the source of
truth; `scripts/vanguard-rules.mjs` embeds them in `bundled-rules.ts` because the bundled main cannot read
them off disk, and a test fails when that copy is stale. Engines are `ScanEngine`s with `available()`,
`scan(paths)` and a pure parser (`yara -m` and `clamscan` output): neither is linked, both run through the
sensor host's `runProcess` (deadline, group kill, stop signal). `yara` runs the bundled rules when found, the
built-in matcher otherwise (and whenever yara errors); the built-in matcher also checks file names (the
`.github/workflows/*shai-hulud*` check, which a content rule cannot express); `clamscan` is added when found.
**No engine installed is a calm, explained state on the Sensors tab, not an error.** Engines are found by the
monitor feature's `probeBinary`, injected through `sensorDeps.malware.probe` (Studio passes desktop's
re-export); `apps/vanguard` has no monitor and falls back to looking at the Homebrew and system paths only.
**No network:** rules ship in the app, `freshclam` keeps ClamAV's signatures current and is the user's to run,
and a signed rule feed is Phase 122 C's. A `malware` sensor (every 5 minutes and as soon as something is
queued) scans new `node_modules/*/package.json` with an install script, new browser downloads (Phase 117's
hook gains a plain-data `onDownloadDone`; Studio queues the path, and Vanguard never touches `webContents`),
and the file paths of any integrity, persistence or process finding. On demand, from the Sensors tab:
Downloads, a repo, a folder, and a full home-folder scan behind its own confirm and time estimate (never the
default). Studio wires the probe, the repos list and the download hook; the Vanguard app has no repo registry,
folder picker or browser, so it offers Downloads and the full scan and its sensor sees no install scripts or
downloads. A scan skips Vanguard's own rules and fixtures **by content, never by location**: `vanguard-rules.mjs` also
embeds the SHA-256 of every file under `rules/` (`OWN_FILE_DIGESTS`, with its own staleness test), and a file is
skipped only when its bytes hash into that set, so a modified fixture dropped under any
`packages/features/vanguard/...` path is still flagged. Scans are **cancellable**: `vanguardMalwareScanCancel`
(shared channel, bridge, preload, the Vanguard app's bridge and the mock bridge) aborts one controller threaded
through the scanner, the engines' `runProcess` calls and the built-in matcher's walk; the card shows *Cancel scan*
while one runs, and a cancelled scan keeps its findings so far and reports itself as cancelled, not as a failure.
The full-scan confirm no longer quotes a number: it says a scan can take a long time, often tens of minutes.
Findings are `malware`, fingerprinted by rule and path (yara and the matcher dedupe), with a quarantine
action that Theme H implements.

**Theme G — Rogue agent behaviour.** ◻ Vanguard subscribes to Phase 121's audit trail and raises
findings for the behaviours a compromised agent shows: reads under `~/.ssh`/`~/.aws`, `curl | sh`
shapes, writes outside the scope jail, git writes that bypass the write queue, bursts past the rate
limits, a persistence item appearing while a session is live.

**Theme H — Response and quarantine.** ✅ Every finding's remediation buttons now do something. Eight of
the ten actions are built in `packages/features/vanguard/main/actions.ts`: pause the session (Ctrl-C to its
pty), kill the process group (SIGTERM, SIGKILL after 2 s), `launchctl bootout` a user LaunchAgent, quarantine
a file, restore it, `chmod 600`, report the issue (main builds a redacted issue-form URL, the user submits it)
and mute. Each destructive one asks main for its blast radius first (new `securityFindingsActPreview`
channel). The radius is measured from the machine as it is now: process-group members from `ps`, the agent
sessions that end with them, the plist's label and program, and file paths, sizes and modes. It is shown in
the frame's confirm dialog as *Stops / Moves / Pauses* lines. Main plans again when it acts and runs only if
the fresh plan has the digest the user confirmed, which covers the exact targets behind any capped list
(Decision 17). A group that gained a member while the dialog was open is refused, not killed. A stale target is refused with the error recorded: a pid whose start time is after
the finding was last seen, an executable path that changed, or a file or plist whose hash moved. The act also
refuses the app's own process tree, its Electron helpers, the pty broker, other users' processes, system
files, symlinks, and any file the user does not own or whose directory they cannot write. Only an action listed in the finding's own remediation can run, so the renderer can
never name a target. Every outcome is appended to the finding's ledger row as `actions: [{id, at, ok,
error?}]`; a failed `bootout` leaves the finding open. The quarantine reuses Theme F's
`<userData>/vanguard/quarantine` rather than adding the second directory the plan named. It holds one
`<findingId>/` with `manifest.json` (path, hash, mode, xattrs, size, when, which finding, the parent's
realpath) and the file at 0000, dotfiles such as `~/.claude.json` included. Moves are made with
link-and-unlink so nothing is overwritten. No symlink is ever followed in or out: modes are set with
`chmod -h`, xattrs with `xattr -s`, and the copy must be the same inode after the re-scan as before it. Theme F's Settings retention purges it. `restore-file` re-scans first,
never restores over something already at the path, and refuses if the parent directory now resolves
elsewhere. The Sensors tab gains a Quarantine card with *Restore* and *Open quarantine folder*.
The process and persistence sensors now hash the executables they report, so the stale check compares
hashes rather than mtimes, and a re-detection refreshes a finding's actions along with its evidence.
`revoke-mcp-server` and `open-in-agents` stay in the closed enum but answer with a typed "available once
Phase 121 lands" outcome; the UI shows both disabled with that reason. `apps/vanguard` runs all eight, and
*Pause session* works there only while Studio's broker is up. It also never targets its own bundle, Studio's,
the shared runtime directory, or Studio's userData. The tile stays `comingSoon` until a Vanguard
release exists (see Decisions). `bootout` is tested against a fake `launchctl` seam, not a real temp domain,
so Verification H's second half is still open. Screenshots in `docs/screenshots/vanguard-response/`.

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

- [x] **The watched set.** Per open repo: `.claude/**`, `.codex/**`, `.agents/**`, `.cursor/**`,
      `.mcp.json`, `.githooks/**`, `.git/hooks/**`, `.vscode/settings.json`, `.vscode/tasks.json`,
      `package.json` (`scripts` only), every lockfile (`pnpm-lock.yaml`, `package-lock.json`,
      `yarn.lock`, `Cargo.lock`, `poetry.lock`, `go.sum`), `.env*`, `.npmrc`. Per user: `~/.claude/settings.json`,
      `~/.claude/plugins/installed_plugins.json`, `~/.claude.json`, `~/.codex/config.toml`,
      `~/.npmrc`, `~/.gitconfig`. The list is a `shared` constant with a reason per entry, so the
      Sensors tab can say why each is watched. [S]
- [x] **Baseline and diff.** `packages/features/vanguard/main/integrity-sensor.ts`: SHA-256 per file,
      baseline persisted under `<userData>/security/integrity/<repoId>.json`, `fs.watch` with a
      debounce plus a slow full re-hash on the cadence; a change outside a git commit (the file is
      dirty, or the HEAD it was committed in is newer than the last baseline) is a finding of category
      `integrity`, severity `high` for hooks/MCP/agent config, `medium` for the rest. [M]
- [x] **Attribution.** A change is attributed to the agent session live at that moment: the pty
      sessions' `agentId`/`sessionId` (the write-side fingerprint
      [`pty-env.ts`](../../../packages/desktop/src/main/pty-env.ts) already puts in the environment)
      and the processes descended from them. The evidence names the session; Phase 121 G's audit
      trail, when present, names the tool call. Best-effort, stated as such in the finding. [S]
- [x] **The bundle verifies itself.** At launch, `codesign --verify --deep --strict` on
      `process.execPath`'s bundle and `spctl --assess --type execute`; an ad-hoc or unsigned result
      is `info` (dev builds) unless the build is a release, in which case `critical`. The same check
      Phase 91 H's installer runs, reused rather than rewritten. [S]
- [x] **Tests.** The watched-set constant has a reason per entry; a hook rewritten under a fake
      session yields one `integrity` finding naming that session; a committed change yields none. [S]

### D — Persistence and process sensors [L · 1–2d]

- [x] **Persistence locations.** `~/Library/LaunchAgents`, `/Library/LaunchAgents`,
      `/Library/LaunchDaemons`, login items (`osascript -e 'tell application "System Events" to get
      the name of every login item'` or `sfltool dumpbtm` where readable), `crontab -l`,
      `~/.zshrc`/`~/.zprofile`/`~/.bashrc`/`~/.bash_profile`/`~/.profile`, `~/.ssh/authorized_keys`
      and `~/.ssh/config`, `/etc/periodic`. Baseline + `fs.watch`; a new or changed item is a
      `persistence` finding whose evidence carries the plist's `ProgramArguments` and the signature
      state of what it launches. `high` by default, `critical` when the target is unsigned or
      quarantined. [M]
- [x] **Process table.** `ps -axo pid,ppid,uid,comm,args` on the cadence (the reader in
      [`agent-process.ts`](../../../packages/desktop/src/main/agent-process.ts) generalised into the
      runtime), diffed; each new executable path gets `codesign -dv --verbose=2` (team id, ad-hoc or
      not), `spctl --assess`, and `xattr -p com.apple.quarantine`. Unsigned + quarantined + spawned
      from a shell under an agent session is `critical`; unsigned from a known dev tool path
      (`node_modules/.bin`, `~/.cargo/bin`, `/opt/homebrew/bin`) is `info`. [M]
- [x] **Apple's own signals.** XProtect version from
      `/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/Info.plist` (stale beyond
      30 days is `medium`), Gatekeeper and XProtect denials from
      `log show --last <cadence> --predicate 'subsystem == "com.apple.syspolicy"'` and
      `'process == "XProtectRemediator"'` — each denial is a finding with the log line as evidence.
      Gatekeeper off (`spctl --status`) and SIP off (`csrutil status`) are `high` config findings
      shared with Phase 122 D (same fingerprint, so they dedupe). [M]
- [x] **Terminal paste shapes.** A command line in an agent pty that matches the ClickFix grammar —
      `curl`/`wget` piped to `sh`/`bash`/`zsh`, `base64 -d | sh`, `osascript -e` with a
      `do shell script`, `hdiutil attach` of a freshly downloaded DMG, `xattr -d com.apple.quarantine`
      — is a `process` finding at `high` the moment it is seen in scrollback (the broker's output
      stream, read-only; Phase 121 B is where it can be *blocked*). [M]
- [x] **Tests.** Fixture plists (a benign Homebrew agent, an AMOS-shaped one with a hidden
      `~/Library/Application Support/.x/x` target) classify as expected; the `ps` diff with a fixture
      table; the ClickFix grammar against a corpus of benign dev commands (`curl | jq`, `pnpm dlx`)
      with zero false positives. [S]

### E — Network behaviour [M · ~1d]

- [x] **Connection snapshots.** `lsof -i -nP -F pcnPT` on the cadence (10 s while a session is
      live, 60 s otherwise, nothing while the window is blurred and no agent runs — the visibility
      gate from Phase 76), parsed into `{pid, command, remote host, port, state}`. The parser is pure
      and fixture-tested. [M]
- [x] **Our own processes against the registry.** A connection from a suite process (the app, its
      broker) to an address no `EGRESS_HOSTS` entry resolves to is a `network` finding, rated `info`
      until Phase 115 A's registry covers the app's real egress (Decision 9) — it is exactly the leak
      the registry test cannot see, since the test covers `fetch` and not a native module. [S]
- [x] **Agent sessions against a baseline.** For processes under an agent session, the first
      connection to each `(host, port)` is recorded; a destination not seen in that repo's last 30
      days is `medium`, and `high` when the process is unsigned or the address belongs to a
      paste-site, a tunnel service (`ngrok`, `*.trycloudflare.com`, `*.loca.lt`) or a known
      exfiltration shape (`webhook.site`, `requestbin`, `*.burpcollaborator.net`), found by resolving
      the list's names forward. The "raw IP" rung is deferred to Phase 122 (Decision 10: it needs a
      reverse lookup). The list is a `shared` constant Phase 122 C's threat
      feed can extend. [M]
- [x] **The Network tab.** The catalog's "Network Monitor" feature: live connections grouped by
      process, the suite's processes first, each row with the registry entry that allows it or the
      finding that flags it. Read-only; blocking is a deferred decision (see Decisions). [S]

### F — Malware scanning [M · ~1d]

- [x] **Engines.** `probeBinary` (the monitor feature's probe) finds `yara` and `clamscan` on the
      login-shell PATH; each engine is a `ScanEngine` with `available()`, `scan(paths)`, and a
      parser for its output. Neither is linked; both run through `runProcess` with a deadline and
      group kill. No engine installed means the bundled ruleset still runs through a small pure
      matcher for the string/regex subset it uses — the ruleset is written to that subset so
      detection does not depend on Homebrew. [M]
- [x] **The ruleset.** `packages/features/vanguard/rules/*.yar`, each rule with a source comment and
      a test fixture: ClickFix one-liners, the Shai-Hulud family's markers (a `bundle.js`
      `postinstall` that reads `~/.npmrc`, `.github/workflows/*shai-hulud*`, the TruffleHog download
      line, `setup_bun.js`), the Mini Shai-Hulud npm+PyPI dual-registry shape, AMOS/MacSync dropper
      strings, credential-file readers in `postinstall`/`preinstall`. Refreshed by Phase 122 C's
      signed feed, never by Vanguard itself. [M]
- [x] **What gets scanned, when.** On change: a new file under a watched persistence location, a
      new executable in the process table, a new `node_modules/*/package.json` with an install
      script, anything Theme C flags. On demand: a repo, a folder, `~/Downloads`, a browser download
      (Phase 117's `will-download` hook hands the path over; Vanguard never touches `webContents`).
      Never the whole disk by default — a full scan is a button with a time estimate. [S]
- [x] **Tests.** Every rule has a positive fixture that matches and the benign corpus that does not;
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

- [x] **Action enum.** `RemediationActionSchema` (Theme A) closed set: `pause-session`,
      `kill-process-group`, `bootout-launch-item`, `quarantine-file`, `restore-file`,
      `revoke-mcp-server` (Phase 121 C's allowlist), `chmod-600`, `report-issue`, `open-in-agents`
      (compose an investigation prompt into a Chats thread with the finding as an attachment, tagged
      untrusted per Phase 121 A), `mute`. Each has a handler in
      `packages/features/vanguard/main/actions.ts` and a blast-radius description. [M]
- [x] **Quarantine.** `<userData>/security/quarantine/<findingId>/` holding the file at 0000 plus
      `manifest.json` (original path, hash, mode, xattrs, when, which finding); `restore-file` puts
      it back only after re-scanning. Retention from Settings; "Open quarantine folder" reveals it.
      [S]
- [x] **Confirm and record.** Every action except `mute` and `report-issue` shows the confirm
      dialog (what dies, what moves, which sessions pause) through the app's existing dialog host;
      the outcome is appended to the finding's ledger row (`actions: [{id, at, ok, error?}]`). [S]
- [ ] **The tile goes live.** With C, D and H checked, `catalog.ts`'s `vanguard` entry drops
      `comingSoon`, and the launcher's install bundle list gains the app. [S] *Deferred until a
      Vanguard release exists (Decision 13); the change is one line.*
- [x] **Tests.** Each action against a temp dir and a fake process; the confirm text names the
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
- [x] **C:** rewriting `.githooks/pre-commit` under a fake agent session yields one `high` integrity
      finding naming the session; committing the change clears it on the next baseline.
- [ ] **D:** dropping a fixture plist into a temp `LaunchAgents` yields a `persistence` finding
      within one cadence; the ClickFix grammar has zero hits on the benign-command corpus.
- [x] **E:** a fixture `lsof` output with one unregistered host from the app's own pid yields one
      `info` network finding (`high` once the registry is complete); the parser handles IPv6 and `->` forms.
- [x] **F:** every rule's positive fixture matches under both `yara` and the built-in matcher; the
      benign corpus matches nothing.
- [ ] **G:** a trail fixture with `cat ~/.ssh/id_ed25519` yields `high`; auto-pause writes `\x03`
      to the right session and nothing to any other.
- [ ] **H:** quarantine + restore round-trips a file byte-for-byte with its mode and xattrs; a
      `bootout` of a fixture agent in a temp domain succeeds and is recorded. *The round trip is
      proven, including a real `/usr/bin/xattr` pass on darwin. `bootout` is proven against a fake
      `launchctl` seam (success recorded, a failure leaves the finding open), not a real domain. A
      real launchd pass belongs to the packaged-app check below.*
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
9. **Suite egress is `info` until the registry is complete.** *Decided.* A connection from the app or
   its broker to an address no `EGRESS_HOSTS` entry resolves to is rated `info`, not `high`, until
   Phase 115 A's registry covers the app's real egress (forge, database, LLM). It lists only three
   hosts today, so at `high` every normal call would raise a false finding and teach people to mute
   the sensor. The severity is one named constant, `NETWORK_UNREGISTERED_SUITE_SEVERITY`, so raising
   it later is one line; `outstanding.md` tracks it.
10. **DNS in the network sensor: forward lookups of our own lists only.** *Decided.* See "Nothing
    phones home" above. The raw-IP trigger is dropped, since without reverse DNS it cannot be decided
    and "no reverse name" flagged CDN addresses; it is deferred to Phase 122's threat feed
    (`outstanding.md`). The other `high` triggers for agent sessions, an unsigned process and an
    address a threat-list name resolves to, stay.
11. **The quarantine directory is Theme F's, not a second one.** *Decided.* The plan said
    `<userData>/security/quarantine`; Theme F had already created `<userData>/vanguard/quarantine`,
    with a retention setting and an *Open quarantine folder* action. Theme H uses that one, so there is
    one place to look and one retention to set.
12. **The two Phase 121 actions are stubs, on purpose.** *Agreed.* `revoke-mcp-server` needs Phase 121
    C's per-agent MCP allowlist and `open-in-agents` needs Phase 121 A's untrusted-attachment tagging.
    Neither exists yet, and a half version would mean reaching into another feature or composing a
    prompt that is not marked untrusted. Both stay in the closed enum. Their handlers return a calm,
    typed outcome, `{ unavailable: { reason, dependsOn } }` ("available once Phase 121 lands"), that
    never throws and records nothing. The UI shows both disabled with that reason. `outstanding.md`
    tracks each against its Phase 121 theme.
13. **The tile does not go live in Theme H.** *Agreed.* Dropping `comingSoon` would show a working tile
    for an app with no release to install. The release tooling already builds `apps/vanguard` as a bundle
    because it has a `moon.yml` (`scripts/release-bundles.mjs`), and the launcher lists whatever the
    release's `catalog.json` carries. So once a Vanguard release exists, the flip is the one line
    `comingSoon: true` deleted from the `vanguard` entry in `apps/launcher/src/common/catalog.ts`.
    `outstanding.md` tracks it.
14. **What a successful action does to the finding.** *Decided.* Kill, bootout, quarantine and
    `chmod 600` resolve it (`resolvedBy: action:<id>`), restore marks it acknowledged, and mute mutes
    it. Pause and report-issue leave the status alone, since neither removes the cause. A refused or
    failed action records its error and leaves the status alone.
15. **Restore allows exactly one rule.** *Decided.* The re-scan before restore refuses on any match
    except the malware rule the finding itself named, which the confirm shows as a warning. Restoring a
    file the user has judged a false positive is the point of the action, but a file that now matches
    something *else* is a new finding, not a restore.
16. **`bootout` is user-domain only.** *Decided.* Only a `gui/<uid>` item whose plist sits under
    `~/Library/LaunchAgents` is unloaded. A system daemon would need escalation, which Vanguard never
    asks for. The confirm says the plist stays on disk and loads again at the next login unless it is
    also quarantined.
17. **A confirm is a contract, not just a preview.** *Decided (self-review).* The preview carries a
    `digest`: a hash of the radius as shown plus the exact targets behind it (every member pid and command,
    the file's full hash and inode). `act` sends it back as `confirmed`. Main plans again and runs only if the
    digests match. A mismatch is refused and recorded on the ledger. A missing digest on a destructive action
    is refused without a record, since the caller skipped the dialog. Without this, a process group that grew
    while the dialog was open would lose members the user never saw.
