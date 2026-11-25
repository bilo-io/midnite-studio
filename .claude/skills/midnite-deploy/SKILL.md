---
name: midnite-deploy
description: End-to-end release automation combining release-prep and release-complete — verifies preconditions, bumps versions across packages in lockstep, drafts changelog, commits chore(release), tags, pushes, merges release PR to main, and cuts GitHub release.
argument-hint: "[optional: 'major' | 'minor' | 'patch' | 'dry-run']"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

You are running the **deployment and release** pipeline for **Midnite Studio**. This skill combines release preparation (version analysis, changelog drafting, lockstep bumping) and release finalization (tagging, merging to main, pushing, and GitHub release creation) into one seamless workflow.

## 0 · Run the script first

Run `node scripts/skills/release-prep.mjs [major|minor|patch|ephemeral]` for step 1, then `node scripts/skills/release-complete.mjs [ephemeral]` for step 3. The first prints the read-only plan, the second the precondition check; the irreversible steps run only with `--confirm vX.Y.Z` and `--verify vX.Y.Z` checks the result. The go/no-go gate in step 2 stays yours and the user's; never pass `--confirm` without it. Add `--no-llm` for the fully offline path (deterministic text, no Ollama). If the script errors or is unavailable, fall back to the manual steps below, which stay in place.

## Release Policy & Constraints

- **Two steps, one human gate.** A release is `release-prep.mjs` (reversible: branch, bumps, changelog, a release PR) → a human reviews that branch → `release-complete.mjs` (irreversible: tag, push, GitHub Release). This skill chains them and never collapses them. It never pushes `main` directly and never cuts a single `vX.Y.Z` tag by hand: the tag scheme (lockstep `vX.Y.Z`, a patch's scoped `pkg@X.Y.Z` tags plus a final plain tag) is `planReleaseTags`, run by the script.
- **Lockstep rule:** Every workspace package shares the same `MAJOR.MINOR` version (e.g. `0.0.x`).
- **Clean state:** Working tree must be clean before beginning.
- **Verification:** the repo's release gate (`moon ci`, plus `moon run root:version-check`) must pass green; `release-complete.mjs` refuses without `--gate-confirmed`.
- **Irreversible-step guards:** nothing tags or pushes without `--confirm vX.Y.Z` (the exact tag) after the human has reviewed the release branch; the plain `vX.Y.Z` tag is created last and pushed alone; a failed step stops the run and is never retried blindly. Merging the release PR stays a human step.

---

## 1 · Prepare (reversible)

1. Read the plan: `node scripts/skills/release-prep.mjs [major|minor|patch|ephemeral]` (read-only: preconditions, base tag, commits, bump level, next versions, tags, drafted changelog). An `$ARGUMENTS` bump overrides the detected level.
2. Create the release branch: `node scripts/skills/release-prep.mjs [level] --apply` (creates `release/vX.Y.Z`, bumps every `package.json` in lockstep, writes the changelogs, runs version-check, commits `chore(release): prepare vX.Y.Z`).
3. Push the branch and open the release PR as a draft; it is the human's review surface. Nothing has been tagged or merged.

---

## 2 · Go/No-Go (human gate)

Show the release plan: target version `vX.Y.Z` and bump type, the curated changelog, the packages bumped, the tags `release-complete.mjs` would create, and the release gate result. Stop for the user's go-ahead via AskUserQuestion before any step below. Never pass `--confirm` without it.

---

## 3 · Finalize (irreversible)

1. Check and plan, changing nothing: `node scripts/skills/release-complete.mjs [ephemeral] --gate-confirmed`.
2. After the go-ahead: `node scripts/skills/release-complete.mjs [ephemeral] --gate-confirmed --confirm vX.Y.Z` (tags and pushes; it prints the steps that landed).
3. Merge the release PR by hand (a human step), cut the GitHub Release from the changelog section as `/midnite-release-complete` §4 describes, then verify: `node scripts/skills/release-complete.mjs --verify vX.Y.Z`.
4. Report the released version, the git tags and the GitHub Release URL to the user.
