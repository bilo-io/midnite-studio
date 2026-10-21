# Phase 116 Theme A — Collapse the 36-package `gate-node` tax

## Task & Scope
- Deliverables:
  1. Add workspace-level Vitest multi-project configuration (`vitest.node-gate.config.ts`, wired as `moon run root:test-node`) registering 35 node-portable packages in `NODE_PROJECTS` (from `scripts/gate-projects-check.mjs`, excluding `app` which runs in `gate-node-app-test`) plus `scripts/**/*.test.mjs` as Vitest projects. Single Vitest boot sharing one worker pool.
  2. Add `root:lint-all` task in `moon.yml` running `pnpm exec eslint . --cache --cache-location .moon/cache/eslint/` once across workspace.
  3. Add batched `root:typecheck-node` task in `moon.yml` covering the 36 `NODE_PROJECTS` packages without moon's sequential 36-task process-spawn overhead.
  4. Update `.github/workflows/ci.yml`'s `gate-node` job to invoke the consolidated root tasks (`root:typecheck-node`, `root:lint-all`, `root:test-node`), preserving individual per-package tasks in `.moon/tasks/typescript.yml`.
  5. Verify locally: `moon run root:gate-projects-check`, `moon run root:test-node`, `moon run root:lint-all`, `moon run root:typecheck-node`, `moon run root:tracker-check`.
  6. Push branch `feature/p116-a`, open PR against `main`, watch CI green, update docs/index, squash-merge, delete worktree.

## Decisions taken
- Node projects list is dynamically or statically derived in alignment with `scripts/gate-projects-check.mjs`.

## Status
- Worktree initialized at `.worktrees/p116-a` on branch `feature/p116-a`.
- Dependencies verified.
