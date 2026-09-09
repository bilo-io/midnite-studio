import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/**
 * Ad Hoc "the local voice engine crashed" — the packaging bug PR #307
 * introduced (`companion-tts-worker.js` forked but never unpacked) and the
 * broader lesson this task's own deeper diagnosis surfaced: NOT every
 * `bundle.mjs` outfile that ends up in a spawned process belongs in
 * `asarUnpack`. Two different mechanisms spawn these scripts, and they need
 * OPPOSITE treatment:
 *
 * - **`child_process.spawn`/`ELECTRON_RUN_AS_NODE`** (`broker.js`, via
 *   `broker-client.ts`) boots as genuinely plain Node with zero awareness of
 *   `.asar` archives — its target MUST be a real file on disk, so it MUST be
 *   in `asarUnpack`.
 * - **`utilityProcess.fork`** (`companion-tts-worker.js`, via
 *   `tts-broker.ts`) runs inside Electron's own Node integration, the same
 *   asar-transparent `fs`/`Module` resolution `main.js` itself gets — it
 *   reads its script from *inside* `app.asar` fine. Unpacking it is not just
 *   unnecessary, it actively breaks `require('kokoro-js')`
 *   (`workerScriptPath`'s own doc has the full mechanism, confirmed against
 *   a real `moon run desktop:dist` build both ways) — so it MUST NOT be in
 *   `asarUnpack`.
 *
 * This file checks both directions rather than "every outfile needs
 * unpacking" — a test asserting universal coverage would have been WRONG
 * for `companion-tts-worker.js` and would have pointed this PR at the wrong
 * fix.
 */

function readOutfileNames() {
  const source = readFileSync(resolve(root, 'scripts/bundle.mjs'), 'utf8');
  // The array literal `bundle.mjs` maps over — kept in sync with that
  // file's own list rather than importing the module (which would kick off
  // a real esbuild build as a side effect).
  const match = /const outfiles = \[([\s\S]*?)\]\.map/.exec(source);
  if (!match) throw new Error('Could not find the `outfiles` array in scripts/bundle.mjs');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function readAsarUnpack() {
  return readFileSync(resolve(root, 'electron-builder.yml'), 'utf8');
}

function isUnpacked(asarUnpack, name) {
  return asarUnpack.includes(`'dist/bundle/${name}.js'`);
}

describe('electron-builder.yml asarUnpack treats spawned bundle.mjs outfiles correctly', () => {
  const outfiles = readOutfileNames();
  const asarUnpack = readAsarUnpack();

  it('found a non-trivial outfiles list to check (a sanity guard on the regex above)', () => {
    expect(outfiles.length).toBeGreaterThan(2);
    expect(outfiles).toContain('main');
    expect(outfiles).toContain('companion-tts-worker');
  });

  it('unpacks broker.js — spawned via child_process/ELECTRON_RUN_AS_NODE, genuinely plain Node', () => {
    expect(isUnpacked(asarUnpack, 'broker')).toBe(true);
  });

  it('does NOT unpack companion-tts-worker.js — a utilityProcess.fork target that must stay virtually inside app.asar for require("kokoro-js") to resolve', () => {
    expect(isUnpacked(asarUnpack, 'companion-tts-worker')).toBe(false);
  });

  /*
    Known, deliberately unfixed gaps this task's diagnosis surfaced — flagged
    in the PR body, not fixed here (out of scope: a different feature area's
    own packaging, Phase 70's script runner and Theme F's MCP shim).
    `it.todo` keeps them visible in `moon run desktop:test`'s output without
    failing the gate this PR has to leave green.
  */
  it.todo(
    'mcp-shim.js should be unpacked (its path is handed to an EXTERNAL, genuinely plain-Node MCP client — same category as broker.js, not companion-tts-worker.js) but currently is not',
  );
  it.todo(
    "script-runner-worker.js's own workerScriptPath() (script-runner-broker.ts) still does the same unnecessary app.asar → app.asar.unpacked rewrite this PR removed from tts-broker.ts — currently harmless in practice (script-runner.ts requires no external npm package the rewrite would break) but it means script-runner-worker.js can never actually be forked in a packaged build at all today, since it is not in asarUnpack either",
  );
});
