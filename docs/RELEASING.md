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

## The first release has not happened yet — and the flow could not have cut it

Verified 2026-09-06 (Phase 53 Theme F), and each line is a command, so re-check rather than trust:

| Link in the chain | State | How to check |
|---|---|---|
| Source tags here | **0** | `git tag \| wc -l` |
| Releases in `midnite-apps` | **0** | `gh release list --repo bilo-io/midnite-apps` |
| `midnite-studio/version.json` | `"version": null` | `curl -fsSL https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-studio/version.json` |
| `midnite-studio/feed/` | `README.md` only | `gh api repos/bilo-io/midnite-apps/contents/midnite-studio/feed --jq '.[].name'` |
| `RELEASES_REPO_TOKEN` | **not created** | Settings ▸ Secrets ▸ Actions, in this repo |

**The pre-release failure mode, confirmed.** `install.sh` resolves the version with
`sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'` — a pattern that matches only a
*quoted* string. The live feed's `"version": null` is unquoted, so `$version` comes back empty and
the script exits on `Midnite Studio has no published release yet.` before downloading anything. That
is the "before" the first release changes, and it is a property of the two files rather than of the
machine you run it on — the feed and the shipped `install.sh` above are the whole proof.

**A rehearsal of the flow planned the wrong version.** Running
`/midnite-release-prep`'s step 2 + 3 against this repo's real state — 799 commits, **0** tags, every
package `0.1.0` — falls back to the root commit, meets a `feat`, categorises as `minor`, and plans
**v0.2.0**. Phase 53 settled on **v0.1.0**: the first release ships what is already in the tree.
`/midnite-release-complete` fared no better — it reads `previousVersions` from "the last `v*` tag's
tree", and there is no such tree. Both skills now carry an explicit `previous = null` branch and
call [`planRelease`](../packages/shared/src/version.ts), which returns
`{ firstRelease, level, next, tags }` in one call so the case cannot be dropped again.

### What is left, and it needs a human

Nothing below is automatable from a session — each step is irreversible, cross-repo, or needs a
machine with no checkout of this repo:

1. **Create `RELEASES_REPO_TOKEN`** (see the table below). Until it exists `release.yml` cannot
   publish, and its `publish-feed` job is the one that fails *quietly* — the Release still looks
   published.
2. **Run `/midnite-release-prep`, review the branch, then `/midnite-release-complete`.** Expect
   `firstRelease: true`, `level: none`, no version bumps, and the single source tag `v0.1.0`.
3. **Confirm all four links flipped** — the tag here, the `midnite-studio/v0.1.0` Release with both
   the dmg and the zip, `version.json` rewritten to `0.1.0` by the receiving repo's
   `release-feed.yml`, and `feed/latest-mac.yml` committed *after* the Release.
4. **Install it as a stranger would**, on a machine with no checkout:
   `curl -fsSL https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-studio/install.sh | sh`
   — then check no Gatekeeper prompt, that `midnite-studio` works on the CLI, and that it launches
   under `env -i` with a bare `PATH`.
5. **Edit the receiving repo's `midnite-studio/README.md`** to drop its *"No public release yet."*
   banner (and, per *Still open* below, to state that builds are ad-hoc signed).

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

## Ephemeral test releases (installer verification)

When verifying `install.sh` on other machines before an official release, an **ephemeral test release**
can be published without bumping versions or modifying `CHANGELOG.md`:

1. **Tag matches the working tree:** Electron-builder templates artifact names from `package.json`'s
   current version (`0.0.1`), so the git tag must be `v0.0.1` (matching the current version). Every
   package was dropped from `0.1.0` to `0.0.1` for exactly this reason: an ephemeral tag must never
   collide with `v0.1.0`, the real first release Phase 53 settled on.
2. **Publish via `/midnite-release-complete ephemeral`:** Tags HEAD and pushes to trigger
   `.github/workflows/release.yml`, publishing assets to `bilo-io/midnite-apps`. No PR is opened or merged to `main`.
3. **Verify installer on target machines:**
   ```sh
   curl -fsSL https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-studio/install.sh | sh
   ```
4. **Teardown when testing is complete:**
   ```sh
   # Delete the Release and tag from midnite-apps
   gh release delete midnite-studio/v0.0.1 --repo bilo-io/midnite-apps --yes --cleanup-tag

   # Reset version.json in midnite-apps
   gh api repos/bilo-io/midnite-apps/contents/midnite-studio/version.json \
     -X PUT -f message="chore: reset version.json after ephemeral test release" \
     -f content="$(echo -n '{"app":"midnite-studio","channel":"stable","version":null,"releasedAt":null,"notesUrl":null}' | base64)" \
     -f sha="$(gh api repos/bilo-io/midnite-apps/contents/midnite-studio/version.json --jq .sha)"

   # Delete tag in midnite-studio (local & remote)
   git tag -d v0.0.1
   git push origin :refs/tags/v0.0.1
   ```

## Still open

The receiving repo's `midnite-studio/README.md` does not yet say plainly that builds are ad-hoc
signed and that `manualInstall` is the permanent (not provisional) update route — that edit lives in
`bilo-io/midnite-apps`, a separate repo from this one, and is left for a human pass alongside the
first real release (Phase 53 Theme F).
