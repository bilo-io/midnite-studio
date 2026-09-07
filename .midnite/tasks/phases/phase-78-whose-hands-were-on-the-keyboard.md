# Phase 78 — Whose hands were on the keyboard

**Written directly** (no human in the loop — see Decisions) · 2026-09-08 · from a novelty audit:
what this app can do that no other git client can, and where that edge stops one step short.

Midnite Studio's genuinely novel claim is not the graph, the terminal, the browser or the API
client — each has a peer. It is that the app **owns both halves of an agent's work**: the session
the agent ran in ([Phase 15](phase-15-multi-terminal-sessions.md),
[Phase 21](phase-21-agent-roster-and-terminal-identity.md), [Phase 67](phase-67-the-sessions-you-closed.md)
— a roster, a typed `agentId` on every pty, an archived transcript for every closed session) and
the commits that session produced (the graph, the diff, the blame). Councils
([Phase 34](phase-34-agent-councils.md)), loops ([Phase 35](phase-35-fab-mission-control.md)), the
MCP server ([Phase 57](phase-57-mcp-server.md)) and "point an agent at a node"
([Phase 75](phase-75-what-blocks-what.md)) all *start* agents. Nothing in the app can look at a
commit and say **an agent made this** — let alone *which* one, or *in which session*, or *show me
what it was told*.

That is the gap. A git client that renders agent authorship as a first-class fact — in the graph,
in the sessions list, in the dashboard — does not exist, and this app is the only one positioned to
build it, because it already holds the session records every other client would have to guess at.

> **Four findings from the audit. The first is why this is cheap; the fourth is why it is honest.**
>
> **1. The log format reads no trailers.** [`log-parser.ts:20`](../../../packages/git-engine/src/parsers/log-parser.ts):
> `LOG_FORMAT = '%H%x00%P%x00%an%x00%ae%x00%at%x00%ct%x00%D%x00%s'` — sha, parents, author,
> dates, decorations, subject. [`CommitSchema`](../../../packages/shared/src/domain/commit.ts)
> mirrors it exactly. Yet every agent this app runs already signs its commits: Claude Code writes
> `Co-Authored-By: Claude <noreply@anthropic.com>` (this very repository's history is full of it),
> Codex and Antigravity write their own. The provenance is *in the repo*, in every clone, for free —
> the parser simply never asks for it. `%(trailers:key=Co-Authored-By,valueonly)` is one format
> token away.
>
> **2. The roster knows the agents; nothing maps a trailer back to one.**
> [`terminal.ts:201–318`](../../../packages/shared/src/terminal.ts) declares five built-in agents —
> `claude`, `agy`, `codex`, `openclaude`, `opencode` — each with a command and an icon, and none with
> the co-author identity it writes. A `signatures` field per roster entry (emails and display names
> the agent uses in trailers) is the missing join.
>
> **3. Closed sessions carry exactly the fields a join needs.**
> [`ClosedSessionSchema`](../../../packages/shared/src/domain/session-history.ts): `agentId`, `repoId`,
> `cwd`, `createdAt`, `closedAt`, `reason`, and a `transcriptBytes` pointing at an archived
> `scrollback/<id>.bin`. A commit whose `committerDate` falls inside `[createdAt, closedAt]` of an
> agent session on the same `repoId` was *probably* made in it. Probably is the right word, and
> Theme B's vocabulary says it out loud.
>
> **4. There is no write-side fingerprint, and adding one is a consent question.** The broker
> spawns agent ptys with the user's `$SHELL` and no `MSTUDIO_*` environment
> ([`broker/server.ts:560`](../../../packages/desktop/src/broker/server.ts)). Git will not add a
> trailer on its own; a `prepare-commit-msg` hook would, and this repo already runs its own hooks
> through `core.hooksPath .githooks`. But a hook the app installs into a *user's* repository is a
> write into their project, and it is opt-in or it is not built. Theme E is the opt-in.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

**Scope guardrails.** Read-side first, always: Themes A–D need no change to any repository and
work on history that predates this app. Nothing here rewrites a commit, changes an author, or
alters what `git log` says. "Agent-made" is rendered as a *mark*, never as a judgement — the
graph does not dim, sort or hide by it unless the user filters. Attribution below the commit
(which *lines* an agent wrote, in blame) is named in *Not in this phase*.

## Deliverables

### A — Read the trailers (M)

- [ ] Extend `LOG_FORMAT` at [`log-parser.ts:20`](../../../packages/git-engine/src/parsers/log-parser.ts)
      with two more NUL-separated fields: `%(trailers:key=Co-Authored-By,valueonly,separator=%x1f)`
      and `%(trailers:key=Midnite-Session,valueonly,separator=%x1f)`. `%x1f` (unit separator)
      inside a `%x00` field keeps the whole line NUL-delimited — the house rule — while allowing
      several co-authors per commit. Subjects and names still never split on whitespace.
- [ ] `CommitSchema` gains `coAuthors: z.array(z.string())` (each `Name <email>` verbatim) and
      `sessionTrailers: z.array(z.string())`. `parseLogLine` splits the two new fields on `\x1f`,
      dropping empties. Fixture tests: a commit with no trailers, one, three, a trailer whose value
      contains a NUL-free `<`/`>` pair, and a subject that *contains* the literal text
      `Co-Authored-By:` (it must not be mistaken for a trailer — git's own trailer parser handles
      this; the test proves the parser trusts git, not a regex).
- [ ] Measure on `scripts/perf/make-big-repo.sh`'s 50k fixture: `git log` wall time and first-batch
      bytes with and without the two tokens, in the PR body. Trailer parsing is git-side and cheap;
      the number is what makes that a fact rather than an assumption.
- [ ] *Acceptance:* every existing `log-parser.test.ts` fixture still parses; `git log` on this
      repository yields `coAuthors` containing `Claude <noreply@anthropic.com>` on the commits that
      carry it.

### B — A provenance vocabulary, pure and in `shared` (M)

- [ ] `packages/shared/src/domain/provenance.ts` + `.test.ts`:
      ```ts
      export type ProvenanceSource = 'session-trailer' | 'co-author' | 'author' | 'session-window';
      export type CommitProvenance =
        | { kind: 'human' }
        | { kind: 'agent'; agentIds: string[]; source: ProvenanceSource; sessionId?: string }
        | { kind: 'mixed'; agentIds: string[]; source: ProvenanceSource; sessionId?: string };
      export function classifyProvenance(
        commit: Commit,
        roster: readonly AgentSignature[],
        sessions: readonly ClosedSession[],
      ): CommitProvenance;
      ```
      Confidence is an ordered enum, strongest first, and the function returns the strongest
      source that matched: a `Midnite-Session` trailer that resolves to a known session; a
      `Co-Authored-By` whose email or name matches a roster signature; the commit's own author
      matching a signature (an agent committing *as itself*); and last, the session-window join —
      `committerDate ∈ [createdAt, closedAt]` of an agent session with the same `repoId`. `mixed`
      is a human author with an agent co-author — the ordinary Claude Code commit.
- [ ] `AgentSignatureSchema` in [`terminal.ts`](../../../packages/shared/src/terminal.ts) —
      `{ agentId, emails: string[], names: string[] }` — and a `signatures` entry on each of the five
      `BUILTIN_AGENTS`, filled from what each CLI actually writes today (`noreply@anthropic.com`
      for `claude`; the audit did not capture the others — the theme's first task is a one-commit
      probe with each installed CLI, recorded in the PR body). A user-added roster agent gets an
      empty `signatures` and an editable field in `Settings ▸ Agents`.
- [ ] Window-join rules, tested: a session with `reason: 'superseded'` still counts; two overlapping
      agent sessions on one repo yield both `agentIds` and `source: 'session-window'`; a session on
      a different `repoId` never matches even if the timestamps do; a commit older than the oldest
      session is `human` (absent any trailer).
- [ ] *Acceptance:* 100% branch coverage on `classifyProvenance` — it is small, pure, and the
      thing every later theme trusts.

### C — The mark on the row (M)

- [ ] In [`graph-row.tsx`](../../../packages/app/src/features/graph/graph-row.tsx), beside the
      author cell (`:278`) and inside the avatar node variant (`:306–361`): a `ProvenanceMark` —
      the roster agent's icon (the same glyph the terminal tab and the FAB already use) at badge
      size, `mixed` rendered as the agent glyph overlapping the human avatar's corner, `agent`
      rendered in place of the avatar. `human` renders nothing: the mark is the exception, not the
      rule. Tooltip: "Co-authored by Claude" / "Made during *session name* · Claude" /
      "Probably made during *session name*" for the window source — the word *probably* is
      load-bearing and is asserted in the test.
- [ ] Provenance is computed **once per row batch** in the renderer as rows arrive
      ([`graph-store.ts`](../../../packages/app/src/features/graph/graph-store.ts)'s `appendBatch`),
      not in render — `classifyProvenance` over 500 rows against the roster and the repo's closed
      sessions (one `sessionsList` query, cached with react-query, invalidated when a session
      closes). Stored beside the row, not on `GraphRow` — the wire type is main's and provenance is
      a renderer-side join.
- [ ] A filter chip in the graph toolbar: **All · Humans · Agents**, plus a per-agent sub-filter
      when the roster has more than one agent with matches. Filtering follows whatever the graph's
      existing filter infrastructure is (locate it at execution: `grep -rn "filter" packages/app/src/features/graph`
      — Phase 25's search and Phase 7's interactions both touched it); a filtered graph keeps lane
      layout intact and dims non-matching rows rather than removing them, so the shape of history
      stays readable.
- [ ] Commit detail ([`commit-detail.tsx`](../../../packages/app/src/features/commit/commit-detail.tsx))
      gets a **Provenance** line under the author: the same text as the tooltip, with the session
      name as a link (Theme D).
- [ ] Respects `data-motion="reduced"` (no animated badge entry) and density (badge size follows
      the avatar size token). `MSTUDIO_SHOTS` screenshots for the avatar and non-avatar graph themes
      with a mixed-provenance fixture.
- [ ] *Acceptance:* a fixture graph with one human commit, one Claude co-authored commit and one
      window-joined commit renders three distinct states; the Agents filter dims exactly the human
      row; `human` rows have no extra DOM.

### D — The crosswalk: sessions ↔ commits (M)

- [ ] In the Sessions view ([`features/sessions/sessions-view.tsx`](../../../packages/app/src/features/sessions/sessions-view.tsx)),
      each closed agent session row gains a count — "*N* commits" — from the inverse join
      (`commitsForSession(rows, session)` in `provenance.ts`, the same window/trailer rules run the
      other way). Clicking it opens the graph with the Agents filter narrowed to that session's
      SHAs (a `sessionId` facet on the Theme C filter).
- [ ] Commit detail's Provenance line (Theme C) links to the session; the link opens the archived
      transcript through Phase 67's existing reader — the user reads what the agent was told and
      what it printed, one click from the commit it made. No new transcript machinery.
- [ ] A **live** agent session shows the same count for commits made since `createdAt` — the
      count ticks up as the agent works, read from the graph store's rows on each batch. This is the
      one place the mark is *motion*: a session tab whose count just changed pulses once, subject to
      the motion policy.
- [ ] *Acceptance:* close an agent session that made two commits → the Sessions row says "2
      commits" → click → the graph shows exactly those two undimmed → click one → Provenance line →
      the transcript opens. End-to-end in Playwright against `mock-bridge.ts` fixtures extended
      with `closedSessions` and trailer-bearing commits.

### E — The write-side fingerprint, opt-in (S)

- [ ] When the broker spawns a `kind: 'agent'` pty ([`broker/server.ts`](../../../packages/desktop/src/broker/server.ts)
      `create`), set `MSTUDIO_SESSION_ID=<session id>` and `MSTUDIO_AGENT_ID=<agentId>` in the
      child environment. Environment only — no git config, no hook. Any agent, hook or script the
      user already runs can read them; nothing changes if none does. Shell sessions get neither.
- [ ] `Settings ▸ Agents ▸ Stamp commits with the session` — a switch, default **off**, whose
      description says exactly what it does: "Installs a `prepare-commit-msg` hook into this
      repository's hooks directory that adds a `Midnite-Session:` trailer when a commit is made from
      an agent session started here." Per-repo, because a hook is a per-repo write.
- [ ] The hook itself: `packages/desktop/src/main/hooks/prepare-commit-msg.sh`, POSIX `sh`,
      appends `Midnite-Session: $MSTUDIO_SESSION_ID` (and `Midnite-Agent: $MSTUDIO_AGENT_ID`) via
      `git interpret-trailers --in-place` **only if** `MSTUDIO_SESSION_ID` is set and the message
      does not already carry one. Installed by `ensureHook(repoPath)` in a new
      `main/hooks/install.ts`: refuses if `core.hooksPath` is unset *and* `.git/hooks/prepare-commit-msg`
      already exists (never clobber a user's hook — offer the snippet to paste instead), otherwise
      writes into `core.hooksPath` if set, else `.git/hooks/`. Removal is the same function in reverse,
      and the switch off calls it.
- [ ] Theme A's parser already reads `Midnite-Session`; Theme B ranks it strongest. With the switch
      on, the *probably* disappears from Theme C's tooltip for every commit the hook stamped.
- [ ] *Acceptance:* with the switch off, `env | grep MSTUDIO_` inside an agent terminal shows the
      two variables and a commit carries no trailer; with it on, the commit carries
      `Midnite-Session:` and the graph shows `source: 'session-trailer'`; turning it off removes
      the hook and leaves any pre-existing user hook untouched (fixture test with a sentinel hook).

### F — Agent share, on the dashboard (S)

- [ ] A **Provenance** tile on the Dashboard ([`features/dashboard/`](../../../packages/app/src/features/dashboard/)):
      commits in the last 7 / 30 days by `kind` (human / mixed / agent) as one stacked bar, and a
      per-agent breakdown on hover — computed over the loaded graph rows with Theme B, no new IPC.
- [ ] Follows `references/palette.md`'s categorical rules if a dataviz skill is loaded at execution,
      else the graph's own lane palette for agents and the muted foreground for humans; reduced
      motion disables the bar's fill animation.
- [ ] *Acceptance:* the tile's numbers equal the count of rows the Agents filter (Theme C) leaves
      undimmed for the same window.

## Files this phase touches

**A — git-engine + shared**
- [`packages/git-engine/src/parsers/log-parser.ts`](../../../packages/git-engine/src/parsers/log-parser.ts) + test.
- [`packages/shared/src/domain/commit.ts`](../../../packages/shared/src/domain/commit.ts) — two fields.

**B — shared**
- New `packages/shared/src/domain/provenance.ts` + `.test.ts`.
- [`packages/shared/src/terminal.ts`](../../../packages/shared/src/terminal.ts) — `AgentSignatureSchema`, `signatures` on `BUILTIN_AGENTS`.

**C, D, F — app**
- [`features/graph/graph-row.tsx`](../../../packages/app/src/features/graph/graph-row.tsx),
  [`graph-store.ts`](../../../packages/app/src/features/graph/graph-store.ts), the graph toolbar/filter,
  new `features/graph/provenance-mark.tsx` + test.
- [`features/commit/commit-detail.tsx`](../../../packages/app/src/features/commit/commit-detail.tsx).
- [`features/sessions/sessions-view.tsx`](../../../packages/app/src/features/sessions/sessions-view.tsx).
- `features/dashboard/` — one new tile.
- `e2e/mock-bridge.ts` — `closedSessions` and trailer fixtures; new `e2e/provenance.spec.ts`.

**E — desktop**
- [`packages/desktop/src/broker/server.ts`](../../../packages/desktop/src/broker/server.ts) — two env vars on agent spawn.
- New `packages/desktop/src/main/hooks/prepare-commit-msg.sh`, `main/hooks/install.ts` + test,
  a `hooksInstall`/`hooksRemove` channel pair in `shared/src/ipc/channels.ts`, and a switch on
  the Agents settings page.

## Verification

- [ ] `moon run :typecheck :lint :test` green after every theme.
- [ ] **A:** `git log` on this repository shows `coAuthors` populated; the 50k-fixture numbers are
      in the PR body.
- [ ] **B:** full branch coverage on `classifyProvenance`; the probe commits from each installed
      CLI are recorded and their signatures encoded.
- [ ] **C/D:** the Playwright crosswalk spec passes; `MSTUDIO_SHOTS` screenshots for both graph
      node styles with the mixed fixture.
- [ ] **E:** the hook install/remove fixture test, including the never-clobber case.
- [ ] **Open, for a human:** run one real Claude Code session from the app on a scratch repo, make
      two commits, close the session — then find them from the Sessions view, and read the
      transcript from the commit. That round trip is the phase.

## Not in this phase

- **Line-level attribution in blame.** Phase 25's blame gutter could colour lines by the
  provenance of the commit that last touched them — the obvious sequel, and a separate phase because
  blame's per-line model and the gutter's density both need their own design pass.
- **Rewriting history or changing authorship.** Nothing here touches `--amend`, `--author`, or a
  commit's trailers after the fact.
- **Attributing councils and loops as distinct actors.** A council run's synthesizer and a loop's
  recurring session are both `kind: 'agent'` ptys today and are attributed to their `agentId`;
  distinguishing "Claude, in a loop" from "Claude, interactively" is a `sessionKind` refinement for
  Phase 67's schema, not this one.
- **Cross-repo provenance.** Sessions are joined by `repoId`; a session whose agent committed to a
  *different* checkout (a worktree it created itself) is not matched by the window rule. The
  trailer path (Theme E) covers it when opted in.

## Decisions / open questions

- **Resolved — read-side first, and it works on history that predates the app.** Themes A–D
  need nothing from the user's repo but the trailers agents already write. Theme E is last and
  opt-in for that reason.
- **Resolved — *probably* is rendered, not hidden.** The session-window join is a heuristic and the
  UI says so in the tooltip. A provenance mark that overstated its certainty would be worse than
  none.
- **Resolved — provenance is a renderer-side join, not a `GraphRow` field.** Main lays out lanes
  and knows nothing about sessions' relationship to commits; the join needs the roster and the
  session list, both of which the renderer already holds. Keeping it out of the wire type keeps
  Phase 77 Theme B's `GraphRow` change independent of this one.
- **Resolved — the hook never clobbers.** An existing user `prepare-commit-msg` is left alone and
  the switch offers the snippet instead. A settings toggle that overwrote a user's hook would be
  the kind of surprise this repo's own `.githooks/pre-commit` exists to prevent.
- **Open — which signatures do `agy`, `codex`, `openclaude`, `opencode` actually write?** The audit
  confirmed only Claude Code's. Theme B's first task is the probe; the answer may be "none" for some,
  in which case the window join is their only read-side source until Theme E is on.
- **Open — should `mixed` count as agent work in the dashboard tile?** A human author with an agent
  co-author is the ordinary Claude Code commit; calling it "agent" overstates, calling it "human"
  understates. Recommendation: its own segment in the stacked bar, labelled *with an agent*.
- **Open — the filter's dim vs. hide.** Dimming keeps lane layout honest; hiding would need a
  re-layout that lies about parents. Recommendation: dim, always — a hidden-row graph is a different
  feature (a query graph) and would be its own phase.
