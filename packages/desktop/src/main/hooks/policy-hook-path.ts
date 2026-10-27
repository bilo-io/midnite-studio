import { join } from 'node:path';

/**
 * Where `policy-hook.js` lives on disk (Phase 121 Theme B).
 *
 * Like `mcpShimScriptPath()`, every `bundle.mjs` outfile lands beside `main.js`,
 * so `__dirname` inside `main.js` points to `dist/bundle/`. In packaged builds,
 * `replace('app.asar', 'app.asar.unpacked')` resolves to the unpacked directory.
 */
export function policyHookScriptPath(): string {
  return join(__dirname, 'policy-hook.js').replace('app.asar', 'app.asar.unpacked');
}
