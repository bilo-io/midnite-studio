# Phase 2 — macOS permission prompts

Planned 2026-11-14 by a midnite-swarm (research → design → plan) · grounded against the tree as of `2d4626d71`.

**Model:** every theme is a spec'd build for sonnet; no theme needs `Model: opus`.

The packaged app keeps asking for permissions it already has: a keychain prompt after "Always allow", "enable X in
System Settings" while X is already on, and repeated Downloads / Documents / Desktop / Photos / Music prompts. One cause
sits under all three: every build is **ad-hoc signed**, so its designated requirement is a bare `cdhash`, and TCC grants
and keychain ACLs pinned to it die with each install (the `Midnite Studio Safe Storage` item's ACL holds 74 dead cdhash
entries). Stable signing is the fix (Theme E); Themes A–D land regardless and stop the app asking for things nobody
started, and make a stale grant explain itself.

> **Builds on.**
> - **Phase 91 Theme H** — `release.yml`'s CSC-gated signing step, `notarize.cjs`, the fuse flip in `afterpack.cjs`.
> - **Phase 113 Theme D** — the runtime vault (`packages/runtime/src/vault/`) and the broker client (`runtime/src/broker/client.ts`).
> - **Phase 118 Theme H** — vault integrity (`integrity.ts`), whose boot-time verify is what touches the keychain.
> - **Phase 51 Themes F/G** — legacy-broker sessions and the restart banner.
>
> **Depends on:** nothing for A–D. Theme E needs the owner's signing decision (Developer ID vs self-signed) and, for
> E(a), the certificate and secrets.
>
> **Scope guardrails.** Never delete or recreate the `Midnite Studio Safe Storage` keychain item. Never probe a
> protected folder to learn its status (the probe would itself prompt). Never disclaim responsibility for terminal
> children (`posix_spawnattr_setdisclaim` — rejected). Reset touches only Studio's own bundle id and never runs `sudo`.
> Suite apps' Permissions page, CI-pre-signed suite stubs and fewer guest keychain items (K3) are **not in this
> phase**.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

**Theme A — No keychain access on the boot path.** ◻ (S–M) `createVaultService` no longer verifies integrity in its
constructor; a memoised `ensureVerified()` runs before the first ciphertext read or write, and still locks on tamper
before anything is served. The boot-time disk-redaction refresh and canary planting wait for the vault's first real
access, or for the window's first show + focus + idle — and never run when no vault file exists. A launch with nothing
secret open makes no keychain call.

**Theme B — Settings ▸ Permissions.** ◻ (M–L) A frame-owned settings page lists the macOS grants Studio uses — Screen
Recording, Microphone, Camera, Accessibility, Full Disk Access (read live, re-read on focus), Automation and Files &
Folders (never probed; asked on first use) — each with a deep link into System Settings and, for a toggle that shows on
but reads off, a **Reset** (`tccutil reset <Service> io.bilo.midnite-studio`) plus **Relaunch**. It says plainly that
agents in Studio's terminals inherit these grants.

**Theme C — Nags point at the page; legacy terminals say why.** ◻ (S) The capture, microphone and Finder-automation
messages stop saying "reopen the app" and link to Settings ▸ Permissions. The existing legacy-session banner explains
that terminals from a previous build don't get this build's permissions, and it is visible without opening the session
list.

**Theme D — No unprompted protected-folder access; folder usage strings.** ◻ (M) An audit of every boot- and
timer-driven path that can reach `~/Desktop|Documents|Downloads|Pictures|Music|Movies`; `isProtectedPath` in `shared`;
Vanguard's full scan skips Photos/Music/Mail/Messages/Safari libraries without Full Disk Access; a `tcc-guard` script
fails CI on a new unmarked protected-folder access. Info.plist gains the seven folder/library usage strings, so the
prompts that remain say why.

**Theme E — A stable code identity.** ◻ (M) *(a) Developer ID:* CI signs and notarises with the cert behind a `release`
Environment (App Store Connect API key), the ad-hoc re-sign is skipped when an identity signs, local builds pick up the
cert from the login keychain, launcher stubs sign with it where present, `RELEASES_ARE_NOTARISED` flips. *(b)
Self-signed, after a spike:* one long-lived cert signs every build in `afterPack`; TCC grants stick, the per-build
keychain prompt is parked. Either way: a hardened-runtime smoke pass of the packaged build, and the one-time user
remediation.

## Deliverables

### A — No keychain access on the boot path
- [ ] `runtime/src/vault/vault-service.ts:286-288`: constructor `verifyAll()` → memoised `ensureVerified()` awaited by read / set / delete / keys / has / export / restore; tamper still locks before serving.
- [ ] `VaultService.onFirstAccess(cb)`; `vaultFilesPresent(directory)` (stat only) exported from `runtime/src/vault/index.ts`.
- [ ] `desktop/src/main/keychain-gate.ts` `whenKeychainMayBeTouched(fn)`; `index.ts:1045` (`refreshDiskSecrets()`) and `:1050` (`ensureCanaries`) moved behind it.
- [ ] Tests: `vault-service.test.ts` (zero cipher calls until first read; tamper on first read → locked), `vault-files-present.test.ts`, `keychain-gate.test.ts`.

### B — Settings ▸ Permissions
- [ ] `shared`: `permissionsStatus` / `permissionsOpenPane` / `permissionsReset` channels, `MacPermissionId` / `MacPermissionState` / `PermissionRow` schemas, bridge type.
- [ ] `desktop/src/main/permissions/probe.ts` (pure, injected port) + `ipc/permissions-handlers.ts`, registered beside `registerPrivacyHandlers()`; preload.
- [ ] `feature-registrations.ts:85` + `ui-store.ts:284` register `permissions`; `settings-pages/permissions-page.tsx` with focus/visibility re-check, deep links, Reset + Relaunch, FDA recommendation.
- [ ] Tests: `probe.test.ts`, `permissions-handlers.test.ts`, `permissions-page.test.tsx`; `mock-bridge.ts` entry.

### C — Nags point at the page; legacy terminals say why
- [ ] `terminal-session-list.tsx:319` banner copy + Permissions link; `terminal-panel.tsx:155-157` makes it visible when `hasLegacy`.
- [ ] Copy + link in `capture/main/service.ts:169`, `capture/renderer/permission-panel.tsx:40,57`, `companion/renderer/recorder.ts:59,87`, `companion/renderer/web-speech.ts:137`, `desktop/src/main/trash-service.ts:159`.
- [ ] Tests: banner renders without a toggle; nag copy names Settings ▸ Permissions; `broker-client.test.ts` still proves `retireLegacy`.

### D — No unprompted protected-folder access; usage strings
- [ ] Audit table (boot / timer / user-started; can it reach a protected folder?) in the PR body for every suspect in the plan.
- [ ] `shared/src/macos-protected-paths.ts` (`PROTECTED_HOME_FOLDERS`, `PROTECTED_LIBRARY_PATHS`, `isProtectedPath`).
- [ ] `vanguard/main/malware/scanner.ts:228` full scan skips protected libraries without FDA; any boot/timer offender guarded or made lazy.
- [ ] `scripts/tcc-guard.mjs` + test, wired into a node gate; `// tcc-ok:` on the two legitimate sites.
- [ ] `packages/desktop/electron-builder.yml:181` and `apps/launcher/electron-builder.yml` `extendInfo`: seven usage strings; stubs keep them.
- [ ] Tests: `macos-protected-paths.test.ts`, `scanner.test.ts`, `tcc-guard.test.mjs`.

### E — A stable code identity *(keep the chosen variant)*
- [ ] *(a)* `release.yml` `environment: release`, API-key notarisation env; `notarize.cjs` (both) prefers the API key.
- [ ] *(a/b)* `scripts/lib/signing-identity.cjs`; both `afterpack.cjs` skip `--sign -` when an identity signs (a) or sign with `MIDNITE_CODESIGN_IDENTITY` (b).
- [ ] *(a/b)* Launcher `stub.ts:140` / `dev-stub.ts:81` sign with a keychain identity when present, else `-`.
- [ ] *(a)* `verify-signature.mjs --expect-developer-id` in the release job; `bundle-check.ts:27` `RELEASES_ARE_NOTARISED = true`; `updater.ts:85` checked; `outstanding.md:196-197` struck. *(b)* `--expect-identity`.
- [ ] *(b)* Spike recorded first (`spike-r2.md` in the swarm folder): DR certificate-anchored, TCC holds across builds.
- [ ] `docs/RELEASING.md` "ad-hoc until a cert exists" rewritten.
- [ ] Hardened-runtime smoke pass on the packaged build: terminal, git, mic, Empty Trash, local STT/TTS, capture, a launcher-installed suite app.

## Verification
- [ ] CI green on every theme's PR (`gate-node`, `gate-node-app-test`, `gate-native`, `e2e`); `tcc-guard` passes.
- [ ] **Done line 1** (manual, packaged): after "Always allow" on signed build N, installing N+1 and relaunching twice raises no keychain prompt. *(Parked under E(b).)*
- [ ] **Done line 2** (manual): a grant made on N reads `granted` on N+1 in Settings ▸ Permissions; no "enable X" nag for a grant that is on.
- [ ] **Done line 3** (manual): 15 min idle launch with no terminal shows no Documents / Desktop / Downloads / Photos / MediaLibrary TCC requests in `log show`; folder prompts answered on N do not return on N+1.
- [ ] One-time user remediation handed over (plan.md §One-time user remediation).

## Decisions / open questions
- *Open:* Developer ID ($99/yr) vs self-signed — decides Theme E's variant. Recommended: Developer ID.
- *Open:* one cert for Studio, the launcher and every suite stub — recommended yes.
- *Resolved:* lazy keychain defers, never fakes "unavailable" — a fake would mint a fresh integrity key and flag every vault file as tampered.
- *Resolved:* the Permissions page never probes Files & Folders or Automation; both read `unchecked` with a deep link.
- *Resolved:* end-user suite stubs stay ad-hoc in this phase (assembled on the user's machine, where no private key exists).
