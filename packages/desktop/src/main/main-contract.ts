/**
 * The seam Studio's Electron main entry calls (Phase 113 Theme G).
 *
 * `apps/studio/entry/main.ts` imports `@midnite/studio-desktop/main`. esbuild
 * resolves that to `./index.ts` (`scripts/bundle.mjs`); apps/studio's typecheck
 * resolves it to this file, so it type-checks against the seam without
 * compiling desktop's whole main graph — and its built feature declarations — a
 * second time. `index.ts` is typed against `StartStudioMain`, so this package's
 * own typecheck fails if the two drift.
 */
export type StartStudioMain = () => void;

export declare const startStudioMain: StartStudioMain;
