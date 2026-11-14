---
name: midnite-agents
description: Start a group of agents. Asks whether this is a Fleet (separate tasks, one agent each — the default) or a Swarm (one problem, one agent per stage — research, plan, design, refine, dev, review, test, report), runs that mode's interview as option sheets, then launches and posts the first sitrep table. Use when the user wants several agents working at once, says "agents", "fleet" or "swarm".
---

**Invoke with:** [optional: fleet|swarm, then that mode's arguments]

The one entry point for agent groups.

```
/midnite-agents
 ├─ Fleet  → /midnite-fleet   separate tasks, one agent each, each to its own merged PR
 ├─ Swarm  → /midnite-swarm   one problem, one agent per stage, handing work forward
 └─ both   → /midnite-orchestrate   settings, cap, board, sitreps, RAM, rotation, unsticking, wrap-up
```

## 1 · Mode — option sheet (skip if the invocation starts with `fleet` or `swarm`)

One question:
- **Fleet (Recommended)** — several separate phases or tasks at once, one agent and one PR each.
- **Swarm** — one problem, split across research, plan, design, refine, dev, review, test, report.

## 2 · Interview — that mode's pages, then the shared settings page

| Page | Fleet | Swarm |
|---|---|---|
| 1 | Tasks: checkboxes, 16 per page, as many pages as it takes | The problem, in one line or a link |
| 2 | Size per task | Stages: Discovery and Delivery checkboxes |
| last | Run settings (`/midnite-orchestrate` §1): sitrep interval, models with the per-unit recommendation, subagent cap, auto-rotation | same |

Each page is one question call. Questions stand alone, since the human may see only the
dialog.

## 3 · On submit

Invoke the chosen skill with every answer as its arguments, so it skips the questions already
answered. It launches the first wave within the cap and immediately posts the **first sitrep**: the
sitrep table with one row per task or stage (queued ones shown as `⏳ queued`), the
whole-batch ETA line, the machine line with `🤖 Subagent CAP`, and the machine chart. The
recurring sitrep then keeps that shape every tick.
