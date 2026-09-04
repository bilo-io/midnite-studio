# Phase 53 — The first release

[Phase 11](phase-11-packaging.md) taught this repo to build a `.dmg`.
[Phase 33](phase-33-installable-app-and-cli-integration.md) taught it to install one, and shipped an
in-app updater against a feed that did not exist yet. Everything a user *receives* is built and
documented. Nothing has ever been *sent*: `git tag | wc -l` is **0**, `bilo-io/midnite-apps` has
**zero releases**, and its `midnite-studio/version.json` still carries `"version": null`. This
phase closes that gap and ships v0.1.0 — not by building new machinery, but by connecting machinery
that already exists at both ends and has never been joined in the middle.

**Builds on.** The receiving half is complete and needs no work here:
[`midnite-apps`](https://github.com/bilo-io/midnite-apps) already carries an `apps.json` registry
naming this app's tag prefix and artifact names, an `install.sh` that resolves a version from
`version.json` with **`sed` rather than `jq`** so it depends on nothing but `curl`, a
`release-feed.yml` workflow that rewrites `version.json` automatically on every published release,
and a `feed/README.md` explaining precisely why the provider is `generic` and not `github`. The
app half is equally complete: `electron-updater` is a real dependency,
[`update-service.ts`](../../../packages/desktop/src/main/update-service.ts) registers it with the
**named** `{ autoUpdater }` import behind an `!app.isPackaged` no-op guard,
[`feed-channel.ts`](../../../packages/desktop/src/updates/feed-channel.ts) and
[`update-state.ts`](../../../packages/desktop/src/updates/update-state.ts) are electron-free and
unit-tested, and an update pill and a Settings ▸ Updates page already render every phase of the
state machine. CI already builds a real signed-by-nobody arm64 dmg on every push to `main`.

**Why this is smaller than the sibling app's.** `~/Dev/midnite` solved the same problem and is the
crib throughout — but three of its costs do not apply here, and the reason is the one this phase
should not accidentally spend: **nothing in this download or update path requires a login.** The
feed is a `generic` provider pointed at a `raw.githubusercontent.com` path, so there is no GitHub
API call to authenticate, no `releases/latest` redirect to follow, and no API rate limit to dodge —
where midnite's `install.ps1` hits `api.github.com` and its `install.sh` follows a redirect
specifically to avoid it, this app's installer reads one static JSON file. `version.json` is
already written by a workflow in the receiving repo, so there is no `emit-version-manifest.mjs`
equivalent to build. And the distribution target is **macOS arm64 only**, so the release workflow
is one matrix leg rather than midnite's three, and none of that repo's Windows-runner and
Intel-rebuild scar tissue is inherited.

**Scope guardrails.** This phase does not add Windows or Linux targets — node-pty needs a matching
runner and [Phase 33](phase-33-installable-app-and-cli-integration.md) deferred both with reasons
that still hold. It does not build a marketing site, a download page, or a force-update floor
(midnite has one; this app has no `minSupported` in its `version.json` shape and does not need a
hard cutover before its first release). It does not restructure the two-repo split, the namespaced
tag scheme, or the `generic`-not-`github` decision — all three are settled and documented in the
receiving repo. It does not purchase a Developer ID; Theme H ships the wiring and says plainly what
stays blocked without one.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The CLI wrapper actually ships (S) — ✅ DONE (PR #155, 2026-09-05)

A real bug, not a gap. [`cli-handlers.ts:12`](../../../packages/desktop/src/main/ipc/cli-handlers.ts)
resolves the CLI wrapper from `${process.resourcesPath}/bin/midnite-studio` when packaged. That
file exists in the repo at `packages/desktop/resources/bin/midnite-studio`, executable — but
`resources/` is `directories.buildResources`, which electron-builder uses as a *source of build
inputs* and **does not copy into the bundle**, and `extraResources`
([`electron-builder.yml:26-40`](../../../packages/desktop/electron-builder.yml)) lists only the
renderer and the templates. So every packaged build has shipped with the CLI integration pointing
at a path that does not exist.

- [x] Add `resources/bin` to `extraResources`, and preserve the executable bit through the copy —
      the wrapper is useless without it and `afterpack.cjs` already has a precedent for re-asserting
      `+x` on files electron-builder moved.
- [x] A gate in [`verify-dist.mjs`](../../../packages/desktop/scripts/verify-dist.mjs) asserting the
      wrapper is present **and executable** in the packaged app. The bug survived Phase 33's own
      verification because that verification never looked; a fix with no gate would be one
      `extraResources` edit away from regressing silently.
- [x] Shell completions stay out. Phase 33's doc says they are "shipped through extraResources", but
      **no completion file exists anywhere in the repo** — that is a missing feature, not a
      packaging bug, and writing zsh/bash completions is its own slice.

### B — Lockstep as a check, not a convention (S)

Both release skills have preconditions that fail on a first run today. There is **no
`CHANGELOG.md` at the repo root**, so `/midnite-release-prep` has nothing to append to and
`/midnite-release-complete`'s `extractChangelogSection` has nothing to read. There is no
`packages/shared/src/version.ts` and no `root:version-check` task, so the lockstep rule — every
package sharing one `MAJOR.MINOR`, with independent `PATCH` — is a paragraph in a skill rather than
something CI can fail on.

- [ ] Seed a root [`CHANGELOG.md`](../../../CHANGELOG.md) in the Keep-a-Changelog shape the release
      skills already assume, with an `Unreleased` section. Empty-but-present is what unblocks the
      flow; back-filling fifty-three phases of history into it is not this phase's job and would be
      a fiction assembled after the fact.
- [ ] A `scripts/version-check.mjs` asserting the lockstep invariant across the root and every
      `packages/*` `package.json`, wired as a `root:version-check` moon task inside `moon ci`. Crib
      the sibling app's `scripts/version-check.mjs` — the invariant is identical.
- [ ] The check runs in CI, not only in the release skill. A rule enforced solely by the tool that
      performs the release is a rule that can only be discovered to be broken at the least
      convenient moment.
- [ ] Tests for the pure comparison (`version-check.test.mjs` or equivalent): all-equal passes, a
      divergent `MINOR` fails, a divergent `PATCH` passes, and a missing package is reported rather
      than skipped.

### C — `verify-dist` learns what a *distributable* build is (S)

[`verify-dist.mjs`](../../../packages/desktop/scripts/verify-dist.mjs) has six gates — dmg exists,
zip exists, both ≥ 50 MB, `codesign --verify`, `hdiutil verify`, `Info.plist` names the app, plus
Phase 49's template check. **None of them is about the feed**, which is the artifact the in-app
updater actually consumes and the one most likely to be missing or stale.

- [ ] Assert `latest-mac.yml` exists beside the dmg and that its `version` matches the
      `package.json` version and its `path`/`sha512` match the emitted **zip** — the zip, because
      that is what electron-updater downloads and the dmg is only what a human clicks.
- [ ] Assert the `.blockmap` is present. It is what makes a differential update possible; a release
      missing it still updates, just by re-downloading everything, and nothing would ever say so.
- [ ] Assert `Info.plist`'s `CFBundleShortVersionString` equals the `package.json` version — the
      cheapest possible guard against shipping a bundle whose internal version disagrees with the
      tag it was cut from, which is exactly the disagreement an updater compares against.
- [ ] Keep every existing gate. This theme adds; it does not renegotiate what Phase 11 and Phase 49
      each put there for a reason.

### D — A tag-triggered release workflow (M)

[Phase 33](phase-33-installable-app-and-cli-integration.md) deferred this in as many words: *"the
`publish:` block lands so packaged builds emit a manifest, but the repo has no remote and zero
tags, so a workflow would have nothing to publish to."* The repo now has a remote, and Theme F
gives it a tag. CI's existing `package` job cannot do this job: it triggers on `main` rather than a
tag, holds `contents: read`, and uploads **the dmg only** — not the zip and not `latest-mac.yml`.

- [ ] `.github/workflows/release.yml`, triggered on `push: tags: v*`, single leg on `macos-14`,
      running the existing `desktop:rebuild-native` → `desktop:dist` → `desktop:verify-dist` chain
      so the release path and the CI path cannot drift.
- [ ] Publish cross-repo to `bilo-io/midnite-apps` under the **namespaced** tag
      `midnite-studio/vX.Y.Z`, using a fine-grained PAT (`RELEASES_REPO_TOKEN`, Contents: write).
      The default `GITHUB_TOKEN` is scoped to this private repo and cannot write to the other one;
      the namespacing is not cosmetic, since a bare `vX.Y.Z` would collide with a sibling app's.
- [ ] **Crib four guards from the sibling app's `release.yml`, each of which cost it a broken
      release to learn:**
  - Write `CSC_LINK`/`CSC_KEY_PASSWORD` into `$GITHUB_ENV` from a conditional bash step, never
    inline as `env:`. GitHub expands an unset secret to `""`, electron-builder reads an empty
    `CSC_LINK` as *"a certificate to import"*, resolves it against the cwd and dies **before**
    `CSC_IDENTITY_AUTO_DISCOVERY` is ever consulted — so an unsigned build fails outright instead
    of proceeding unsigned. Write `CSC_IDENTITY_AUTO_DISCOVERY=false` when there is no cert.
  - An explicit asset **allowlist**, not `artifacts/**/*`. Every build leg emits `builder-debug.yml`;
    a glob uploads it and collides.
  - A pre-flight failing on an empty asset set or a duplicate basename, before anything is published.
  - `if: ${{ !cancelled() }}` on the publish job, so one flaky leg cannot silently skip the publish
    and leave a tag with no release behind it.
- [ ] `--publish never` on the electron-builder invocation. The `generic` provider is **read-only**
      — it describes where the app *fetches* its manifest, not somewhere anything can be uploaded —
      so the flag still generates `latest-mac.yml` while correctly attempting no upload. Publishing
      is `gh release`/`action-gh-release` against the other repo, and conflating the two is the
      mistake the `generic`-vs-`github` choice makes easy.

### E — `latest-mac.yml` stops being a step a human forgets (M)

This is where this app genuinely differs from its sibling, and the difference is a trap.
midnite's feed is the `github` provider, so its manifest is a **release asset** and uploading the
assets publishes the feed in one action. This app's feed is `generic`, pointed at
`raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-studio/feed`, so its manifest is a
**committed file** in the receiving repo and is not published by attaching it to anything.
[`/midnite-release-complete` §4](../../.claude/skills/midnite-release-complete/SKILL.md) currently
instructs a human to commit it by hand, and the `feed/README.md` in the receiving repo already
names the failure mode: a release that updates one feed and not the other *"leaves either the
installer or the in-app updater pinned to the previous version."*

- [ ] A second job in the release workflow that commits `latest-mac.yml` into
      `midnite-studio/feed/` in `midnite-apps`, using the same `RELEASES_REPO_TOKEN`.
- [ ] **Ordering is load-bearing:** the release must exist first, because the manifest's `path`
      resolves against release assets that must already be downloadable. Committing the manifest
      before the assets are attached publishes a feed that points at a 404 — and every running app
      would find it, offer the update, and fail the download.
- [ ] Concurrency-guard it the way the receiving repo's own `release-feed.yml` guards
      `version.json` (`group:`, `cancel-in-progress: false`). Two releases close together must not
      race on a push to the same branch.
- [ ] Update [`/midnite-release-complete`](../../.claude/skills/midnite-release-complete/SKILL.md)
      §4 to describe verifying the automated commit rather than performing a manual one, matching
      how it already treats `version.json`.
- [ ] **De-stale both release skills.** Both open with a ⚠️ banner claiming release infrastructure
      "doesn't exist here yet" and that there are no `packages/shared/src/{version,release}.ts`
      helpers. `release.ts` and its tests exist today; after Theme B, `version.ts` and
      `root:version-check` do too. A banner that is wrong is worse than no banner, because it
      instructs a future session to rebuild what is already there.

### F — The first release, end to end (M)

Every theme above is untested speculation until a real release goes out. This one does it, and it
is deliberately the *verification* theme rather than an afterthought inside another.

- [ ] Cut **v0.1.0** through [`/midnite-release-prep`](../../.claude/skills/midnite-release-prep/SKILL.md)
      then [`/midnite-release-complete`](../../.claude/skills/midnite-release-complete/SKILL.md),
      using the flow as written rather than by hand — the run is also the first real test of two
      skills that have never been executed.
- [ ] Confirm each link of the chain independently, because a break in any one of them is silent:
      the source tag `v0.1.0` exists here; the release `midnite-studio/v0.1.0` exists in
      `midnite-apps` with **both** the dmg and the zip attached; `release-feed.yml` rewrote
      `version.json` from `"version": null` to `0.1.0`; and `latest-mac.yml` is committed under
      `midnite-studio/feed/`.
- [ ] Install it the way a stranger would — `curl -fsSL …/install.sh | sh` on a machine with no
      checkout of this repo — and launch the result. Then check what only that path can check: that
      the app opens **without a Gatekeeper prompt** (curl sets no `com.apple.quarantine`, which is
      the entire reason the installer is the recommended route for an unsigned build), that
      `midnite-studio` on the CLI works (Theme A), and that it launches under `env -i` with a bare
      `PATH` — the check [Phase 11](phase-11-packaging.md) established after a packaged build
      shipped without git.
- [ ] Update the app README in the receiving repo to drop its *"No public release yet"* banner.

### G — An updater observed working, for the first time (S)

The updater has **never been seen to function**, because the feed URL it points at has 404'd since
the day it was written. [Phase 33 Decision 3](phase-33-installable-app-and-cli-integration.md)
accepted that deliberately — the updater fail-softs to a hidden banner, which needs no extra code —
but a fail-soft that has never once succeeded is indistinguishable from a broken one.

- [ ] With Theme F's feed live, confirm the pill and Settings ▸ Updates actually reach `available`,
      and that `manualInstall` routes an ad-hoc-signed build to the curl one-liner rather than
      offering a Restart that Squirrel.Mac cannot perform.
- [ ] **Surface the raw updater error in Settings ▸ Updates.** Crib this directly: the sibling app
      added exactly this line after its fail-soft banner concealed a broken feed *across multiple
      releases*. A silent-by-design surface needs one place that is loud.
- [ ] Read the persisted `updateChannel` at startup. `update-service.ts:50` hardcodes
      `feedChannelFor('stable')` at boot and the preference is only applied through the
      `updateSetChannel` IPC — so a user on beta is on stable again after every relaunch, until
      something happens to re-send it.
- [ ] Keep `feedChannelFor`'s `stable → 'latest'` mapping exactly as it is, and note why in a test:
      the naive `autoUpdater.channel = 'stable'` makes the provider look for a `stable-mac.yml`
      that is never published, producing `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND` — which the fail-soft
      rule then swallows. This is the sibling app's most expensive bug and this repo has already
      avoided it; a test is what stops it being "simplified" back in.

### H — Signing and notarization, wired and honestly blocked (M)

[`notarize.cjs`](../../../packages/desktop/scripts/notarize.cjs) exists and no-ops unless `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are all present.
[`electron-builder.yml`](../../../packages/desktop/electron-builder.yml) already sets
`hardenedRuntime: true`, both entitlements files, and `notarize: false` so the env-gated hook owns
the step. Every piece is in place except a certificate, **and a certificate is a purchase, not a
task.**

- [ ] Document the four secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, and the three `APPLE_*`), where
      each comes from and how to set them, so the day the cert exists this is configuration rather
      than archaeology.
- [ ] Verify the unsigned path stays green with all four absent — Theme D's `$GITHUB_ENV` guard is
      precisely what makes that true, and it is worth an explicit CI run rather than an assumption.
- [ ] Flip `notarize: true` and require the signed path **only once a Developer ID exists**. Until
      then this box stays unticked on purpose, and the phase does not pretend otherwise.
- [ ] Say plainly, in the receiving repo's README, that builds are ad-hoc signed and `manualInstall`
      is therefore the permanent update route for now. The README already explains the Gatekeeper
      workaround for a browser download; what it does not yet say is that this is a *state with an
      end*, not the design.

## Files this phase touches

| Area | Path |
|---|---|
| Packaging config | [`electron-builder.yml`](../../../packages/desktop/electron-builder.yml) — `resources/bin` into `extraResources` (A), `notarize: true` when a cert exists (H) |
| Build scripts | [`verify-dist.mjs`](../../../packages/desktop/scripts/verify-dist.mjs) — feed, blockmap, bundle-version and CLI-wrapper gates (A, C); [`afterpack.cjs`](../../../packages/desktop/scripts/afterpack.cjs) — `+x` on the copied wrapper (A) |
| Repo root | [`CHANGELOG.md`](../../../CHANGELOG.md) — new, seeded (B); `scripts/version-check.mjs` — new (B) |
| Moon | root `moon.yml` — `version-check` task, added to `moon ci` (B) |
| CI | `.github/workflows/release.yml` — new, tag-triggered, cross-repo publish + feed commit (D, E); [`ci.yml`](../../../.github/workflows/ci.yml) — unchanged, its `package` job stays the `main`-branch smoke test |
| Contract | `packages/shared/src/version.ts` — new (B); [`release.ts`](../../../packages/shared/src/release.ts) — unchanged, already correct |
| Main, updater | [`update-service.ts`](../../../packages/desktop/src/main/update-service.ts) — read the persisted channel at boot (G) |
| Renderer | [`updates-page.tsx`](../../../packages/app/src/features/settings/settings-pages/updates-page.tsx) — a raw-error status line (G) |
| Skills | [`midnite-release-prep`](../../.claude/skills/midnite-release-prep/SKILL.md), [`midnite-release-complete`](../../.claude/skills/midnite-release-complete/SKILL.md) — stale banners removed, §4 rewritten for the automated feed commit (E) |
| Receiving repo (`bilo-io/midnite-apps`) | `midnite-studio/README.md` — drop the "no release yet" banner, state the ad-hoc-signing position (F, H); `midnite-studio/feed/latest-mac.yml` — written by the workflow, not by hand (E) |
| Tests | `version-check.test.mjs` (B), a `feed-channel.test.ts` case pinning the `stable → 'latest'` mapping (G) |

## Verification

- [ ] `moon run :typecheck :lint :test` green, and `moon ci` now fails on a deliberately divergent
      package version (B).
- [ ] A packaged build contains `Contents/Resources/bin/midnite-studio`, executable, and the CLI
      integration works from the installed app (A).
- [ ] `desktop:verify-dist` fails a build whose `latest-mac.yml` is missing, whose `sha512` does not
      match the zip, or whose `Info.plist` version disagrees with `package.json` (C) — proven by
      breaking each on purpose once, not by inspection.
- [ ] Pushing a `v*` tag produces a `midnite-studio/vX.Y.Z` release in `midnite-apps` carrying the
      dmg **and** the zip, with no `builder-debug.yml` among the assets (D).
- [ ] `latest-mac.yml` lands in `midnite-studio/feed/` **after** the release assets are attached,
      and never before (E).
- [ ] The unsigned release path completes green with no `CSC_*` or `APPLE_*` secrets set (D, H).
- [ ] `curl -fsSL …/install.sh | sh` on a machine with no checkout installs v0.1.0, and it launches
      with no Gatekeeper prompt and under `env -i` with a bare `PATH`. **A human pass** — it needs a
      second machine, or at least a shell that has never seen this repo (F).
- [ ] `version.json` reads `0.1.0`, written by `release-feed.yml` and not by hand (F).
- [ ] A v0.1.1 published afterwards is offered in-app to a running v0.1.0, with the raw error line
      empty — the first end-to-end proof the updater works. **A human pass**, and the only one that
      can close [Phase 33](phase-33-installable-app-and-cli-integration.md)'s inert-feed decision (G).
- [ ] A user on the beta channel is still on beta after a relaunch (G).

## Not in this phase

- **Windows and Linux targets.** node-pty needs a matching runner; [Phase 33](phase-33-installable-app-and-cli-integration.md)'s
  deferral is unchanged and this phase adds no reason to revisit it.
- **Buying a Developer ID.** Theme H wires everything around it and stops there.
- **A force-update floor.** midnite has one (`floor.ts`, a `minSupported` field); this app's
  `version.json` shape has no such field and does not need a hard cutover before its first release.
- **A marketing site or download page.** The receiving repo's README plus a curl one-liner is the
  whole distribution surface, deliberately.
- **Shell completions.** Named in Phase 33's doc as shipped; they do not exist in the repo at all.
  A feature, and its own slice.
- **A dmg background image.** Phase 33 Theme A specified `@1x`/`@2x` PNGs; neither exists, and the
  `dmg:` block has no `background:` key referencing them, so nothing is broken — it is unbuilt
  polish, not a defect.
- **Back-filling `CHANGELOG.md` with fifty-three phases of history.** The file is seeded with an
  `Unreleased` section; a retrospective changelog assembled from commit archaeology would read as
  authoritative while being a reconstruction.
- **Re-litigating the two-repo split, the namespaced tags, or `generic`-over-`github`.** All three
  are settled, and the receiving repo documents each with the reasoning intact.

## Decisions / open questions

- **Settled — publishing is `action-gh-release` against the other repo, not `electron-builder
  --publish`.** The `generic` provider is read-only by construction: it says where the app fetches
  a manifest, not where anything uploads one. `--publish never` still emits the manifest, which is
  all the build step needs to do.
- **Settled — the feed commit is a separate job, ordered after the release.** The manifest names
  assets by path; committing it before those assets exist publishes a feed that every running app
  will find, offer, and fail to download.
- **Settled — `CSC_LINK` is written conditionally into `$GITHUB_ENV`, never passed inline.** An
  unset secret expands to `""`, which electron-builder reads as a certificate to import and dies
  on before it ever consults auto-discovery.
- **Settled — signing does not block the first release.** [Phase 33 Decision 2](phase-33-installable-app-and-cli-integration.md)
  already argued this: detection is a plain HTTPS fetch and only *installation* needs a real cert,
  which is why `manualInstall` exists. Waiting for a certificate before shipping anything would
  leave a finished consumer side untested indefinitely.
- **Settled — v0.1.0, not v1.0.0.** Every package is `0.1.0` today and the lockstep rule makes the
  first release a statement about all of them. A 1.0 is a claim about stability that eighteen
  unfinished phases do not support.
- **Open — should the release workflow run the e2e suite before publishing, or trust `gate`?**
  *Recommendation:* trust `gate`. The e2e job runs on ubuntu against a mock bridge with a ratchet
  excluding seventeen known failures ([Phase 38](phase-38-e2e-suite-repair.md) is still emptying
  it); gating a release on a suite that is knowingly partial buys confidence it cannot supply.
- **Open — does a prerelease channel get wired now, or when there is something to put on it?**
  *Recommendation:* later. `feedChannelFor` already maps `beta`, and the receiving repo's
  `release-feed.yml` already skips prereleases for the stable feed, so the seams exist. A
  `beta-mac.yml` with nothing in it is the exact shape of the `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND`
  bug Theme G is pinning a test against.
- **Open — should `verify-dist` also assert notarization once Theme H lands?** *Recommendation:*
  yes, but conditionally — `spctl --assess` passing should be *required when a cert was used* and
  skipped otherwise, mirroring how `notarize.cjs` itself is env-gated. An unconditional gate would
  make every unsigned build fail its own verification.
