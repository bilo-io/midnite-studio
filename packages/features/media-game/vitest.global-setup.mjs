// The game tests scaffold, compose and export real games, so they need the vendored engine files in
// `packages/desktop/resources/game-engines/` — gitignored, and produced by `desktop:bundle`, which
// this package's tests do not depend on (CI's gate-node never runs it). Vendor them here when they are
// missing: `vendorGameEngines` only copies (and esbuild-wraps) packages already in node_modules, so it
// needs no network.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { vendorGameEngines } from '../../../scripts/vendor-game-engines.mjs';

const enginesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../desktop/resources/game-engines');

export default async function setup() {
  if (!existsSync(enginesDir)) await vendorGameEngines();
}
