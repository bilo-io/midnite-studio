# `ps` fixtures

Captured `ps -axo pid=,ppid=,stat=,args=` output, trimmed to the rows that
matter, for `agent-process.test.ts`.

Fixtures rather than a live process tree on purpose: the interesting cases are
the ones a working laptop will not produce on demand — a nested agent, two
agents at the same depth, an agent's name appearing as an *argument* — and a
test that reads the machine's real process table asserts whatever happened to be
running when it ran.

Every fixture uses **pid 60000 as the pty's own login shell**, which is the pid
`pty-service.ts` hands the walk. The numeric columns are right-aligned with
leading spaces exactly as header-suppressed `ps` prints them, because that
padding is what `parsePsOutput`'s leading `\s*` exists for. Every row carries a
STAT column (Phase 30 Theme E) — `S+`/`Ss` are the values these fixtures use
for "sleeping" and "session leader", `+` marking a process in its terminal's
foreground process group. `foregroundOf` is the only thing that reads it; the
agent-matching fixtures' STAT values are otherwise arbitrary since nothing else
inspects them.

The command lines are real forms observed on the machine this phase was written
on: Claude Code and `agy` are compiled binaries invoked as a bare name, and
`codex` is a `#!/usr/bin/env node` script, which the process table shows as
`node /opt/homebrew/bin/codex`.

Four more (`ps-foreground-*`, `ps-bare-prompt`, `ps-background-job`) exist for
`foregroundOf`'s own tests, added in Phase 30 Theme E: a single foreground
process, a pipeline (two processes both carrying `+`), a shell alone at its
prompt, and a background job with no `+` at all.
