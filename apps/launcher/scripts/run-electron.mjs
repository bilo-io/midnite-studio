#!/usr/bin/env node
/**
 * `electron <args>` with `ELECTRON_RUN_AS_NODE` stripped — see start-electron.mjs
 * for why a moon task cannot just unset it. Used by `launcher:logos`.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), process.argv.slice(2), { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 1));
