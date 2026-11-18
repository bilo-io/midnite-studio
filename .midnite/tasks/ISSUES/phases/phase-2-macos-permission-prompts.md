# Phase 2 — macOS permission prompts

**Refined: x1** · 2026-11-17 · functionality & edge cases, sequencing, file-map precision, testing & verification, security & blast radius

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
> **Depends on:** nothing for A–D (all landed). Theme E is built as variant (a) Developer ID (resolved 2026-11-17,
> below). Its code lands **inert** — every signing path is gated on the certificate being present, exactly as
> `release.yml`'s CSC gate is today — so E1 can merge before the owner buys the certificate; E2 (the flips) and the
> human passes wait for the first notarised release.
>
> **Scope guardrails.** Never delete or recreate the `Midnite Studio Safe Storage` keychain item. Never probe a
> protected folder to learn its status (the probe would itself prompt). Never disclaim responsibility for terminal
> children (`posix_spawnattr_setdisclaim` — rejected). Reset touches only Studio's own bundle id and never runs `sudo`.
> Suite apps' Permissions page, CI-pre-signed suite stubs and fewer guest keychain items (K3) are **not in this
> phase**.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

**Theme A — No keychain access on the boot path.** ✅ [#1254](https://github.com/bilo-io/midnite-studio/pull/1254) (S–M) `createVaultService` no longer verifies integrity in its
constructor; a memoised `ensureVerified()` runs before the first ciphertext read or write, and still locks on tamper
before anything is served. The boot-time disk-redaction refresh and canary planting wait for the vault's first real
access, or for the window's first show + focus + idle — and never run when no vault file exists. A launch with nothing
secret open makes no keychain call. Lock and unlock before first access queue their audit line until verification has run, so a forged audit file cannot be re-baselined. A profile with no vault files gets no canaries until its first vault op (a vault-less user has no tripwire until then).

**Theme B — Settings ▸ Permissions.** ✅ [#1266](https://github.com/bilo-io/midnite-studio/pull/1266) (M–L) A frame-owned settings page lists the macOS grants Studio uses — Screen
Recording, Microphone, Camera, Accessibility, Full Disk Access (read live, re-read on focus), Automation and Files &
Folders (never probed; asked on first use) — each with a deep link into System Settings and, for a toggle that shows on
but reads off, a **Reset** (`tccutil reset <Service> io.bilo.midnite-studio`) plus **Relaunch**. It says plainly that
agents in Studio's terminals inherit these grants.

**Theme C — Nags point at the page; legacy terminals say why.** ✅ [#1270](https://github.com/bilo-io/midnite-studio/pull/1270). (S) The capture, microphone and Finder-automation
messages stop saying "reopen the app" and link to Settings ▸ Permissions. The existing legacy-session banner explains
that terminals from a previous build don't get this build's permissions, and it is visible without opening the session
list. The notice (`terminal-notices.tsx`) now says macOS grants do not apply and has a Permissions link through a new optional `actions.openPermissions` host action; the list opens once per launch when a previous-build session exists. Capture, mic and Finder messages name Settings ▸ Permissions, and the capture panel has an "Open Settings ▸ Permissions" button through an optional `CaptureHost.openPermissions`. No broker code changed.

**Theme D — No unprompted protected-folder access; folder usage strings.** ✅ [#1262](https://github.com/bilo-io/midnite-studio/pull/1262). (M) An audit of every boot- and
timer-driven path that can reach `~/Desktop|Documents|Downloads|Pictures|Music|Movies`; `isProtectedPath` in `shared`;
Vanguard's full scan skips Photos/Music/Mail/Messages/Safari libraries without Full Disk Access; a `tcc-guard` script
fails CI on a new unmarked protected-folder access. Info.plist gains the seven folder/library usage strings, so the
prompts that remain say why. The audit found no boot or timer path entering a protected folder; the full scan was the one
offender (`tcc-guard` is the regression net). Prompts from commands run in a terminal stay attributed to Studio.

**Theme E — A stable code identity.** 🔄 (M) Variant (a) Developer ID, chosen 2026-11-17. **E1 (code, lands inert):**
one `scripts/lib/signing-identity.cjs` resolver decides "Developer ID or ad hoc" for both `afterpack.cjs` files, which
skip their `--sign -` re-sign when an identity will sign; both `notarize.cjs` prefer an App Store Connect API key over
the Apple ID trio; `release.yml`'s `build` job runs under a `release` Environment; `verify-signature.mjs` grows
`--expect-developer-id`, passed only when the CSC gate found a cert; the developer-run dev stub signs with a local
identity. **E2 (after the first notarised release):** `RELEASES_ARE_NOTARISED` flips and the "ad-hoc until a cert
exists" prose goes. Then a hardened-runtime smoke pass and the one-time user remediation (now written into this doc).
End-user suite stubs stay ad hoc. The self-signed variant (b) is not built.

*Pre-certificate slice landed (E1 items 1–3).* `scripts/lib/signing-identity.cjs` (`resolveSigning`, `listKeychainIdentities`, `afterPackSignArg`) decides ad hoc vs Developer ID and also honours `MIDNITE_CODESIGN_IDENTITY` (hooks then sign with that name themselves; `CSC_*` or a keychain Developer ID means electron-builder signs and the hooks skip `--sign -`). Both `notarize.cjs` export `notarizeOptions` (API key, then Apple ID trio, else skip); `release.yml`'s `build` job runs under `environment: release` and writes the API key when all three secrets exist. The launcher dev stub signs with a keychain identity when present, else `-`. With no identity configured every path is today's ad-hoc build. Still waiting on the Developer ID certificate (Phase 53 Theme H): `verify-signature.mjs --expect-developer-id`, `updater.ts` test seam, `RELEASES_ARE_NOTARISED = true`, `docs/RELEASING.md`, the hardened-runtime smoke pass and the three human Done lines.

**Audit — 2026-11-17.** Re-checked against `origin/main` at `2615c1c60`. A–D (17 items) were already ticked and still
hold: every file they name is where they say (`desktop/src/main/keychain-gate.ts`, `desktop/src/main/permissions/probe.ts`,
`features/terminal/renderer/terminal-notices.tsx`, `shared/src/macos-protected-paths.ts`, `scripts/tcc-guard.mjs`,
`features/vanguard/main/malware/scanner.ts`), and `node scripts/tcc-guard.mjs` prints `tcc-guard: ok`. Of the 12 open
items: **0** ticked as landed (no Theme E code exists on main: both `afterpack.cjs` still sign `-` unconditionally,
`RELEASES_ARE_NOTARISED = false`), **1** struck (the E(b) self-signed spike, ruled out by the Developer ID decision; the (b) arms of E2/E4 and E3's end-user `stub.ts` half are struck inline), **5**
rewritten as precise `(human)` checks (the smoke pass, three done lines, the remediation hand-over — the swarm's
`plan.md` it pointed at no longer exists, so the remediation is now inline), **6** refined for sonnet (E1–E4, E6 and
the CI line, which A–D could not meet: #1254/#1262/#1266/#1270 merged while Actions was billing-locked). Both open
decisions resolved. Refined x1.

## Deliverables

### A — No keychain access on the boot path
- [x] `runtime/src/vault/vault-service.ts:286-288`: constructor `verifyAll()` → memoised `ensureVerified()` awaited by read / set / delete / keys / has / export / restore; tamper still locks before serving.
- [x] `VaultService.onFirstAccess(cb)`; `vaultFilesPresent(directory)` (stat only) exported from `runtime/src/vault/index.ts`.
- [x] `desktop/src/main/keychain-gate.ts` `whenKeychainMayBeTouched(fn)`; `index.ts:1045` (`refreshDiskSecrets()`) and `:1050` (`ensureCanaries`) moved behind it.
- [x] Tests: `vault-service.test.ts` (zero cipher calls until first read; tamper on first read → locked), `vault-files-present.test.ts`, `keychain-gate.test.ts`.

### B — Settings ▸ Permissions
- [x] `shared`: `permissionsStatus` / `permissionsOpenPane` / `permissionsReset` channels, `MacPermissionId` / `MacPermissionState` / `PermissionRow` schemas, bridge type.
- [x] `desktop/src/main/permissions/probe.ts` (pure, injected port) + `ipc/permissions-handlers.ts`, registered beside `registerPrivacyHandlers()`; preload.
- [x] `feature-registrations.ts:85` + `ui-store.ts:284` register `permissions`; `settings-pages/permissions-page.tsx` with focus/visibility re-check, deep links, Reset + Relaunch, FDA recommendation.
- [x] Tests (in review, #1266; reset logic tested in `reset.test.ts`): `probe.test.ts`, `permissions-handlers.test.ts`, `permissions-page.test.tsx`; `mock-bridge.ts` entry.

### C — Nags point at the page; legacy terminals say why
- [x] `terminal-notices.tsx` banner (was `terminal-session-list.tsx:319`) copy + Permissions link; `terminal-panel.tsx` opens the list once per launch when `hasLegacy`.
- [x] Copy + link in `capture/main/service.ts:169`, `capture/renderer/permission-panel.tsx:40,57`, `companion/renderer/recorder.ts:59,87`, `companion/renderer/web-speech.ts:137`, `desktop/src/main/trash-service.ts:159`.
- [x] Tests: banner copy and Permissions link; nag copy names Settings ▸ Permissions. (`broker-client.test.ts` unchanged, not re-run locally: desktop vitest needs built feature packages.)

### D — No unprompted protected-folder access; usage strings
- [x] Audit table (boot / timer / user-started; can it reach a protected folder?) in the PR body for every suspect in the plan.
- [x] `shared/src/macos-protected-paths.ts` (`PROTECTED_HOME_FOLDERS`, `PROTECTED_LIBRARY_PATHS`, `isProtectedPath`).
- [x] `vanguard/main/malware/scanner.ts:228` full scan skips protected libraries without FDA; any boot/timer offender guarded or made lazy.
- [x] `scripts/tcc-guard.mjs` + test, wired into a node gate; `// tcc-ok:` on the two legitimate sites.
- [x] `packages/desktop/electron-builder.yml:181` and `apps/launcher/electron-builder.yml` `extendInfo`: seven usage strings; stubs keep them.
- [x] Tests: `macos-protected-paths.test.ts`, `scanner.test.ts`, `tcc-guard.test.mjs`.

### E — A stable code identity: variant (a) Developer ID (M)

**Sequencing.** E1 is the first four items plus E6 and is one PR; every path in it is gated on a certificate being
present, so with no cert a release is byte-for-byte the ad-hoc build it is today. E2 (the `RELEASES_ARE_NOTARISED` flip
inside E4, and the `outstanding.md` strike) is a second, tiny PR that merges only after the first release whose
`verify-signature.mjs --expect-developer-id` step passed. The human items run on that release.

- [x] *(a)* `release.yml` `environment: release`, API-key notarisation env; `notarize.cjs` (both) prefers the API key.
  - [`.github/workflows/release.yml`](../../../../.github/workflows/release.yml): add `environment: release` to the
    `build:` job (line ~114, the only job that signs) — never to `meta`/`plan`/`bundles`/`assemble`/`release`/`publish-*`.
  - Same file, the `Configure macOS code-signing` step (line ~172): add `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`,
    `APPLE_API_ISSUER` secrets to its step `env:`. Inside the existing `if [ -n "$CSC_LINK" ]` branch, when
    `APPLE_API_KEY_P8` is non-empty: write it to `$RUNNER_TEMP/AuthKey.p8` (`printf '%s' "$APPLE_API_KEY_P8" >`), then
    append `APPLE_API_KEY=$RUNNER_TEMP/AuthKey.p8`, `APPLE_API_KEY_ID=…`, `APPLE_API_ISSUER=…` to `$GITHUB_ENV`. Keep
    the Apple-ID trio lines as the fallback. Never write an empty value (the comment above the step says why).
  - [`packages/desktop/scripts/notarize.cjs`](../../../../packages/desktop/scripts/notarize.cjs) and
    [`apps/launcher/scripts/notarize.cjs`](../../../../apps/launcher/scripts/notarize.cjs) (identical today; keep them
    identical): pick credentials in this order — (1) `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` all set
    → `notarize({ appPath, appleApiKey, appleApiKeyId, appleApiIssuer })` (`@electron/notarize` ^2.5 option names);
    (2) else the Apple-ID trio as today; (3) else log `[notarize] skipped (missing Apple credentials in env)` and
    return. Extract the choice as `exports.notarizeOptions = (env, appPath) => object | null` so it is testable.
  - Edge: a partial API-key set (e.g. key but no issuer) falls through to the Apple-ID trio, never throws.
  - Test (net-new) [`scripts/lib/notarize-options.test.mjs`](../../../../scripts/lib/) — vitest via the root
    `scripts/**/*.test.mjs` include; `createRequire` the desktop `notarize.cjs`; assert API key wins when both sets
    exist, partial API key → Apple-ID options, nothing → `null`; and that the two `notarize.cjs` files are byte-equal.
- [x] *(a)* ~~`(a/b)`~~ `scripts/lib/signing-identity.cjs`; both `afterpack.cjs` skip `--sign -` when an identity signs. *(The (b) `MIDNITE_CODESIGN_IDENTITY` arm is not built — variant (a) chosen.)*
  - Net-new [`scripts/lib/signing-identity.cjs`](../../../../scripts/lib/) (CommonJS, no deps — both `afterpack.cjs`
    are CJS): `exports.resolveSigning = (env, listIdentities) => ({ kind: 'developer-id', name } | { kind: 'adhoc' })`.
    Rule, in order: `env.CSC_IDENTITY_AUTO_DISCOVERY === 'false'` → adhoc; non-empty `env.CSC_LINK` or `env.CSC_NAME`
    → developer-id (`name` = `CSC_NAME` or `'from CSC_LINK'`); else the first line of `listIdentities()` matching
    `/"(Developer ID Application: [^"]+)"/` → developer-id; else adhoc. Mirrors electron-builder's own discovery,
    which is what actually signs. `exports.listKeychainIdentities = () => execFileSync('security', ['find-identity',
    '-v', '-p', 'codesigning'], {encoding:'utf8'})`, returning `''` on any throw (listing never prompts; using the key
    would — that is builder's job, not ours).
  - [`packages/desktop/scripts/afterpack.cjs`](../../../../packages/desktop/scripts/afterpack.cjs) step 4 (line ~129):
    `require('../../../scripts/lib/signing-identity.cjs')`; when `kind === 'developer-id'` log
    `[afterPack] skipping ad-hoc sign — <name> signs after this hook` and skip the `codesign --sign -`.
  - [`apps/launcher/scripts/afterpack.cjs`](../../../../apps/launcher/scripts/afterpack.cjs) line ~34: same require and
    skip, and skip its `--verify --deep --strict` too (the bundle is unsealed until builder signs; the release's
    `verify-signature.mjs` checks the final zip). Fuse flipping is unchanged in both.
  - Test (net-new) `scripts/lib/signing-identity.test.mjs`: the four rule arms above with an injected
    `listIdentities`; an `Apple Development:` identity alone → adhoc; `listIdentities` returning `''` → adhoc.
- [x] *(a)* ~~Launcher `stub.ts:140` /~~ `dev-stub.ts:81` signs with a keychain identity when present, else `-`. *(`stub.ts` struck: it runs inside the installed launcher on the user's machine, where signing with a keychain key would itself raise a keychain prompt — the thing this phase removes — and the resolved decision keeps end-user stubs ad hoc.)*
  - [`apps/launcher/src/main/bundles/dev-stub.ts`](../../../../apps/launcher/src/main/bundles/dev-stub.ts): add
    optional `signIdentity?: string` to `DevStubInput`; the two `codesign` steps use `input.signIdentity ?? '-'` for
    `--sign`. `planDevStub` stays pure.
  - [`apps/launcher/scripts/dev-app.mjs`](../../../../apps/launcher/scripts/dev-app.mjs) line ~74: resolve once with
    `resolveSigning(process.env, listKeychainIdentities)` (createRequire the `.cjs`) and pass `signIdentity: name`
    only for `developer-id` from the keychain arm (not `'from CSC_LINK'`). Add the identity to `devStubStamp`'s input
    so switching identity rebuilds the stub: `devStubStamp(electronVersion, iconHash, signIdentity = '-')`
    appends `sign=<id>\n`.
  - [`apps/launcher/src/main/bundles/stub.ts`](../../../../apps/launcher/src/main/bundles/stub.ts) — **unchanged**;
    update the comment at line ~138 to cite this decision.
  - Test: [`dev-stub.test.ts`](../../../../apps/launcher/src/main/bundles/dev-stub.test.ts) — no `signIdentity` → `'-'`
    (existing expectations hold); `signIdentity: 'Developer ID Application: X (T)'` → both codesign steps carry it;
    `devStubStamp` differs by identity.
- [ ] *(a)* `verify-signature.mjs --expect-developer-id` in the release job; `bundle-check.ts:27` `RELEASES_ARE_NOTARISED = true`; `updater.ts:85` checked; `outstanding.md:196-197` struck. ~~*(b)* `--expect-identity`.~~ *(variant (b) not built)*
  - **E1:** [`scripts/verify-signature.mjs`](../../../../scripts/verify-signature.mjs): parse a leading
    `--expect-developer-id` flag out of `argv` before the zips. When set, after the existing `--verify`, run
    `codesign -dv --verbose=2 <app>` (stderr) and fail the zip unless it has `Authority=Developer ID Application:`
    and no `Signature=adhoc`, then `spctl --assess --type execute -vv <app>` must exit 0, then `xcrun stapler validate
    <app>` must exit 0. Without the flag behaviour is unchanged. Update the header comment.
  - **E1:** `release.yml` line ~245: `flag=""; [ "$CSC_IDENTITY_AUTO_DISCOVERY" = "true" ] && flag=--expect-developer-id;
    node scripts/verify-signature.mjs $flag packages/desktop/release/*.zip apps/launcher/release/*.zip`.
  - **E1:** [`apps/launcher/src/main/updater.ts`](../../../../apps/launcher/src/main/updater.ts) `isAdHocSigned` (line
    ~89): no behaviour change; add an optional second param `run = spawnSync` so it is testable, and in
    [`updater.test.ts`](../../../../apps/launcher/src/main/updater.test.ts) assert a Developer ID `codesign -dv` stderr
    → `false`, `Signature=adhoc` → `true`, non-zero exit → `true`.
  - **E2 (separate PR, after the first release whose `--expect-developer-id` step passed):**
    [`bundle-check.ts`](../../../../packages/features/vanguard/main/integrity/bundle-check.ts) line 27 →
    `RELEASES_ARE_NOTARISED = true`; run `bundle-check.test.ts` and `integrity-sensor` tests and fix any expectation
    that encoded `false`. In [`outstanding.md`](../../outstanding.md) strike the two "Real Developer ID signing is a
    prerequisite" lines (currently ~196–197) with `~~…~~ — landed, ISSUES Phase 2 E`.
  - Edge: a dry-run release (`dry_run=true`) with no secrets must still pass — the flag is absent then.
- [ ] ~~*(b)* Spike recorded first (`spike-r2.md` in the swarm folder): DR certificate-anchored, TCC holds across builds.~~ — struck 2026-11-17: variant (a) Developer ID chosen; the self-signed spike is not needed (and the swarm folder it named no longer exists).
- [ ] `docs/RELEASING.md` "ad-hoc until a cert exists" rewritten.
  - [`docs/RELEASING.md`](../../../../docs/RELEASING.md): in E1, add a "Signing with Developer ID" section — the five
    secrets now plus the three API-key secrets, the `release` Environment, how a local build picks the cert up (login
    keychain; `CSC_IDENTITY_AUTO_DISCOVERY=false` forces ad hoc), and that `--expect-developer-id` only runs when the
    cert is present. In E2, rewrite the "Every build ships ad-hoc signed … until then" paragraph (lines ~86–95) and
    the `Still open` lines (~63, ~227) to past tense. Also update `verify-signature.mjs`'s header ("every build is ad
    hoc signed until notarisation lands").
- [ ] **(human)** Hardened-runtime smoke pass on the packaged build: terminal, git, mic, Empty Trash, local STT/TTS, capture, a launcher-installed suite app.
  - Build: the first Developer-ID-signed release `.dmg` from `bilo-io/midnite-apps` (or `moon run desktop:dist` on a
    machine with the cert in its login keychain), installed to `/Applications`. Confirm first:
    `codesign -dv --verbose=2 "/Applications/Midnite Studio.app" 2>&1 | grep Authority` shows `Developer ID Application`.
  - Pass each: open a terminal and run `ls ~`, `git status` in a repo; Graph view fetch + commit; companion mic
    recording (grants Microphone); Settings ▸ Empty Trash on a file you trashed (Finder Automation); local STT and TTS
    each once; a screen capture (Screen Recording); install and open one suite app from Midnite Apps.
  - Look for: no crash, no `Code Signature Invalid`/`EXC_BAD_ACCESS (Code Signature)` in Console, each grant prompt
    appears at most once and Settings ▸ Permissions then reads `granted`.

## Verification
- [ ] Theme E's PRs gate green (`gate-node`, `gate-node-app-test`, `gate-native`, `e2e`) and `tcc-guard` passes. *(Narrowed 2026-11-17 from "every theme's PR": #1254, #1262, #1266 and #1270 merged while Actions was billing-locked — every job failed at start-up — so A–D can never show green; `node scripts/tcc-guard.mjs` prints `tcc-guard: ok` on `2615c1c60`.)*
  - While Actions stays locked, the E PRs merge on the focused local gate instead (never a workspace-wide moon run —
    it exhausts RAM): `pnpm exec vitest run scripts/lib/signing-identity.test.mjs scripts/lib/notarize-options.test.mjs`,
    `pnpm -C apps/launcher exec vitest run src/main/bundles/dev-stub.test.ts src/main/updater.test.ts`,
    `pnpm exec eslint <changed files>`, `node scripts/tcc-guard.mjs`, `node scripts/tracker-check.mjs`
    — and a `gh workflow run release.yml -f dry_run=true` once Actions returns, to prove the cert-less path is unchanged.
- [ ] **Done line 1 (human):** after "Always allow" on signed build N, installing N+1 and relaunching twice raises no keychain prompt.
  - Builds: two consecutive Developer-ID-signed releases N and N+1. Install N, launch, open anything that reads the
    vault (Settings ▸ Accounts) → answer the `Midnite Studio Safe Storage` prompt with **Always Allow**. Install N+1
    over it via the curl installer, launch, quit, launch again, and open Settings ▸ Accounts each time.
  - Pass: no keychain dialog on either N+1 launch. Evidence: `security dump-keychain -a ~/Library/Keychains/login.keychain-db | grep -A3 "Midnite Studio Safe Storage"` lists a Developer-ID requirement (`identifier "io.bilo.midnite-studio" and anchor apple generic …`), not a bare `cdhash`.
- [ ] **Done line 2 (human):** a grant made on N reads `granted` on N+1 in Settings ▸ Permissions; no "enable X" nag for a grant that is on.
  - On N: grant Screen Recording and Microphone (capture once, record once). Install N+1, launch, open Settings ▸
    Permissions. Pass: both rows read `granted` with no Reset offered; a capture and a mic recording start without any
    "enable … in System Settings" message.
- [ ] **Done line 3 (human):** 15 min idle launch with no terminal shows no Documents / Desktop / Downloads / Photos / MediaLibrary TCC requests; folder prompts answered on N do not return on N+1.
  - Quit Studio, close every terminal session, launch the packaged build, then leave it idle 15 min. Run
    `log show --last 16m --predicate 'subsystem == "com.apple.TCC" AND eventMessage CONTAINS "midnite-studio"' | grep -E "kTCCService(SystemPolicy(Documents|Desktop|Downloads)Folder|Photos|MediaLibrary)"`.
    Pass: no lines. Then answer one folder prompt on N (e.g. open a repo under `~/Documents`), install N+1, repeat —
    pass if the prompt does not return.
- [ ] **(human)** One-time user remediation handed over (the steps under *One-time user remediation* below), posted to the owner with the first signed release's notes.

## One-time user remediation

For a machine that ran ad-hoc builds, once, after installing the first Developer-ID-signed build:

1. Launch it. If macOS asks for `Midnite Studio Safe Storage`, enter the login password and click **Always Allow** —
   the last time. **Do not delete the keychain item** (it holds the vault key; deleting it loses every stored secret).
2. Open Settings ▸ Permissions. For each row whose System Settings toggle is on but reads off: **Reset**, then
   **Relaunch**, then grant it once when asked.
3. Answer each Documents / Desktop / Downloads prompt once, when the feature that needs it first asks.
4. Close and reopen any terminal started by an older build (the legacy-session notice names them) — those processes
   keep the old identity's grants.
5. Optional tidy-up: Keychain Access ▸ `Midnite Studio Safe Storage` ▸ Access Control — remove the stale
   `Midnite Studio` entries left by ad-hoc builds. Harmless if skipped.

## Files Theme E touches

| File | Change |
|---|---|
| [`.github/workflows/release.yml`](../../../../.github/workflows/release.yml) | `environment: release` on `build`; API-key env; `--expect-developer-id` when signed |
| [`packages/desktop/scripts/notarize.cjs`](../../../../packages/desktop/scripts/notarize.cjs), [`apps/launcher/scripts/notarize.cjs`](../../../../apps/launcher/scripts/notarize.cjs) | API key first, `notarizeOptions` export |
| `scripts/lib/signing-identity.cjs` + `.test.mjs` | **net-new** |
| `scripts/lib/notarize-options.test.mjs` | **net-new** |
| [`packages/desktop/scripts/afterpack.cjs`](../../../../packages/desktop/scripts/afterpack.cjs), [`apps/launcher/scripts/afterpack.cjs`](../../../../apps/launcher/scripts/afterpack.cjs) | skip ad-hoc sign when an identity signs |
| [`apps/launcher/src/main/bundles/dev-stub.ts`](../../../../apps/launcher/src/main/bundles/dev-stub.ts) + test, [`apps/launcher/scripts/dev-app.mjs`](../../../../apps/launcher/scripts/dev-app.mjs) | optional `signIdentity` |
| [`apps/launcher/src/main/bundles/stub.ts`](../../../../apps/launcher/src/main/bundles/stub.ts) | **unchanged** (comment only) — end-user stubs stay ad hoc |
| [`scripts/verify-signature.mjs`](../../../../scripts/verify-signature.mjs) | `--expect-developer-id` |
| [`apps/launcher/src/main/updater.ts`](../../../../apps/launcher/src/main/updater.ts) + test | injectable `run`, tests only |
| [`packages/features/vanguard/main/integrity/bundle-check.ts`](../../../../packages/features/vanguard/main/integrity/bundle-check.ts) | E2: flip `RELEASES_ARE_NOTARISED` |
| [`docs/RELEASING.md`](../../../../docs/RELEASING.md), [`.midnite/tasks/outstanding.md`](../../outstanding.md) | E1 section; E2 prose + strike |
| [`packages/desktop/electron-builder.yml`](../../../../packages/desktop/electron-builder.yml) | **unchanged** — `notarize: false` stays (notarize.cjs is the path) |

## Decisions / open questions
- **Resolved (2026-11-17) — Developer ID ($99/yr), variant (a).** The conventional path and the doc's own
  recommendation: Gatekeeper, notarisation and electron-updater's auto-install all need it, a self-signed cert gets
  none of those. Built inert, so it merges before the cert is bought. *If the owner later picks self-signed, un-strike
  the (b) items and re-refine.*
- **Resolved (2026-11-17) — one Developer ID cert for Studio, the launcher and the dev stub.** One team, one identity;
  separate certs buy nothing for TCC (grants key on bundle id + requirement).
- **Resolved (2026-11-17) — notarise with an App Store Connect API key, Apple ID as fallback.** Apple's recommended
  notarytool credential; no 2FA/app-password expiry; existing Apple-ID secrets keep working.
- **Resolved (2026-11-17) — the end-user `stub.ts` stays ad hoc.** Signing on the user's machine needs a private key
  there and would prompt for keychain access; consistent with the resolved stub decision below.
- **Resolved (2026-11-17) — the `RELEASES_ARE_NOTARISED` flip is a separate E2 PR after a proven notarised release.**
  Flipping first would turn every ad-hoc build's integrity finding `critical`.
- *Resolved:* lazy keychain defers, never fakes "unavailable" — a fake would mint a fresh integrity key and flag every vault file as tampered.
- *Resolved:* the Permissions page never probes Files & Folders or Automation; both read `unchecked` with a deep link.
- *Resolved:* end-user suite stubs stay ad-hoc in this phase (assembled on the user's machine, where no private key exists).
