---
name: midnite-release-complete
description: Finalise a prepped release/vX.Y.Z branch — verify preconditions, commit chore(release), create the tag(s) per the scheme, push, merge the release PR to main, and cut the GitHub Release from the changelog. The IRREVERSIBLE half of the two-step flow; run only after a human has reviewed the /midnite-release-prep branch.
argument-hint: "(run on the release/vX.Y.Z branch that /midnite-release-prep prepared)"
allowed-tools: Bash, Read, Edit, AskUserQuestion, Agent
---

Execute a prepped Midnite Studio release: the irreversible half of the two-step flow.
Runs **after** a human has reviewed the `release/vX.Y.Z` branch that
[`/midnite-release-prep`](../midnite-release-prep/SKILL.md) left. Tags, pushes, merges to `main`, and
cuts a GitHub Release — so it **stops for explicit confirmation before the first
irreversible step** and refuses to run if preconditions aren't met.

> ⚠️ **Ported from midnite — release infra doesn't exist here yet.** Midnite Studio has no
> `packages/shared/src/{version,release}.ts` helpers, no `root:version-check` task, and
> no tag-triggered release workflow (packaging lands in Phase 11; the updater is
> post-MVP). Port the helpers from `~/Dev/midnite/packages/shared/src/` or apply the
> rules by hand, and update this skill once the infra lands.

**Policy + math are fixed** — don't re-derive them (midnite's tested helpers, if ported):
- tag scheme = `planReleaseTags` (lockstep `vX.Y.Z` vs scoped `‹pkg›@X.Y.Z`);
- bump math = `planVersionBump`; lockstep invariant = `sharesLockstepMajorMinor`;
- changelog section = `extractChangelogSection`; branch→version = `versionFromReleaseBranch`.

**Style:** terse — report the checks + the plan, then act once confirmed.

## 1 · Preconditions — refuse if any fail
Gather, and **stop with a clear message** on the first failure (nothing has changed yet):
- **On a release branch:** current branch = `release/vX.Y.Z`; derive `X.Y.Z` with `versionFromReleaseBranch` (`git rev-parse --abbrev-ref HEAD`). Not a release branch → tell the user to run `/midnite-release-prep` first.
- **Clean tree:** `git status --porcelain` empty.
- **In sync:** `git fetch origin`; the branch's `main` base isn't ahead in a way that conflicts (rebase/merge `main` first if so).
- **Versions match the branch:** read every `package.json`; for a lockstep release every package is `X.Y.0`; for a patch the bumped package(s) are `X.Y.Z`. The lockstep MAJOR.MINOR invariant holds (run `moon run root:version-check` if ported; otherwise eyeball).
- **Changelog ready:** `extractChangelogSection(CHANGELOG.md, 'X.Y.Z')` returns a section with a non-null `date` (a dated `## [X.Y.Z] - YYYY-MM-DD`) and a non-empty body. An undated/`Unreleased`-only changelog means `/midnite-release-prep` wasn't finished — stop.
- **Green:** `moon ci` passes. (Run it; don't trust a stale cache for the gate.)

## 2 · Plan the tags & show the go/no-go — STOP for the human
- Compute the tag(s): `planReleaseTags(previousVersions, currentVersions)` — `previousVersions` from the last `v*` tag's tree (`git show ‹lastTag›:package.json` etc.), `currentVersions` from the working tree. Expect `['vX.Y.Z']` for a lockstep release or `['‹pkg›@X.Y.Z', …]` for a patch.
- **AskUserQuestion** with the full plan and an explicit go/no-go (recommended option = proceed only if every precondition passed): the version, the tag(s), the changelog section that will become the GitHub Release body, and that this will tag + push + merge to `main` + publish a Release. Do **not** proceed without an affirmative.

## 3 · Commit + tag (first irreversible step)
- If `/midnite-release-prep` left version bumps uncommitted (it shouldn't), or the changelog still shows `## [Unreleased]` instead of the dated section, finalise: confirm the bumps are lockstep, move `## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD` (today). Commit `chore(release): vX.Y.Z` with the required `Co-Authored-By` trailer. (Usually the prep branch already has this commit.)
- Create the tag(s) from `planReleaseTags`: `git tag vX.Y.Z` (annotated: `-a -m "vX.Y.Z"`), or each scoped `git tag '‹pkg›@X.Y.Z'`.

## 4 · Publish
Two repos are involved, and the split matters: **this repo is private, so nothing users touch can
live here.** Source tags stay here; the public Release, the installers and the feeds go to
**[bilo-io/midnite-apps](https://github.com/bilo-io/midnite-apps)**, the shared downloads + issue
tracker. Because that repo carries several apps, its tags are namespaced — `midnite-studio/vX.Y.Z`,
never a bare `vX.Y.Z`, which would collide with another app's.

- **Push** the branch and the source tag(s) here: `git push origin release/vX.Y.Z` then
  `git push origin ‹tag›`.
- **Merge to main:** open the release PR if one isn't open (`gh pr create --base main --title 'chore(release): vX.Y.Z' --body …`), wait for CI, then `gh pr merge` — prefer a **merge commit** here so the tagged commit stays on `main`.
- **GitHub Release — on `bilo-io/midnite-apps`, not here:**

  ```sh
  gh release create 'midnite-studio/vX.Y.Z' \
    --repo bilo-io/midnite-apps \
    --title 'Midnite Studio vX.Y.Z' \
    --notes-file ‹changelog section› \
    packages/desktop/release/midnite-studio-X.Y.Z-arm64.dmg \
    packages/desktop/release/midnite-studio-X.Y.Z-arm64.zip
  ```

  Build the artifacts first (`moon run desktop:dist`). If a build did not run, cut the Release
  without assets rather than skipping it — but say so in the report.
- **Mirror the changelog section** into `midnite-studio/CHANGELOG.md` in that repo, above the
  previous release, and open it as a PR or push it directly to `main`.
- **The two feeds.** `midnite-studio/version.json` (what `install.sh` reads) is rewritten
  automatically by that repo's `release-feed.yml` when the Release publishes — check that it ran
  rather than editing the file. `midnite-studio/feed/latest-mac.yml` (what electron-updater reads)
  is **not** automatic: commit the `latest-mac.yml` that `desktop:dist` emitted alongside the dmg.
  Skipping it means the in-app updater keeps reporting the previous version.

## 5 · Re-seed + confirm
- Re-seed an empty `## [Unreleased]` stub above the released section in `CHANGELOG.md` and refresh the compare link (`[Unreleased]: …/compare/vX.Y.Z...HEAD`), if `/midnite-release-prep` didn't. Commit on `main` (`docs(changelog): re-seed Unreleased after vX.Y.Z`).
- Report, terse: the **released version**, the **source tag(s)** here, the **Release URL**
  (`gh release view 'midnite-studio/vX.Y.Z' --repo bilo-io/midnite-apps --json url`), the merge
  commit, and that `## [Unreleased]` is reset. Also state, per §4, whether the assets attached,
  whether `release-feed.yml` updated `version.json`, and whether `latest-mac.yml` was committed —
  a release that is missing any of the three is published but not installable, and that must not
  be reported as done.

## Notes
- **Out of scope:** publishing packages to a registry (private monorepo) — tags + GitHub Release only.
- **Abort cleanly before §3:** nothing is irreversible until the first tag/push. If the human says no at §2, leave the branch as-is.
- **If a push or merge fails midway:** report exactly what landed (tag created? pushed? merged?) so the human can finish by hand — never silently retry a partial publish.
