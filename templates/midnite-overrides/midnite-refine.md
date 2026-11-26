# midnite-refine

This repo's design doc and its package boundaries become the target repo's own (via AGENTS.md).

<<<<
  [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md) is the design source of truth.
====
  The design source of truth is whatever `AGENTS.md` names, if anything.
>>>>

<<<<
- Respect `CLAUDE.md` boundaries (`shared ◀ git-engine ◀ desktop`, `shared ◀ app`; git-engine is
  electron-free; the renderer only reaches main via `window.midniteStudio`; NUL-delimited parsing; the
  per-repo write queue; `GitOpResult` envelopes). A refinement that would need a boundary exception
  is wrong — refine it into an IPC channel instead.
====
- Respect the boundaries and conventions `AGENTS.md` sets out. A refinement that would need a
  boundary exception is wrong — refine it into the sanctioned seam instead.
>>>>

<<<<
| Testing & verification | The layer (vitest in git-engine vs RTL vs Playwright), the named spec file, the exact assertion, the fixture, what the mock bridge must learn |
====
| Testing & verification | The layer (unit vs component vs end-to-end), the named spec file, the exact assertion, the fixture, what any mock must learn |
>>>>
