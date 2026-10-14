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
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron');

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
