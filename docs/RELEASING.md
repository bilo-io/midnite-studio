# Releasing Midnite Studio

Both `/midnite-release-prep` and `/midnite-release-complete` reference this file for the secrets a
real release needs. It did not exist before Phase 53 Theme H — the skills' own `⚠️` banners said so
and were the last thing to read this before it existed.

## The two-repo model, in one paragraph

This repo (`bilo-io/midnite-studio`) is private. Source tags (`vX.Y.Z`) live here; everything a user
touches — the public GitHub Release, the installers, the update feed, the changelog mirror, and the
issue tracker — lives in **[`bilo-io/midnite-apps`](https://github.com/bilo-io/midnite-apps)** under
the **namespaced** tag `midnite-studio/vX.Y.Z`. See `CLAUDE.md` and
[Phase 53](../.midnite/tasks/phases/phase-53-first-release.md) for why, and
[`packages/shared/src/release.ts`](../packages/shared/src/release.ts) for the URLs every surface
reads.

## Secrets

All six live in **this repo's** Settings ▸ Secrets and variables ▸ Actions — `release.yml` is what
reads them.

| Secret | Used for | Where it comes from |
|---|---|---|
| `RELEASES_REPO_TOKEN` | Cross-repo publish: attaching the dmg/zip/blockmap/manifest to `bilo-io/midnite-apps`, and committing `feed/latest-mac.yml` + the changelog mirror there. The default `GITHUB_TOKEN` is scoped to this repo only. | A **fine-grained PAT** ([github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens)) scoped to the single repo `bilo-io/midnite-apps`, with **Contents: Read and write** and nothing else. |
| `CSC_LINK` | The macOS code-signing certificate electron-builder imports. | Export a **Developer ID Application** certificate from Keychain Access as a `.p12`, then base64-encode it: `base64 -i cert.p12 | pbcopy`. The value is the base64 string, not a file path. |
| `CSC_KEY_PASSWORD` | The `.p12`'s export password. | Set when exporting the certificate above. |
| `APPLE_ID` | Notarization (`notarize.cjs`) — the Apple ID that owns the Developer ID cert. | The Apple Developer Program account's own sign-in email. |
| `APPLE_APP_SPECIFIC_PASSWORD` | Notarization — `notarize.cjs` cannot use the Apple ID's normal password. | Generate one at [appleid.apple.com](https://appleid.apple.com) ▸ Sign-In and Security ▸ App-Specific Passwords. |
| `APPLE_TEAM_ID` | Notarization — disambiguates which team the cert belongs to. | [developer.apple.com/account](https://developer.apple.com/account) ▸ Membership details. |

**A certificate is a purchase, not a task** — an Apple Developer Program membership, currently not
held. `notarize: true` in
[`electron-builder.yml`](../packages/desktop/electron-builder.yml) stays unflipped, and the five
Apple/CSC secrets stay unset, until one exists. Every build ships ad-hoc signed
(`afterpack.cjs` re-signs after electron-builder strips the signature copying `resources/`), and
`manualInstall` — the curl-installer / `brew upgrade` route rather than the in-app updater's
"Restart to install" — is the permanent update path until then, not a placeholder for one.

## The unsigned path is the one that runs today

`.github/workflows/release.yml`'s "Configure macOS code-signing" step writes `CSC_LINK` etc. into
`$GITHUB_ENV` **only when `CSC_LINK` is non-empty**, and sets `CSC_IDENTITY_AUTO_DISCOVERY=false`
otherwise. GitHub expands an unset secret to `""`, and electron-builder reads an empty `CSC_LINK` as
"a certificate to import" — it would die before `CSC_IDENTITY_AUTO_DISCOVERY` is ever consulted
without that guard. `ci.yml`'s `package` job runs the identical unsigned path on every push to
`main`, with none of the five secrets set — that is today's live proof the guard works, not a
one-time check to schedule separately.

## Signing mode is recorded, not just gated

[`verify-dist.mjs`](../packages/desktop/scripts/verify-dist.mjs) inspects the packaged bundle's
`codesign` output and logs which mode it shipped in (`unsigned (ad-hoc)` vs. `signed (Developer
ID)`). A signed build is additionally required to pass `spctl --assess` — Gatekeeper's own check,
which a signed-but-unnotarized build fails — so a mistyped secret can no longer produce a silently
unnotarized release. An unsigned build is never held to that bar; requiring it unconditionally would
fail every build's own verification today.

## A known sharp edge

[`afterpack.cjs`](../packages/desktop/scripts/afterpack.cjs) only `console.warn`s if the ad-hoc
`codesign` step it runs after electron-builder strips the original signature fails — it does not
throw. A failure there surfaces two steps later, at `verify-dist`'s `codesign --verify --deep
--strict`, with a proximate cause (a `codesign` verification failure) that does not point back at
where the signature actually went missing. Read the `afterpack` log, not just `verify-dist`'s, when
that gate fails.

## Still open

The receiving repo's `midnite-studio/README.md` does not yet say plainly that builds are ad-hoc
signed and that `manualInstall` is the permanent (not provisional) update route — that edit lives in
`bilo-io/midnite-apps`, a separate repo from this one, and is left for a human pass alongside the
first real release (Phase 53 Theme F).
