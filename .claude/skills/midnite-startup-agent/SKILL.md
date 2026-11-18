---
name: midnite-startup-agent
description: Work with a founder's company in Midnite Startup through the startup_* tools on the midnite MCP server — read the runway, roadmap and fleet projections, make the three small writes the user has allowed, and point them to Updates for the investor update. Use when asked about a company's runway, cash, burn, milestones or fleet projections, or when Midnite Startup is running.
---

# Midnite Startup — agent

Midnite Startup keeps one company's plan: opening cash, cost and revenue lines, milestones, fleet projections, invoices, vendors, and a monthly investor update. An agent reaches the plan through the `startup_*` tools on the `midnite` MCP server. They exist only while Startup is running and only after the user has turned them on in Startup ▸ Settings ▸ Agents.

## Consent

- **Nothing is listed until "Let agents read" is on.** If a `startup_*` call answers "Turn on agent access in Midnite Startup ▸ Settings ▸ Agents.", stop and tell the user where the switch is. Do not retry, and do not work around it by reading the workspace file.
- **The three write tools need a second switch, "Let agents make changes".** Without it only the reads are listed. Never ask the user to turn it on just to save you a step; offer the change in words and let them decide.
- If a call answers "Open Midnite Startup to use this tool.", the app is not running. Ask the user to open it.

## Read first

1. **Start with `startup_summary`.** It gives the company, currency, cash, burn, runway and counts. Everything else is read against it. A `company: null` means setup is not done; say so, and stop.
2. `startup_runway` (optionally a `scenarioId` and `months` of 12, 24 or 36) gives the month-by-month cash.
3. `startup_milestones` (optionally filtered by status), `startup_projections` and `startup_projection` (one, by id) give the roadmap and the fleet models.

## Never invent numbers

- Quote money exactly as the tools return it: `formatted` for people, `minor` plus `currency` when you compute. Minor units are the smallest currency unit, so never guess the exponent.
- If the book is not linked, cash and burn are modelled, not actual. Say which the answer is.
- A figure the tools do not return is a question for the user, not a number to fill in. Label any estimate of your own as an estimate and show the arithmetic.

## Writes (only with the second switch)

- `startup_upsert_milestone` adds or edits a milestone. Read the milestones first and reuse an existing id to edit.
- `startup_upsert_projection` adds or edits a fleet projection. Start from `startup_projection` for the current shape.
- `startup_send_projection_to_runway` turns a projection into plan lines from a start month (`YYYY-MM`). It replaces the lines that projection wrote before, so say what will change, then call it once.
- No tool changes an invoice, a vendor, a contract or the ledger: those post journal entries and stay in the app.
- A write made by an agent shows in the open app right away. Report the `revision` it answers with, and what you changed.

## The investor update

Do not draft or write the investor update through the tools; there is none. Point the user to **Updates** in Startup's rail: New update (last month by default), Draft with AI, review the draft, Accept, then Copy, Save as .md or PDF, or Email draft. A draft is never saved until they accept it. You can help with the facts to mention: read the summary, runway and milestones, and offer the figures to put in the notes box.
