# midnite-plan

This repo's design doc, package boundaries, example phase rows and board default become generic.

<<<<
- Respect `AGENTS.md` and `docs/INITIAL_PLAN.md` (package boundaries — `shared ◀ git-engine ◀ desktop`, `shared ◀ frame ◀ feature ◀ app`; shared is the wire contract).
====
- Respect `AGENTS.md` (package boundaries, conventions) and the design source of truth it names, if any.
>>>>

<<<<
   | 0 · Scaffold | ✅ | Monorepo, moon/proto, package skeletons | 100% | — |
   | 124 · Apps into modules | ✅ | Merge suite apps into packages/modules | 100% | — |
   | 125 · Animations library | 🔄 | Animation clip library & timeline | 93% | PR pending |
====
   | 0 · Scaffold | ✅ | Repo layout, toolchain, CI | 100% | — |
   | 4 · Search | ✅ | Full-text search over records | 100% | — |
   | 5 · Exports | 🔄 | CSV and PDF export | 93% | PR pending |
>>>>

<<<<
board 8 unless `--project N`, `--no-board` skips
====
the board configured in `.midnite/skills.json` unless `--project N`, `--no-board` skips
>>>>

<<<<
   - What IPC channels or shared zod schemas need adding?
====
   - What API, IPC or shared schema contracts need adding?
>>>>
