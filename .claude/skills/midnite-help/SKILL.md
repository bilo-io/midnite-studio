---
name: midnite-help
description: A directory of the midnite skills — the hierarchy as a tree, one line each on what it does and when to reach for it, then a short numbered list of things to do next. Read-only. Use when the user types /midnite-help or /midnite -help, or asks which midnite skills exist or how they fit together.
argument-hint: "[optional: a family to zoom into — lifecycle, pr, agents, sitrep, git, release, media]"
allowed-tools: Bash, Read, Glob
---

# /midnite-help: the skill directory

Read-only. Print the tree, the when-to-use notes, and a few next steps. No option sheet.

## 1 · Check the tree against what is installed

```bash
ls -1 .claude/skills .agents/skills ~/.claude/skills 2>/dev/null | grep '^midnite' | sort -u
```

Print the tree below. Any installed `midnite-*` skill missing from it goes under **Other** with
its own description's first clause; any skill in the tree that is not installed is left out. With
an argument, print only that family's branch, in more detail.

## 2 · The tree

```
/midnite                          front door: reads what you want, offers the best skills
├─ /midnite-help                  this directory
│
├─ Lifecycle — one task, idea to merged PR
│  ├─ /midnite-plan               plan a new phase doc, interactively
│  │  └─ /midnite-plan-fast       quick read-only feasibility + PR breakdown, in chat
│  ├─ /midnite-refine             deepen a planned phase until any model can build it
│  ├─ /midnite-design             add visual design and UI specs to a phase doc
│  ├─ /midnite-build              build the next unblocked phase task → merged PR
│  │  └─ /midnite-build-adhoc     same, for work outside the phase tracker
│  ├─ /midnite-test               run and diagnose local test suites
│  ├─ /midnite-verify             verify a phase's checklist, then mark it done
│  ├─ /midnite-maintain           issue triage and repo upkeep loop
│  └─ /midnite-address-issue      pick the best open issue, fix it → PR
│
├─ Pull requests
│  ├─ /midnite-pr-create          open a draft PR (body from -pr-description)
│  ├─ /midnite-check-yourself     self-review your own PR, fix, push
│  ├─ /midnite-pr-review          review someone's PR against repo conventions
│  ├─ /midnite-pr-feedback        act on review comments and failing CI
│  └─ /midnite-pr-audit           does the PR do what was asked?
│
├─ Agents — several at once
│  └─ /midnite-agents             asks which mode, then:
│     ├─ /midnite-fleet           separate tasks, one agent each
│     ├─ /midnite-swarm           one problem, one agent per stage
│     └─ /midnite-agents-handover pass a running group to a fresh session (pending, PR #1232 — not installed yet)
│
├─ Status
│  ├─ /midnite-sitrep             the standing status table (+ graph, ci, timeline… views)
│  ├─ /midnite-triage             open PRs and issues at a glance
│  ├─ /midnite-git-report         what landed over a day, week or month
│  └─ /midnite-retro              themes across a longer window
│
├─ Release and git
│  ├─ /midnite-deploy             prep + complete a release end to end
│  │  ├─ /midnite-release-prep    the reviewable half: version, changelog, branch
│  │  └─ /midnite-release-complete the irreversible half: tag, merge, publish
│  └─ /midnite-git-cleanup        delete branches and worktrees that have landed
│
├─ Media — Media ▸ … pages through the midnite MCP server
│  └─ /midnite-media-*            image, audio, sfx, docs, video, model, map, terrain, sprite, game
│
└─ Setup and safety
   ├─ /midnite-setup              scaffold a brand-new repo on this workflow
   └─ /midnite-sanitize           audit a third-party skill or MCP before installing it
```

## 3 · When to use which

Under the tree, at most six bullets, one line each:

- Not sure → `/midnite <what you want>` and pick from its table.
- An idea → `/midnite-plan`; a planned phase → `/midnite-refine`, then `/midnite-build`.
- A bug or one-off → `/midnite-build-adhoc`, or `/midnite-address-issue` if it is on the board.
- Your PR → `/midnite-check-yourself` before anyone reviews; theirs → `/midnite-pr-review`.
- Several things at once → `/midnite-agents`.
- "Where are we?" → `/midnite-sitrep`.

## 4 · Ask what next

End with a short numbered list of three or four likely next steps for this repo right now (look
at open PRs and open `phase` issues if that is quick), each naming the skill it would
run, then one line: "Reply with a number, or tell me what you want and I'll route it with
`/midnite`." No option sheet here.
