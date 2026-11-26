# midnite-build

This repo's package boundaries, its Playwright shots helper, the moon gate and the PR family
(`midnite-pr-description`) are not the target repo's; they become pointers to its AGENTS.md.

<<<<
screenshot visual changes with Playwright, open a PR
====
screenshot visual changes, open a PR
>>>>

<<<<
- `AGENTS.md` = conventions (Claude Code reads them through `CLAUDE.md`) (package boundaries — `shared ◀ git-engine ◀ desktop`, `shared ◀ frame ◀ feature ◀ app`; commit style; pre-push gate). Re-read relevant sections before coding. `docs/INITIAL_PLAN.md` is design source of truth.
====
- `AGENTS.md` = conventions (Claude Code reads them through `CLAUDE.md`) (package boundaries, commit style, pre-push gate, and the project's design source of truth if it names one). Re-read relevant sections before coding.
>>>>

<<<<
- Maintain strict package boundaries:
  - `packages/shared` has wire contracts only.
  - `packages/git-engine` touches git and never imports Electron.
  - `packages/app` communicates with main strictly via `window.midniteStudio`.
- Tests ship with every change:
  - Unit tests with Vitest at the proper layer.
  - Functional tests or Playwright tests where browser capabilities are required.
====
- Maintain the package boundaries `AGENTS.md` sets out.
- Tests ship with every change:
  - Unit tests at the proper layer.
  - End-to-end tests only where a real browser or runtime is genuinely required.
>>>>

<<<<
## 5 · Visual Verification (Playwright Screenshots)

- For visual changes, capture screenshots using Playwright shots helper under `/tmp/midnite-shots-<slice>/`.
====
## 5 · Visual Verification (Screenshots)

- For visual changes, capture screenshots (Playwright or the project's own tool) under `/tmp/midnite-shots-<slice>/`.
>>>>

<<<<
It runs vitest on the changed tests, `tsc --noEmit` per touched package (building `shared` first when needed) and eslint on the changed files. Never the workspace-wide moon gate: it exhausts RAM.
====
It runs vitest on the changed tests, `tsc --noEmit` per touched package and eslint on the changed files (it assumes a JS workspace with those tools; elsewhere run the project's focused equivalents). Leave the full gate to CI.
>>>>

<<<<
- Format PR body using house template (`midnite-pr-description`).
====
- Format the PR body using the repo's PR template, if it has one.
>>>>
