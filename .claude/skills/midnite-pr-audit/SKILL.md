---
name: midnite-pr-audit
description: Audit one or more Midnite Studio PRs against everything that asked for them — the user's original request, the phase doc, the GitHub issue and the PR's own claims — and show every contract the PR changes (IPC channels, shared zod schemas, persisted store shapes) as JSON, with real values from its tests. Read-only. Use when the user says "pr-audit", asks whether a PR "adheres to the spec", "does what the phase asked", "violates the original request", or wants to go through a phase's PRs one by one and "see the JSON".
argument-hint: "[PR numbers/URLs, or a phase/theme like '99 E' — one PR, or a pair that ships one change]"
allowed-tools: Bash, Read, Glob, Grep
---

Checks that a PR builds what was asked for, not just what its issue or theme says. A spec is
paraphrased on the way down, from the user's words to the phase doc to the issue to the PR body,
and each paraphrase can drift. This skill reads every layer and reports where they part.

**Read-only.** It posts nothing, commits nothing and touches no phase doc. Fixes are offered at the
end and made only when the user says so.

**Conversation style.** Terse. No preamble, and no narrating the `gh` calls. The report is the
five sections below, in that order, then the questions.

## 1 · Scope

- Take the PRs from `$ARGUMENTS`. A phase or theme (`99 E`) resolves through that phase doc's
  `## Headlines` paragraph, which names the theme's PR.
- **One PR at a time.** A pair is fine when the two ship one behaviour change. A bigger set means
  going one by one: audit the first, and offer the next.
- No arguments means the PRs this session opened, in merge order.

## 2 · Gather every layer, from the top

Fetch them all before writing anything. The repo is `bilo-io/midnite-studio`. When the active
`gh` account is not `bilo-io`, set the token in the same command:
`GH_TOKEN="$(gh auth token -u bilo-io)" gh …`. Never `gh auth switch`.

| Layer | What it is | Where it lives |
|---|---|---|
| **L0 · Request** | the user's own words | this session's transcript (`~/.claude/projects/<cwd-slug>/<session>.jsonl`, the `type=="user"` entries), else the issue as the user first wrote it |
| **L1 · Phase** | the theme's deliverables and its contract row | `.midnite/tasks/phases/phase-<N>-*.md`: `## Headlines`, `## Deliverables` (the `Contract` row), `## Verification` |
| **L2 · Issue** | what the task promised | `gh pr view <n> --json closingIssuesReferences`, then `gh issue view <i> --json title,body,comments` |
| **L3 · PR body** | what the author claims | `gh pr view <n> --json title,body,files,baseRefName,headRefName` |
| **L4 · Code** | what actually ships | the PR's head in its worktree (`git worktree list`, under `.worktrees/`), or `gh pr diff <n>` |

Quote L0 **verbatim** in the report wherever a finding turns on it. Paraphrasing the request is
exactly the failure being checked for.

## 3 · The report

### 3.1 · Contract: what crosses a boundary

Show every boundary the PR changes **as JSON**, in fenced `json` blocks:

- **IPC.** A channel from `packages/shared/src/ipc/channels.ts` (`mstudio:<domain>:<verb>`): the
  `invoke` request and its response, or the pushed event payload. Build the shape from the zod
  schema at the PR's head (`packages/shared/src/*.ts`), not from memory.
- **Persisted state.** A store's persisted blob, with its `version`. Show the before and after of
  any migration the PR adds, for example `ui-store v28 → v29`.
- **On-disk files.** Sidecars, `project.json`, anything main writes. Show one real example.
- **Values.** Real ones, from the PR's tests or fixtures, never invented. Collapse unchanged
  siblings to `{ "…": "unchanged" }`.
- **When it is absent or fails.** Every case that omits a field, rejects or errors, in one list.
- **Before and after** as a table when behaviour differs by platform or by first run versus an
  existing profile.

### 3.2 · Against the specification (L2 and L1)

For each PR, state the verdict up front ("everything asked for is there", or the count missing),
then one bullet per deliverable in the issue and in the phase theme: built, missing, or changed.
Evidence is `file:line` at the PR's head. Check the Verification rows the PR claims are covered,
and say which still need a human pass.

### 3.3 · Drift from the original request (L0)

The numbered findings. This is the part that matters. Look for:

1. **Paraphrase drift.** Compare L0 with L1 with L2 wording on every rule that decides behaviour (a
   default, a limit, a fallback, what counts as "done"). Quote each version side by side.
2. **Asked for and dropped.** Something in L0 that no layer below carries, or that is stored but
   never shown.
3. **Silent gaps.** Cases the code quietly skips, such as a platform, an empty state or a first run.
4. **Claims without evidence.** L3 says "tested" or "unchanged" but L4 shows otherwise, or a test
   is named that does not exist.
5. **Stale words.** Schema doc comments, code comments, the phase doc, `CLAUDE.md`, `AGENTS.md` or
   `GEMINI.md` still describing the old behaviour.
6. **Ruled out, and done anyway.** Anything L0 said to keep, or a package boundary the diff crosses.

Every finding says what the request said, what ships, the consequence, and whose call it is.

### 3.4 · Observations

At most three. Out of scope for this PR but worth a look, such as UX that is correct but looks
wrong. Say plainly that each one is not a regression.

### 3.5 · Close

One line saying whether the PR breaks anything L0 ruled out. Then the decisions the user owes, as
direct questions, and the fixes on offer. Stop there.

## Pitfalls

- **Stacked PRs.** Read the code at the PR's own head, not `main`. A stacked PR's diff is against
  its base branch.
- **The PR body is a claim, not evidence.** Verify each "left alone" and "unchanged" against the
  diff.
- **zsh does not word-split** unquoted variables. Loop over literal lists.
