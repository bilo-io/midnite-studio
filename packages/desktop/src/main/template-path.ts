import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { app } from 'electron';

/**
 * Where the onboarding kit's template tree lives (Phase 49 Theme A).
 *
 * Packaged: `electron-builder.yml`'s `extraResources` copies the repo-root
 * `templates/` directory to `Resources/templates`. Unpackaged: `templates/`
 * at the repo root, four levels up from the compiled `dist/bundle/main.js` —
 * same shape as `window.ts`'s `rendererEntry()`, which this mirrors on
 * purpose rather than introducing a second dev-vs-packaged pattern.
 *
 * This is the one item Theme A's own doc flags as "most likely to pass in
 * `moon run desktop:start` and fail in a dmg" — a typo'd relative path here
 * resolves fine against the repo's own working tree in dev and silently
 * finds nothing once packaged, since `existsSync` on the packaged branch
 * only ever fails loud (an absent `Resources/templates`), never quiet. The
 * packaged-build assertion that actually exercises this belongs to Theme E;
 * this function is the single place a future caller (Theme C's scaffold
 * reader) asks the question, so there is exactly one path to get right.
 */
export function templateRoot(): string {
  const packaged = process.resourcesPath ? join(process.resourcesPath, 'templates', 'midnite') : '';
  if (app?.isPackaged || (packaged && existsSync(packaged))) return packaged;
  // Unpackaged: dist/bundle/main.js → ../../../../templates/midnite
  return join(__dirname, '..', '..', '..', '..', 'templates', 'midnite');
}

/**
 * `templates/media-video/` — Setup Video's scaffold (Phase 99 Theme D). Same
 * packaged-vs-dev split as `templateRoot()`; the whole `templates/` tree
 * already ships through `extraResources`.
 */
export function mediaVideoTemplateRoot(): string {
  const packaged = process.resourcesPath ? join(process.resourcesPath, 'templates', 'media-video') : '';
  if (app?.isPackaged || (packaged && existsSync(packaged))) return packaged;
  return join(__dirname, '..', '..', '..', '..', 'templates', 'media-video');
}

/**
 * `templates/media-game/` — the files every new game repo starts from (Phase
 * 107 Theme A). Same packaged-vs-dev split as the others.
 */
export function mediaGameTemplateRoot(): string {
  const packaged = process.resourcesPath ? join(process.resourcesPath, 'templates', 'media-game') : '';
  if (app?.isPackaged || (packaged && existsSync(packaged))) return packaged;
  return join(__dirname, '..', '..', '..', '..', 'templates', 'media-game');
}

/**
 * `resources/game-engines/` — the vendored engine files copied into game repos
 * (Phase 107 Theme C).
 *
 * Packaged: `extraResources` copies `resources/game-engines` to `process.resourcesPath/game-engines`.
 * Unpackaged / dev: `packages/desktop/resources/game-engines`.
 */
export function gameEnginesDir(): string {
  if (process.env['MSTUDIO_GAME_ENGINES_DIR']) return process.env['MSTUDIO_GAME_ENGINES_DIR'];
  const packaged = process.resourcesPath ? join(process.resourcesPath, 'game-engines') : '';
  if (app?.isPackaged || (packaged && existsSync(packaged))) return packaged;
  return join(__dirname, '..', '..', '..', '..', 'packages', 'desktop', 'resources', 'game-engines');
}

