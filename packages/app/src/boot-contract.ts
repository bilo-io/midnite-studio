/**
 * The seam Studio's renderer entry calls (Phase 113 Theme G).
 *
 * `apps/studio/entry/renderer.ts` imports `@midnite/studio-app/boot`. The
 * bundler resolves that to `./boot.tsx`; apps/studio's typecheck resolves it to
 * this file, so it type-checks against the seam without compiling the whole
 * renderer a second time. `boot.tsx` is typed against `BootStudioRenderer`, so
 * this package's own typecheck fails if the two drift.
 */
export type BootStudioRenderer = (container: HTMLElement) => void;

export declare const bootStudioRenderer: BootStudioRenderer;
