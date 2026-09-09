import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/**
 * Ad Hoc "the local voice engine crashed": #307 added `companion-tts-worker`
 * to `bundle.mjs`'s `outfiles` (so the bundle gets produced) but never added
 * a matching `electron-builder.yml` `asarUnpack` glob — so in a packaged
 * build `tts-broker.ts`'s `workerScriptPath()` rewrote its fork target to
 * `app.asar.unpacked/dist/bundle/companion-tts-worker.js`, a file that was
 * never actually unpacked, and `utilityProcess.fork` failed every time
 * (confirmed against a real `moon run desktop:dist` build — see this PR's
 * body). Dev mode never exercises this: `__dirname` there has no `app.asar`
 * segment to rewrite, so the bug survived every check that only ran there.
 *
 * This is the test that would have caught it: every `bundle.mjs` outfile
 * that is actually forked as its own OS process by this app (as opposed to
 * `main`/`preload`, which are loaded in-process) needs a matching
 * `dist/bundle/<name>.js` entry in `asarUnpack`, or its own
 * `app.asar` → `app.asar.unpacked` rewrite (`broker-client.ts`,
 * `mcp/index.ts`, `script-runner-broker.ts`, `tts-broker.ts` all do this,
 * independently, the same way) silently points at nothing once packaged.
 */

/**
 * Read `bundle.mjs`'s own `outfiles` array by text rather than importing the
 * module — importing it would kick off a real esbuild build as a side
 * effect (`await Promise.all(outfiles.map(...))` at the top level).
 */
function readOutfileNames() {
  const source = readFileSync(resolve(root, 'scripts/bundle.mjs'), 'utf8');
  const match = /const outfiles = \[([\s\S]*?)\]\.map/.exec(source);
  if (!match) throw new Error('Could not find the `outfiles` array in scripts/bundle.mjs');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function readAsarUnpack() {
  return readFileSync(resolve(root, 'electron-builder.yml'), 'utf8');
}

/**
 * `main` is the entry point itself and `preload` is read by Electron's own
 * `webPreferences.preload`, never forked — every other outfile is spawned as
 * its own OS process by this app and needs the asarUnpack treatment.
 */
const IN_PROCESS_OUTFILES = new Set(['main', 'preload']);

/**
 * Known gaps this task's own diagnosis surfaced but deliberately did not
 * fix, per the ad hoc task's own instruction not to silently expand scope
 * into an unrelated component:
 *
 * - `script-runner-worker` (Phase 70 Theme B's `pm.*` sandbox,
 *   `script-runner-broker.ts`) resolves its fork target with the identical
 *   `.replace('app.asar', 'app.asar.unpacked')` pattern `tts-broker.ts`
 *   does, and is equally absent from `asarUnpack` — confirmed via the same
 *   `asar list` check against the packaged build this PR used to confirm
 *   the companion-tts-worker bug. Same latent bug, different feature area;
 *   flagged in the PR body rather than fixed here.
 * - `mcp-shim` (Theme F's MCP stdio shim, `mcp/index.ts`) is a related but
 *   distinct case: nothing in this app forks it — its path is only ever
 *   reported to an *external* MCP client's own config, which would hit the
 *   same "reading a file that was never unpacked" failure the moment it
 *   tried to run it. Also flagged, also not fixed here.
 *
 * `it.todo` keeps both visible in `moon run desktop:test`'s output as
 * still-open findings without failing the gate this PR has to leave green.
 */
const KNOWN_UNFIXED_GAPS = new Set(['script-runner-worker', 'mcp-shim']);

describe('electron-builder.yml asarUnpack covers every forked bundle.mjs outfile', () => {
  const outfiles = readOutfileNames();
  const asarUnpack = readAsarUnpack();

  it('found a non-empty, non-trivial outfiles list to check (a sanity guard on the regex above)', () => {
    expect(outfiles.length).toBeGreaterThan(2);
    expect(outfiles).toContain('main');
  });

  for (const name of outfiles) {
    if (IN_PROCESS_OUTFILES.has(name)) continue;
    const glob = `'dist/bundle/${name}.js'`;

    if (KNOWN_UNFIXED_GAPS.has(name)) {
      it.todo(`asarUnpack lists dist/bundle/${name}.js (known gap — see this file's module doc)`);
      continue;
    }

    it(`asarUnpack lists dist/bundle/${name}.js`, () => {
      expect(asarUnpack.includes(glob)).toBe(true);
    });
  }

  it('the fix: companion-tts-worker.js is both an outfile and unpacked', () => {
    expect(outfiles).toContain('companion-tts-worker');
    expect(asarUnpack.includes(`'dist/bundle/companion-tts-worker.js'`)).toBe(true);
  });
});
