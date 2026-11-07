# Phase 115 — Privacy: data leaving the Mac and data at rest

**Written with the user** (via `/midnite-ideate`) · 2026-10-19

A security reviewer asked three questions about Midnite: does it send data or crash reports off
the Mac, how does it protect transcripts and saved logins, and does it change Claude's security
settings? A read of the tree on 2026-10-19, after [Phase 91](phase-91-security-hardening.md)
Themes A–H, answered them well but not completely. There is no telemetry, no crash upload and no
analytics SDK. Credentials sit behind `safeStorage`. Nothing writes Claude's or Codex's config.
But nothing *proves* any of that, and four things fall short. No single list says which hosts the
app talks to. The launcher calls home on every start with no switch. Transcripts, scrollback,
chats and logs sit in plaintext at default file modes. Two local surfaces, the LAN stream and the
MCP and broker sockets, trust whoever can see a URL or open a socket.

This phase turns the answers into guarantees, each held by a test, and closes those gaps. It
builds on [Phase 76](phase-76-the-renderer-in-a-sandbox.md) (C added the CSP; D added the
Privacy page and the `ipwho.is` switch), [Phase 65](phase-65-somewhere-for-a-crash-to-go.md)
(crash records stay local), [Phase 91](phase-91-security-hardening.md) G (`redactRecord`, the vault
at 0600) and I/J (`SECURITY.md`, the audit of record).

Scope guardrails:
- **Defaults do not change.** Every automatic call stays on unless the user turns it off. The
  phase adds switches and one "turn off all automatic network" master switch, not new defaults.
- **No encryption of transcripts in this phase.** History is locked down by file mode and
  retention, and FileVault is named as the at-rest protection. Encrypting it with the
  `safeStorage` key is a recorded, deferred decision (see Decisions).
- **Terminal scrollback is never rewritten.** It is replayed byte-for-byte into xterm, so
  redaction applies to logs, archived session transcripts and chats only.
- **No new outbound host without a registry entry.** Theme A's test is the gate for every later
  phase, not just this one.
- **No change to Claude's or Codex's configuration, ever.** Theme F makes that a test, not a habit.

> **Effort tags:** S ≈ ≤ 2h · M ≈ half-day to a day · L ≈ 1–2 days. A and F land first and are
> independent. B, C and D need nothing from A. E needs nothing from the others. G needs A (it is
> generated from A's registry) and lands last. Suggested swarm: A+F, then B+C+D, then E+G.

> **Findings, verified against the tree on 2026-10-19, that this phase is built on.**
>
> **1. Outbound calls are scattered.** Automatic: the launcher's update feed and `catalog.json`
> ([`updater.ts`](../../../apps/launcher/src/main/updater.ts),
> [`index.ts`](../../../apps/launcher/src/main/index.ts)), weather
> ([`weather-api.ts`](../../../packages/app/src/features/titlebar-status/weather-api.ts): `ipwho.is`
> behind a switch, Open-Meteo not), markets
> ([`markets-service.ts`](../../../packages/features/finance/main/markets/markets-service.ts)), map
> tiles and Overpass ([`overpass.ts`](../../../packages/features/media-map/main/map/overpass.ts)),
> Ollama library search
> ([`library-search.ts`](../../../packages/features/models/main/library-search.ts)), TMDB
> ([`online.ts`](../../../packages/features/media-library/main/online.ts)), a jsDelivr GSAP pull in
> the video engine ([`engine.ts`](../../../packages/features/media-video/main/video/engine.ts)), and
> the sherpa-onnx model download
> ([`sherpa-local.ts`](../../../packages/desktop/src/main/companion/stt/sherpa-local.ts)). The CSP's
> `connect-src` ([`csp.ts`](../../../packages/desktop/src/main/csp.ts)) lists the renderer's hosts,
> but main-side `fetch` has no list at all.
>
> **2. History is plaintext at default modes.** Scrollback `<userData>/scrollback/<id>.bin`
> ([`broker/server.ts`](../../../packages/desktop/src/broker/server.ts),
> [`terminal-store.ts`](../../../packages/desktop/src/main/terminal-store.ts)), archived transcripts
> ([`session-history-store.ts`](../../../packages/desktop/src/main/session-history-store.ts)), chats
> and patches ([`chat-store.ts`](../../../packages/features/chats/main/chat-store.ts)), and the NDJSON
> log ([`log-sink.ts`](../../../packages/desktop/src/main/log-sink.ts)). None sets a mode, so the
> umask decides (typically 0644/0755). Voice-recording storage was not checked; Theme B checks it.
>
> **3. Redaction runs at the edges, not on write.**
> [`redact.ts`](../../../packages/shared/src/redact.ts) covers prefixed secrets (GitHub, GitLab,
> `sk-`, Slack, Bearer/Basic, JWT, Atlassian, URL credentials). Azure DevOps PATs and Bitbucket app
> passwords have no prefix and match nothing. Log record bodies are not redacted.
>
> **4. One plaintext fallback remains.**
> [`migrate-agent-api-keys.ts`](../../../packages/app/src/store/migrate-agent-api-keys.ts) deletes
> the localStorage copy only after `secrets.has` confirms the vault holds it, so a Mac with no
> working Keychain keeps the key in `midnite-studio.ui` indefinitely. Forge PATs already degrade to
> session-only ([`vault-service.ts`](../../../packages/runtime/src/vault/vault-service.ts)).
>
> **5. Inbound surfaces trust possession.** The LAN server
> ([`lan-server.ts`](../../../packages/features/media-library/main/lan-server.ts)) checks a 256-bit
> `?k=` token. That's sound, but it rides in a plain-HTTP URL that anyone on the LAN can read, and
> it is long-lived until "Regenerate". The MCP socket
> ([`socket-server.ts`](../../../packages/runtime/src/mcp/socket-server.ts)) and pty broker are
> 0600 in 0700 dirs, with no caller check beyond that. The vault host already pairs with a nonce
> ([`host/server.ts`](../../../packages/runtime/src/vault/host/server.ts)). `buildCsp` keeps
> `script-src 'unsafe-inline'` for one reason: `index.html`'s no-flash theme script.
>
> **6. Claude and Codex config is read, never written.** Studio reads `~/.claude/settings.json`'s
> `enabledPlugins` ([`chat-skills.ts`](../../../packages/features/chats/main/chat-skills.ts)),
> `~/.claude` usage ([`agent-usage.ts`](../../../packages/features/monitor/main/agent-usage.ts)) and
> `~/.codex/sessions` ([`codex.ts`](../../../packages/desktop/src/main/agent-conversation/codex.ts)).
> The MCP server is registered by the user running a `claude mcp add` line the app shows. Media
> agent runs pass scoped, per-run `--allowedTools`/`--permission-mode dontAsk` flags and persist
> nothing. A grep finds no write, but no test holds the line.

## Headlines

*Every byte that leaves the Mac goes through one list, every file that stays on it is yours alone,
and a test says so.* Born from a security reviewer's three questions, and from the answers being
true without anything to prove them. (0% · 0/46) — **Planned 2026-10-19.**

**Theme A — One list of every outbound host.** ◐ PARTIAL ([PR #1045](https://github.com/bilo-io/midnite-studio/pull/1045)). First slice landed: `EGRESS_ENTRIES` (and the host-keyed `EGRESS_HOSTS` the Vanguard sensor reads) in `shared/src/egress.ts` now carries `owner`, `switch`, `renderer` and a `PRIVACY_SWITCHES` id list; `guardedFetch`/`guardedFetchFor` in `runtime/src/net/guarded-fetch.ts` refuse an unregistered host (`EgressUnregisteredError`) or one whose switch is off (`EgressBlockedError`), reading the switches from a new `egress` field on the settings mirror. Moved onto it: Guard's OSV/KEV fetch, Finance markets, TMDB, Ollama library search, sherpa model download, the API client and the workflow HTTP node (the last two register once as `host: '*'`). `buildCsp`'s renderer hosts come from the registry. Settings ▸ Privacy gains "Automatic network calls": a master "Turn off all automatic network" plus one generated switch per automatic entry (weather now has its own, gating the forecast as well as the IP lookup). `egress-registry.test.ts` scans main-side code for raw `fetch`/`net.fetch`/`https.get`, with a commented `UNMIGRATED` ratchet. Two gaps from that slice are closed: `guardedFetch` now follows redirects itself (transport called with `redirect: 'manual'`, at most 5 hops, each `Location` re-checked against the registry and switches, 303/301/302-POST turned into a body-less GET, a caller's own `manual`/`error` passed through; a follow-up hardening narrows a cross-origin hop to a header safelist (`accept*`, `user-agent`, plus `content-type`/`content-language` on 307/308) and refuses an https-to-http downgrade, and the network sensor fails closed on switchable hosts until the first settings sync, matching `guardedFetch`), and Vanguard's network sensor reads the same settings mirror so an address only a switched-off host resolves to is a `medium` finding rather than "expected" (an address an enabled host also resolves to stays allowed). Still open: the launcher's update/catalog switches (off the graph, own settings), map tiles/Overpass, forges, image providers, Whisper and the two model downloads still hold raw clients (listed in the test's ratchet), user-supplied-host registration for forges, Alpaca and Kraken, and the idle e2e with everything off. Original text: An `EGRESS_HOSTS` registry in `shared` (host,
owner, what is sent, automatic or user-initiated, the switch that gates it). A test fails on a
fetch to an unregistered host. Settings ▸ Privacy is generated from the registry, with a switch per
automatic call and one master switch. The launcher gets the same switches for its update and
catalog checks. An idle e2e test proves no request leaves with every switch off.

**Theme B — History that is yours alone.** ✅ DONE ([PR #1031](https://github.com/bilo-io/midnite-studio/pull/1031)). Landed: `ensurePrivateDir`/`writePrivateFile`/`appendPrivateFileSync`/`tightenTree` in `runtime/src/private-files.ts` (atomic 0600 writes, 0700 dirs), applied to terminals.json, scrollback (main store and broker flush), session history and transcripts, chats and patches, and the NDJSON log; `tightenHistoryModes` migrates existing files at boot. No voice-recording store exists on disk to cover. Also landed (#1031): Settings ▸ Privacy ▸ Local history — "Keep local history" select (Forever default, 90/30/7 days) driven by `desktop/src/main/history-retention.ts` (mtime prune of scrollback and archived transcripts on a setting change and daily, live sessions skipped), "Clear all local history" behind a confirm showing file count and bytes (scrollback, transcripts, logs and closed-session rows; never chats, settings or live sessions — Decision 8 settled: no), and a FileVault note from `fdesetup status` linking the pane when off. 0700 dirs and 0600 files for scrollback, session
history, chats, logs and voice, with a one-time migration of existing files. A retention limit the
user chooses (default: keep). "Clear all local history". FileVault named as the at-rest protection.

**Theme C — Scrub secrets before they reach disk.** ✅ DONE ([PR #1035](https://github.com/bilo-io/midnite-studio/pull/1035)). Landed: `runtime/src/disk-redaction.ts` (a synchronous snapshot of the vault's live values plus `redactOutbound`'s shape patterns, home directory kept) applied to log records, chats and patches on write, and to archived transcripts as they move out of scrollback (live scrollback stays byte-exact; non-UTF-8 bytes scrub as latin1). Main refreshes the snapshot at boot, on every vault set/delete (new `VaultService.onEntriesChanged`) and on unlock, and keeps the last snapshot while the vault is locked. Reused Phase 121's matcher rather than a second one, so the label is `[redacted: vault-secret]`, not `[redacted:<namespace>]`. Original text: Log records, archived session transcripts
and chats pass through `redactRecord` on write. A vault-value matcher catches the prefixless tokens
(Azure DevOps, Bitbucket). Scrollback stays byte-exact.

**Theme D — No plaintext key when the Keychain is missing.** ✅ DONE ([PR #1035](https://github.com/bilo-io/midnite-studio/pull/1035)). Landed: the `secrets` vault namespace now holds a value for the session when encryption is unavailable (`whenUnavailable: 'session'`, like forge PATs), so `secrets.has` answers true and the migration drops the localStorage copy; `vaultLock.status` carries `keychainAvailable`, which drives a one-time warning toast at migration and a persistent note on Settings ▸ Agents. Also fixed (#1031 leftover): main's `agentHistoryReadsEnabled()` now fails closed until the renderer's first settings push. Original text: The legacy `agentApiKeys` copy
moves to session memory instead of staying in localStorage, with a visible notice, matching how
forge PATs already degrade.

**Theme E — Inbound surfaces that check who's asking.** ◻ LAN streams use short-lived, per-item
signed URLs instead of the long-lived token. The MCP and broker sockets require a per-launch
token from a 0600 file. The CSP drops `'unsafe-inline'` by hashing the no-flash theme script.

**Theme F — Claude's and Codex's settings are never written.** ✅ DONE ([PR #1031](https://github.com/bilo-io/midnite-studio/pull/1031)). Landed: `agent-config-no-write.test.ts` source scan (no allowlist entries needed today) and `assertNotAgentConfig`, which every private write calls and which throws under `~/.claude*`/`~/.codex` except `skills/`. Also landed (#1031): the Privacy-page disclosure and the "Read Claude and Codex history" switch (default on), mirrored into main; off stops usage totals, conversation-id lookup and the plugin/`enabledPlugins` reads, and Token spend shows an enable prompt. `assertNotAgentConfig` now resolves realpath so a symlink cannot bypass it, and the static scan also covers cp/link/truncate/chmod/createWriteStream and `claudeHome()` over a 5-line window. A test fails on any write path to
`~/.claude*`, `.mcp.json` or `~/.codex/config.toml`. Reading `~/.claude`/`~/.codex` transcripts is
disclosed in Settings ▸ Privacy, with an off switch (default on).

**Theme G — A privacy statement anyone can read.** ◻ `docs/PRIVACY.md` and a website page,
generated from Theme A's registry, answering the three questions in plain language.

## Deliverables

### A — One list of every outbound host [L · 1–2d]

- [x] **`EGRESS_HOSTS` in `shared`.** A new `packages/shared/src/egress.ts`: one entry per host
      with `host` (exact or a `*.` suffix), `owner` (feature id or `launcher`), `sends` (one plain
      sentence: "GET only, no identifiers", "coordinates", "the user's prompt"), `trigger`
      (`automatic` | `user`) and `switch` (a `PrivacySwitchId`, required when `trigger` is
      `automatic`). zod schema, no other imports, per `shared`'s boundary.
- [~] **Populate it from Finding 1.** Every host in Finding 1, plus every user-triggered provider
      (OpenAI, Gemini, Ollama cloud, the forges, Alpaca, Kraken). The API client and workflow HTTP
      executor go to user-supplied URLs, so they register once as `owner: 'api-client'`/`'workflows'`
      with `host: '*'` and `trigger: 'user'`.
- [~] **One egress seam in main.** A `guardedFetch(owner, url, init)` in `runtime` that looks the
      host up in `EGRESS_HOSTS`, refuses (with a typed error) when the entry's switch is off, and
      otherwise calls `fetch`. Move every main-side `fetch` in Finding 1 onto it. The renderer's
      direct calls (weather) move behind main or check the same switch.
- [x] **A test that fails on an unregistered host.** A vitest that scans `packages/**/main/**`,
      `packages/runtime/**` and `apps/launcher/src/main/**` for `fetch(`, `net.request(`,
      `https.get(` and `http.request(` outside `guardedFetch`, and fails on any match not on a short,
      commented allowlist (electron-updater, which brings its own client). Same shape as
      `persisted-secrets.test.ts`.
- [x] **`connect-src` derived from the registry.** `buildCsp` takes its renderer hosts from
      `EGRESS_HOSTS` entries marked `renderer: true`, so the two lists cannot drift.
- [x] **Settings ▸ Privacy generated from the registry.** One switch per `automatic` entry,
      grouped by owner, each showing its `sends` sentence. Plus one master switch, "Turn off all
      automatic network", which overrides the rest without changing their stored values. Extends
      [`privacy-page.tsx`](../../../packages/app/src/features/settings/settings-pages/privacy-page.tsx)
      and keeps Phase 76 D's `ipwho.is` switch.
- [x] **Open-Meteo gets its own switch.** Today only the IP-location fallback is gated.
- [ ] **The launcher's update and catalog checks get switches.** Stored in the launcher's own
      settings (off the graph — it takes the switch ids from `shared` by source path, as it does
      `studio-link`). Off means no request at start. A manual "Check now" stays.
- [ ] **Idle e2e with everything off.** Extend
      [`privacy-network.spec.ts`](../../../packages/app/e2e/privacy-network.spec.ts): master switch
      off → zero outbound requests over 30 s of idle on the dashboard. Header names the browser
      capability: real network interception.
- [ ] *Acceptance:* adding a `fetch('https://example.com')` to any main-side file fails the
      registry test; flipping the master switch stops every automatic request in the e2e test.

### B — History that is yours alone [M · ~1d]

- [x] **One helper for private paths.** `ensurePrivateDir(path)` (0700) and
      `writePrivateFile(path, data)` (0600, atomic rename) in `runtime`, with tests that stat the
      modes.
- [x] **Apply it to every history store.** Scrollback (`broker/server.ts`, `terminal-store.ts`),
      session history and archived transcripts (`session-history-store.ts`), chats and patches
      (`chat-store.ts`), the NDJSON log (`log-sink.ts`), and voice recordings and transcriptions
      (locate and add to this list first).
- [x] **Migrate existing files once.** On first launch after upgrade, `chmod` the existing dirs
      and files to 0700/0600 under `userData`. Idempotent, logged once, never fatal.
- [x] **Retention.** A Settings ▸ Privacy "Keep local history" select (Forever · 90 · 30 · 7
      days), **default Forever**. Applies to scrollback and archived session transcripts on start
      and once a day. Chats are excluded (they are documents, not logs). Prune by mtime and skip
      live sessions.
- [x] **"Clear all local history".** A button behind the blast-radius confirm (file count and
      bytes) that deletes scrollback, archived transcripts and logs, never live sessions, chats or
      settings.
- [x] **Name the at-rest protection.** A note on the Privacy page and in Theme G's statement:
      history is protected by macOS file permissions and FileVault. The note links to the FileVault
      pane when FileVault is off (read with `fdesetup status`, no admin needed).
- [x] *Acceptance:* a fresh profile and an upgraded profile both show 0700/0600 across every store
      above. A 7-day limit deletes an 8-day-old transcript and keeps a live one.

### C — Scrub secrets before they reach disk [M · ~1d]

- [x] **Redact on write.** `log-sink.ts` record bodies, archived session transcripts and chat
      messages pass through `redactRecord` before they are written. Scrollback does not.
- [x] **A vault-value matcher.** On vault load and change, main builds a set of the live secret
      values (≥ 12 chars) and `redactRecord` replaces any occurrence with `[redacted:<namespace>]`.
      This catches prefixless Azure DevOps and Bitbucket tokens and anything the patterns miss.
      The values never leave main.
- [x] **Tests.** A log record containing a stored Azure PAT and a transcript containing a stored
      `sk-` key are written scrubbed, and a 40-hex commit SHA is not redacted (the Phase 91 G
      negative case).
- [x] *Acceptance:* `grep -r <test-token> <userData>` finds nothing after a scripted session that
      pasted it into a chat and an agent prompt.

### D — No plaintext key when the Keychain is missing [S · ≤ 2h]

- [x] **Session-only fallback.** When `safeStorage.isEncryptionAvailable()` is false,
      `migrate-agent-api-keys.ts` hands the key to the vault's session-only degrade (as forge PATs
      already do) and removes it from `midnite-studio.ui` anyway.
- [x] **Tell the user.** A one-time notice and a persistent note on Settings ▸ Agents: "Keychain
      unavailable — keys last until you quit."
- [x] *Acceptance:* with encryption forced off, the persisted `midnite-studio.ui` blob holds no
      `agentApiKeys` value after first run, and the key still works until quit.

### E — Inbound surfaces that check who's asking [M · ~1d]

- [ ] **LAN: short-lived signed URLs.** Each stream URL becomes `/i/<itemId>?e=<expiry>&s=<hmac>`
      with an HMAC over item and expiry, keyed by the existing LAN secret, expiring in 6 h by
      default. The long-lived `?k=` stays only for the index page, which is shown to the user and
      never shared to clients. DLNA/VLC clients cannot add headers, which is why it is a URL rather
      than a header.
- [ ] **Sockets: a per-launch token.** Main writes 32 random bytes to
      `<userData>/run/socket-token` (0600, 0700 dir) at start. The MCP stdio shim and broker clients
      send it as the first frame, and the server drops any connection whose first frame isn't the
      token, comparing in constant time. A stale token from a previous launch is refused.
- [ ] **Keep legacy broker peers reachable.** The legacy-peer handshake keeps working: the token
      is per build fingerprint, alongside the socket name. Document it in the broker README comment.
- [ ] **CSP without `'unsafe-inline'`.** Hash the `index.html` no-flash theme script into
      `script-src 'sha256-…'` at build time, and drop `'unsafe-inline'` from `script-src` (style-src
      stays as-is). Zero CSP violations across `app:e2e`.
- [ ] *Acceptance:* a `nc -U` to the MCP socket with no token is closed without a reply. An
      expired LAN item URL returns 401. The packaged build's CSP header has no `'unsafe-inline'` in
      `script-src`.

### F — Claude's and Codex's settings are never written [S · ≤ 2h]

- [x] **A test that holds the line.** A vitest that scans main-side source for write calls
      (`writeFile`, `appendFile`, `rename`, `rm`, `mkdir`, `copyFile`, `symlink`) whose path
      expression mentions `.claude`, `.codex`, `.mcp.json` or `settings.json` outside an allowlist,
      and fails. The allowlist holds only repo-scaffold writes of `.claude/skills` and
      `.codex/skills` (skills, not settings), each with a comment.
- [x] **A runtime guard too.** Make `writePrivateFile` (Theme B) refuse targets under
      `~/.claude*` or `~/.codex` except `*/skills/**`, so a future write fails loudly in dev.
- [x] **Disclose the reads, with a switch.** Settings ▸ Privacy says Studio reads
      `~/.claude/settings.json` (`enabledPlugins`), `~/.claude` usage, and `~/.codex/sessions` for
      the usage and conversation views. A switch, "Read Claude and Codex history" (default **on**),
      stops those reads, and the views show an enable prompt.
- [x] *Acceptance:* the test fails on an injected `writeFile(join(home, '.claude', 'settings.json'))`.
      With the switch off, a full usage-view load makes no `fs` read under `~/.claude` or `~/.codex`
      (spy test).

### G — A privacy statement anyone can read [S · ≤ 2h]

- [ ] **`docs/PRIVACY.md`, generated.** A `scripts/privacy-doc.mjs` (moon `root:privacy-doc`)
      renders the three answers. The outbound table comes from `EGRESS_HOSTS`. Storage comes from a
      short hand-written section on credentials (vault/Keychain), history (Theme B), redaction
      (Theme C) and the Claude/Codex guarantee (Theme F). A check mode fails CI when the committed
      file is stale.
- [ ] **A website page.** `packages/website` gets a Privacy page built from the same generated
      markdown. Mind the website's boundary: it may import `shared` (zod-only) for `EGRESS_HOSTS`
      and nothing else, and must not link to this repo.
- [ ] **Link it.** `SECURITY.md` and the app's Settings ▸ Privacy footer link to the statement.
- [ ] *Acceptance:* adding a registry entry and running the generator changes `PRIVACY.md`. A stale
      file fails the check.

## Files this phase touches

| Area | Files |
|---|---|
| Registry and seam | `packages/shared/src/egress.ts` (new), `packages/runtime/src/net/guarded-fetch.ts` (new), [`csp.ts`](../../../packages/desktop/src/main/csp.ts) |
| Outbound callers | [`markets-service.ts`](../../../packages/features/finance/main/markets/markets-service.ts), [`overpass.ts`](../../../packages/features/media-map/main/map/overpass.ts), [`library-search.ts`](../../../packages/features/models/main/library-search.ts), [`online.ts`](../../../packages/features/media-library/main/online.ts), [`engine.ts`](../../../packages/features/media-video/main/video/engine.ts), [`sherpa-local.ts`](../../../packages/desktop/src/main/companion/stt/sherpa-local.ts), [`weather-api.ts`](../../../packages/app/src/features/titlebar-status/weather-api.ts) |
| Launcher | [`updater.ts`](../../../apps/launcher/src/main/updater.ts), [`index.ts`](../../../apps/launcher/src/main/index.ts) |
| Privacy UI | [`privacy-page.tsx`](../../../packages/app/src/features/settings/settings-pages/privacy-page.tsx), [`persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) |
| History stores | [`broker/server.ts`](../../../packages/desktop/src/broker/server.ts), [`terminal-store.ts`](../../../packages/desktop/src/main/terminal-store.ts), [`session-history-store.ts`](../../../packages/desktop/src/main/session-history-store.ts), [`chat-store.ts`](../../../packages/features/chats/main/chat-store.ts), [`log-sink.ts`](../../../packages/desktop/src/main/log-sink.ts) |
| Redaction and keys | [`redact.ts`](../../../packages/shared/src/redact.ts), [`vault-service.ts`](../../../packages/runtime/src/vault/vault-service.ts), [`migrate-agent-api-keys.ts`](../../../packages/app/src/store/migrate-agent-api-keys.ts) |
| Inbound | [`lan-server.ts`](../../../packages/features/media-library/main/lan-server.ts), [`socket-server.ts`](../../../packages/runtime/src/mcp/socket-server.ts), the broker client and server |
| Claude/Codex reads | [`chat-skills.ts`](../../../packages/features/chats/main/chat-skills.ts), [`agent-usage.ts`](../../../packages/features/monitor/main/agent-usage.ts), [`codex.ts`](../../../packages/desktop/src/main/agent-conversation/codex.ts) |
| Tests | [`privacy-network.spec.ts`](../../../packages/app/e2e/privacy-network.spec.ts), new registry, no-write and mode tests |
| Docs | `docs/PRIVACY.md` (new), `scripts/privacy-doc.mjs` (new), `SECURITY.md`, `packages/website` Privacy page |

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme (CI is the gate; no local full run).
- [ ] **A:** the registry test fails on an injected unregistered `fetch`. The idle e2e test sees zero
      requests with the master switch off. `connect-src` equals the registry's renderer hosts.
- [ ] **B:** `stat` shows 0700/0600 across every history store on a fresh and an upgraded profile.
      The retention prune and "Clear all local history" are tested.
- [ ] **C:** a stored Azure PAT pasted into a chat never reaches disk, and a commit SHA survives.
- [ ] **D:** with encryption forced off, no `agentApiKeys` value persists in `midnite-studio.ui`.
- [ ] **E:** an unauthenticated socket connect is dropped. An expired LAN URL gets 401. No
      `'unsafe-inline'` in `script-src`, with zero CSP violations across `app:e2e`.
- [ ] **F:** the no-write test fails on an injected write. With the switch off, no read under
      `~/.claude` or `~/.codex`.
- [ ] **G:** `PRIVACY.md` regenerates from the registry, and the stale check fails CI.
- [ ] **Open, for a human:** one packaged-app pass on a real Mac with a network monitor (Little
      Snitch or `nettop`), master switch off, 10 minutes idle, and zero connections. A LAN stream
      to a real TV or VLC client still plays through a signed URL.

## Decisions / open questions

1. **Default for automatic calls: on, with switches.** *Resolved with the user.* Today's behaviour
   stays the default; every automatic call gets its own switch plus a master switch.
2. **Transcripts at rest: lock down plus retention, not encryption.** *Resolved with the user.*
   0700/0600, a user-chosen retention limit and "Clear all local history", with FileVault named.
   **Deferred:** encrypting history with the `safeStorage` key. Search, replay and scrollback
   restore read these files directly, and a lost Keychain would lose history. Revisit if a user
   needs history protected from other admin users or from backups.
3. **Retention default: keep forever.** *Resolved with the user.* Nothing is deleted on upgrade;
   the user picks a limit.
4. **Reading `~/.claude` and `~/.codex` transcripts: keep, disclose, add a switch (default on).**
   *Resolved with the user.*
5. **Redaction scope: logs, archived transcripts and chats, not scrollback.** *Resolved with the
   user.* Scrollback is replayed into xterm and must stay byte-exact.
6. **Socket auth: a per-launch token from a 0600 file.** *Resolved with the user.* Pure Node, no
   native peer-credential call. It stops same-user processes that don't read the file. A process
   that can read the user's files can still read the token, which `SECURITY.md`'s same-user
   position already covers.
7. **CSP `'unsafe-inline'` lives here, in Theme E, not back in Phase 76.** *Resolved with the
   user.*
8. **Open: should "Clear all local history" also clear chats?** Recommendation: no. Chats are
   documents the user wrote, and they get their own delete. Settle when B is built.
9. **Open: does `guardedFetch` cover electron-updater?** Recommendation: no. It uses its own HTTP
   client, so the launcher's update switch gates whether `checkForUpdates` is called at all, and
   the registry test allowlists it with a comment.
