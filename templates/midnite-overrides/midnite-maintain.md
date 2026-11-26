# midnite-maintain

The product name in the description, the package manager's audit command, and the board default (the
kit has none; see docs/TRACKER.md › Settings).

<<<<
sub-skills for Midnite Studio —
====
sub-skills for this repo —
>>>>

<<<<
   - Run `pnpm audit --json` or scan lockfile dependencies against known CVE databases.
====
   - Run the package manager's audit (`npm audit --json`, `cargo audit`, …) or scan lockfile dependencies against known CVE databases.
>>>>

<<<<
   - `file` puts it on the project board (board 8 by default). Nothing is committed.
====
   - `file` puts it on the project board configured in `.midnite/skills.json`, if any. Nothing is committed.
>>>>

This repo's examples (SQLite, git-engine's NUL-delimited parsing, zod-validated IPC) become generic.

<<<<
(e.g. SQLite database indexing, NUL-delimited git stream parsing in git-engine)
====
(e.g. a missing database index, a hot parser)
>>>>

<<<<
   - Audit IPC channels for missing Zod validation envelopes.
====
   - Audit trust boundaries (APIs, IPC, user input) for missing input validation.
>>>>
