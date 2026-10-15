#!/usr/bin/env node
/**
 * Launch Electron with a sanitised environment.
 *
 * `ELECTRON_RUN_AS_NODE=1` makes the Electron binary behave as a plain Node
 * runtime: `require('electron')` then returns the npm shim's *path string*
 * instead of the runtime module, and main dies on the first line that touches
 * `app` with "Cannot read properties of undefined". Editors that are themselves
 * Electron apps — VS Code, Cursor and friends — export it into their integrated
 * terminals, so `moon run desktop:start` fails there and works in a normal
 * terminal, which is a maddening thing to debug.
 *
 * A moon task can set env vars but not unset them, hence this launcher.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/**
 * On macOS run from the cloned `Midnite Apps.app` stub (scripts/dev-app.mjs) so the Dock reads
 * "Midnite Apps" with the launcher's icon — LaunchServices takes both from the bundle, not from
 * `app.setName`. Any failure falls back to the stock binary: a wrong Dock label beats no launcher.
 */
function devExecutable() {
  if (process.platform !== 'darwin') return require('electron');
  try {
    const out = execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--disable-warning=ExperimentalWarning',
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        fileURLToPath(new URL('./dev-app.mjs', import.meta.url)),
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    );
    return out.trim().split('\n').pop();
  } catch (e) {
    process.stderr.write(`[start] dev stub failed (${e.message}); using stock Electron\n`);
    return require('electron');
  }
}

const electron = devExecutable();

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
