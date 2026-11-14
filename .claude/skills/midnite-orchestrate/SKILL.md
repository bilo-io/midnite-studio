---
name: midnite-orchestrate
description: The shared core of every midnite agent group — the run-settings interview (sitrep interval, models, subagent cap, context rotation), the standing worker rules, the shared board, the recurring sitrep with RAM report, context rotation, unsticking stalled agents and wrap-up. Called by midnite-fleet and midnite-swarm (and reached through midnite-agents); not meant to be invoked on its own.
argument-hint: "[called by midnite-fleet / midnite-swarm with: roster of units, worker brief, done criterion, any pre-answered settings]"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, AskUserQuestion, TodoWrite, Agent, ToolSearch, CronCreate, CronDelete, ListAgents, SendMessage, TaskStop
---

The machinery every midnite agent group shares. A **caller** (`/midnite-fleet`, `/midnite-swarm`)
decides *what* runs: it hands over a **roster** of units (a fleet's tasks, a swarm's stages), the
**worker brief** for each unit, and the **done criterion** (a merged PR, a finished stage artifact).
This skill decides *how* they run: it asks the run settings, launches within the cap, watches,
rotates, unsticks, reports, and closes out.

**Conversation style — enforced.** Terse. No preamble, no recap, no narrating intentions. Report
results; bullets and tables over prose; silent on no-op steps.

## 1 · Run settings — one interview page (skip whatever the caller or `$ARGUMENTS` already answers)

One `AskUserQuestion` call, up to four questions, each standalone:

| Question | Options (first is the default, marked `(Recommended)`) |
|---|---|
| **Sitrep interval** | `10 min` · `5 min` · `15 min` · `30 min` |
| **Models** | `Per-unit recommendation` (the caller's table; opus for judgment, sonnet for spec'd builds, haiku for mechanical) · `All sonnet` · `All opus` |
| **Subagent cap** | `Dynamic 2–6` (§3) · `Fixed 2` · `Fixed 3` · `Dynamic, max 3` |
| **Auto-rotation** | `On, 40–60% of window` (§6) · `On, 300k absolute` · `Off` |

Show the per-unit model recommendation in the Models option's description so the choice is
informed. Under Codex or Antigravity, offer the models that CLI exposes instead. Record every
answer on the board (§2) so each tick applies the same numbers.

## 2 · The shared board

Create `<session scratchpad>/BOARD.md` before the first launch: the roster with each unit's model,
worktree and status; the resolved settings; and an append-only log. **The orchestrator owns shared
files** (`_INDEX.md`, the board's roster, any merge into a shared branch); workers append to the
log only. Every cross-agent contract change goes through the board *before* it is written into a
doc or a file.

## 3 · Concurrency cap: dynamic, 2 to 6

The subagent cap is dynamic, never above 6 and never below 2:
- Capacity = the higher of CPU % (`top -l 2 -n 0 -s 1 | grep 'CPU usage' | tail -1`, 100 − idle)
  and RAM % (`memory_pressure -Q | tail -1`, 100 − free).
- Start at 3. Over 80%: −1. Under 60% on two checks in a row: +1. Never below 2 or above 6, and
  never above a user-named max.
- Launch at most the cap, queue the rest in roster order, re-check before every spawn and every tick.
- Over the cap, send the lowest-priority agent `WRAP UP`: it finishes its step, commits (`wip:` if
  mid-change), writes `## HANDOFF`, kills its own dev servers and browsers, and stops. A fresh agent
  resumes it when room frees (§6 step 4).
- Every launch message and every tick carries `🤖 Subagent CAP: <x> (<n> running, <q> queued)`.

## 4 · Launch — at most the cap, in parallel

Spawn one background `Agent` per unit, `model:` from §1, every call for the wave **in one message**.
Each prompt is self-contained (the agent starts with none of this conversation) and is the caller's
worker brief **plus these standing rules**, verbatim in spirit:

- **SCRATCHPAD.md** at its worktree root (or the path the caller names), written before the first
  edit, never committed: goal, decisions and why, done (commit shas), what surprised it, next. Kept
  current after every commit and stage boundary — when an agent dies, this is what survives.
- **A live `## Todo` checklist** in that scratchpad, mirroring its TodoWrite list: one `- [ ]` per
  verifiable step (about 5–12, in order), ticked `- [x]` on commit, new steps appended `(+)`,
  dropped ones struck through, never deleted. The sitrep reads progress and **Doing** from it.
- **Commit after each logical step**, and push where the caller's flow pushes. No attribution
  trailer of any kind on commits.
- **Watch CI to completion** (`gh pr checks <n> --watch`) instead of ending a turn with checks
  pending. A failure in files the PR did not touch is a flake: rerun failed jobs once, then escalate.
- **Visual changes are verified in-thread**: screenshots to `/tmp/midnite-shots-<unit>/`, shown in
  the thread, never committed.
- **Keep context lean**: tail logs (`| tail -80`), read files by range, never dump whole outputs.
- **Obey `CONTEXT ROTATION` and `WRAP UP`**: stop at the next safe point, commit (and push if its
  flow pushes), write `## HANDOFF (read first)` at the top of the scratchpad (goal, decisions and
  why, done, PR/CI state with any failing job's cause, the exact next steps in order, gotchas, files
  that matter), reply `HANDOFF READY <path>` and end its turn. Never merge or remove its worktree
  while handing off.
- **Report at the end**: what landed (PR URL or artifact path), what it left open.

Log each launch on the board. The launch message carries the cap line.

## 5 · Sitrep — recurring until the done criterion holds for every unit

Schedule with `CronCreate` (`recurring: true`) at the §1 interval, or the `loop` skill if that is
already wired up — never both. The cron prompt bakes in everything below so every tick matches.

Each tick, gather read-only, then post:

1. **The table first, nothing above it** — the `midnite-sitrep-table` format: `# | Task | Author |
   Progress | ETA | Diff | Status | Notes`, one row per unit, a clickable PR link once one exists.
   - **Progress** before a PR: `10 + 40 × ticked/total` from the unit's `## Todo`, rounded to 10,
     never the agent's own claim; after: the shared lifecycle scale. Bar + number.
   - **Diff** always `🟩 +a 🟥 -d 📄 f` (PR, or `git diff --shortstat` in its worktree; `—` empty).
   - **ETA** from observed pace: minutes per ticked step × steps left, plus the CI and merge time
     actually seen this session. `?` with no basis, `done` once done.
   - **Notes** six words max: news, a named blocker, or an ask.
2. **One line**: the ETA for the whole batch (parallel rows don't add; a later wave does).
3. Any views the run was set up with (`timeline`, `graph`, …) under `####` headings.
4. **Machine line**: `🩺 CPU <c>% · RAM <r>% → capacity <k>% · 🤖 Subagent CAP: <x> (<n> running, <q> queued)`.
5. **`#### 🩺 Machine`** — a three-line bar chart:
   ```
   CPU  █████░░░░░ 49%
   RAM  ████░░░░░░ 39%
   CAP  ██░░░░ 2/6
   ```

Then act: adjust the cap (§3), launch queued units into free slots, rotate (§6), unstick (§7).

**Read the scratchpads before writing the table.** Their Todo, Done and Next lines are the cheapest
ground truth — evidence, not a claim: cross-check against `git log` and `gh pr` state. A unit with
no checklist is told to write one now. Ticks and commits unmoved for two ticks = **⚠️ stalled**.

## 6 · Context rotation (skip if §1 said Off)

On every tick, measure each live agent's context from the tail of its output file — never the whole
file:

```bash
tail -n 300 "$OUT" | grep '"usage"' | tail -1 \
  | jq '(.message.usage // .usage) | (.input_tokens//0)+(.cache_read_input_tokens//0)+(.cache_creation_input_tokens//0)'
```

Windows: 1M for current Opus and Sonnet, 200k for Haiku (`window=<N>k` overrides). At the band's
lower edge, rotate; past the upper edge, rotate first at its very next safe point:

1. `SendMessage` it `CONTEXT ROTATION`. Wait for `HANDOFF READY`, or check its scratchpad for
   `## HANDOFF` if it is parked.
2. `TaskStop` it once the handoff is on disk. Worktree, branch and PR stay as they are.
3. Launch a fresh agent (no worktree isolation) pointed at the *existing* path: read the repo's
   convention file, then the scratchpad from `## HANDOFF`; continue from its first next step; the §4
   standing rules; the report it owes. It takes the old agent's slot.
4. Log it on the board (`rotated <unit> at <N>k`) and in the row's Notes.

Never rotate mid-merge. The orchestrator's own window is the harness's (`/autocompact <N>k`).

## 7 · Unsticking stalled agents

A background agent can report `completed` having done nothing, or stop mid-poll with CI pending.
Every tick, cross-check external state (`git log`, `gh pr view --json state,mergedAt`,
`gh pr checks`) against what it last said:

- Open PR, CI resolved, agent idle → `SendMessage` it to finish (fix and re-push, or the caller's
  closing steps).
- Re-stalls after one or two nudges → finish the remaining steps yourself.
- Dead and unreachable → read its scratchpad end to end and continue from its **Next** line; never
  restart the unit from scratch.

## 8 · Wrap-up

When every unit meets the done criterion (or a real, reported blocker stands): post a final table,
`CronDelete` the sitrep job (or stop the loop), clean up finished worktrees, and stop. Never leave a
recurring job running past its batch.

---
Autonomous from §4 on. Stop only for a real decision: a unit's genuine blocker (a credential it
lacks, CI it cannot fix after real attempts), a classifier or permission block, or a unit to add
mid-run.
