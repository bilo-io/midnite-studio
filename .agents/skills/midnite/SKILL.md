---
name: midnite
description: The front door to every midnite skill. Reads what you are trying to do from the rest of the prompt, scans the installed skills for the best fits, shows them in a table and asks which to run (three options plus a free-text answer), then hands over to the chosen one. Understands shorthands like -build, -review, -plan, -refine, -design, -agents, -sitrep and -help. Use when the user types bare /midnite, is unsure which midnite skill fits, or a prompt says /midnite followed by a description of the work.
---

**Invoke with:** [-build|-review|-plan|-refine|-design|-agents|-sitrep|-help] [what you want done]

# /midnite: find the right skill, then run it

A router. It does no work of its own: it works out which skill the request is for and runs that
skill with the rest of the prompt as its arguments.

```
/midnite [-shorthand] [text]
 ├─ -help                    → /midnite-help (the skill directory)
 ├─ -<shorthand> (one fit)   → that skill, at once
 └─ text, or nothing         → scan → table → option sheet → chosen skill
```

## 1 · Read the request

Take the invocation's arguments. Split off a leading `-word` shorthand if there is one; the rest is the
**request text**.

| Shorthand | Skill it means | Notes |
|---|---|---|
| `-help` | `/midnite-help` | Always direct. No scan, no sheet. |
| `-build` | `/midnite-build` | `/midnite-build-adhoc` instead when the text names work that is not a phase. |
| `-review` | `/midnite-pr-review` | `/midnite-check-yourself` when the text says "my PR", "self-review" or "check yourself". |
| `-feedback` | `/midnite-pr-feedback` | |
| `-plan` | `/midnite-plan` | `/midnite-plan-fast` when the text asks for a quick or read-only plan. |
| `-refine` | `/midnite-refine` | |
| `-design` | `/midnite-design` | |
| `-agents` | `/midnite-agents` | Also `-fleet` → `/midnite-fleet`, `-swarm` → `/midnite-swarm`. |
| `-sitrep` | `/midnite-sitrep` | `-sitrep graph` and the other views pass through as arguments. |
| `-test` | `/midnite-test` | `/midnite-verify` when the text says "verify" or names a phase. |
| `-triage` | `/midnite-triage` | |
| `-issue` | `/midnite-address-issue` | |
| `-maintain` | `/midnite-maintain` | |
| `-deploy`, `-release` | `/midnite-deploy` | Prep alone → `/midnite-release-prep`. |
| `-pr` | `/midnite-pr-create` | |
| `-retro` | `/midnite-retro` | |

A shorthand with exactly one fit runs that skill straight away (step 5). An unknown shorthand is
treated as part of the request text.

## 2 · Scan the installed skills

List every skill the session can run, with its description:

```bash
for d in .claude/skills/*/ .agents/skills/*/ ~/.claude/skills/*/; do
  f="$d/SKILL.md"; [ -f "$f" ] || continue
  printf '%s\t%s\n' "$(basename "$d")" "$(grep -m1 '^description:' "$f" | cut -c14-)"
done | sort -u -k1,1
```

Leave out `midnite` itself and the internal helpers no one invokes directly
(`midnite-orchestrate`, `midnite-sitrep-*` views, `midnite-pr-description*`); those are reached
through their parents.

Rank the rest against the request text by what the work is, not by matching words: "the
terminal crashes when I resize" is a bug fix (`/midnite-address-issue` or `/midnite-build-adhoc`),
"where are we" is `/midnite-sitrep`, "look at Kurt's PR" is `/midnite-pr-review`. With no request
text at all, rank by what is most often wanted next in this repo: open PRs waiting → review or
sitrep; WIP phases in `.midnite/tasks/` → build; nothing in flight → plan.

## 3 · Show the fits

One table, best first, at most five rows:

| # | Skill | What it does | Why it fits |
|---|---|---|---|
| 1 | `/midnite-build` | Builds the next unblocked phase task to a merged PR | You asked to "ship the terminal fix" |

Keep each cell to a few words.

## 4 · Ask which to run

Ask one question, header `Skill`: the top three rows as options, the best first with
"(Recommended)" after its label, each description saying in one line what will happen. The
automatic "Other" answer is the free-text field: if the user types there, treat it as a new
request and go back to step 2 with it.

**Unattended runs.** When nobody can answer (inside `/loop`, a scheduled run, or a prompt that
says never to stop and ask), skip the question, take the recommended row, and say which skill was
picked and why in one line before running it.

## 5 · Hand over

Invoke the chosen skill with the `Skill` tool, passing the request text (without the shorthand)
as its arguments. From here on that skill's instructions are the ones to follow; this one is done.

## Rules

- Never do the work yourself: always hand over to a skill.
- Never run more than one skill per invocation; a request that needs two gets the first, and the
  table says what comes next.
- If no installed skill fits, say so in one line and offer `/midnite-help`.
