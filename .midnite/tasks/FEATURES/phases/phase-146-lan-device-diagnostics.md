# Phase 146 — LAN device diagnostics

Planned 2026-11-14 with the user · grounded against the tree as of `2d4626d71`.

On 2026-11-14 a session found the user's LG TV on the Wi-Fi (`[LG] webOS TV UR73006LA`, model `50UR73006LA`, a 2023
entry-level set) through SSDP and Bonjour, probed it from outside and answered "why is it so slow, is there spyware":
twelve open ports, all stock LG services; no sign of malware visible from the network; a budget α5 chip running LG's own
ACR tracking (Live Plus), ads and home-screen promos as the likely cause; and a fixes table of menu paths. It stopped at
the two steps it could not take from a shell without the user: pairing with the TV over SSAP (`wss://<ip>:3001`, a
prompt on the TV) to read firmware, settings and installed apps, and a DNS log to see which ad servers it talks to. The
procedure lives on as the `midnite-lan-devices` skill. This phase turns it into a Studio feature: a **Devices** view in
the Monitor module that discovers what is on the network, runs a per-device **procedure** — steps, forks, timings —
and reports it with the same four sitrep views the skills use (table, graph, histogram, timeline); an LG webOS SSAP
client that pairs, reads and verifies; and `lan_*` tools on the `midnite` MCP server so an agent can drive the same
procedure through Studio instead of raw shell.

> **Builds on.**
> - **The Monitor module and feature** (Phase 124 Theme D, Phase 113 Theme I):
>   [`modules/monitor/manifest.ts`](../../../packages/modules/monitor/manifest.ts),
>   [`features/monitor/manifest.ts`](../../../packages/features/monitor/manifest.ts). Vanguard mounts it, so the view
>   reaches Vanguard and Studio with no host work.
> - **The runtime's one vault** (Phase 113 Theme D): [`runtime/src/vault/vault-service.ts`](../../../packages/runtime/src/vault/vault-service.ts)
>   and its namespace table — the TV's SSAP client-key gets its own namespace.
> - **The MCP tool pattern** of Media ▸ Maps (Phase 108 Theme I): a zod contract file in `shared`
>   ([`media-map-mcp.ts`](../../../packages/shared/src/media-map-mcp.ts)), registration in
>   [`desktop/src/main/mcp/map-tools.ts`](../../../packages/desktop/src/main/mcp/map-tools.ts), read tools always on,
>   changing tools behind a default-off `Settings ▸ MCP ▸ Let agents …` switch, ownership through the feature
>   manifest's `mcpTools` ([`mcp-tool-owners.ts`](../../../packages/shared/src/mcp-tool-owners.ts)).
> - **The sitrep view formats**: [`midnite-sitrep`](../../../.claude/skills/midnite-sitrep/SKILL.md) §3 and its
>   `-table`, `-graph`, `-histogram` and `-timeline` skills. The view's procedure panel draws the same shapes.
> - **The `midnite-lan-devices` skill** ([`.claude/skills/midnite-lan-devices`](../../../.claude/skills/midnite-lan-devices/SKILL.md),
>   mirrored in by this phase's planning PR): its guardrails, `discover.py`, `references/playbooks.md` and
>   `references/procedures.json` are the spec Themes B–D port.
>
> **Scope guardrails.** The local subnet only, never more than a /24, never a public address. Connect-only TCP probes on
> a fixed port list — no full port scan, no vulnerability scanner, no credential guessing, no traffic interception. MACs,
> serials, hostnames and IPs never leave the machine (no online MAC-vendor lookup). Read-only by default: every step that
> changes a device or raises a prompt on it needs the user's confirm in the app for that one action, and is re-read to
> verify. LG privacy settings are **read** over SSAP and **fixed by the user** from a menu path; no undocumented luna-bridge
> writes. macOS only, `react-icons` only, every new test a vitest unless it names the browser capability it needs.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

Planned 2026-11-14. Seven themes: a wire contract, discovery in main, playbooks and a procedure runner, the LG SSAP
client, the Devices view, the MCP tools, and the skill that already runs the procedure by hand.

**Theme A — The contract.** ◻ `shared/src/lan-devices.ts`: device, probe, playbook and procedure-DAG schemas, the
step-run record with timings, the IPC channels and the four text formatters (table, graph, histogram, timeline) that the
view and the MCP tools both print.

**Theme B — Discovery.** ◻ A new `packages/features/lan-devices` main half: subnet detection, SSDP and mDNS over
`node:dgram`, the ARP table, connect-only probes on the known-port list and UPnP description fetches, classified to a
playbook id — a TypeScript port of `discover.py` with its guardrails enforced in code.

**Theme C — Playbooks and the procedure runner.** ◻ Each of the skill's thirteen playbooks (`lg-webos`, `cast`,
`router`, `generic` and the rest) as data: a DAG of steps with forks. The runner walks it, times every step, records the evidence
and the branch taken, and stops at any step that changes a device until the user confirms it.

**Theme D — LG webOS SSAP client.** ◻ `ws` over `wss://<ip>:3001` with the TV's self-signed certificate pinned on first
use, the `register` pairing handshake, the client-key in a new `lanDevices` vault namespace, the read calls (firmware,
system settings, apps, foreground app) and the documented writes (toast, volume, close app) — each write re-read.

**Theme E — The Devices view.** ◻ A second Monitor view: the discovery table, a device panel with its capabilities, and
a procedure panel whose tabs are the sitrep table, the fork graph, the step-duration histogram and the run timeline.

**Theme F — MCP `lan_*` tools.** ◻ `lan_discover`, `lan_device`, `lan_procedure_run` (read-only, always on) and
`lan_pair`, `lan_ssap_call` (behind `Settings ▸ MCP ▸ Let agents control LAN devices`, off by default, and still
confirmed in the app).

**Theme G — The skill.** 🔄 Landed with the planning PR: `midnite-lan-devices` §6 runs a device's procedure step by
step through `scripts/procedure.py` over the DAGs in `references/procedures.json`, and reports it as the sitrep step
table, fork graph, step-duration histogram and run timeline; mirrored into `.claude/`, `.agents/` and `.codex/` and
pinned by `skill-copies.test.mjs`. Left: switch to the `lan_*` tools once Theme F lands.

## Build order

1. **A** first: every other theme reads the contract.
2. **B** and **D** in parallel (no shared files; D needs only A's SSAP schemas).
3. **C** after B (the runner calls B's probes) and D (the `lg-webos` playbook calls D's client).
4. **E** and **F** in parallel after C.
5. **G**'s remaining item (switch to `lan_*`) after F. Its other three items landed with the planning PR.

## Deliverables

### A — The contract (S)

- [ ] `packages/shared/src/lan-devices.ts` (zod only, exported from the barrel):
  - `LanDeviceKindSchema` = `'tv' | 'speaker' | 'cast' | 'router' | 'printer' | 'computer' | 'phone' | 'nas' | 'iot' | 'unknown'`.
  - `LanPlaybookIdSchema` = `'lg-webos' | 'cast' | 'roku' | 'samsung' | 'apple' | 'sonos' | 'hue' | 'printer' | 'router' |
    'smarthome' | 'camera' | 'generic' | 'self'` — the skill's playbook ids, one for one.
  - `LanDeviceSchema`: `{ id: string /* stable: UPnP UDN, else mDNS instance, else `ip:<addr>` */, ip: string, mac?: string,
    name: string, kind, vendor?: string, model?: string, playbook, openPorts: number[], ssdp: { location?: string,
    server?: string, st: string[] }, mdns: { services: string[], txt: Record<string, string> }, seenAt: number,
    identified: number /* 0–100, how much of the identity is evidenced */ }`.
  - `LanProcedureStepSchema`: `{ id: string, label: string, kind: 'probe' | 'read' | 'decision' | 'prompt' | 'write' |
    'manual', changesDevice: boolean, needs: string[], branches?: { when: string, next: string }[], expectedMs: number,
    manualPath?: string /* menu path shown for a 'manual' step */ }`. A `prompt` or `write` step must have
    `changesDevice: true` (refine check).
  - `LanStepRunSchema`: `{ stepId, startedAt: number, endedAt?: number, outcome: 'pass' | 'warn' | 'fail' | 'skipped' |
    'blocked' | 'awaiting-confirm', evidence: string, branchTaken?: string }` and `LanProcedureRunSchema`:
    `{ runId, deviceId, playbook, steps: LanStepRun[], startedAt, endedAt? }`.
  - Every response in the `GitOpResult`-style envelope (`{ ok: true, … } | { ok: false, kind: 'error' | 'refused',
    message }`): a guardrail refusal is `kind: 'refused'`, never a throw.
- [ ] `CHANNELS` entries in [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts): `lanDiscover`
  (`mstudio:lan:discover`), `lanDevice`, `lanProcedureStart`, `lanProcedureConfirm` (`{ runId, stepId, confirm: boolean }`),
  `lanProcedureCancel`, `lanForget` (drop a device's vault entry); `EVENT_CHANNELS.lanProcedureProgress` (a `LanStepRun`
  per change). Request/response schemas in [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts); optional
  methods on the bridge type in [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts).
- [ ] `packages/shared/src/lan-procedure-report.ts`: pure formatters over a `LanProcedureRun` + its playbook, each returning
  the markdown/text the matching sitrep skill specifies — `formatStepTable` (one row per step: #, step, status emoji,
  duration, branch, ≤6-word note), `formatForkGraph` (the DAG, the taken path marked, untaken branches dimmed `┄`),
  `formatDurationHistogram` (horizontal bars per step, sorted, median marked `│`, `mono` palette default),
  `formatRunTimeline` (Gantt of the run, waits drawn apart from work). No clock reads: times come from the run.
- [ ] Tests: `lan-devices.test.ts` (schema round-trips; a `write` step with `changesDevice: false` fails refine; a
  playbook DAG with a cycle or a `needs` to an unknown id fails) and `lan-procedure-report.test.ts` (inline-snapshot
  each formatter for a fixture run that took the "pairing declined" fork).

### B — Discovery (M)

- [ ] New feature package `packages/features/lan-devices` (copy `features/monitor`'s layout: `manifest.ts`, `main/`,
  `renderer/`, `bridge.ts`, `moon.yml`, `package.json` `@midnite/studio-feature-lan-devices`), added to
  `STUDIO_FEATURES` in [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts), to the Monitor
  module's `features`, and to Feature toggles' registry (Phase 135) under the `workspace` group.
- [ ] `main/guardrails.ts`: `localSubnet()` (first non-internal IPv4 from `os.networkInterfaces()`, refusing a prefix
  shorter than /24 — it scans the /24 containing the address), `assertPrivateTarget(ip)` (RFC 1918 + 169.254/16 only,
  inside `localSubnet()`; else `refused`), `PROBE_PORTS` (the playbooks' known-port list, frozen), `HTTP_TIMEOUT_MS = 3000`.
- [ ] `main/ssdp.ts`: send `M-SEARCH * HTTP/1.1` (`ST: ssdp:all`, `MX: 2`) to `239.255.255.250:1900` from a
  `node:dgram` socket, collect for 3 s, parse headers case-insensitively, dedupe by `USN`.
- [ ] `main/mdns.ts`: hand-rolled DNS packet encode/decode (questions; PTR/SRV/TXT/A answers; name compression) for
  `_services._dns-sd._udp.local` then each advertised type, over `224.0.0.251:5353`, 3 s window.
- [ ] `main/arp.ts`: `execFile('arp', ['-an'])` parsed into `{ ip, mac }` (skip `(incomplete)`); MACs stay local.
- [ ] `main/probe.ts`: connect-only TCP on `PROBE_PORTS` (`net.connect`, 800 ms, at most 32 sockets in flight), and a
  GET of each SSDP `LOCATION` (same-subnet only, `HTTP_TIMEOUT_MS`) parsed for `friendlyName`, `manufacturer`,
  `modelName`, `UDN`.
- [ ] `main/classify.ts`: evidence → `{ kind, vendor, model, playbook, identified }` (LG: `webos-second-screen` ST or
  `[LG] webOS TV` AirPlay name → `lg-webos`; Google cast `_googlecast._tcp` → `cast`; `InternetGatewayDevice` →
  `router`; the remaining ids per `discover.py`'s signature table; `_ipp._tcp` → `printer`; else `generic`).
- [ ] `main/discover.ts`: runs SSDP, mDNS and ARP in parallel, merges by IP, probes, classifies; returns `LanDevice[]`.
  Bound to `CHANNELS.lanDiscover`; at most one discovery in flight (a second call joins the first).
- [ ] Tests (vitest, no network): fixture bytes for an SSDP response and an mDNS answer (the UR73's shape, addresses
  rewritten to `192.0.2.x`), `arp -an` output, guardrail refusals (`8.8.8.8`, a /16 interface, a port off the list), and
  `classify` per playbook.

### C — Playbooks and the procedure runner (M)

- [ ] `main/playbooks/*.ts`, one per `LanPlaybookId` (`self` has no steps — it only anchors the table), each a
  `LanProcedureStep[]` ported from the **Procedure** block of the skill's `references/playbooks.md`. `lg-webos` is the reference DAG:
  `identify → latency (ping ×20) → ports (exposure vs stock set; 🚩 on 22/23) → ssap-port? ─┬ open → pair (prompt) →
  paired? ─┬ yes → read-firmware → read-settings → list-apps → audit → fixes`
  `│                                       └ declined → fixes (manual paths only)`
  `└ closed → enable-tv-on-with-mobile (manual) → ssap-port? (retry once)`.
  The `fixes` step lists Live Plus, Limit Ad Tracking, Home Promotion, User Agreements, 60 s unplug, unused apps and
  firmware update as `manual` steps with their `manualPath`.
- [ ] `main/procedure-runner.ts`: `startRun(device, playbook)` walks the DAG in dependency order, stamps
  `startedAt`/`endedAt` from an injected clock, evaluates a `decision` step's `branches` against the previous step's
  evidence, emits `lanProcedureProgress` per change, and on a `changesDevice` step parks with `awaiting-confirm` until
  `lanProcedureConfirm` (declined → that step `skipped` and the decline branch taken). One run per device at a time;
  `lanProcedureCancel` ends it with the remaining steps `skipped`.
- [ ] Runs kept in memory plus the last 20 per device in `userData/lan-devices/runs.json` (no MACs or client-keys in it),
  listed in the feature's toggle `data` for Phase 135's "Delete this feature's data".
- [ ] Tests: the runner over a fake clock and fake probes takes each `lg-webos` fork (port closed, pairing declined,
  paired), never runs a `changesDevice` step without a confirm, and records durations equal to the fake clock's steps.

### D — LG webOS SSAP client (M)

- [ ] Add `ws` (and `@types/ws`) to `packages/features/lan-devices` — the only new dependency.
- [ ] `main/webos/ssap-client.ts`: connect `wss://<ip>:3001` with `rejectUnauthorized: false` **plus** a pinned SHA-256 of
  the TV's certificate stored on first successful pairing (a later mismatch → `refused`, "the TV's certificate changed");
  `register` with a fixed manifest (app id `midnite.studio.lan`, permissions limited to the read calls and the three
  writes below); resolve on `registered` with the client-key, reject on `error`/timeout (60 s for the on-screen prompt).
- [ ] Store `{ clientKey, certSha256 }` in a new vault namespace `lanDevices` (`lan-devices.vault.json`, fingerprinted,
  `whenUnavailable: 'session'`), keyed `lg-webos:<UDN>`, added to the runtime namespace table. The renderer only ever
  learns `paired: boolean`.
- [ ] Reads: `ssap://com.webos.service.update/getCurrentSWInformation`, `ssap://settings/getSystemSettings`
  (`category: 'option'` and `'other'` — Live Plus, ad and home-promo keys where the firmware exposes them; a missing key is
  reported as "not readable on this firmware", never guessed), `ssap://com.webos.applicationManager/listApps`,
  `ssap://com.webos.applicationManager/getForegroundAppInfo`.
- [ ] Writes, each confirmed in the app and then re-read: `ssap://system.notifications/createToast`,
  `ssap://audio/setVolume` (re-read `getVolume`), `ssap://system.launcher/close` (re-read the foreground app). Nothing
  else is reachable: `ssapCall` checks the URI against an allowlist and answers `refused` otherwise.
- [ ] Tests: a local `ws` server fixture (plain `ws://` in tests, the TLS path behind an injected socket factory) for
  register → key, prompt timeout, declined, cert-pin mismatch, an off-allowlist URI refused, and write-then-re-read.

### E — The Devices view (L)

- [ ] Monitor module manifest ([`modules/monitor/manifest.ts`](../../../packages/modules/monitor/manifest.ts)) and the
  lan-devices feature manifest declare view `devices` (`global: true`, rail label `Devices`, description "What's on the
  network and what each device allows", glyph `LuRadar`), with the feature's `ipc` list.
- [ ] `renderer/devices-page.tsx`: a **Scan** button and the discovery table (#, emoji kind, name, IP, `Identified`
  10-cell bar, evidence, status) in the house sitrep style; empty, scanning and refused states.
- [ ] `renderer/device-panel.tsx`: the selected device's identity, capability table (can do now · needs something · not
  possible remotely) and a **Run procedure** button. Pairing and every write open the existing confirm dialog, whose
  body says exactly what happens on the device ("A pairing prompt appears on the TV. Accept it with the remote.").
- [ ] `renderer/procedure-panel.tsx`: live from `lanProcedureProgress`, four tabs — **Steps** (table), **Graph** (forks,
  taken path highlighted), **Durations** (histogram, median marked) and **Timeline** — each rendering Theme A's
  formatter output in a monospace block, plus a **Copy as markdown** action that copies all four.
- [ ] Fixes list: each `manual` step as a checklist row with its menu path; ticking it is the user's own record, stored
  with the run, never reported as "applied".
- [ ] Tests (vitest/jsdom): the page renders a discovery fixture; a run at `awaiting-confirm` shows the confirm with the
  device-side text; declining takes the decline branch in the Graph tab; each tab shows its formatter's text.

### F — MCP `lan_*` tools (M)

- [ ] `packages/shared/src/lan-devices-mcp.ts`: input/output schemas and `LAN_CONTROL_OFF_MESSAGE` = `'LAN device control
  is off — Settings ▸ MCP ▸ Let agents control LAN devices'`; tool ids added to `MCP_TOOLS`
  ([`mcp.ts`](../../../packages/shared/src/mcp.ts)) and to the lan-devices feature manifest's `mcpTools` (owner
  `monitor`).
- [ ] `packages/desktop/src/main/mcp/lan-tools.ts` (pattern: `map-tools.ts`): `lan_discover` → the device table text +
  JSON; `lan_device` → one device's detail; `lan_procedure_run` → runs every read-only step and returns the four
  formatted views, stopping at the first `changesDevice` step with `awaiting-confirm` and its device-side text.
- [ ] `lan_pair` and `lan_ssap_call` (allowlisted URIs only) refused with `LAN_CONTROL_OFF_MESSAGE` unless
  `allowLanControl` is on (new `Settings ▸ MCP` switch, default off); when on, they still raise the in-app confirm and
  wait for the user — an agent can never accept on the user's behalf.
- [ ] Update [`tool-manifest.pin.json`](../../../packages/desktop/src/main/mcp/tool-manifest.pin.json); tests for each
  tool's happy path, the off-switch refusal and the confirm wait (fake runner).

### G — The skill (S)

- [x] `midnite-lan-devices` gains **§6 Procedure**: plan (step table, fork graph, estimated timeline), run step by step
  through `scripts/procedure.py` (`init` / `next` / `start` / `end --branch` keep the clock, work out ready, skipped and
  ⏳ awaiting-OK steps), and report through the four sitrep views — the `midnite-sitrep-table` step table, the
  `midnite-sitrep-graph` fork graph (━━▶ taken, ┄┄▶ not), the `midnite-sitrep-histogram` step-duration histogram and the
  `midnite-sitrep-timeline` run timeline with waits and the critical path. §5 offers `Full procedure` first.
- [x] `references/procedures.json` holds the step DAGs (`lg-webos`, `cast`, `router`, `generic`; other playbooks fall
  back to `generic`) in the shape Theme A's `LanProcedureStepSchema` encodes — `needs`, `branches`, `changesDevice`,
  `expectedS`, `how`, `manualPath` — and `playbooks.md` points at it.
- [x] The skill is mirrored into `.claude/skills/`, `.agents/skills/` and `.codex/skills/` (`midnite-lan-devices/`):
  scripts and references byte-identical, the `.agents`/`.codex` SKILL.md without the Claude-only frontmatter keys,
  pinned by `scripts/skill-copies.test.mjs`.
- [ ] After Theme F: the skill checks for the `midnite` MCP server and uses `lan_discover` / `lan_procedure_run`
  when it is connected, falling back to `discover.py` and `procedure.py` when it is not (§6 already names the tools;
  this item makes the switch real and drops the "Phase 146" forward reference).

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/lan-devices.ts` | A | net-new: schemas |
| `packages/shared/src/lan-procedure-report.ts` | A | net-new: four formatters |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), `schemas.ts`, `bridge.ts` | A | channels, payloads, bridge |
| `packages/features/lan-devices/**` | B C D E | net-new feature package |
| [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) | B | `STUDIO_FEATURES` |
| [`packages/modules/monitor/manifest.ts`](../../../packages/modules/monitor/manifest.ts) | E | `devices` view, feature |
| `packages/shared/src/feature-toggles.ts` | B | a `lan-devices` toggle |
| [`packages/runtime/src/vault/vault-service.ts`](../../../packages/runtime/src/vault/vault-service.ts) | D | `lanDevices` namespace |
| `packages/shared/src/lan-devices-mcp.ts` | F | net-new |
| `packages/desktop/src/main/mcp/lan-tools.ts`, `tools.ts`, `tool-manifest.pin.json` | F | net-new tools, registration |
| `.claude/skills/midnite-lan-devices/**` (+ `.agents/`, `.codex/`) | G | mirrored skill |
| [`scripts/skill-copies.test.mjs`](../../../scripts/skill-copies.test.mjs) | G | mirror pin |

## Verification

- [ ] Targeted checks green: `tsc --noEmit` per touched package, eslint on changed files, vitest on touched suites,
  `scripts/layer-boundaries.test.mjs` (the feature imports no module, no other feature, no `electron`), the tracker
  drift guard and `e2e-budget`. The workspace-wide gate runs in CI, not locally.
- [ ] No probe leaves the subnet: a vitest drives `discover` with a stubbed interface on `10.0.0.5/8` and asserts it
  scans `10.0.0.0/24` only, and that `assertPrivateTarget` refuses a public address from every entry point (IPC and MCP).
- [ ] **Gate — the built app on the user's network, a throwaway `--user-data-dir`.** Monitor ▸ Devices ▸ Scan lists the
  LG TV as `lg-webos` with `Identified` ≥ 80%. Run procedure: the TV shows the pairing prompt; accept it; firmware,
  settings and apps read back; the four tabs render; a toast write appears on the TV and its re-read passes. Run again
  and **decline** the prompt: the Graph tab shows the decline fork and the fixes list. Shots under
  `/tmp/midnite-shots-p146/`, never committed.
- [ ] **Gate — MCP.** With `allowLanControl` off, `lan_pair` answers the off message; `lan_procedure_run` returns the four
  views and stops at `pair` with `awaiting-confirm`.

## Not in this phase

- **The DNS tracker audit** (a Pi-hole or router DNS log classified against the bundled easyprivacy list) — deferred to
  [`outstanding.md`](../../outstanding.md).
- **LG privacy writes over the luna bridge** (Live Plus, ads, promos). Undocumented, model-specific key names, and no way
  to verify across firmware; the fix stays the user's, from the menu path.
- **Controlling other device kinds** (cast, Roku, Samsung, Sonos, Hue, router port mappings, smart-home). Their
  playbooks run their read-only steps here; their control steps are listed but stay `blocked` until a later phase.
- **Wake-on-LAN, power-on, packet capture, Linux/Windows.**

## Decisions / open questions

1. **Resolved — all four directions in one phase** (agreed with the user): the Devices view, the procedure runner, the
   MCP tools and the LG deep dive, sequenced A → B‖D → C → E‖F.
2. **Resolved — the view lives in the Monitor module** (agreed with the user), as a second view beside the machine one;
   the logic is its own feature package so Phase 135 can switch it off.
3. **Resolved — hand-rolled SSDP and mDNS over `node:dgram`, `ws` for SSAP** (agreed with the user): one new dependency;
   the packet code is small, fixture-tested and has no native parts.
4. **Resolved — read plus manual path for LG privacy settings** (agreed with the user): only the documented SSAP calls
   write, each confirmed and re-read.
5. **Resolved — the DNS tracker audit is deferred** (agreed with the user).
6. **Resolved — one set of formatters** in `shared` feeds the view, the MCP tools and matches the skills' text formats,
   so a report reads the same wherever it is produced.
7. **Open — the `getSystemSettings` key names** for Live Plus and ads differ by firmware. Theme D reads what the UR73
   answers on the gate pass and records the keys it found in this doc; a missing key is reported as unreadable, never
   guessed.
