# `ps` fixtures

Captured `ps -axo pid=,ppid=,args=` output, trimmed to the rows that matter, for
`agent-process.test.ts`.

Fixtures rather than a live process tree on purpose: the interesting cases are
the ones a working laptop will not produce on demand — a nested agent, two
agents at the same depth, an agent's name appearing as an *argument* — and a
test that reads the machine's real process table asserts whatever happened to be
running when it ran.

Every fixture uses **pid 60000 as the pty's own login shell**, which is the pid
`pty-service.ts` hands the walk. The numeric columns are right-aligned with
leading spaces exactly as header-suppressed `ps` prints them, because that
padding is what `parsePsOutput`'s leading `\s*` exists for.

The command lines are real forms observed on the machine this phase was written
on: Claude Code and `agy` are compiled binaries invoked as a bare name, and
`codex` is a `#!/usr/bin/env node` script, which the process table shows as
`node /opt/homebrew/bin/codex`.
