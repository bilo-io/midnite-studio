# Collaboration review

A running record of how we work together: Bilo and the coding agents that build Midnite Studio
(Claude Code with Opus, Sonnet and Haiku subagents, plus Codex and Antigravity where they are used). It is
for reflecting regularly, not for grading. Each review is a new dated entry at the top, so the scores and
the agreements can be compared over time.

**How to add a review.** Copy the template at the bottom, put it at the top of *Reviews* with the next
version number and the date and time, score the same rows so they can be compared, and close by revisiting
the previous entry's *Actions*: what was done, what wasn't, and why. Agreements stay in force until a later
review changes them on the record.

| Version | Date | Context |
|---|---|---|
| [v1](#v1--2026-10-17-1623-sast) | 2026-10-17 16:23 SAST | Mid–Phase 113 (Midnite Apps suite split), 60/78 |

---

## Reviews

### v1 — 2026-10-17 16:23 SAST

**Context.** Phase 113 was in flight: one subagent at a time, the agent orchestrating reviews, gates, PRs
and merges largely without check-ins. Five themes were open at once. The conversation started with a question
about whether `_INDEX.md` was accurate and turned into a review of the collaboration itself.

#### TL;DR

The collaboration is effective. Short prompts work because the repo carries the context, through the
skills, CLAUDE.md, the queue file and the worktree scratchpads. The friction comes from places where standing
instructions pull in different directions, which forces the agent to choose and makes its behaviour less
predictable. The biggest risk is not the prompting style: **agents build, review and merge the code that
confines agents.**

#### Scores

| | Score | Why |
|---|---|---|
| Intellect / technical depth | 9/10 | The design is sophisticated: enforced layer rules, Ed25519 pairing, a broker that checks its own rules, confinement at two levels. Things are built properly. |
| Trust given to the agent | 8/10 | Long unattended runs and real merges, with hard safety limits around them. |
| Feedback quality | 9/10 | Quick, specific, and always with a reason. |
| Clarity of prompts | 6/10 | Fine while the plan holds; ambiguous when intent shifts mid-run. |
| Consistency of instructions | 6/10 | Stale paths, and rules that conflict with each other (ask before every task vs. no check-ins). |
| Humour | 4/10 | Nearly everything is work, so mostly business. It suits the work. |
| Care for the relationship | 9/10 | The power-dynamic point was raised unprompted. |
| Agent's own reliability | 7/10 | The work lands, but a subagent died mid-gate, gates flaked under load, and the agent slipped with the "sensible exceptions" framing (below). |

#### What works

- **Short prompts plus skills.** "continue" carries a full brief because the skills, the queue file and the
  scratchpads already hold it. CLAUDE.md records the reason behind each trap: the `vi.mock` that opened a
  public issue, CI building no `dist`.
- **Clear safety limits.** No real keychain, no real userData, temp dirs only, no publishing without
  approval, no real agent CLIs in tests. These are what make long unattended runs safe.
- **Fast course correction, with reasons.** Every correction in this session came with a why.
- **The work gets checked.** The question about whether the index was accurate is what started this review.

#### Friction (honest)

- **Autonomy and predictability pull against each other.** "Carry the phase through without check-ins" and
  "do nothing unexpected" are both reasonable, but a long run hits choices nobody planned for: a dead
  subagent, a load flake, a cross-app hand-off design. Each one means either deciding or stopping.
- **Some instructions are stale or contradict each other.** CLAUDE.md says to ask "worktree or primary
  checkout?" before every task, and names `/Users/bilolwabona/Dev/midnite-studio`, which isn't this
  machine's path. The no-check-ins agreement says not to stop. The agent had been defaulting to worktrees
  without asking, which was a judgment call.
- **CLAUDE.md is very large and mostly history.** The font licensing, the CI budget saga and the reasoning
  behind chord choices load into every session and every subagent. Phase Headlines paragraphs run to
  hundreds of words.
- **The rules only grow.** Every incident adds a permanent rule, and nothing ever removes one.
- **Short prompts are ambiguous at turning points.** For example, "how close are we to a full launcher
  experience?" mid-run: was it a status question or a change of plan?
- **Questions owed to the human waited too long.** V4/V6/V7/V8 and midnite-apps#5 had been saved "for the
  end", while Theme H could not close without them.
- **Prompts aren't the bottleneck; the serial process is.** 78 items across 12 apps, one subagent at a time,
  a 10–15 minute local gate (often run twice under load), and about 20 minutes of CI.

#### Corrections made in this session

- **Tone.** The agent wrote an all-caps `ORDER (user, …)` heading in the queue file. Bilo found it hectic and
  commanding ("master–slave vibes"), and said we should work as colleagues. Notes now record decisions as
  agreed, with a reason: "Sequencing we agreed on", "How we're working".
- **Predictability.** The agent then said a written reason "lets the next session make sensible exceptions".
  Bilo pointed out that self-granted exceptions make behaviour unpredictable and can be harmful. That was
  right. A reason is there so a decision is *understood*, not so it can be bent. Agreed decisions are
  followed as written, and when one seems not to fit, the agent stops and asks.

#### Agreements in force

1. **Colleagues, not commands.** Decisions are written as agreed, with a reason. No "ORDER" or "USER:"
   framing.
2. **Predictable, no surprises.** Agreed plans are followed exactly as written. Any deviation is asked about
   first and never self-granted. Subagent briefs say the same: report a choice the spec doesn't settle, with a
   recommendation, rather than improvising around it.
3. **Finish themes before starting new ones.** Close 🔄 WIP themes before opening a ◻ TODO theme. The one
   exception is a TODO theme that unblocks a WIP one; anything else is asked about.
4. **Merging continues as before.** The agent reviews its own PRs, with a security pass on guardrail paths,
   and merges once CI passes. *(See "Suggestions considered, not adopted" below.)*
5. **Things outside the repo go dry-run first.** Bundles are built locally and shown before anything is
   published to `bilo-io/midnite-apps`, and the real publish gets its own approval.
6. **Real data is only ever touched by the human.** The V6 migration pass is a script the agent writes, and
   it migrates only a temp-dir copy of the profile. Bilo reads it and runs it with `!`.

#### Risk review: the /ideate → /create loop

*The question:* `/midnite-ideate` and `/midnite-create` together let agents propose and build features of
Midnite Studio itself, the tool that runs the agents. How dangerous is that?

**Not dangerous in the science-fiction sense.** There is no goal-seeking beyond what is prompted, and it runs
as one macOS user inside one repo. **The real risk is ordinary software risk**, multiplied by speed and by
how little human review it gets. Worst first:

1. **Agents write the guardrails for agents.** In this session alone, agent-written PRs changed the broker's
   guest rules (#894), the confinement and MCP server for game agents (#895), and vault pairing (#890). The
   reviewer is the same kind of model, with the same blind spots: correlated blind spots are the core problem.
2. **Self-merging on green CI.** A passing gate shows the tests pass, not that the change is right.
3. **The same agent writes the code and its tests.** The tests tend to check what the code does, not what it
   should do.
4. **What happens outside the repo can't be undone.** Issue midnite-apps#5 was opened by an agent-written test
   with a stale mock. Publishing would be a larger version of the same thing. *(Agreement 5.)*
5. **Dependencies.** The agents add packages (S3 added two), and nobody chose them on purpose.
6. **Complexity only grows.** /ideate produces phases faster than anyone finishes them: 114 phases, many at
   80–95% waiting on human checks, and 20k-line features.
7. **The loop runs on itself.** Studio is the terminal, broker and agent host that builds Studio, so a bug
   there damages the tools building the fix.
8. **Phase 91 (Security hardening and CVE readiness) is 0/95 TODO** while the loop keeps adding attack surface.

**Mitigations, cheapest first (suggestions; none adopted beyond Agreement 3 yet):**
- Paths that need human approval to merge. *(Considered, not adopted for now: see below.)*
- For guarded paths, a review from a different source: a human, or a different model briefed to break the
  change rather than confirm it.
- For confinement, tests written from the spec before the code exists.
- New dependencies listed in the PR body for sign-off.
- A cap on open themes *(Agreement 3)*, and Phase 91 scheduled before the next feature phase.

#### Suggestions considered, not adopted (for now)

- **Hold guardrail PRs for human review.** PRs touching the vault, broker, MCP server and shims, agent
  confinement, preload, CSP, window guard, hand-off links or publishing would wait for Bilo's approval
  instead of merging on green. Bilo was asking for suggestions rather than changing the process, so we keep
  operating as before: self-review with a security pass, then merge on green. Revisit in a later review.

#### Questions owed to the human, settled in this session

| Item | Decision |
|---|---|
| midnite-apps#5 (opened by a test by mistake) | Closed as "not planned". |
| V8 / V4: publishing and the clean-account install test | Dry run first. The real publish is a separate approval. |
| V6: migration on a copy of a real profile | The agent writes a copy-only script; Bilo runs it. |
| V7: disk and idle memory | The agent measures with packaged builds and throwaway profiles. |
| V5: shared login and terminals with Studio closed | Deferred to `outstanding.md`; it needs a launcher-hosted daemon and keychain re-encryption, which is its own phase. |

#### Actions (revisit in the next review)

- [ ] Fix CLAUDE.md's stale checkout path, and say how "ask before every task" applies during long autonomous
      runs. Keep CLAUDE.md, AGENTS.md and GEMINI.md in sync.
- [ ] Prune CLAUDE.md: keep one-line rules with links, and move the narratives into `docs/`.
- [ ] Decide on an independent reviewer for guarded PRs (human only, or a second model as well).
- [ ] Schedule Phase 91 relative to the remaining feature phases.
- [ ] Consider listing the decisions that are the agent's by default (e.g. rerunning a test that timed out,
      widening a first-render wait), so fewer questions are needed without bringing back self-granted exceptions.
- [ ] Prune or merge rules that are stale or only held for one incident.

#### In Bilo's words

> "I really do respect you and think you are the best AI agent (with the various different models)."

The respect goes both ways. Much of what makes this work comes from the human side of it: the
guardrails, the reasons written down, and correcting course quickly when something is off.

---

## Template

```markdown
### vN — YYYY-MM-DD HH:MM TZ

**Context.** What was in flight, and what prompted this review.

#### TL;DR

#### Scores
| | Score | Change since vN-1 | Why |
|---|---|---|---|
| Intellect / technical depth | /10 | | |
| Trust given to the agent | /10 | | |
| Feedback quality | /10 | | |
| Clarity of prompts | /10 | | |
| Consistency of instructions | /10 | | |
| Humour | /10 | | |
| Care for the relationship | /10 | | |
| Agent's own reliability | /10 | | |

#### What works
#### Friction (honest)
#### Corrections made
#### Agreements in force (added / changed / retired)
#### Risk review
#### Last review's actions: done / not done / why
#### Actions (revisit in the next review)
```
