---
name: midnite-deploy
description: End-to-end release automation combining release-prep and release-complete — verifies preconditions, bumps versions across packages in lockstep, drafts changelog, commits chore(release), tags, pushes, merges release PR to main, and cuts GitHub release.
argument-hint: "[optional: 'major' | 'minor' | 'patch' | 'dry-run']"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

You are running the **deployment and release** pipeline for **this repo**. This skill combines release preparation (version analysis, changelog drafting, lockstep bumping) and release finalization (tagging, merging to main, pushing, and GitHub release creation) into one seamless workflow.

## Release Policy & Constraints

- **Versioning rule:** follow the repo's release scheme (its convention file or release doc) — e.g. whether workspace packages bump in lockstep, and how tags are named.
- **Clean state:** Working tree must be clean before beginning.
- **Verification:** the repo's gate (typecheck, lint, tests) and any version-consistency check it has must pass green.
- **Confirmation:** Halts with a summary before irreversible steps (pushing tags or merging to main) unless `--auto` or explicit user confirmation is given.

---

## 1 · Analyze & Prepare

1. **Check preconditions:**
   - Ensure clean git status: `git status --porcelain` is empty.
   - Fetch tags: `git fetch origin --tags --quiet`.
   - Ensure up-to-date main: `git switch main && git pull --ff-only`.
2. **Find last release & gather commits:**
   - Base tag: the latest release tag under the repo's tag scheme, e.g. `git describe --tags --abbrev=0 --match '<tag-pattern>'` (or `previous = null` if no tags). Do not assume bare `vX.Y.Z`; a repo that shares a release feed with others may namespace its tags.
   - Commits since base: `git log <base>..HEAD --no-merges --format='%H%x09%s%x09%b'`.
   - PR context: query merged PRs via `gh pr list --state merged`.
3. **Determine version bump:**
   - Auto-detect bump level from conventional commits (`breaking` → major, `feat` → minor, `fix` → patch), or honor `$ARGUMENTS` override (`major`/`minor`/`patch`).
   - Bump the target version in every manifest the release scheme covers (e.g. `package.json` files, `Cargo.toml`, `pyproject.toml`).
4. **Draft CHANGELOG.md:**
   - Add new version header: `## [X.Y.Z] - YYYY-MM-DD`.
   - Curate commits into Features, Fixes, Architecture, Documentation sections with PR links.
5. **Verify Lockstep:**
   - Run the repo's version-consistency check, if it has one.

---

## 2 · Review & Go/No-Go Confirmation

Show the release plan:
- Target version: `vX.Y.Z` (bump type: major/minor/patch).
- Curated changelog preview.
- List of packages bumped.
- Pre-release gate results.

Stop for user go-ahead via AskUserQuestion before executing irreversible steps.

---

## 3 · Finalize & Publish

1. **Commit release:**
   ```bash
   git add <the bumped manifests> CHANGELOG.md
   git commit -m "chore(release): vX.Y.Z"
   ```
2. **Tag release:**
   ```bash
   git tag -a "vX.Y.Z" -m "vX.Y.Z"
   ```
3. **Push to origin:**
   ```bash
   git push origin main
   git push origin "vX.Y.Z"
   ```
4. **Publish GitHub Release:**
   - Extract section from CHANGELOG for `X.Y.Z`.
   - Create the release on the repo's forge, with the tag name its release scheme dictates (shown here as `vX.Y.Z`). If releases are published to a different repo or feed, or an updater/installer manifest must be written, follow the repo's release doc for that step.
   - Run:
     ```bash
     gh release create "vX.Y.Z" --title "vX.Y.Z" --notes-file <notes_file>
     ```
5. Report released version, git tag, and GitHub Release URL to the user.
