# Phase 53 — The first release

**Refined: x1** · 2026-09-05 · sequencing & dependencies, per-item acceptance criteria, testing & verification, file-map precision, observability & diagnostics, out-of-scope tightening

[Phase 11](phase-11-packaging.md) taught this repo to build a `.dmg`.
[Phase 33](phase-33-installable-app-and-cli-integration.md) taught it to install one, and shipped an
in-app updater against a feed that did not exist yet. Everything a user *receives* is built and
documented. Nothing has ever been *sent*: `git tag | wc -l` is **0**, `bilo-io/midnite-apps` has
**zero releases**, and its `midnite-studio/version.json` still carries `"version": null`. This
phase closes that gap and ships v0.1.0 — not by building new machinery, but by connecting machinery
that already exists at both ends and has never been joined in the middle.

**The x1 refinement re-verified every claim in this doc after Theme A landed.** Most held — `git tag`
is still **0**, `midnite-apps` still has **zero releases**, `version.json` still reads
`"version": null`, its `feed/` still holds only a `README.md`, and all four sibling-app cribs in
Theme D are real, each with the broken release that taught it. Five things changed or were wrong:

1. **Theme A shipped a new release-blocker.** The CLI wrapper PR #155 added
   [`resources/bin/midnite-studio`](../../../packages/desktop/resources/bin/midnite-studio), and its
   line 32 is `echo "midnite-studio 0.1.0"` — a **sixth** hand-written version site, outside every
   check Theme B is about to build. The first bump ships a CLI whose `--version` lies. Theme B now
   owns it.
2. **The raw updater error is already surfaced — in the wrong place to matter.**
   [`updates-page.tsx:92`](../../../packages/app/src/features/settings/settings-pages/updates-page.tsx)
   renders `updateState.error ?? 'Failed to check for updates'`. What is blind is the **pill**:
   [`update-pill.tsx:32-38`](../../../packages/app/src/features/status-bar/update-pill.tsx) returns
   `null` for `error` *and* `checking`, so a user who never opens Settings sees a silent no-op.
   Theme G is re-aimed accordingly.
3. **`updateChannel` is renderer-only, so "read it at boot" is a design fork, not a one-liner.**
   It lives at [`ui-store.ts:668`](../../../packages/app/src/store/ui-store.ts), persisted to
   `localStorage` under `midnite-studio.ui` v8. `grep -rn "updateChannel" packages/desktop` → **0**.
   Main cannot read it at `whenReady()` at all. See Decision — *how the channel survives a relaunch*.
4. **The skills are far more broken than a stale banner.** They invoke **six** helpers by name that
   exist nowhere in this repo — `planVersionBump`, `planReleaseTags`, `parseConventionalCommit`,
   `bumpLevelFromCommits`, `sharesLockstepMajorMinor`, `versionFromReleaseBranch` (grep → 0 each) —
   and `/midnite-release-complete`'s changelog precondition calls
   `extractChangelogSection(CHANGELOG.md, 'X.Y.Z')` expecting an object with a `.date`, while the
   shipped helper ([`release.ts:57`](../../../packages/shared/src/release.ts)) returns
   `string | null`. That precondition **cannot pass as written**. The banner also lives in **six**
   files, not two (`.claude`, `.agents`, `.codex` × prep/complete), so [`CLAUDE.md`](../../../CLAUDE.md)'s
   three-way sync rule applies.
5. **There are three propagation targets, not two.** The receiving repo's
   `midnite-studio/CHANGELOG.md` states it is *"the public mirror of the changelog in the private
   source repo … the release flow copies the released section across"*, and
   [`release.ts:20`](../../../packages/shared/src/release.ts)'s `RELEASE_CHANGELOG_RAW_URL` points
   the in-app release-notes popover at **that mirror**. `/midnite-release-complete` §4 makes copying
   it a third manual step. A release that skips it ships with an empty notes panel.

One crib correction: midnite publishes to **`bilo-io/midnite-app` (singular)**, a different repo from
this app's `bilo-io/midnite-apps`. Copy its workflow's *shape*, never its `repository:` value.

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

### B — Lockstep as a check, not a convention (S) — ✅ DONE (PR #179, 2026-09-05)

Both release skills have preconditions that fail on a first run today. There is **no
`CHANGELOG.md` at the repo root**, so `/midnite-release-prep` has nothing to append to and
`/midnite-release-complete`'s `extractChangelogSection` has nothing to read. There is no
`packages/shared/src/version.ts` and no `root:version-check` task, so the lockstep rule — every
package sharing one `MAJOR.MINOR`, with independent `PATCH` — is a paragraph in a skill rather than
something CI can fail on.

- [x] Seed a root [`CHANGELOG.md`](../../../CHANGELOG.md) in the Keep-a-Changelog shape the release
      skills already assume, with an `Unreleased` section. Empty-but-present is what unblocks the
      flow; back-filling fifty-three phases of history into it is not this phase's job and would be
      a fiction assembled after the fact.
- [x] A `scripts/version-check.mjs` asserting the lockstep invariant across the root and every
      `packages/*` `package.json`, wired as a `root:version-check` moon task inside `moon ci`. Crib
      the sibling app's `scripts/version-check.mjs` — the invariant is identical.
  - The comparison is a **grouping, not a pairwise equality**: bucket every package by its
    `MAJOR.MINOR` and require exactly one bucket, so `PATCH` may legitimately diverge. That is what
    the sibling's `main()` does, and the error message must name every offending package, not just
    report a mismatch.
  - Take only the lockstep half. midnite's script also exports `checkManifestFreshness`, which
    guards a locally-emitted `version.json`; this app's `version.json` is written **server-side** by
    the receiving repo's `release-feed.yml`, so there is nothing here for it to check.
  - Keep it import-free (no `@midnite/*`), as the sibling does — it runs in `moon ci` before
    anything is built.
  - **Root [`moon.yml`](../../../moon.yml) has exactly one task today (`install`).** `version-check`
    is its second, not an addition to a list.
- [x] **Bring `resources/bin/midnite-studio` under the check — it is the sixth version site and it
      is brand new.** PR #155 shipped
      [`packages/desktop/resources/bin/midnite-studio:32`](../../../packages/desktop/resources/bin/midnite-studio)
      hardcoding `echo "midnite-studio 0.1.0"`. Nothing bumps it and nothing reads it back. Either
      have the wrapper derive its version from the bundle it sits inside (it already resolves
      `$RESOURCES`), or add it to `version-check.mjs`'s file list with a regex. **Deriving is
      preferred** — a sixth site that merely gets checked is still a sixth site to remember.
- [x] The check runs in CI, not only in the release skill. A rule enforced solely by the tool that
      performs the release is a rule that can only be discovered to be broken at the least
      convenient moment.
- [x] Tests for the pure comparison (`version-check.test.mjs` or equivalent): all-equal passes, a
      divergent `MINOR` fails, a divergent `PATCH` passes, and a missing package is reported rather
      than skipped.
  - **Do not expect to inherit these.** The sibling app's only test
    (`packages/shared/src/version-manifest-scripts.test.ts`) covers `checkManifestFreshness` — the
    half this app is *not* taking. Its lockstep grouping in `main()` has **no test at all**, so this
    is net-new coverage of the one thing that matters here.
  - Export the comparison as a pure function so the test does not shell out; the sibling's
    import-free style already makes this straightforward.
- [x] **Fix the two release skills' broken helper references, in all six files.** They call
      `planVersionBump`, `planReleaseTags`, `parseConventionalCommit`, `bumpLevelFromCommits`,
      `sharesLockstepMajorMinor` and `versionFromReleaseBranch` by name; `grep -rn` finds **zero** of
      them. Either port them into `packages/shared/src/version.ts` alongside the lockstep helper this
      theme is already adding, or rewrite those skill steps as hand-applied rules. **Porting is
      preferred** — the skills are written around them and a rules-only rewrite loses the precision.
- [x] **Fix `/midnite-release-complete`'s unimplementable changelog precondition.** It asserts
      `extractChangelogSection(CHANGELOG.md, 'X.Y.Z')` "returns a section with a non-null `date`";
      the shipped helper ([`release.ts:57`](../../../packages/shared/src/release.ts)) returns
      `string | null` and has no `date`. Either widen the helper's return (and its nine existing
      tests in `release.test.ts`) or restate the precondition against the real signature.

### C — `verify-dist` learns what a *distributable* build is (S) — ✅ DONE (PR #179, 2026-09-05)

[`verify-dist.mjs`](../../../packages/desktop/scripts/verify-dist.mjs) has six gates — dmg exists,
zip exists, both ≥ 50 MB, `codesign --verify`, `hdiutil verify`, `Info.plist` names the app, plus
Phase 49's template check. **None of them is about the feed**, which is the artifact the in-app
updater actually consumes and the one most likely to be missing or stale.

- [x] Assert `latest-mac.yml` exists beside the dmg and that its `version` matches the
      `package.json` version and its `path`/`sha512` match the emitted **zip** — the zip, because
      that is what electron-updater downloads and the dmg is only what a human clicks.
- [x] Assert the `.blockmap` is present. It is what makes a differential update possible; a release
      missing it still updates, just by re-downloading everything, and nothing would ever say so.
- [x] Assert `Info.plist`'s `CFBundleShortVersionString` equals the `package.json` version — the
      cheapest possible guard against shipping a bundle whose internal version disagrees with the
      tag it was cut from, which is exactly the disagreement an updater compares against.
- [x] Keep every existing gate. This theme adds; it does not renegotiate what Phase 11 and Phase 49
      each put there for a reason. **There are ten of them today**, not six —
      [`verify-dist.mjs`](../../../packages/desktop/scripts/verify-dist.mjs) exits on: dmg exists
      (`:16`), zip exists (`:20`), dmg ≥ 50 MB (`:29`), zip ≥ 50 MB (`:33`), `codesign --verify`
      (`:38`), `hdiutil verify` (`:46`), `Info.plist` names the URL scheme (`:54`), Phase 49's
      template check (`:68`), and **two** from PR #155 — wrapper present (`:90`) and wrapper
      executable (`:96`).
- [x] Note what the version gate is actually guarding against: `verify-dist.mjs:7-8` reads `version`
      from `packages/desktop/package.json` and builds every expected artifact name from it, but never
      compares it to the built bundle. A skew between the two passes today, silently, and it is
      exactly the skew an updater compares against.

### D — A tag-triggered release workflow (M) — ✅ DONE (PR #179, 2026-09-05)

[Phase 33](phase-33-installable-app-and-cli-integration.md) deferred this in as many words: *"the
`publish:` block lands so packaged builds emit a manifest, but the repo has no remote and zero
tags, so a workflow would have nothing to publish to."* The repo now has a remote, and Theme F
gives it a tag. CI's existing `package` job cannot do this job: it triggers on `main` rather than a
tag, holds `contents: read`, and uploads **the dmg only** — not the zip and not `latest-mac.yml`.

- [x] `.github/workflows/release.yml`, triggered on `push: tags: v*`, single leg on `macos-14`,
      running the existing `desktop:rebuild-native` → `desktop:dist` → `desktop:verify-dist` chain
      so the release path and the CI path cannot drift.
- [x] Publish cross-repo to `bilo-io/midnite-apps` under the **namespaced** tag
      `midnite-studio/vX.Y.Z`, using a fine-grained PAT (`RELEASES_REPO_TOKEN`, Contents: write).
      The default `GITHUB_TOKEN` is scoped to this private repo and cannot write to the other one;
      the namespacing is not cosmetic, since a bare `vX.Y.Z` would collide with a sibling app's.
  - **`RELEASES_REPO_TOKEN` does not exist yet** — `grep -rn "RELEASES_REPO_TOKEN"` → **0**.
    Creating it and adding it to this repo's Actions secrets is a step, not an assumption. The only
    secret any workflow references today is `secrets.GITHUB_TOKEN`, mapped to
    `GITHUB_PACKAGES_TOKEN` at seven points in [`ci.yml`](../../../.github/workflows/ci.yml).
  - Asset names come from `electron-builder.yml:14`'s `artifactName`
    (`midnite-studio-${version}-${arch}.${ext}`) and must match `apps.json`'s declared
    `midnite-studio-${version}-arm64.{dmg,zip}` in the receiving repo **exactly** — `install.sh`
    builds its download URL from that template, so a rename there breaks installation silently.
  - **Copy the sibling workflow's shape, never its `repository:` value.** midnite publishes to
    `bilo-io/midnite-app` — *singular*, a different repo. This one targets `bilo-io/midnite-apps`.
- [x] **Crib four guards from the sibling app's `release.yml`, each of which cost it a broken
      release to learn:**
  - Write `CSC_LINK`/`CSC_KEY_PASSWORD` into `$GITHUB_ENV` from a conditional bash step, never
    inline as `env:`. GitHub expands an unset secret to `""`, electron-builder reads an empty
    `CSC_LINK` as *"a certificate to import"*, resolves it against the cwd and dies **before**
    `CSC_IDENTITY_AUTO_DISCOVERY` is ever consulted — so an unsigned build fails outright instead
    of proceeding unsigned. Write `CSC_IDENTITY_AUTO_DISCOVERY=false` when there is no cert.
  - An explicit asset **allowlist**, not `artifacts/**/*`. Every build leg emits `builder-debug.yml`;
    a glob uploads it and collides. The sibling's allowlist is
    `.dmg .zip .exe .AppImage .blockmap latest*.yml`; this app needs
    **`.dmg .zip .blockmap latest-mac.yml`** — one leg, but the `.blockmap` and the manifest must be
    in it, since Theme C now gates on both and Theme E consumes the manifest. Its comment records the
    cost of learning this: the glob "uploaded all three under that one basename … absorbed on v0.9.0,
    fatal on v0.9.1/v0.10.0/v0.11.0, where the failed job left the release an **untagged draft**".
  - A pre-flight failing on an empty asset set or a duplicate basename, before anything is published.
  - `if: ${{ !cancelled() }}` on the publish job, so one flaky leg cannot silently skip the publish
    and leave a tag with no release behind it.
- [x] The workflow needs **`permissions: contents: write`** on its publish job. CI's existing
      `package` job holds `contents: read` + `packages: read`
      ([`ci.yml:179-181`](../../../.github/workflows/ci.yml)) — it could not publish even if it
      wanted to, which is why this is a new workflow rather than a trigger added to that one.
- [x] Reuse `ci.yml`'s `package` job as the literal template for the build steps (checkout, pnpm
      9.15.0 / node 22.12.0, `GITHUB_PACKAGES_TOKEN`, `desktop:rebuild-native`, `desktop:dist` with
      `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`, `desktop:verify-dist`) so the two paths cannot drift.
      Note `desktop:dist`/`verify-dist` carry `options.runInCI: false` in
      [`packages/desktop/moon.yml`](../../../packages/desktop/moon.yml) — that suppresses them under
      `moon ci` only, and both CI and this workflow invoke them by explicit `moon run`, so they do
      execute. Fragile, and worth a comment in the new workflow rather than a rediscovery.
- [x] `--publish never` on the electron-builder invocation. The `generic` provider is **read-only**
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
  - That directory holds **only a `README.md`** today — confirmed against the live repo tree. The
    manifest has never existed there, so the first run creates it rather than replacing it.
- [ ] **Mirror the changelog section too — it is the third propagation target, not a second.** The
      receiving repo's `midnite-studio/CHANGELOG.md` describes itself as *"the public mirror of the
      changelog in the private source repo … the release flow copies the released section across"*,
      and [`release.ts:20`](../../../packages/shared/src/release.ts)'s `RELEASE_CHANGELOG_RAW_URL`
      points the in-app release-notes popover at **that mirror**, not at this repo. A release that
      updates the feed but not the mirror ships an empty notes panel for its own version.
      `/midnite-release-complete` §4 lists it as a third manual step; automate it in the same job as
      the manifest, since both are commits to the same repo under the same token.
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
- [ ] **De-stale the release skills — six files, not two.** The ⚠️ banner is duplicated verbatim
      across `.claude/`, `.agents/` and `.codex/` × `midnite-release-prep` and
      `midnite-release-complete`, and [`CLAUDE.md`](../../../CLAUDE.md)'s three-way sync rule makes
      updating all six mandatory, not tidy.
  - It is **half** wrong, and only the wrong half should go: `packages/shared/src/release.ts`
    **does** exist (88 lines, nine tests, two live consumers), so "no
    `packages/shared/src/{version,release}.ts` helpers" misleads a future session into rebuilding it.
    `version.ts`, `root:version-check`, `docs/RELEASING.md` and the release workflow genuinely do not
    exist — until Theme B and Theme D land, at which point the whole banner comes out.
  - Also stale in the same paragraph: *"packaging lands in Phase 11"* — it landed. And *"the updater
    is post-MVP"* — it is built, wired and shipped; only its feed has been missing.

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
- [ ] Install it the way a stranger would — the installer lives at **`midnite-studio/install.sh`**,
      not the receiving repo's root, so the one-liner is
      `curl -fsSL https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-studio/install.sh | sh`
      — on a machine with no checkout of this repo, then launch the result. Then check what only that path can check: that
      the app opens **without a Gatekeeper prompt** (curl sets no `com.apple.quarantine`, which is
      the entire reason the installer is the recommended route for an unsigned build), that
      `midnite-studio` on the CLI works (Theme A), and that it launches under `env -i` with a bare
      `PATH` — the check [Phase 11](phase-11-packaging.md) established after a packaged build
      shipped without git.
- [ ] Update the app README in the receiving repo to drop its *"No public release yet"* banner —
      verbatim today: *"**No public release yet.** Midnite Studio is pre-1.0 and packaging is still
      landing, so `version.json` carries `"version": null` and the installer below will tell you as
      much rather than downloading anything."*
- [ ] **Confirm the pre-release failure mode is what actually changes.** `install.sh` parses the
      version with a `sed` that matches only a *quoted* string, so today's `"version": null` yields
      an empty `$version` and the script exits with *"Midnite Studio has no published release yet."*
      Run the installer **once before** cutting the release to see that message, so the after-state
      is a proven change rather than an assumed one.

### G — An updater observed working, for the first time (S)

The updater has **never been seen to function**, because the feed URL it points at has 404'd since
the day it was written. [Phase 33 Decision 3](phase-33-installable-app-and-cli-integration.md)
accepted that deliberately — the updater fail-softs to a hidden banner, which needs no extra code —
but a fail-soft that has never once succeeded is indistinguishable from a broken one.

- [ ] With Theme F's feed live, confirm the pill and Settings ▸ Updates actually reach `available`,
      and that `manualInstall` routes an ad-hoc-signed build to the curl one-liner rather than
      offering a Restart that Squirrel.Mac cannot perform.
- [ ] **Surface the updater error in the status-bar pill — Settings already does it.**
      [`updates-page.tsx:92`](../../../packages/app/src/features/settings/settings-pages/updates-page.tsx)
      already renders `updateState.error ?? 'Failed to check for updates'`, so the original
      deliverable was aimed at the one surface that was never blind. The blind one is
      [`update-pill.tsx:32-38`](../../../packages/app/src/features/status-bar/update-pill.tsx), which
      returns `null` for **both** `error` and `checking` — a user who never opens Settings gets a
      Check button that does nothing visible, forever. Render at least an error affordance there.
      The sibling app added its loud line after a fail-soft banner concealed a broken feed *across
      multiple releases*; the lesson applies to whichever surface the user is actually looking at.
- [ ] Make the channel survive a relaunch. [`update-service.ts:50`](../../../packages/desktop/src/main/update-service.ts)
      is `const config = feedChannelFor('stable');` and the only other `feedChannelFor` call is at
      `:100`, inside the `updateSetChannel` handler — so a beta user is back on `latest` after every
      relaunch until they re-touch the Settings control.
  - **This is not a one-line fix, because main cannot read the preference.** `updateChannel` lives at
    [`ui-store.ts:668`](../../../packages/app/src/store/ui-store.ts), persisted to renderer
    `localStorage` under `midnite-studio.ui` v8; `grep -rn "updateChannel" packages/desktop` → **0**.
    Two options, and the phase picks one before writing code — see the Decision below.
  - Whichever is chosen, the acceptance test is the same and is already in `## Verification`: set
    beta, relaunch, and assert the app requests `beta-mac.yml`.
- [ ] Keep `feedChannelFor`'s `stable → 'latest'` mapping, and **write down why — the test already
      exists but the reasoning does not.**
      [`feed-channel.test.ts:5`](../../../packages/desktop/src/updates/feed-channel.test.ts)
      (*"maps stable to latest channel"*) pins the behaviour, but
      [`feed-channel.ts`](../../../packages/desktop/src/updates/feed-channel.ts) has **zero
      comments** and `grep -rn "ERR_UPDATER"` → **0** repo-wide. A test that pins a value without
      saying why invites exactly the "simplification" it exists to prevent. Add the reason as a
      docblock: `autoUpdater.channel` is appended to the generic feed base as
      `<base>/<channel>-mac.yml`, so `'stable'` would request a `stable-mac.yml` that is never
      published, producing `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND` — which the fail-soft rule then
      swallows. This is the sibling app's most expensive bug, and this repo has already avoided it by
      accident of naming.

### H — Signing and notarization, wired and honestly blocked (M)

[`notarize.cjs`](../../../packages/desktop/scripts/notarize.cjs) exists and no-ops unless `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are all present.
[`electron-builder.yml`](../../../packages/desktop/electron-builder.yml) already sets
`hardenedRuntime: true`, both entitlements files, and `notarize: false` so the env-gated hook owns
the step. Every piece is in place except a certificate, **and a certificate is a purchase, not a
task.**

- [ ] Document the five secrets — `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
      `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (the doc previously said four; the three
      `APPLE_*` plus the two `CSC_*` are five) — where each comes from and how to set them, in a new
      `docs/RELEASING.md`, which both release skills already reference and which **does not exist**.
  - Today `CSC_LINK`/`CSC_KEY_PASSWORD` appear only as prose in
    [`README.md:114`](../../../README.md) and a comment in `electron-builder.yml:86`, and the three
    `APPLE_*` only as `process.env` reads in
    [`notarize.cjs:12-14`](../../../packages/desktop/scripts/notarize.cjs). **No workflow references
    any of them.**
- [ ] Verify the unsigned path stays green with all five absent — Theme D's `$GITHUB_ENV` guard is
      precisely what makes that true, and it is worth an explicit CI run rather than an assumption.
- [ ] **Make the notarization skip visible.** [`notarize.cjs:16-19`](../../../packages/desktop/scripts/notarize.cjs)
      logs `[notarize] skipped (missing Apple credentials in env)` and returns — and nothing
      downstream asserts it ran, so an unnotarized build passes `verify-dist` (`codesign --verify`
      succeeds on the ad-hoc signature from `afterpack.cjs`). That is correct today and a trap the
      day a cert exists: a mistyped secret name would silently produce an unnotarized release.
      Theme C's verify step should record which mode the build was in.
- [ ] Note that [`afterpack.cjs:87`](../../../packages/desktop/scripts/afterpack.cjs) only
      `console.warn`s when the ad-hoc `codesign` fails rather than throwing — a failed sign surfaces
      two steps later at `verify-dist`'s `codesign --verify`, with a misleading proximate cause.
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
| Renderer | [`updates-page.tsx`](../../../packages/app/src/features/settings/settings-pages/updates-page.tsx) — (**unchanged**) `:92` already renders the raw error; the gap is the pill (G) |
| Skills | [`midnite-release-prep`](../../.claude/skills/midnite-release-prep/SKILL.md), [`midnite-release-complete`](../../.claude/skills/midnite-release-complete/SKILL.md) — stale banners removed, §4 rewritten for the automated feed commit (E) |
| Receiving repo (`bilo-io/midnite-apps`) | `midnite-studio/README.md` — drop the "no release yet" banner, state the ad-hoc-signing position (F, H); `midnite-studio/feed/latest-mac.yml` — written by the workflow, not by hand (E) |
| Tests | `version-check.test.mjs` — net-new, the sibling's lockstep half is untested (B); [`feed-channel.ts`](../../../packages/desktop/src/updates/feed-channel.ts) — a docblock, since [`feed-channel.test.ts:5`](../../../packages/desktop/src/updates/feed-channel.test.ts) already pins the mapping (G) |
| CLI wrapper | [`resources/bin/midnite-studio`](../../../packages/desktop/resources/bin/midnite-studio) — line 32's hardcoded `0.1.0`, the sixth version site, shipped by Theme A itself (B) |
| Docs | `docs/RELEASING.md` — **new**; referenced by both skills and absent (H) |
| Skills ×6 | `.claude/`, `.agents/` **and** `.codex/` × `midnite-release-prep`, `midnite-release-complete` — the banner, the six missing helper references, and §4's changelog precondition (B, E) |
| Renderer | [`update-pill.tsx`](../../../packages/app/src/features/status-bar/update-pill.tsx) — an error affordance; it returns `null` for `error` and `checking` today (G) |
| Receiving repo | `midnite-studio/CHANGELOG.md` — the **third** propagation target, mirrored by the release flow and read by the in-app notes popover (E) |

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
- [ ] A user on the beta channel is still on beta after a relaunch — assert the app requests
      `beta-mac.yml`, not `latest-mac.yml` (G).
- [ ] `midnite-studio --version` on the **installed** build prints the released version, not a
      hardcoded `0.1.0` (B). The sixth version site, proven rather than assumed.
- [ ] `moon ci` fails when `resources/bin/midnite-studio`'s version disagrees with `package.json`,
      or the wrapper derives it and there is nothing left to disagree (B).
- [ ] The status-bar pill shows *something* when a check fails — today it renders `null` for `error`
      and `checking`, so a failed check is indistinguishable from a successful one (G).
- [ ] The in-app release-notes popover shows v0.1.0's notes, proving the **changelog mirror** was
      propagated and not just the two feeds (E, F).
- [ ] `grep -rn "planVersionBump\|versionFromReleaseBranch" .claude .agents .codex` either resolves
      to real exports or the skills no longer name them (B).
- [ ] The ⚠️ banner is gone from all **six** skill files, and `.claude`/`.agents`/`.codex` remain
      byte-identical to each other (B, E).
- [ ] Running `install.sh` **before** the release prints "no published release yet", and the same
      command after it installs v0.1.0 — the before-state captured, not assumed (F).

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
- **Settled (x1) — the release propagates THREE artifacts, not two.** `version.json` (automatic,
  server-side, via the receiving repo's `release-feed.yml`), `latest-mac.yml` (Theme E automates it)
  and `midnite-studio/CHANGELOG.md` (the public mirror the in-app notes popover actually reads, via
  `release.ts`'s `RELEASE_CHANGELOG_RAW_URL`). `/midnite-release-complete` §4 and §5 already treat
  the first two as a pair and call a release missing either "published but not installable"; the
  third belongs in that same sentence, because a release missing it is installable but mute.

- **Settled (x1) — the CLI wrapper's version is derived, not checked.** PR #155 shipped a sixth
  hand-written version site (`resources/bin/midnite-studio:32`). Adding it to `version-check.mjs`
  would work and is the smaller change; deriving it from the bundle the wrapper already resolves is
  better, because a checked constant is still a constant somebody has to remember to bump, and the
  whole point of Theme B is to stop relying on that.

- **Open (x1) — how does the update channel survive a relaunch?** `updateChannel` is renderer state
  in `localStorage`; main reads nothing at boot. Two options:
  (a) **Push it from the renderer on mount** — one `updateSetChannel` call in an effect. Tiny, and it
  leaves a window between `whenReady()` and first paint where main is on `latest`; harmless, since
  nothing checks for updates in that window unless auto-check fires first.
  (b) **Move the preference to a main-side store**, joining the `userData`-rooted JSON stores at
  `index.ts:322-344`, with the renderer reading it over IPC. Correct, and it makes the renderer's
  copy the derived one.
  *Recommendation:* **(a) for this phase, and record (b) as the right end state.** The bug is that a
  beta user silently reverts; an effect fixes that today for a handful of lines. (b) is a persistence
  migration (a `ui-store` v9 with a key removed) in a phase whose job is to ship a release, and the
  moment auto-check-on-boot becomes real, (b) stops being optional.

- **Open (x1) — do the six missing skill helpers get ported, or the skills rewritten?** The skills
  call `planVersionBump`, `planReleaseTags`, `parseConventionalCommit`, `bumpLevelFromCommits`,
  `sharesLockstepMajorMinor` and `versionFromReleaseBranch`; none exists here.
  *Recommendation:* **port them into `packages/shared/src/version.ts`** alongside Theme B's lockstep
  helper. The sibling's are tested and self-contained, the skills are written around their exact
  names, and Theme B is already creating that file. A rules-only rewrite makes both skills longer,
  vaguer, and untestable — and the first release is precisely when you want the version math to be a
  function with tests rather than a paragraph a session interprets.

- **Open — should `verify-dist` also assert notarization once Theme H lands?** *Recommendation:*
  yes, but conditionally — `spctl --assess` passing should be *required when a cert was used* and
  skipped otherwise, mirroring how `notarize.cjs` itself is env-gated. An unconditional gate would
  make every unsigned build fail its own verification.
