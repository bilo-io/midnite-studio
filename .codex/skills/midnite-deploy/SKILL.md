---
name: midnite-deploy
description: End-to-end release automation combining release-prep and release-complete — verifies preconditions, bumps versions across packages in lockstep, drafts changelog, commits chore(release), tags, pushes, merges release PR to main, and cuts GitHub release.
---

**Invoke with:** [optional: 'major' | 'minor' | 'patch' | 'dry-run']

You are running the **deployment and release** pipeline for **Midnite Studio**. This skill combines release preparation (version analysis, changelog drafting, lockstep bumping) and release finalization (tagging, merging to main, pushing, and GitHub release creation) into one seamless workflow.

## Release Policy & Constraints

- **Lockstep rule:** Every workspace package shares the same `MAJOR.MINOR` version (e.g. `0.0.x`).
- **Clean state:** Working tree must be clean before beginning.
- **Verification:** `moon run :typecheck :lint :test && moon run root:version-check` must pass green.
- **Confirmation:** Halts with a summary before irreversible steps (pushing tags or merging to main) unless `--auto` or explicit user confirmation is given.

---

## 1 · Analyze & Prepare

1. **Check preconditions:**
   - Ensure clean git status: `git status --porcelain` is empty.
   - Fetch tags: `git fetch origin --tags --quiet`.
   - Ensure up-to-date main: `git switch main && git pull --ff-only`.
2. **Find last release & gather commits:**
   - Base tag: `git describe --tags --abbrev=0 --match 'v*'` (or `previous = null` if no tags).
   - Commits since base: `git log <base>..HEAD --no-merges --format='%H%x09%s%x09%b'`.
   - PR context: query merged PRs via `gh pr list --state merged`.
3. **Determine version bump:**
   - Auto-detect bump level from conventional commits (`breaking` → major, `feat` → minor, `fix` → patch), or honor `$ARGUMENTS` override (`major`/`minor`/`patch`).
   - Bump target version across `package.json` in root and all workspace packages (`packages/*`, `apps/*`).
4. **Draft CHANGELOG.md:**
   - Add new version header: `## [X.Y.Z] - YYYY-MM-DD`.
   - Curate commits into Features, Fixes, Architecture, Documentation sections with PR links.
5. **Verify Lockstep:**
   - Run `node scripts/version-check.mjs`.

---

## 2 · Review & Go/No-Go Confirmation

Show the release plan:
- Target version: `vX.Y.Z` (bump type: major/minor/patch).
- Curated changelog preview.
- List of packages bumped.
- Pre-release gate results (`moon run :typecheck :lint :test`).

Stop for user go-ahead before executing irreversible steps.

---

## 3 · Finalize & Publish

1. **Commit release:**
   ```bash
   git add package.json packages/*/package.json apps/*/package.json CHANGELOG.md
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
   - Run:
     ```bash
     gh release create "vX.Y.Z" --title "vX.Y.Z" --notes-file <notes_file>
     ```
5. Report released version, git tag, and GitHub Release URL to the user.
