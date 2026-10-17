import { startStudioMain } from '@midnite/studio-desktop/main';

/**
 * Midnite Studio's Electron main entry (Phase 113 Theme G) — what
 * `dist/bundle/main.js` is built from (`packages/desktop/scripts/bundle.mjs`).
 *
 * Studio is the superset app: its main process is `packages/desktop`, which
 * registers every feature's main half beside Studio's own services, so the entry
 * starts that and nothing else. The bundle, its preload and workers, and
 * electron-builder's config stay in packages/desktop, where the packaged app's
 * layout is decided.
 */
startStudioMain();
