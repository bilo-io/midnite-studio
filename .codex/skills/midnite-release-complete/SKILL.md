---
name: midnite-release-complete
description: Finalise a prepped release/vX.Y.Z branch — verify preconditions, commit chore(release), create the tag(s) per the scheme, push, merge the release PR to main, and cut the GitHub Release from the changelog. The IRREVERSIBLE half of the two-step flow; run only after a human has reviewed the $midnite-release-prep branch.
---

**Invoke with:** (run on the release/vX.Y.Z branch that /midnite-release-prep prepared)

Execute a prepped Midnite Git release: the irreversible half of the two-step flow.
Runs **after** a human has reviewed the `release/vX.Y.Z` branch that
[`$midnite-release-prep`](../midnite-release-prep/SKILL.md) left. Tags, pushes, merges to `main`, and
cuts a GitHub Release — so it **stops for explicit confirmation before the first
irreversible step** and refuses to run if preconditions aren't met.

> ⚠️ **Ported from midnite — release infra doesn't exist here yet.** Midnite Git has no
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
- **On a release branch:** current branch = `release/vX.Y.Z`; derive `X.Y.Z` with `versionFromReleaseBranch` (`git rev-parse --abbrev-ref HEAD`). Not a release branch → tell the user to run `$midnite-release-prep` first.
- **Clean tree:** `git status --porcelain` empty.
- **In sync:** `git fetch origin`; the branch's `main` base isn't ahead in a way that conflicts (rebase/merge `main` first if so).
- **Versions match the branch:** read every `package.json`; for a lockstep release every package is `X.Y.0`; for a patch the bumped package(s) are `X.Y.Z`. The lockstep MAJOR.MINOR invariant holds (run `moon run root:version-check` if ported; otherwise eyeball).
- **Changelog ready:** `extractChangelogSection(CHANGELOG.md, 'X.Y.Z')` returns a section with a non-null `date` (a dated `## [X.Y.Z] - YYYY-MM-DD`) and a non-empty body. An undated/`Unreleased`-only changelog means `$midnite-release-prep` wasn't finished — stop.
- **Green:** `moon ci` passes. (Run it; don't trust a stale cache for the gate.)

## 2 · Plan the tags & show the go/no-go — STOP for the human
- Compute the tag(s): `planReleaseTags(previousVersions, currentVersions)` — `previousVersions` from the last `v*` tag's tree (`git show ‹lastTag›:package.json` etc.), `currentVersions` from the working tree. Expect `['vX.Y.Z']` for a lockstep release or `['‹pkg›@X.Y.Z', …]` for a patch.
- **a direct question to the user** with the full plan and an explicit go/no-go (recommended option = proceed only if every precondition passed): the version, the tag(s), the changelog section that will become the GitHub Release body, and that this will tag + push + merge to `main` + publish a Release. Do **not** proceed without an affirmative.

## 3 · Commit + tag (first irreversible step)
- If `$midnite-release-prep` left version bumps uncommitted (it shouldn't), or the changelog still shows `## [Unreleased]` instead of the dated section, finalise: confirm the bumps are lockstep, move `## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD` (today). Commit `chore(release): vX.Y.Z` with the required `Co-Authored-By` trailer. (Usually the prep branch already has this commit.)
- Create the tag(s) from `planReleaseTags`: `git tag vX.Y.Z` (annotated: `-a -m "vX.Y.Z"`), or each scoped `git tag '‹pkg›@X.Y.Z'`.

## 4 · Publish
- **Push** the branch and the tag(s): `git push origin release/vX.Y.Z` then `git push origin ‹tag›`. (If a tag-triggered release workflow exists — Phase 11+ — a `v*` tag kicks off the desktop build; note its status. Until then, tags are just tags.)
- **Merge to main:** open the release PR if one isn't open (`gh pr create --base main --title 'chore(release): vX.Y.Z' --body …`), wait for CI, then `gh pr merge` — prefer a **merge commit** here so the tagged commit stays on `main`.
- **GitHub Release:** cut it on **this repo** against the tag, with the curated changelog section as the body: `gh release create vX.Y.Z --title 'vX.Y.Z' --notes-file ‹changelog section›` (attach installer artifacts if the desktop build produced them).

## 5 · Re-seed + confirm
- Re-seed an empty `## [Unreleased]` stub above the released section in `CHANGELOG.md` and refresh the compare link (`[Unreleased]: …/compare/vX.Y.Z...HEAD`), if `$midnite-release-prep` didn't. Commit on `main` (`docs(changelog): re-seed Unreleased after vX.Y.Z`).
- Report, terse: the **released version**, the **tag(s)**, the **Release URL** (`gh release view vX.Y.Z --json url`), the merge commit, and that `## [Unreleased]` is reset. Note the desktop-build workflow status if one exists and a `v*` tag was pushed.

## Notes
- **Out of scope:** publishing packages to a registry (private monorepo) — tags + GitHub Release only.
- **Abort cleanly before §3:** nothing is irreversible until the first tag/push. If the human says no at §2, leave the branch as-is.
- **If a push or merge fails midway:** report exactly what landed (tag created? pushed? merged?) so the human can finish by hand — never silently retry a partial publish.
