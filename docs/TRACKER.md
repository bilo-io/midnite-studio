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

## The tracker CLI

Skills call [`scripts/skills/tracker.mjs`](../scripts/skills/tracker.mjs) instead of hand-running the gh
sequences below; [`scripts/skills/lib/forge-tracker.mjs`](../scripts/skills/lib/forge-tracker.mjs) is the
same model as pure functions over an injectable `gh` runner (envelope results, never throws). The agent
still writes the bodies and the Headlines sentences; the CLI does the plumbing. Every command takes
`--json`; every write takes `--dry-run`, which prints the exact gh calls and runs none. `GH_TOKEN`
defaults to the `bilo-io` account's token.

| Command | Does |
|---|---|
| `index [--state open\|closed\|all] [--category C]` | Every phase: category, `refined-N`, themes closed/total, WIP and TODO theme letters |
| `next` | The next free phase number |
| `view <issue>` · `view --phase N` | A phase issue with its theme sub-issues, progress and `## Headlines` |
| `candidates` | Every open theme of an open phase: `ready`, `claimed` (assignee or `wip`), `in PR #n`, or `blocked by #n` (`Blocked by` / `Depends on` in the body, on a still-open issue) |
| `file --phase-body F --theme F… [--category C] [--project N] [--no-board]` | Create the phase issue, each theme, and link each as a sub-issue; each file's first `# ` line is its title. Every new issue is put on the board (board 8 unless `--project` or `$MIDNITE_TRACKER_PROJECT`) as Todo; `--no-board` skips that, and a board failure is a warning that never undoes the filing |
| `link <phase-issue> <theme-issue>` | Link an existing issue as a sub-issue |
| `claim <issue>` | Assign `@me` and add `wip` (created when missing) |
| `tick <issue> --item "text"` | Tick the one open `- [ ]` task containing the text; refuses no match or several |
| `headlines <issue>\|--phase N [--theme X] --text "…"\|--file F` | Replace theme X's paragraph in `## Headlines` (inserted in letter order when absent); without `--theme`, the whole section |
| `refine-stamp <issue>\|--phase N` | Swap any `refined-*` label for `refined-N`, N = current + 1 |
| `close <issue> [--comment "…"]` | Drop `wip`, then close |
| `board <issue> --status S [--project N]` | Set the board card's Status (adding the card). The board is `--project`, else the board the issue is already on (board 8 when it is on several and 8 is one of them), else `$MIDNITE_TRACKER_PROJECT`, else **board 8**, `bilo-io: all repos`, the tracker's board. Several boards without 8 among them is reported as ambiguous, never guessed |

`verify-phase.mjs`, `git-report.mjs` and `pr-audit.mjs` read the phases through the same library.

## The gh calls underneath

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
