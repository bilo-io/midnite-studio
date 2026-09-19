import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { app } from 'electron';

/**
 * Where `prepare-commit-msg.sh` lives on disk.
 *
 * Same dev-vs-packaged split as `template-path.ts`'s `templateRoot()`, and
 * for the same reason: `electron-builder.yml`'s `extraResources` copies the
 * source file to `Resources/hooks/prepare-commit-msg.sh` in a packaged build,
 * where it sits outside the asar as a plain file `install.ts` can `readFile`
 * (and, unlike a `.node` binary, this file is never executed by Electron
 * itself — the target repo's own git runs it — so asar-unaware `readFileSync`
 * is all it needs, no `asarUnpack` entry).
 */
export function hookScriptPath(): string {
  const packaged = join(process.resourcesPath, 'hooks', 'prepare-commit-msg.sh');
  if (app.isPackaged || existsSync(packaged)) return packaged;
  // Unpackaged: dist/bundle/main.js → ../../src/main/hooks/prepare-commit-msg.sh
  return join(__dirname, '..', '..', 'src', 'main', 'hooks', 'prepare-commit-msg.sh');
}
