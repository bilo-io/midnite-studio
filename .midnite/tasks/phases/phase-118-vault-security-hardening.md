# Phase 118 — Vault security hardening

**Planned unattended** (swarm agent, `/midnite-ideate` house style, interactive stages skipped) · 2026-10-22

The Vault is the suite's one home for secrets — the runtime's vault service
([`vault-service.ts`](../../../packages/runtime/src/vault/vault-service.ts)) over a `safeStorage`
cipher that is injected, never imported ([`secure-store.ts`](../../../packages/runtime/src/vault/secure-store.ts)),
written 0600 on every write, split into three namespaces (`VAULT_NAMESPACES`: `secrets` — API,
STT and `agent.<id>.apiKey` keys — `forge-accounts` and `db-credentials`), reached by other apps over a Unix socket whose
peers pair with an Ed25519 proof against a nonce
([`host/server.ts`](../../../packages/runtime/src/vault/host/server.ts),
[`pairing.ts`](../../../packages/runtime/src/vault/host/pairing.ts)) and are then limited by
per-app grants ([`grants.ts`](../../../packages/runtime/src/vault/grants.ts)). The Vault app
([`apps/vault`](../../../apps/vault), composing [`packages/features/vault`](../../../packages/features/vault))
registers no handler that returns a value — `has`, `keys` and one-way writes only
([`main/index.ts`](../../../packages/features/vault/main/index.ts)) — and the renderer says so:
"Values are write-only: they are never shown again once saved"
([`secrets-section.tsx`](../../../packages/features/vault/renderer/secrets-section.tsx) L139).

That is a good vault for an app. It is not yet a good vault for a *person*, and four things are
missing. **There is no lock.** Anything that can reach the socket and pair, or any code in the
runtime's process, reads every value for as long as the user is logged in; the screen lock
([`lock-state.ts`](../../../packages/desktop/src/main/lock-state.ts), scrypt passcode, 5-guess
lockout) locks the *window*, not the vault. **There is no record.** No line anywhere says which app
read which secret when; a grant abused at 03:00 looks like a grant used. **There is no way out.** A
write-only vault with no export means a lost Keychain, a new Mac or a corrupted file is a total loss,
and a user who wants a backup makes a plaintext one by hand. **And nothing watches the files
themselves** — `vault-grants.json` and `vault-pairing.json` are plain JSON a same-user process can
edit to grant itself everything, and the encrypted blobs carry no MAC over the *set* of entries, so a
swapped file is not a detected event.

This phase adds the lock, the record, the way out and the watch, and extends the vault outward to
where secrets leak in practice: repositories (a token committed), the clipboard (a token pasted) and
breach corpora (a password already public). It builds on
[Phase 76](phase-76-the-renderer-in-a-sandbox.md) D (the first `safeStorage` vault),
[Phase 91](phase-91-security-hardening.md) D (the passcode service), G (`SECRET_PATTERNS`,
`persisted-secrets.test.ts`, 0600 on create) and J (`SECURITY.md`'s same-user position),
[Phase 113](phase-113-midnite-apps-suite-split.md) D/J (one vault, pairing, grants, the Vault app),
and [Phase 115](phase-115-privacy-egress-and-at-rest.md) B (`writePrivateFile`), C (the
vault-value matcher) and D (no plaintext key without a Keychain).

Scope guardrails:
- **The cipher stays `safeStorage`.** No second key hierarchy, no passphrase-derived master key
  for the live vault (Decision 1). The export format (Theme G) is the one place a passphrase key
  exists, and it exists only in the exported file.
- **The renderer never holds a value.** Theme C's reveal is a main-side, re-authenticated, one-shot
  read whose result is shown by the Vault app's own window and never cached in a store; `has`,
  `keys` and one-way writes remain the only steady-state channels, and
  `persisted-secrets.test.ts` keeps proving it.
- **Every network call is a Phase 115 registry entry**, user-initiated, with the exact bytes sent
  stated in the entry (`sends`). Theme E sends five hex characters of a SHA-1, nothing else.
- **Nothing here changes a secret the user did not ask to change.** Breach and scan results are
  advisories with a "rotate" link; rotation itself is the user's act in the provider's UI.
- **Same-user compromise is still the documented boundary** (`SECURITY.md`). This phase narrows
  what a same-user process gets (a locked vault, a detected tamper, an audit line) and says
  plainly what it cannot stop (a process that can read the login keychain once the vault is
  unlocked). Vanguard ([Phase 120](phase-120-vanguard.md), sibling plan) is where host-level
  detection of that process lives; agent-side secret handling is
  [Phase 121](phase-121-agents-security.md).

> **Effort tags:** S ≈ ≤ 2h · M ≈ half-day to a day · L ≈ 1–2 days. A is a document and lands
> first. B and D are the core and are independent of each other. C needs B (reveal needs
> re-auth). E and F need nothing from the others. G needs B. H needs nothing but is best after D
> (its tamper events go to the log). Suggested swarm: A+B+D, then C+G, then E+F, then H.

> **Threat landscape this phase is written against (read 2026-10-22).**
>
> **1. Developer secrets are the target, and the thief is often a package.** The two Shai-Hulud
> npm worm waves (September and November 2025) harvested GitHub PATs, npm tokens and cloud keys
> from developer machines and CI, published them to attacker-controlled repos and used them to
> republish the worm — 14,206 leaked secrets in the second wave, 2,485 still valid when counted
> ([Check Point](https://blog.checkpoint.com/research/shai-hulud-2-0-inside-the-second-coming-the-most-aggressive-npm-supply-chain-attack-of-2025/),
> [Wiz](https://wiz.io/blog/shai-hulud-npm-supply-chain-attack)). A `postinstall` script runs as
> the user, which is exactly `SECURITY.md`'s "same user" position. A vault that is *locked* when
> no app needs it, that *logs* every read, and whose grants a same-user process cannot silently
> widen (Theme H) is the difference between "the worm got everything" and "the worm got what the
> one unlocked app was granted, and the log says which".
>
> **2. Infostealers on macOS ship the vault-stealing step by default.** Atomic Stealer's 2025
> ClickFix campaigns harvest Keychain items, browser credential stores and wallet files after a
> fake password prompt ([Kaspersky](https://www.kaspersky.com/blog/macos-clickfix-attack/56187/),
> [ThreatDown](https://www.threatdown.com/blog/atomic-stealer-now-using-clipboard-hijacking-to-target-macs/)).
> `safeStorage`'s key lives in the login keychain; an infostealer that has the user's password has
> the key. Theme A says this out loud; Theme B (lock) and Theme H (memory hygiene) shrink the
> window in which an unlocked vault and a resident plaintext exist.
>
> **3. Breach corpora are queryable without disclosure.** Have I Been Pwned's Pwned Passwords
> range API takes the first five hex characters of a SHA-1 (or NTLM, `?mode=ntlm`), returns every
> suffix in that bucket, needs no key, has no rate limit, no licence or attribution requirement, and
> supports `Add-Padding: true` so the response size does not leak the bucket
> ([HIBP API v3](https://haveibeenpwned.com/API/v3), read 2026-10-22). Theme E uses exactly that
> and nothing else.
>
> **4. The agent beside the vault reads the clipboard and the repo.** Prompt injection against
> agentic browsers in 2025–2026 (Comet, Atlas) exfiltrated authenticated data through the agent's
> own tools ([coverage](https://www.gilricardo.com/blog/comet-vs-atlas-vs-dia-agentic-browser-2026)).
> [Phase 117](phase-117-browser-security-hardening.md) G gives the browser agent an empty vault
> grant by default; this phase's Theme D makes any grant's use visible, and Theme F stops a token
> reaching a commit or sitting on the clipboard where an agent tool can read it.

## Headlines

*The vault locks when no one needs it, remembers everything that touched it, can be carried out
and brought back, and notices when its own files are not its own.* Born from a vault that encrypts
well and does nothing else a person expects of one. (0% · 0/51) — **Planned 2026-10-22.**

**Theme A — Threat model and key handling, written down.** ◻ `docs/VAULT_SECURITY.md`: where the
key is, who can reach it, what pairing and grants do and do not stop, FileVault, and the four
positions this phase holds.

**Theme B — A lock, and re-auth for anything sensitive.** ◻ A `locked` state in the runtime vault
service: auto-lock on idle, sleep and screen lock; unlock by passcode (the Phase 91 D scrypt
service, moved into the runtime) or Touch ID; every `get` while locked returns `locked` so apps
degrade rather than fail; reveal, copy, export, grant and pairing changes require a fresh unlock.

**Theme C — Reveal and copy without leaving a trace.** ◻ A one-shot, re-authenticated reveal in
the Vault app's own window; copy with a 30-second clipboard clear that only clears what it put
there; nothing cached, nothing logged in plaintext.

**Theme D — An audit log that cannot be quietly edited.** ◻ `vault-audit.ndjson`, 0600,
hash-chained, one line per read, write, delete, grant, pairing, unlock and failure, naming the
app by pairing identity; a viewer in the Vault app; a chain check on open.

**Theme E — Breach check with k-anonymity.** ◻ User-initiated, password-type entries only,
HIBP range API with padding, five hex characters sent, results cached by salted hash, a "rotate"
link and never an automatic change.

**Theme F — Secret scanning: repos and the clipboard.** ◻ A pre-commit scan of the staged diff
from the git graph's commit path using `SECRET_PATTERNS` plus the live vault-value matcher,
blocking with an override; an opt-in clipboard watch for vault values and token shapes; a
one-shot repo history scan with a report.

**Theme G — Encrypted export and import.** ◻ A versioned, passphrase-encrypted export
(scrypt → AES-256-GCM via `node:crypto`), re-auth to produce, re-auth to import, never a
plaintext path; a restore drill in the docs.

**Theme H — Tamper detection and memory hygiene.** ◻ An HMAC over every vault file, grants and
pairing included, under a `safeStorage`-held key; mismatch locks the vault and logs; plaintext
`Buffer`s zeroed after use; no secret in a long-lived string, env of a spawned process, or log.

## Deliverables

### A — Threat model and key handling, written down [S · ≤ 2h]

- [ ] **`docs/VAULT_SECURITY.md`.** Where the key is (`safeStorage` → login keychain → the user's
      password and FileVault), who holds a decrypt capability (the runtime's process; a paired app
      only through the socket, only within its grant), what a same-user process can do before and
      after this phase, and what pairing proves (that the peer holds the seed in
      [`pairing-store.ts`](../../../packages/runtime/src/vault/host/pairing-store.ts) — a 0600 file
      the same user can read, so pairing identifies an *app*, not a *trust level*; Decision 4).
- [ ] **The four positions.** (1) Same-user compromise is the boundary, narrowed here. (2) The
      cipher is `safeStorage`, not a passphrase. (3) The renderer holds no value. (4) Nothing
      rotates a secret on the user's behalf. Each with the test or module that holds it.
- [ ] **A reviewer's checklist.** The ten questions a security reviewer asks of a vault, each
      answered with a link — the shape [Phase 115](phase-115-privacy-egress-and-at-rest.md) G uses
      for privacy.
- [ ] **`SECURITY.md`** links the doc; [`docs/security/README.md`](../../../docs/security/README.md)
      gains rows for "no vault lock", "no audit log", "grants file editable without detection".

### B — A lock, and re-auth for anything sensitive [L · 1–2d]

- [ ] **`locked` in the vault service.** `VaultService` gains `lock()`, `unlock(proof)`,
      `isLocked()` and a `lockedChanged` event; while locked, `get` resolves
      `{ ok: false, kind: 'locked' }` (a new `VaultAccessDeniedError` kind, so every caller's
      existing denied path handles it), `has` and `keys` still answer, and writes queue until
      unlock or fail after a timeout. The host protocol
      ([`protocol.ts`](../../../packages/runtime/src/vault/host/protocol.ts)) gets the `locked`
      error kind so paired apps degrade the way they already do for `denied`.
- [ ] **The passcode service moves into the runtime.** Phase 91 D's `createPasscodeService`
      (scrypt, salted, 5 guesses / 30 s) leaves
      [`lock-state.ts`](../../../packages/desktop/src/main/lock-state.ts) for
      `runtime/src/vault/unlock/passcode.ts`; the screen lock keeps calling it. The stored hash
      moves from `lock-passcode.json` into the vault's own directory under Theme H's HMAC, with a
      one-time migration — the deviation Phase 91 D recorded is closed here.
- [ ] **Touch ID.** `systemPreferences.promptTouchID(reason)` (macOS; Electron's API, injected by
      the composer like the cipher) as an alternative proof when `canPromptTouchID()` is true;
      the passcode stays as the fallback and is required once per 24 h regardless (Decision 2).
- [ ] **Auto-lock triggers.** Idle (`powerMonitor.getSystemIdleTime()` polled by the composer;
      default 15 min, Settings ▸ Vault: 1 / 5 / 15 / 60 / never), system sleep
      (`powerMonitor` `suspend`), screen lock (`lock-screen`), and the app's own screen lock
      (`setScreenLocked`). Studio and the Vault app both compose the triggers; a paired app cannot
      unlock, only ask the user to.
- [ ] **Re-auth for sensitive ops.** `revealOnce`, `copyOnce`, `export`, `import`, any grant
      change ([`grants-handlers.ts`](../../../packages/runtime/src/vault/grants-handlers.ts)) and
      any pairing change require an unlock proof no older than 60 s (`recentUnlockAt`), even when
      the vault is unlocked. A plain `get` by a paired app within its grant does not.
- [ ] **The Vault app's lock screen.** [`vault-app.tsx`](../../../apps/vault/src/vault-app.tsx)
      shows a lock view (reusing
      [`passcode-pad.tsx`](../../../packages/app/src/features/screensaver/passcode-pad.tsx)'s
      pattern through the frame) whenever `isLocked()`; the sections render but every action
      routes through unlock. Studio's Vault page does the same inside its view.
- [ ] *Acceptance:* after 15 idle minutes a paired app's `get` returns `locked` and its UI shows
      the degraded state; Touch ID unlocks; a sixth wrong passcode waits 30 s; sleep locks within
      one event; `grant` without a fresh unlock is refused.

### C — Reveal and copy without leaving a trace [M · ~1d]

- [ ] **`revealOnce` and `copyOnce`.** Two new main-side ops on the Vault feature's own handler
      set — *not* on the host protocol, so a paired app can never call them — each requiring
      Theme B's fresh unlock. `revealOnce` returns the value once over a dedicated, short-lived
      channel that the preload exposes only to the Vault window (verified by a test over the
      Vault app's channel list in [`vault-manifest.ts`](../../../apps/vault/src/vault-manifest.ts));
      `copyOnce` never returns it: main writes the clipboard itself.
- [ ] **Clipboard clear.** After `copyOnce`, main hashes what it wrote and, 30 s later (Settings:
      15 / 30 / 60), clears the clipboard *only if* the current text still hashes the same —
      never wiping something the user copied since. No NSPasteboard "concealed" type is available
      from Electron, so Universal Clipboard is named as a limitation in Theme A's doc.
- [ ] **Shown, not stored.** The revealed value is rendered by a component that holds it in a
      ref, masks it after 30 s or on blur, and is excluded from every persisted store (the
      `persisted-secrets.test.ts` register names the component). No `console`, no log line, no
      React DevTools-visible prop: the value is drawn into a `<canvas>`-free plain text node and
      the test asserts no store contains it after reveal.
- [ ] **Audit.** Each reveal and copy writes a Theme D line with the entry id — never the value.
- [ ] *Acceptance:* reveal shows the value and masks it at 30 s; copy then paste works within
      30 s and the clipboard is empty at 31 s unless the user copied something else; a paired app
      calling `revealOnce` over the socket gets `invalid`.

### D — An audit log that cannot be quietly edited [M · ~1d]

- [ ] **`vault-audit.ndjson`.** In the vault directory, 0600 (Phase 115 B helpers), append-only,
      one JSON line per event: `{ t, seq, prev, op, namespace, id?, app, principal, result,
      reason? }` where `prev` is the SHA-256 of the previous line (genesis: a fixed string) and
      `app` is the pairing identity's public-key fingerprint or `studio`/`vault`. Events: `get`,
      `set`, `delete`, `grant`, `revoke`, `pair`, `unpair`, `unlock`, `unlock-failed`, `lock`,
      `reveal`, `copy`, `export`, `import`, `tamper` (Theme H). Never a value, never a key
      material; `redactRecord` on the `reason`.
- [ ] **Chain check.** On open and once an hour, walk the chain; a broken link locks the vault
      (Theme B), writes a `tamper` line with the broken `seq`, and shows a banner in the Vault
      app. Rotation at 10 MB into `vault-audit.<n>.ndjson` carrying the last hash forward.
- [ ] **A viewer.** A new `audit-section.tsx` in the Vault feature's renderer: filter by app,
      op, time; "Export log" (plain NDJSON — it holds no secret) behind re-auth; the chain status
      in the section header.
- [ ] **Signal, not noise.** `get` lines are coalesced per `(app, namespace, id)` per minute
      with a count, so a polling app does not write 60 lines a minute; every other op is one line.
- [ ] *Acceptance:* the chain verifies on a 10,000-line fixture; editing one byte of line 5,000
      is detected on the next check and locks the vault; the viewer filters by app.

### E — Breach check with k-anonymity [S · ≤ 2h]

- [ ] **Scope.** Only entries typed `password` (database logins' password field in
      [`credential-vault.ts`](../../../packages/features/database/main/credential-vault.ts); a new
      optional `kind: 'password'` on free-form secrets). API tokens are never checked — they are
      not in the corpus and the check would be noise.
- [ ] **The call.** User-initiated ("Check for breaches" in the Vault app, per entry or all),
      `GET https://api.pwnedpasswords.com/range/<5 hex>` with `Add-Padding: true`, SHA-1 computed
      in main, suffix match in main, padding rows (count 0) discarded. A Phase 115 `EGRESS_HOSTS`
      entry `api.pwnedpasswords.com` with `sends: "the first five hex characters of a SHA-1 of the
      password; never the password, never the hash"` and `trigger: 'user'`.
- [ ] **Result and cache.** `{ breached: boolean, count }` per entry, cached under a salted hash
      of the value (salt in the vault) for 30 days so a re-check without a change is local. Shown
      as an advisory badge with the count and a "rotate" link to the provider; nothing changes.
- [ ] *Acceptance:* `password` (hash `5BAA6…`) reports breached with a large count; a random
      32-byte value reports clean; the network trace shows one request of exactly five hex
      characters with padding in the response.

### F — Secret scanning: repos and the clipboard [L · 1–2d]

- [ ] **A scanner in `shared`.** `scan-secrets.ts`: `SECRET_PATTERNS` from
      [`redact.ts`](../../../packages/shared/src/redact.ts) plus a high-entropy string rule
      (Shannon entropy over base64/hex runs ≥ 20 chars, with the same negative cases as Phase 91 G:
      commit SHAs, UUIDs, lockfile integrity hashes) returning `{ line, column, pattern, masked }`.
      In main it is composed with Phase 115 C's live vault-value matcher so a *stored* token is
      caught even when its shape is prefixless (Azure, Bitbucket).
- [ ] **Pre-commit in the git graph.** The commit path (`git-engine`'s
      [`commit.ts`](../../../packages/git-engine/src/commands/commit.ts), through the write queue)
      scans the staged diff (`git diff --cached -z`) before `git commit`; a hit returns a
      `GitOpResult` of kind `'secrets'` listing masked matches, and the commit modal shows them
      with "Commit anyway" behind the blast-radius confirm. Not a git hook: it must work in a
      repo whose hooks the user owns, and [`hooks.ts`](../../../packages/git-engine/src/commands/hooks.ts)
      gets an *optional* "install a pre-commit scan" for commits made outside Studio.
- [ ] **Agent commits are covered.** A commit made by an agent run through Studio's own commit
      op hits the same scan; a commit the agent makes in its own shell is covered only by the
      optional hook — stated in the doc and cross-linked to
      [Phase 121](phase-121-agents-security.md).
- [ ] **A one-shot history scan.** "Scan repository history" in the Vault app (and the Coder
      app's repo settings) walks `git log -p -z` through the scanner in a worker with progress,
      produces a report (file, commit, pattern, masked) and the standard "this is in history;
      rotate the secret, then rewrite if you must" guidance; never rewrites.
- [ ] **The clipboard watch.** Opt-in (Settings ▸ Vault): main polls the clipboard hash at ≤ 1 Hz
      and, when the text matches a vault value or a token shape, shows a notification "A secret is
      on your clipboard" with "Clear now"; auto-clear after 60 s is a second switch. Shares the
      shape matcher with [Phase 117](phase-117-browser-security-hardening.md) G's ClickFix rule;
      the host-wide version is [Phase 120](phase-120-vanguard.md)'s.
- [ ] *Acceptance:* staging a file with a `ghp_` token blocks the commit with the masked match;
      "Commit anyway" works; a 40-hex SHA does not trip the scanner; the history scan of a fixture
      repo finds a token three commits back; copying a stored token triggers the notification.

### G — Encrypted export and import [M · ~1d]

- [ ] **The format.** `midnite-vault-export-v1`: a JSON envelope `{ v: 1, kdf: { name:
      'scrypt', N: 2^17, r: 8, p: 1, salt }, cipher: 'aes-256-gcm', iv, tag, ciphertext }` where
      the plaintext is the full namespace map; `node:crypto` only. Passphrase minimum 12
      characters, strength shown, no recovery. The format and its parameters are in Theme A's
      doc so a user can decrypt with `openssl`/a script without the app.
- [ ] **Export.** "Export vault" in the Vault app, behind Theme B's fresh unlock, writes to a
      user-chosen path via the save dialog, 0600, and an audit line. Never a plaintext option;
      "Export as JSON" does not exist.
- [ ] **Import.** Behind re-auth; a preview of entry *names* and namespaces before merge;
      conflicts default to "keep existing"; an audit line per imported entry.
- [ ] **A restore drill.** A documented, tested path: export on Mac A, fresh profile on Mac B
      (or a throwaway `--user-data-dir`), import, every `has` true. The test runs the whole
      path with a fake cipher.
- [ ] *Acceptance:* an export decrypts with a 20-line Node script from the doc; a wrong
      passphrase fails authentication, not just decryption (GCM tag); the drill test passes.

### H — Tamper detection and memory hygiene [M · ~1d]

- [ ] **An HMAC over every vault file.** A `vault-integrity.json` holding, per file
      (`vault-*.json`, `vault-grants.json`, `vault-pairing.json`, the passcode hash, the audit
      chain head), an HMAC-SHA256 under a key that lives only `safeStorage`-encrypted. Updated
      atomically with every write ([`secure-store.ts`](../../../packages/runtime/src/vault/secure-store.ts)
      is the one write path); checked on open, on `fs.watch` of the directory, and before every
      grant decision. A mismatch locks the vault, writes `tamper`, and shows the banner with the
      file name.
- [ ] **Grants cannot be widened out of band.** With the HMAC in place, a same-user edit of
      `vault-grants.json` is a detected tamper, not a silent escalation — the one concrete thing
      this phase takes away from the Shai-Hulud class. Stated in the doc with its limit: a process
      that can also read the login keychain can re-sign.
- [ ] **Zero after use.** Every decrypt returns a `Buffer` the caller must `fill(0)` after use;
      `decryptSecret` gains a `withSecret(id, fn)` form that zeroes in `finally`, and the existing
      string-returning form is deprecated and removed from main-side callers in this phase. A
      vitest with a fake cipher asserts the buffer is zero after `withSecret` resolves and after it
      throws.
- [ ] **No secret in an environment.** The one legitimate path that hands a secret to a child
      process — an agent run with a granted key — passes it through the broker's per-session env
      (already scoped) and never through `process.env` of the runtime; a test greps the
      runtime's `spawn` sites ([`process-runner.ts`](../../../packages/runtime/src/process-runner.ts))
      for `env: process.env` without an allowlist. Cross-links [Phase 121](phase-121-agents-security.md).
- [ ] **No secret in a log.** Phase 115 C's redact-on-write already covers the sink; this adds
      a test that `vault-service.ts` and the host never pass a value to `defaultLogger`, by
      wrapping the logger in the test and asserting the canary never appears.
- [ ] *Acceptance:* editing `vault-grants.json` by hand locks the vault within one `fs.watch`
      event with a banner naming the file; the zero-after-use test passes; the env grep finds
      nothing.

## Files this phase touches

| Area | Files |
|---|---|
| Vault service | [`vault-service.ts`](../../../packages/runtime/src/vault/vault-service.ts), [`secure-store.ts`](../../../packages/runtime/src/vault/secure-store.ts), [`grants.ts`](../../../packages/runtime/src/vault/grants.ts), [`grants-handlers.ts`](../../../packages/runtime/src/vault/grants-handlers.ts), `unlock/passcode.ts`, `audit-log.ts`, `integrity.ts`, `export-format.ts` (new) |
| Host and pairing | [`host/server.ts`](../../../packages/runtime/src/vault/host/server.ts), [`host/protocol.ts`](../../../packages/runtime/src/vault/host/protocol.ts), [`host/pairing.ts`](../../../packages/runtime/src/vault/host/pairing.ts), [`host/pairing-store.ts`](../../../packages/runtime/src/vault/host/pairing-store.ts), [`host/client.ts`](../../../packages/runtime/src/vault/host/client.ts) |
| Vault feature | [`main/index.ts`](../../../packages/features/vault/main/index.ts), [`manifest.ts`](../../../packages/features/vault/manifest.ts), [`response-schemas.ts`](../../../packages/features/vault/response-schemas.ts), [`vault-page.tsx`](../../../packages/features/vault/renderer/vault-page.tsx), [`secrets-section.tsx`](../../../packages/features/vault/renderer/secrets-section.tsx), [`grants-section.tsx`](../../../packages/features/vault/renderer/grants-section.tsx), [`pairing-section.tsx`](../../../packages/features/vault/renderer/pairing-section.tsx), `audit-section.tsx`, `lock-view.tsx`, `export-section.tsx` (new) |
| Vault app | [`vault-app.tsx`](../../../apps/vault/src/vault-app.tsx), [`vault-manifest.ts`](../../../apps/vault/src/vault-manifest.ts), [`vault-home.tsx`](../../../apps/vault/src/views/vault-home.tsx) |
| Screen lock | [`lock-state.ts`](../../../packages/desktop/src/main/lock-state.ts), [`passcode-pad.tsx`](../../../packages/app/src/features/screensaver/passcode-pad.tsx) |
| Namespaces | [`forge-account-vault.ts`](../../../packages/features/forge/main/forge-account-vault.ts), [`credential-vault.ts`](../../../packages/features/database/main/credential-vault.ts), [`migrate-agent-api-keys.ts`](../../../packages/app/src/store/migrate-agent-api-keys.ts) |
| Scanning | [`redact.ts`](../../../packages/shared/src/redact.ts), `scan-secrets.ts` (new, `shared`), [`commit.ts`](../../../packages/git-engine/src/commands/commit.ts), [`hooks.ts`](../../../packages/git-engine/src/commands/hooks.ts), [`write-queue.ts`](../../../packages/git-engine/src/exec/write-queue.ts) |
| Processes | [`process-runner.ts`](../../../packages/runtime/src/process-runner.ts) |
| Egress | Phase 115 A's `EGRESS_HOSTS` registry (`packages/shared/src/egress.ts`, planned) — the HIBP entry |
| Docs | `docs/VAULT_SECURITY.md` (new), [`SECURITY.md`](../../../SECURITY.md), [`docs/security/README.md`](../../../docs/security/README.md), [`docs/APPS.md`](../../../docs/APPS.md) |

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme (CI is the gate; no local full run).
- [ ] **B:** the lock/unlock state machine is table-tested (idle, sleep, screen lock, wrong
      passcode ×6, Touch ID success/cancel); a paired app's `get` while locked returns `locked`.
- [ ] **C:** no persisted store contains the revealed canary; the clipboard clear respects a
      later copy.
- [ ] **D:** the chain check catches a one-byte edit; coalescing keeps a 60 Hz poller to one line
      a minute.
- [ ] **E:** the request body is five hex characters, the response is padded, the known-breached
      fixture reports breached.
- [ ] **F:** staged-token block, SHA negative case, history fixture, clipboard notification.
- [ ] **G:** the restore drill passes; a wrong passphrase fails on the GCM tag.
- [ ] **H:** out-of-band grant edit locks the vault; `withSecret` zeroes on resolve and throw; no
      `env: process.env` without an allowlist in the runtime.
- [ ] **Open, for a human:** a packaged-app pass on a real Mac: lock on lid close, Touch ID
      unlock, export to a USB key and import on a fresh profile, and one deliberate
      `vault-grants.json` edit with the banner screenshot attached to the PR.

## Decisions / open questions

1. **The live vault keeps `safeStorage`; no passphrase-derived master key.** *Resolved
   (recommended).* A passphrase key would protect against a thief who has the login keychain but
   not the passphrase — but it would also mean every app's background `get` needs the user to
   have typed it since boot, which breaks the suite's "unlocked once, shared with the apps you
   allow" promise. The lock (Theme B) gives the time-boxed version of that protection; the export
   (Theme G) gives the portable one. Revisit if a user asks for a vault that survives a stolen,
   unlocked Mac.
2. **Touch ID is a convenience, the passcode is the proof.** *Resolved (recommended).* Touch ID
   unlocks for 24 h at most; the passcode is required once a day and after any tamper event. It
   keeps a forgotten passcode from becoming a locked-out vault discovered a month later.
3. **Audit log: hash-chained, not signed.** *Resolved (recommended).* A chain detects edits and
   truncation-in-the-middle; it does not stop a same-user process from rewriting the whole chain.
   The HMAC over the chain head (Theme H) covers that under the same limit every other position
   has. A signature with a key the user holds elsewhere is the stronger design and is deferred.
4. **Pairing identifies an app, not a trust level — the doc says so.** *Resolved.* The pairing
   seed is a 0600 file a same-user process can read; pairing stops a *confused* peer, not a
   *malicious* one. Theme H's HMAC makes a grant change detectable, which is the honest ceiling.
5. **Secret scanning is in the commit op, not a git hook, with the hook optional.** *Resolved
   (recommended).* Studio must not install hooks into the user's repos uninvited (Phase 91 A's
   lesson about generated scripts); the op path covers every commit Studio makes, and the hook is
   there for the terminal.
6. **Breach check: passwords only, user-initiated, never automatic.** *Resolved (recommended).*
   An automatic check is a network call per secret the user did not ask for, which Phase 115
   would gate anyway, and tokens are not in the corpus.
7. **Open: should the browser's web-app sign-ins move into the vault as origin-bound logins?**
   [Phase 117](phase-117-browser-security-hardening.md) F declines autofill in the browser.
   Recommendation: a later phase gives the Vault app origin-bound password entries with its own
   fill flow (never a page-side script); until then the Vault lists sign-ins by domain only.
8. **Open: the clipboard watch's default.** Recommendation: off. It polls the clipboard, which
   a privacy page must disclose; the opt-in and the disclosure land together.
9. **Open: should `has` and `keys` also lock?** Recommendation: no. Apps use them to render
   "a token exists" and to decide whether to ask; locking them turns a locked vault into a broken
   UI rather than a degraded one.
