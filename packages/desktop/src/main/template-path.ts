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
  const packaged = join(process.resourcesPath, 'templates', 'midnite');
  if (app.isPackaged || existsSync(packaged)) return packaged;
  // Unpackaged: dist/bundle/main.js → ../../../../templates/midnite
  return join(__dirname, '..', '..', '..', '..', 'templates', 'midnite');
}
