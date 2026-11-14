---
name: midnite-agents-handover
description: Park every running subagent in a midnite agent group cleanly. Each one finishes its current step, commits (`wip:` if mid-change), rewrites its SCRATCHPAD.md with a HANDOFF section above its verbatim brief, kills its own servers and browsers, replies HANDOFF READY and stops. Then the orchestrator checks each handover on disk, stops the agents, pauses the sitrep and posts a resume table. Use when the user says "handover", "hand over", "wrap up the agents", "stop the swarm/fleet", "park the agents", or before a session ends with agents still running.
argument-hint: "[optional: the units or agent names to hand over; default all running]"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, ListAgents, SendMessage, TaskStop, CronList, CronDelete, ToolSearch
---

The clean stop for a `/midnite-agents` group (fleet or swarm). It is the inverse of a launch: every
unit ends with its work committed, its reasoning on disk, and nothing left running, so a fresh agent
can resume it cold.

**Conversation style: enforced.** Be terse. Report results, not intentions. Use one table per report.

## Rules
- **Never merge, never remove a worktree or branch, and never push** unless the unit's own flow
  pushes (a fleet unit with an open PR pushes its branch).
- **Never a blanket `pkill`.** Kill only the PIDs a unit started.
- **SCRATCHPAD.md is never committed.** It stays untracked at the worktree root.
- **Never fabricate a handover.** It counts only when the files on disk prove it, not when the agent
  says so.

## 1 · Roster

Read `<session scratchpad>/BOARD.md` and `ListAgents`. The roster is every running unit, or only the
ones `$ARGUMENTS` names. For each unit, note its agent id, worktree, branch, ports and server PIDs
(from the board or its scratchpad).

## 2 · Send `WRAP UP`, all units in one message

Send one `SendMessage` per unit, all in the same response, with this text (fill in the ports):

> WRAP UP: hand over and stop now.
> (1) Finish only the step you're on. Start nothing new.
> (2) Commit everything in your worktree, as `wip:` if mid-change. Don't merge, and don't remove
>     the worktree or branch.
> (3) Rewrite SCRATCHPAD.md so it opens with `## HANDOFF (read first)`, holding:
>     - the goal;
>     - decisions and why;
>     - done, with commit shas;
>     - gate status so far (tests, types, smoke, parity or perf numbers);
>     - PR and CI state, if any;
>     - the exact next steps in order;
>     - gotchas;
>     - the files that matter;
>     - screenshot and baseline paths.
>     Under it comes `## Brief (verbatim from the orchestrator)`, holding your whole original launch
>     prompt pasted unedited. Your existing notes follow.
> (4) Kill your own servers by PID (ports …) and any browsers you started. Never a blanket pkill.
> (5) Reply `HANDOFF READY <worktree path> <head sha>` and end your turn.

A unit parked in a long background command still gets the message at its next tool round. Wait for
the notifications and don't poll. Meanwhile, mark each row `🤝 handing over` on the board.

## 3 · Check each handover on disk

When a unit replies, or has been silent for 20 minutes, check its worktree:

```bash
W=<worktree>
git -C "$W" status --short | grep -v '^?? SCRATCHPAD.md$'         # must print nothing
git -C "$W" log --oneline -1                                       # matches the sha it reported
git -C "$W" ls-files --error-unmatch SCRATCHPAD.md 2>/dev/null && echo "TRACKED: bad"
head -3 "$W/SCRATCHPAD.md" | grep -q '^## HANDOFF' && echo handoff-ok
grep -q '^## Brief (verbatim from the orchestrator)' "$W/SCRATCHPAD.md" && echo brief-ok
for p in <ports>; do lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null && echo "port $p still up"; done
```

If a check fails, send that unit one precise follow-up naming the failure. If it is dead or still
silent after the follow-up, finish its handover yourself:
- commit its diff as `wip: handover (orchestrator)`;
- write the HANDOFF from `git log main..HEAD`, its scratchpad and its last report, and mark what you
  inferred;
- copy its brief from the board or launch record into the Brief section;
- kill its recorded PIDs.

## 4 · Stop and pause

- `TaskStop` each unit once its checks pass. The worktree, branch and PR stay as they are.
- On the board, set each row to `⏸️ parked @ <sha>` with its scratchpad path, and record the queue
  still waiting.
- Pause the sitrep: copy the recurring job's prompt onto the board under `## Paused sitrep`, then
  `CronDelete` it, so resuming can re-create it word for word.

## 5 · Report

One table, then the cap line and at most one closing line:

| Unit | Head | Tree | HANDOFF | Brief | Servers | Resume from |
|---|---|---|---|---|---|---|
| ⏸️ <name> | `<sha>` <n> commits past main | ✅ clean | ✅ | ✅ | ✅ killed | `<worktree>/SCRATCHPAD.md` |

`🤖 Subagent CAP: <x> (0 running, <q> queued)`

## Resuming later

For each parked unit, launch one fresh background agent, within the cap, with this brief:
- work only in `<worktree>`;
- read the repo's convention file, then SCRATCHPAD.md from `## HANDOFF`, and treat the Brief section
  as the original instruction;
- continue from the first next step without redoing finished work;
- follow the standing worker rules (`/midnite-orchestrate` §4);
- deliver the report the Brief asks for.

Then re-create the sitrep from `## Paused sitrep` on the board and post a sitrep straight away.
