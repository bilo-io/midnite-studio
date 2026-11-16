# The tracker lives on the forge

Planning is tracked as GitHub issues on this repo, never as markdown files in git. `.midnite/tasks/`
and `todo/` are git-ignored: a session may draft a plan there as a scratch file, but a plan exists
only once it is filed as issues. The pre-2026-11 tracker files stay on disk locally as history and
are not updated any more.

| Old file | On the forge |
|---|---|
| `<CATEGORY>/phases/phase-N-<slug>.md` | An issue titled `Phase N — <Title>`, labelled `phase` + `features` / `security` / `issues` |
| A theme (`**Theme X — <name>.**`) | A sub-issue of the phase issue, titled `Phase N · Theme X — <name>` |
| A theme's `- [ ]` deliverables | A task list in the sub-issue body |
| `## Headlines` | The `## Headlines` section of the phase issue body, one paragraph per theme |
| `_INDEX.md` row | The phase issue's card on the GitHub Project board (Status field) |
| `done.md` entry | The closed sub-issue, plus the PR that closed it |
| `outstanding.md` item | An issue labelled `deferred` |
| "Refined: xN" stamp | A `refined-N` label on the phase issue |

## Commands

```sh
# Next phase number: highest open or closed phase issue + 1
gh issue list --label phase --state all --limit 500 --json title \
  -q '[.[].title | capture("^Phase (?<n>[0-9]+)").n | tonumber] | max + 1'

# Index view: every phase with its state
gh issue list --label phase --state all --limit 500 --json number,title,state,labels

# File a phase, then each theme as a sub-issue
gh issue create --title "Phase N — Title" --label phase,features --body-file phase.md
gh issue create --title "Phase N · Theme A — Name" --label theme --body-file theme-a.md
gh api repos/{owner}/{repo}/issues/<phase>/sub_issues -X POST -F sub_issue_id=<theme issue id>

# Read a phase (body + sub-issues)
gh issue view <n> --json title,body,state,labels
gh api repos/{owner}/{repo}/issues/<n>/sub_issues --jq '.[] | {number,title,state}'

# Land a theme: the PR body says `Closes #<theme>`; then refresh the phase's Headlines
gh issue edit <phase> --body-file phase.md
```

The `id` that `sub_issues` takes is the issue's numeric database id (`gh api repos/{owner}/{repo}/issues/<n> --jq .id`), not its number.
