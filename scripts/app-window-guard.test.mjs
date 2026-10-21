// Phase 113 — every suite app's window refuses to navigate away from the app.
//
// An app window carries a preload bridge, so a remote page loaded into it could call the app's IPC
// channels. A plain `<a href>` in a doc, a deck or a chat would do exactly that, and `window.open`
// would open a child window with no rules at all. The runtime's `guardAppWindow` closes both doors;
// this test holds every `apps/<id>/main/index.ts` that opens a `BrowserWindow` to calling it.

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function appMains() {
  // The launcher is off the graph (it cannot import the runtime) and keeps its own guard in src/main.
  const out = execFileSync('git', ['grep', '-l', 'new BrowserWindow(', '--', 'apps/*/main/index.ts', ':!apps/launcher/**'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  return out === '' ? [] : out.split('\n');
}

describe('every app window is guarded', () => {
  it('finds the app mains', () => {
    expect(appMains().length).toBeGreaterThan(0);
  });

  it('calls guardAppWindow on the window it opens', async () => {
    const unguarded = [];
    for (const file of appMains()) {
      const source = await readFile(path.join(repoRoot, file), 'utf8');
      if (!/guardAppWindow\(\s*win\.webContents/.test(source)) unguarded.push(file);
    }
    expect(unguarded).toEqual([]);
  });

  // Phase 113 Theme K slice 2: Capture opens a second window — the desktop region overlay, which carries
  // its own preload — and guards it too: one `guardAppWindow(` call for every `new BrowserWindow(`.
  // (Scoped to Capture: Creator's offscreen print window predates this and carries no preload.)
  it("guards Capture's overlay window as well as its app window", async () => {
    const source = await readFile(path.join(repoRoot, 'apps/capture/main/index.ts'), 'utf8');
    const opened = source.match(/new BrowserWindow\(/g)?.length ?? 0;
    const guarded = source.match(/guardAppWindow\(\s*\w+\.webContents/g)?.length ?? 0;
    expect(opened).toBe(2);
    expect(guarded).toBe(opened);
  });
});
