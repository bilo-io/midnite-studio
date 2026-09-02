---
name: midnite-triage
description: Read-only forge triage — one markdown summary table of the open PRs (and optionally issues), each row a clickable link with emoji status marks for checks, review state, mergeability and age. Changes nothing.
---

**Invoke with:** [prs | issues | all] [--repo owner/name]

A **read-only** snapshot of what the forge is holding, as one table you can scan in a
second. Look, tabulate, touch nothing.

**Style:** terse. Emit the table and the one-line footer, nothing else — no preamble, no
narration of the `gh` calls, no per-PR prose under the table.

## 0 · Hard constraint — read-only

This skill **never** writes. No `gh pr review`, `comment`, `merge`, `close`, `edit`,
`ready`, `label`; no `git push`, `commit`, `rebase`; no file edits. If the surrounding
loop asked for a fix, the fix is *not* this skill's job — report the row and stop.

`allowed-tools` drops `Write` and `Edit` to make that cheaper to honour, but it is not a
guarantee: `Bash` is here for `gh pr list`, and `gh` can merge as easily as it can list.
The constraint above is the real one, and it is on you.

## 1 · Scope

`$ARGUMENTS` may name `prs`, `issues` or `all` — default **`prs`**. `--repo owner/name`
overrides the repo; otherwise use the current checkout's default remote.

## 2 · Gather

One batched query per section, not one per item:

```sh
gh pr list --state open --limit 100 \
  --json number,title,url,author,isDraft,createdAt,updatedAt,mergeable,reviewDecision,statusCheckRollup,labels,additions,deletions
```

```sh
gh issue list --state open --limit 100 \
  --json number,title,url,author,createdAt,updatedAt,labels,assignees
```

Derive per PR:

- **Checks** — roll `statusCheckRollup` up to one of pass / fail / pending / none.
- **Review** — `reviewDecision`: `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`, or none.
- **Mergeable** — `MERGEABLE`, `CONFLICTING`, `UNKNOWN`.
- **Age** — whole days since `createdAt`.
- **Bot** — author login ending `[bot]`, or `dependabot` / `renovate`.

## 3 · The marks

One glyph per state, used consistently — the legend is the footer, so the table needs no
words in these columns.

| Column | Marks |
| --- | --- |
| Checks | ✅ green · ❌ failing · 🟡 pending · ⚪ none |
| Review | 👍 approved · 🔴 changes requested · 👀 review required · ⚪ none |
| Merge | 🟢 mergeable · ⚔️ conflicting · ❔ unknown |
| Kind | 🤖 bot (dependabot/renovate) · 👤 human · 📝 draft |
| Age | 🕐 <2d · 🕒 2–7d · 🕗 >7d |

## 4 · The table

Every PR number is a **clickable markdown link** to its URL — `[#123](https://…)` — never a
bare `#123`; the whole point is that a row can be opened from the report.

```markdown
| PR | Title | Kind | Checks | Review | Merge | Age | Δ |
| --- | --- | :-: | :-: | :-: | :-: | :-: | --- |
| [#123](https://github.com/o/r/pull/123) | feat(area): … | 👤 | ✅ | 👍 | 🟢 | 🕐 1d | +82/−14 |
| [#124](https://github.com/o/r/pull/124) | chore(deps): bump vite | 🤖 | ❌ | 👀 | 🟢 | 🕒 4d | +9/−9 |
```

Sort **most actionable first**: green-and-approved (ready to land) → failing checks →
changes requested → awaiting review → drafts. Truncate titles at ~48 chars with `…`.

For `issues` / `all`, add a second table under an `### Issues` heading with
`| Issue | Title | Labels | Assignee | Age |`, same linking rule.

## 5 · Footer

Exactly three lines after the table(s):

1. **Counts** — `12 open · 3 ready to land · 2 failing · 4 awaiting review · 3 bot`.
2. **Legend** — the marks actually used in this run, inline.
3. **Recommendation** — one sentence naming the single highest-value next action, as a
   suggestion only (this skill does not take it).

If a section is empty, say so in one line (`No open PRs.`) and skip its table.
