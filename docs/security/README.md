# Security audits and finding index

**Pre-publish gate.** This repository is public (`gh api repos/bilo-io/midnite-studio -q .visibility`),
and the two scans below were already tracked in it before this index existed. The standing rule that
follows: a finding is only written into this directory once it is `fixed`, `wont-fix` with a reason,
or already public. A *new* vulnerability goes through the private route in
[`SECURITY.md`](../../SECURITY.md), never into a scan file or an issue. If this repo were ever made
private and then re-published, every `open` row below would first have to be `fixed`, `wont-fix` with
a reason, or moved to a private tracker.

Audits of record, unchanged:

- [`scan_opus_5.md`](scan_opus_5.md) — 21 findings, 2026-09-19.
- [`scan_kilo.md`](scan_kilo.md) — earlier scan; its quick wins landed in `03536e0e`.

A raw scan goes stale the moment a theme lands, so this table is the live view. A theme's PR flips its
rows. Owners are [Phase 91](../../.midnite/tasks/phases/phase-91-security-hardening.md) themes
(`91-X`) and [Phase 76](../../.midnite/tasks/phases/phase-76-the-renderer-in-a-sandbox.md) themes (`76-X`).

| # | Severity | Summary | Owning phase/theme | Status |
|---|---|---|---|---|
| 1 | Critical | Rebase plan fields interpolated into a generated `/bin/sh` script | 91-A | fixed (#917) |
| 2 | Critical | `ops.rebase` passes a renderer string into git's option position (`--exec=`) | 91-B | fixed (#917) |
| 3 | Critical | fetch/pull/push accept an arbitrary string in the `<repository>` position | 91-C | fixed (#917) |
| 4 | High | No `will-navigate` handler on windows carrying the full preload bridge | 91-E, 76-B | partial (global nav net landed in #918; `sandbox: true` is 76-B) |
| 5 | High | Renderer ships with no Content-Security-Policy | 76-C | open |
| 6 | High | Screen lock is renderer-only state a reload or devtools walks past | 91-D | fixed (#918) |
| 7 | High | Shipped Electron major is outside the supported window | 76-A, 91-I (freshness warning) | open |
| 8 | High | `install.sh` has no integrity check and strips the quarantine bit | 91-H | open |
| 9 | Medium | Remaining ref and path positionals lack an end-of-options guard | 91-B | fixed (#917) |
| 10 | Medium | `browser.create` loads any URL scheme | unassigned | open |
| 11 | Medium | Updater IPC channels have no sender check | 91-H, 76-E | open |
| 12 | Medium | Beta update channel enables `allowDowngrade` | 91-H | open |
| 13 | Medium | Logger console arm bypasses redaction | 91-G | open |
| 14 | Medium | Third-party API key in plaintext renderer storage, sent in the query string | 76-D | open |
| 15 | Medium | Opening an untrusted directory honours that repo's own `.git/config` | unassigned | open |
| 16 | Minor | Hardened-runtime entitlements disable library validation | 91-H (logged in outstanding.md) | open |
| 17 | Minor | `isAdHocSigned` interpolates the bundle path into a shell string | 91-H | open |
| 18 | Minor | Screen-lock passcode stored in the clear, compared in the renderer | 91-G | open |
| 19 | Minor | Untrusted PR/issue bodies load remote images directly | 76-C | open |
| 20 | Minor | `ci.yml` has no workflow-level `permissions:` block | 91-I | fixed (this PR) |
| 21 | Minor | Pages deploy token written into a git remote URL on the runner | unassigned | open |
