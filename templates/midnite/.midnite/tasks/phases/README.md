# Phase docs

One file per phase: `phase-<N>-<slug>.md`. Each carries that phase's own checklist (themes,
effort tags, decisions/open questions, a `## Verification` section) and is what `_INDEX.md`'s
`## Phases` table links to.

Every phase doc opens with its framing prose, then a `## Headlines` section — the phase's running
narrative, which used to live in `_INDEX.md` and now lives here so the index stays a status table:

```markdown
## Headlines

*One-line framing.* Why the phase exists, when it was planned, overall status and PR links.

**Theme A — <name>.** ◻ What A is; once it lands, ✅ plus what actually shipped and its PR.

**Theme B — <name>.** ◻ …
```

One lead paragraph at most, then one short paragraph per theme. Landing, refining or verifying a
theme updates its paragraph here and only the phase's row in `_INDEX.md`.

This directory starts empty — `/midnite-ideate` is what turns an item in `_features.md` into
the first phase doc here.
