---
name: midnite-release-complete
description: Finalise a prepped release/vX.Y.Z branch — verify preconditions, commit chore(release), create the tag(s) per the scheme, push, merge the release PR to main, and cut the GitHub Release from the changelog. The IRREVERSIBLE half of the two-step flow; run only after a human has reviewed the /midnite-release-prep branch.
---

**Invoke with:** [ephemeral]   (run on the release/vX.Y.Z branch that /midnite-release-prep prepared, or pass 'ephemeral' from main for a temporary test release)

Execute a prepped Midnite Studio release: the irreversible half of the two-step flow.
Runs **after** a human has reviewed the `release/vX.Y.Z` branch that
[`/midnite-release-prep`](../midnite-release-prep/SKILL.md) left (or after selecting an ephemeral test release).
Tags, pushes, merges to `main` (for standard releases), and cuts a GitHub Release — so it
**stops for explicit confirmation before the first irreversible step** and refuses to run
if preconditions aren't met.

**Policy + math are fixed** — don't re-derive them (ported from midnite, Phase 53 Theme B):
- whole plan = `planRelease` (the one entry point — it wraps the three below and is the only
  thing that knows about the first release);
- tag scheme = `planReleaseTags` (lockstep `vX.Y.Z` vs scoped `‹pkg›@X.Y.Z`);
- bump math = `planVersionBump`; lockstep invariant = `sharesLockstepMajorMinor`;
- changelog section = `extractChangelogSection`; branch→version = `versionFromReleaseBranch`.

**Style:** terse — report the checks + the plan, then act once confirmed.

## 1 · Preconditions — refuse if any fail
Gather, and **stop with a clear message** on the first failure (nothing has changed yet):
- **Branch / Mode:**
  - **Standard release:** current branch = `release/vX.Y.Z`; derive `X.Y.Z` with `versionFromReleaseBranch` (`git rev-parse --abbrev-ref HEAD`). Not a release branch → tell the user to run `/midnite-release-prep` first.
  - **Ephemeral release (`$ARGUMENTS` is `ephemeral`):** runs on current branch (`main`); derive `X.Y.Z` from root `package.json`.
- **Clean tree:** `git status --porcelain` empty.
- **In sync:** `git fetch origin`; the branch's `main` base isn't ahead in a way that conflicts (rebase/merge `main` first if so).
- **Versions match the branch:** read every `package.json`; for a lockstep release every package is `X.Y.0`; for a patch the bumped package(s) are `X.Y.Z`. The lockstep MAJOR.MINOR invariant holds — run `moon run root:version-check`.
- **Changelog ready (standard release only):** this repo's `extractChangelogSection(markdown, version)` ([`release.ts`](../../../packages/shared/src/release.ts)) returns just the section body as `string | null` — no `.date` field — so check both halves directly: `extractChangelogSection(CHANGELOG.md, 'X.Y.Z')` is non-null and non-empty, AND the changelog literally has a dated heading for that version (`## [X.Y.Z] - YYYY-MM-DD`, not `## [Unreleased]` — grep the heading text). Either missing means `/midnite-release-prep` wasn't finished — stop. (Skipped for ephemeral releases.)
- **GitHub secret present:** verify `RELEASES_REPO_TOKEN` exists via `gh secret list --repo bilo-io/midnite-studio`. If absent, stop — `.github/workflows/release.yml` will fail to publish assets to `bilo-io/midnite-apps`.
- **Green:** `moon ci` passes. (Run it; don't trust a stale cache for the gate.)

## 2 · Plan the tags & show the go/no-go — STOP for the human
- Compute the tag(s) with `planRelease({ current, previous, commits: [], changedPackages: [] })`.
  `current` is the working tree's versions; `previous` is the version map read from the last `v*`
  tag's tree (`git show ‹lastTag›:package.json` etc.). Expect `['vX.Y.Z']` for a lockstep release or
  `['‹pkg›@X.Y.Z', …]` for a patch.
- **First release — `git tag --list 'v*'` is empty, so there is no last tag to read `previous`
  from.** Pass `previous: null`: `planRelease` then tags the versions already in the tree
  (`['vX.Y.Z']`) instead of `planReleaseTags(current, current)` returning `[]` — nothing changed, so
  the pairwise form finds nothing to tag and this step would silently produce no release at all.
  `/midnite-release-prep` will have left no version bumps for the same reason, which is correct and
  not a sign it failed: §1's *versions match the branch* check is satisfied by every package already
  reading `X.Y.Z`.
- **Ephemeral test release:** target tag is `vX.Y.Z` matching the current `package.json` version.
- **a direct question to the user** with the full plan and an explicit go/no-go (recommended option = proceed only if every precondition passed):
  - **Standard release:** the version, the tag(s), the changelog section that will become the GitHub Release body, and that this will tag + push + merge to `main` + publish a Release.
  - **Ephemeral release:** the version `vX.Y.Z`, the tag `vX.Y.Z`, that this will tag + push to trigger packaging to `bilo-io/midnite-apps` without opening a PR or merging to `main`, and that teardown commands will be provided to delete the release after testing.
  Do **not** proceed without an affirmative.

## 3 · Commit + tag (first irreversible step)
- **Standard release:** If `/midnite-release-prep` left version bumps uncommitted (it shouldn't), or the changelog still shows `## [Unreleased]` instead of the dated section, finalise: confirm the bumps are lockstep, move `## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD` (today). Commit `chore(release): vX.Y.Z` with the required `Co-Authored-By` trailer. (Usually the prep branch already has this commit.) Create the tag(s) from `planReleaseTags`: `git tag vX.Y.Z` (annotated: `-a -m "vX.Y.Z"`), or each scoped `git tag '‹pkg›@X.Y.Z'`.
- **Ephemeral release:** No commit is created. Create annotated tag on HEAD: `git tag -a vX.Y.Z -m "vX.Y.Z (ephemeral test release)"`.

## 4 · Publish
Two repos are involved, and the split matters: **this repo is private, so nothing users touch can
live here.** Source tags stay here; the public Release, the installers and the feeds go to
**[bilo-io/midnite-apps](https://github.com/bilo-io/midnite-apps)**, the shared downloads + issue
tracker. Because that repo carries several apps, its tags are namespaced — `midnite-studio/vX.Y.Z`,
never a bare `vX.Y.Z`, which would collide with another app's.

- **Push** the source tag(s) here: `git push origin ‹tag›`. This is what
  [`.github/workflows/release.yml`](../../../.github/workflows/release.yml) (Phase 53 Theme D)
  triggers on — it builds the macOS arm64 dmg/zip, publishes the namespaced Release to
  `bilo-io/midnite-apps`, then (Theme E) a second job commits `latest-mac.yml` under
  `midnite-studio/feed/` there and mirrors this version's changelog section into
  `midnite-studio/CHANGELOG.md` — **once the release job it depends on has actually published,
  never before** (a manifest committed first would point at assets that don't exist yet).
  `gh run list --workflow release.yml` / `gh run watch` to follow it rather than assuming.
- **Merge to main (standard release only):** open the release PR if one isn't open (`gh pr create --base main --title 'chore(release): vX.Y.Z' --body …`), wait for CI, then `gh pr merge` — prefer a **merge commit** here so the tagged commit stays on `main`. (For ephemeral release, skip PR/merge entirely.)
- **Verify, don't perform, the three propagation targets** — `release.yml` did the work; this step
  confirms it actually happened rather than assuming a green workflow means every side effect
  landed:
  - **The Release itself:** `gh release view 'midnite-studio/vX.Y.Z' --repo bilo-io/midnite-apps
    --json assets` names both the dmg and the zip (and the `.blockmap`) — no `builder-debug.yml`
    among them.
  - **`version.json`:** rewritten automatically by `bilo-io/midnite-apps`'s own
    `release-feed.yml`, triggered by the Release publishing — confirm it reads the new version
    rather than editing it by hand.
  - **`midnite-studio/feed/latest-mac.yml`:** committed by `release.yml`'s `publish-feed` job.
    Confirm its `version` matches and that the commit landed *after* the Release (check the job
    log or the commit's parent) — this is the job that most silently no-ops if
    `RELEASES_REPO_TOKEN` is missing or expired, since a failed cross-repo push here still leaves
    the Release itself looking published.
  - **`midnite-studio/CHANGELOG.md`:** the same job's changelog-mirror step. If this version's
    section was genuinely empty (a patch of docs/chore-only commits), `has_section=false` in the
    job's own output is the expected outcome, not a failure to chase.

## 5 · Re-seed + confirm (or Ephemeral Teardown)
- **Standard release:**
  - Re-seed an empty `## [Unreleased]` stub above the released section in `CHANGELOG.md` and refresh the compare link (`[Unreleased]: …/compare/vX.Y.Z...HEAD`), if `/midnite-release-prep` didn't. Commit on `main` (`docs(changelog): re-seed Unreleased after vX.Y.Z`).
  - Report, terse: the **released version**, the **source tag(s)** here, the **Release URL**
    (`gh release view 'midnite-studio/vX.Y.Z' --repo bilo-io/midnite-apps --json url`), the merge
    commit, and that `## [Unreleased]` is reset. Also state, per §4, whether the assets attached,
    whether `release-feed.yml` updated `version.json`, and whether the `publish-feed` job committed
    both `latest-mac.yml` and the changelog mirror — a release missing any of the three is published
    but not installable (or, for the changelog, installable but mute), and that must not be reported
    as done.
- **Ephemeral release:**
  Report, terse:
  - The **ephemeral test release** `midnite-studio/vX.Y.Z` is published on `bilo-io/midnite-apps`.
  - The test install command to run from target computers:
    ```sh
    curl -fsSL https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-studio/install.sh | sh
    ```
  - The **teardown commands** to execute once testing is complete:
    ```sh
    # 1. Delete the GitHub Release and tag in bilo-io/midnite-apps:
    gh release delete midnite-studio/vX.Y.Z --repo bilo-io/midnite-apps --yes --cleanup-tag

    # 2. Reset version.json in bilo-io/midnite-apps:
    gh api repos/bilo-io/midnite-apps/contents/midnite-studio/version.json \
      -X PUT -f message="chore: reset version.json after ephemeral test release" \
      -f content="$(echo -n '{"app":"midnite-studio","channel":"stable","version":null,"releasedAt":null,"notesUrl":null}' | base64)" \
      -f sha="$(gh api repos/bilo-io/midnite-apps/contents/midnite-studio/version.json --jq .sha)"

    # 3. Delete tag from midnite-studio (local and remote):
    git tag -d vX.Y.Z
    git push origin :refs/tags/vX.Y.Z
    ```

## Notes
- **Out of scope:** publishing packages to a registry (private monorepo) — tags + GitHub Release only.
- **Abort cleanly before §3:** nothing is irreversible until the first tag/push. If the human says no at §2, leave the branch as-is.
- **If a push or merge fails midway:** report exactly what landed (tag created? pushed? merged?) so the human can finish by hand — never silently retry a partial publish.
