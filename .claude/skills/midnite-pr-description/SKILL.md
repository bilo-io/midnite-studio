---
name: midnite-pr-description
description: Write the body (and title) of a Midnite Studio pull request in the house template, terse and linked. Use before any `gh pr create`, when amending or rewriting a PR body, when filling the Self-review section, or when the user says "pr-description".
argument-hint: "[PR number, or nothing for the current branch]"
allowed-tools: Bash, Read, Glob, Grep
---

# PR description: the house template

Produces the title and body for a PR in `bilo-io/midnite-studio`. Short and factual: a reviewer
should read it in under a minute. Every `gh` call uses `GH_TOKEN="$(gh auth token -u bilo-io)"`.

## Gather

From the branch: `git log origin/main..HEAD --oneline`, `git diff origin/main...HEAD --stat`, and the
diff itself. From the tracker: the phase doc named by the branch or commits
(`.midnite/tasks/phases/phase-<N>-*.md`, its `## Headlines`), and the linked issue if any. Read the
diff; do not just paraphrase the commit messages.

## Title

```
type(scope): short plain claim (Phase N X) [size · ~effort]
```

Conventional-commit type and scope, then an imperative claim in plain words. The `(Phase N X)` and
`[size · ~effort]` suffixes appear only when they apply (a phase theme; a sized, estimated task).
Keep the claim under about 70 characters.

## Body

Exactly these sections, in this order, and **leave out any that would be empty**:

```markdown
## Why
1–3 lines: the problem, and the phase or theme it closes.

## What landed
- **Bold lead:** one sentence.
- **Bold lead:** one sentence.

## Decisions
Only if any were taken unattended. One bullet each, with the reason.

## Not done
Only if something in scope was left.

## Screenshots
Only for visual changes. Commit-pinned raw URLs; see midnite-pr-description-image.

## Verification
Tests added or changed, plus CI state.

## Self-review
What it found and fixed, or "nothing to fix".
```

## Rules

- **Terse.** About 2 to 3k characters in all. No glossary, no background essay, no "for a
  newcomer" section, no restating the diff file by file.
- **Link everything referable.** Repo files as markdown links to the file on the PR's head
  (`[agent-commands.ts](https://github.com/bilo-io/midnite-studio/blob/<branch>/path)`), PRs and
  issues as `#n`, phase docs as links.
- **Plain claims.** "Menu entries now point at the midnite skills", not "refactors the skill
  indirection layer". A number beats an adjective.
- **Why is the problem**, not the history. **What landed** is outcomes, not a changelog: the bold
  lead is the thing, the sentence is what changed about it.
- **Decisions** records every unattended choice (a default picked, a scope trimmed) with its
  reason, so the reviewer can overrule it. Never invent one to fill the section.
- **Verification** names the tests and the scoped commands run, honestly: local runs are scoped
  (vitest, tsc, eslint) because workspace-wide runs exhaust RAM, and CI is the full gate. Say what
  CI showed, or "CI pending".
- **Self-review** is filled after `midnite-check-yourself` (or `code-review`) has run on the current
  diff, with the severity of each finding and what was done about it. Until then it is omitted.
- No `Co-Authored-By`, `Signed-off-by` or generated-by trailer or footer.
- Never name a reviewer or @-mention anyone in a draft; wrap a stray `@name` in backticks.

## Apply

New PR: hand the title and body to `midnite-pr-create`. Existing PR:
`gh pr edit <n> --title "…" --body-file <file>`. Write the body to a file, not an inline string.
Run `midnite-pr-description-image` when the PR changes what a user sees.
