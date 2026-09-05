# Phase 69 — A tracker that can count

**Fifteen of sixty-nine phase docs disagree with the index about how much work they contain.** Three
phases the index calls **100% done** carry **162 unticked boxes** between them. One phase declares
Themes H and I **twice**, with contradictory stamps. And none of it is caught, because the only
automated check any of the three skills runs asks whether a phase has an index *row* — never whether
that row is *right*.

[`outstanding.md`](../outstanding.md) has recorded the symptom since 2026-09-04 and correctly parked
the cleanup:

> *The fix is per-item verification against the tree, not a bulk tick — which is why it is parked
> here rather than done in passing.*

That is still true, and this phase does **not** do the bulk tick. It builds the check that makes the
drift impossible to re-accumulate, and fixes the three *structural* bugs the check would fail on
before anyone can verify a single item. Ticking 162 boxes against the tree is a separate, slower job
that wants a human; a counter that disagrees with itself is a bug, and this is that bug.

**The numbers, each reproducible in one command.**

- **15 of 69** phases have a doc↔index count mismatch. The extremes:
  [Phase 33](phase-33-installable-app-and-cli-integration.md) — doc `15 done / 44 open`, index
  `44/44`; [Phase 32](phase-32-browser-engine.md) — doc `45 done / 54 open`, index `99/99`;
  [Phase 25](phase-25-search-everywhere.md) — doc `39 done / 64 open`, index `101/101`.
- **Phase 32 declares eleven theme headings for nine letters.** `### H — Dev-companion powers` appears
  at `:279` stamped **`✅ DONE`** and again at `:312` stamped **`✅ PARTIAL`**; `### I — The forge,
  opened in place` appears at `:283` stamped `✅ DONE` and again at `:337` unstamped. Any per-theme
  automation counts both.
- **2 phases have theme-letter drift** between the doc's headings and the index's theme key —
  Phase 25 (`ABCDF` vs `ABCDEF`) and Phase 35 (`ABCDE` vs `ABCDEFGHI`).
- **The drift is live, not historical.** As of writing, Phase 59's doc says `55` done and its index
  row says `44` — a session is ticking the doc faster than the roll-up, which is exactly how the
  other fourteen got here.

**Why this matters more than tidiness.** [`_INDEX.md`](../_INDEX.md) is not a report — it is the
input `/midnite-exec` reads to pick work, and the `%` it picks by is computed from numbers that are
wrong for 22% of the tracker. A phase the index calls done that has 64 open items will never be
picked; a phase whose theme letters disagree will have the wrong theme claimed.

**Builds on.**
- The three skills' existing drift guard —
  [`midnite-brainstorm`](../../.claude/skills/midnite-brainstorm/SKILL.md) Stage 6.3,
  [`midnite-refine`](../../.claude/skills/midnite-refine/SKILL.md) Stage 9.5 — a shell one-liner per
  phase file asserting `grep -qE "^\| \[$n ·"`. It checks **presence only**. This phase is that guard
  finishing its job.
- [Phase 53](phase-53-first-release.md) Theme B's `scripts/version-check.mjs` and its
  `root:version-check` moon task. Same shape, same place, same reason — *"a rule enforced solely by
  the tool that performs the release is a rule that can only be discovered to be broken at the least
  convenient moment."* Substitute "the release" for "the tracker" and the sentence is this phase's
  thesis. See Decision 1.
- [`moon.yml`](../../../moon.yml) — the root project, which has **exactly one task** (`install`).
  Phase 53 adds the second; this adds the third.

**Scope guardrails.**
- **No bulk ticking.** The 162 open boxes in phases 25, 32 and 33 stay open. `outstanding.md`'s
  reasoning holds: each needs verifying against the tree, and a bulk tick would replace a wrong
  number with a confident one.
- **The check is advisory about *content*, strict about *arithmetic*.** It never asserts a box
  *should* be ticked; it asserts that whatever the doc says, the index says the same.
- **No change to the index's format.** Nine columns, newest-first, the theme key below — all as they
  are. The check reads that format; it does not renegotiate it.
- **Node, no dependency.** `scripts/version-check.mjs` is import-free by design so it can run in
  `moon ci` before anything is built; this follows it exactly.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The check (M)

- [ ] Add `scripts/tracker-check.mjs` — **new.** Import-free Node, in the shape of Phase 53's
      `version-check.mjs`, exporting its pure comparison so a test does not have to shell out.
- [ ] **Rule 1 — every phase doc has an index row.** The presence check the three skills already
      run, moved into one place so it stops being three copies of a shell one-liner.
- [ ] **Rule 2 — every index row has a phase doc.** The inverse, which nothing checks today: a row
      whose linked file does not exist renders as a broken link and is invisible to `ls`.
- [ ] **Rule 3 — the counts agree.** For each phase, `- [x]` and `- [ ]` in the doc must equal the
      index row's `done/total`, **excluding** items marked `❌ OUT OF SCOPE` or `⏳ deferred` — the
      same exclusion the skills already specify, implemented once instead of described three times.
      This is the rule that fails on fifteen phases today.
- [ ] **Rule 4 — no duplicate theme letters.** A phase declaring `### H` twice is a bug regardless of
      what the index says, because every per-theme count double-counts it. Fails on Phase 32 today.
- [ ] **Rule 5 — theme letters agree.** The set of `### <Letter> —` headings in the doc equals the set
      of `- ◻ **<Letter>** —` entries in the index's theme key. Fails on phases 25 and 35 today.
      Accept both heading forms — `### A — …` and `### Theme A — …` — since phases 12, 31, 33, 55 and
      64 use the second and both are house style.
- [ ] **Rule 6 — the `Refined: xN` stamp matches the index's `Refined` cell.** The second guard
      `midnite-refine` Stage 9.5 already runs, folded in.
- [ ] **Rule 7 — the progress bar and `%` match the counts.** Ten cells, `█` × `round(done/total × 10)`.
      Cheap to check, and a stale bar is the most visible wrongness in the file.
- [ ] Output is one line per violation, `phase N: <rule> — <expected> vs <actual>`, and a final
      count. A check whose failure output requires opening the file to act on is a check people
      disable.
- [ ] `--fix` for the arithmetic rules only (3 and 7) — recompute `done/total`, the bar and the `%`
      from the doc, which is the source of truth for its own boxes. **Never** `--fix` rules 4 or 5:
      a duplicate theme or a letter mismatch is a human decision about what the phase *is*.
- [ ] Wire as `root:tracker-check` in [`moon.yml`](../../../moon.yml) and add it to `moon ci`,
      beside Phase 53's `version-check`. See Decision 2 on what happens while fifteen phases fail.
- [ ] `scripts/tracker-check.test.mjs`: each rule passes on a well-formed fixture and fails on a
      malformed one; `OUT OF SCOPE`/`deferred` items are excluded from the denominator; both theme
      heading forms parse; `--fix` corrects rule 3 and 7 and leaves 4 and 5 alone.

### B — The three structural bugs it fails on today (S)

- [ ] **Phase 32's duplicate Themes H and I.** `### H — Dev-companion powers (M)` at `:279`
      (`✅ DONE`) and `:312` (`✅ PARTIAL`); `### I — The forge, opened in place (L)` at `:283`
      (`✅ DONE`) and `:337` (unstamped). Same titles, contradictory stamps. Merge each pair into one
      heading and reconcile the stamp against the items beneath it — `◐` is the symbol the index's
      key already uses for partial, and it is what belongs there.
- [ ] **Phase 33's `✅ PARTIAL` where the index says `✅`.** Same fix, same symbol: the doc says
      PARTIAL for B, C and D; `outstanding.md` already names `◐` as the right mark.
- [ ] **Phases 25 and 35's theme-letter drift.** Phase 25's doc has no `### E` heading while the key
      lists E; Phase 35's doc has five themes while the key lists nine. Establish which is right by
      reading the doc — the doc is the source of truth for its own themes — and correct the key.
- [ ] Re-run the check and confirm rules 4 and 5 pass. Rule 3 will still fail on fifteen phases; that
      is Theme C's problem, not a regression.

### C — Making the fifteen honest, without pretending (S)

- [ ] Run `--fix` for the arithmetic. This makes the index's `done/total` match each doc's **actual
      box state** — which for phases 25, 32 and 33 means their `%` **drops** from 100% to something
      truthful. That is the point: an index that says 100% for a phase with 64 open items is not a
      more optimistic record, it is a wrong one.
- [ ] Update each affected phase's `Status` cell to match its new `%`: a phase at 38% is `🔄 WIP`,
      not `✅ DONE`. Nine of the fifteen are currently marked done.
- [ ] Move the three headline phases' entries in [`outstanding.md`](../outstanding.md) from
      *"the index is the accurate record"* to *"the doc is"*, since after `--fix` that is true — and
      the remaining work (verifying 162 items against the tree) stays parked there, unchanged and
      now correctly described.
- [ ] **Do not tick anything.** After this theme the tracker is honest about being incomplete. It is
      not more complete.
- [ ] Add a line to the three skills' drift-guard steps pointing at `moon run root:tracker-check`
      instead of restating a shell one-liner —
      [`midnite-brainstorm`](../../.claude/skills/midnite-brainstorm/SKILL.md) Stage 6.3 and
      [`midnite-refine`](../../.claude/skills/midnite-refine/SKILL.md) Stage 9.5. **Six files**, since
      `.claude/`, `.agents/` and `.codex/` each carry a copy and
      [`CLAUDE.md`](../../../CLAUDE.md)'s three-way sync rule applies.

---

## Files this phase touches

| File | What |
|---|---|
| `scripts/tracker-check.mjs` | **new** — seven rules, `--fix` for the arithmetic two, import-free (A) |
| `scripts/tracker-check.test.mjs` | **new** — one case per rule, both heading forms, the exclusion set (A) |
| [`moon.yml`](../../../moon.yml) | `root:tracker-check`, the third task this project has ever had (A) |
| [`.midnite/tasks/phases/phase-32-browser-engine.md`](phase-32-browser-engine.md) | merge the duplicate H and I; reconcile the contradictory stamps (B) |
| [`.midnite/tasks/phases/phase-33-installable-app-and-cli-integration.md`](phase-33-installable-app-and-cli-integration.md) | `✅ PARTIAL` → `◐` (B) |
| [`.midnite/tasks/phases/phase-25-search-everywhere.md`](phase-25-search-everywhere.md) · [`phase-35-fab-mission-control.md`](phase-35-fab-mission-control.md) | theme-letter reconciliation (B) |
| [`.midnite/tasks/_INDEX.md`](../_INDEX.md) | fifteen rows' counts, bars and `%`; nine `Status` cells; two theme keys (B, C) |
| [`.midnite/tasks/outstanding.md`](../outstanding.md) | the three entries re-described now that the doc is the accurate record (C) |
| `.claude/`, `.agents/`, `.codex/` × `midnite-brainstorm`, `midnite-refine` | the drift-guard step points at the task — six files, per CLAUDE.md's sync rule (C) |
| [`.claude/skills/midnite-exec/SKILL.md`](../../.claude/skills/midnite-exec/SKILL.md) | (**unchanged**) — it reads the index; this phase makes what it reads true (C) |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green, and `moon run root:tracker-check` **exits 0**.
- [ ] Introduce each of the seven violations deliberately, one at a time, and confirm the check fails
      with a line naming that phase and that rule — seven negative tests, because a check that has
      never been seen to fail is not known to work.
- [ ] `--fix` on a doc/index count mismatch corrects the row, the bar and the `%`, and **changes
      nothing in the phase doc** — the doc is the source of truth for its own boxes.
- [ ] `--fix` leaves a duplicate theme letter and a theme-letter mismatch untouched, and still exits
      non-zero for them.
- [ ] A phase whose items are all `❌ OUT OF SCOPE` reports `0/0` and `—`, not a division by zero.
- [ ] Phase 32 has nine theme headings for nine letters, and no theme carries two stamps.
- [ ] After Theme C, phases 25, 32 and 33 show a `%` below 100 and a `🔄 WIP` status, and
      `outstanding.md` describes the remaining work as verification rather than as a discrepancy.
- [ ] The check runs in **under two seconds** over 69 docs — it is in `moon ci`, and a slow check in a
      hot path is a check somebody caches wrongly.
- [ ] `grep -rn "grep -qE" .claude/skills .agents/skills .codex/skills` no longer finds the drift
      one-liner in six places.
- [ ] **Open, for a human:** run `/midnite-exec` and confirm the phase it proposes is one that
      actually has open work. That is the whole point, and it is not assertable from a script.

---

## Not in this phase

- **Ticking the 162 open boxes in phases 25, 32 and 33.** Each needs verifying against the tree.
  `outstanding.md` parked it for that reason and the reason has not changed; this phase makes the
  parking honest rather than resolving it.
- **Auto-generating `_INDEX.md` from the docs.** Tempting, and it would make rules 3, 5, 6 and 7
  unfalsifiable by construction. It would also delete the headline paragraphs, which are hand-written
  and are the most useful prose in the tracker. Decision 3.
- **A `done.md` consistency check.** It is append-only and free-form; there is no invariant to assert
  yet.
- **Enforcing the doc's own structure** (that a phase has `## Verification`, that every theme has at
  least one item). Phase 59's refinement found a doc with **zero** verification checkboxes, so the
  need is real — but it is a lint on prose shape rather than an arithmetic invariant, and it belongs
  with whatever phase next touches the doc template.
- **The `_features.md` cross-reference.** Several phases claim to implement a numbered feature from
  it; nothing checks the numbering. Real, unrelated.

---

## Decisions / open questions

1. **Resolved — a script in `moon ci`, not a stricter skill instruction.** All three skills already
   *tell* a session to run a drift guard, and fifteen phases drifted anyway — because the guard only
   checked presence, and because a rule enforced by the tool that performs the edit is discovered
   broken only by whoever edits next. Phase 53 Theme B makes exactly this argument for the lockstep
   rule and reaches the same place. Two checks, one pattern, one directory.

2. **Open — does `root:tracker-check` land in `moon ci` immediately, or after Theme C?** It fails on
   fifteen phases the moment it exists. *Recommendation:* **land the script in Theme A, wire it into
   `moon ci` at the end of Theme C**, in the same commit that makes it pass. A check that is red on
   arrival gets `continue-on-error` bolted onto it within a week, and then it is decoration. The
   intermediate state is one PR long, and Theme A's own tests prove the script works before it gates
   anything.

3. **Resolved — the index stays hand-written.** Generating it from the docs would make four of the
   seven rules vacuous and would be the obvious move if the index were only numbers. It is not: the
   headline paragraphs are the most-read prose in the tracker and are written per phase, by hand,
   with judgement. A generator would either delete them or need them supplied — at which point it is
   a template, not a generator, and the arithmetic is still worth checking.

4. **Resolved — the doc is the source of truth for its own boxes, and the index for nothing.** When
   they disagree the doc wins, always, and `--fix` only ever rewrites the index. The counter-argument
   is real — `outstanding.md` currently says the *index* is the accurate record for phases 25, 32 and
   33, because work landed without the doc being ticked. But "the index remembers something the doc
   forgot" is not a rule a script can apply; it is a claim about the tree that a human must verify.
   The script asserts internal consistency and leaves the truth question to Theme C's parked note.

5. **Open — should the check also fail on a `🔄 WIP` phase with no theme letters in the WIP column?**
   Phase 56 currently sits `🔄 WIP` with `G` in WIP and `D` in TODO, which is well-formed; a WIP row
   with both columns `—` would mean nothing is claimed and nothing is left, which is either done or
   mis-stamped. *Recommendation:* **warn, do not fail.** It is a smell rather than an inconsistency,
   and the phase has enough hard rules to be getting on with.
