import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync, chmodSync, existsSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHANNELS } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Same shape as `mcp-handlers.test.ts`'s own `ipcMain.handle` capture: mock
// `electron` so this file never touches the real runtime, and hoist so the
// mock factory runs before the `import` below is evaluated. `getAppPath()`
// reads `appRoot`, assigned below once all imports have resolved but well
// before any `it()` body runs — `getAppPath()` itself is only ever called
// from inside a handler, i.e. during a test.
const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
let appRoot = '';
vi.mock('electron', () => ({
  ipcMain: { handle },
  app: { isPackaged: false, getAppPath: () => appRoot },
}));

// `cli-handlers.ts` resolves its install targets through `preferredTargets`
// (`../cli-path.js` from this file's own directory) — stubbed per test so
// nothing here ever touches a real `/usr/local/bin`.
const { preferredTargets } = vi.hoisted(() => ({ preferredTargets: vi.fn() }));
vi.mock('../cli-path.js', () => ({ preferredTargets }));

import { registerCliHandlers } from './cli-handlers';

// `getCliStatus()` reads the installed symlink with `existsSync`, which
// follows the link — a dangling symlink (pointing at a bundle path that does
// not exist on disk) reports `installed: false` even though the symlink
// itself was created. So the fake app root needs a real file at the exact
// path `getBundleBinPath()` builds from it (`resources/bin/midnite-studio`).
appRoot = mkdtempSync(join(tmpdir(), 'ms-cli-app-root-'));
mkdirSync(join(appRoot, 'resources', 'bin'), { recursive: true });
writeFileSync(join(appRoot, 'resources', 'bin', 'midnite-studio'), '#!/bin/sh\nexit 0\n');

/** The `ipcMain.handle` listener main registered for `channel`, invoked the way `ipcRenderer.invoke` would. */
function invoke(channel: string, raw?: unknown): unknown {
  const [, listener] = handle.mock.calls.find(([ch]) => ch === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler registered for ${channel}`);
  return listener({}, raw);
}

let dirs: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'ms-cli-handlers-'));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  handle.mockClear();
  preferredTargets.mockReset();
  for (const dir of dirs) {
    try {
      chmodSync(dir, 0o755);
    } catch {
      // best effort — only matters for the EACCES test below
    }
    rmSync(dir, { recursive: true, force: true });
  }
  dirs = [];
});

describe('registerCliHandlers', () => {
  it('reports not installed when neither target exists', async () => {
    const root = tempDir();
    preferredTargets.mockReturnValue([
      join(root, 'usr-local-bin', 'midnite-studio'),
      join(root, 'home-local-bin', 'midnite-studio'),
    ]);
    registerCliHandlers();

    expect(await invoke(CHANNELS.cliStatus)).toEqual({
      installed: false,
      path: null,
      target: null,
      managed: false,
    });
  });

  it('falls back to the user-local target when the preferred one is unwritable', async () => {
    const root = tempDir();
    const primaryDir = join(root, 'usr-local-bin');
    const fallbackDir = join(root, 'home-local-bin');
    const primaryTarget = join(primaryDir, 'midnite-studio');
    const fallbackTarget = join(fallbackDir, 'midnite-studio');

    mkdirSync(primaryDir, { recursive: true });
    chmodSync(primaryDir, 0o555); // read + execute only — symlinkSync inside it throws EACCES
    preferredTargets.mockReturnValue([primaryTarget, fallbackTarget]);
    registerCliHandlers();

    const res = (await invoke(CHANNELS.cliInstall, { target: 'auto' })) as {
      ok: boolean;
      value?: { installed: boolean; target: string | null };
    };

    expect(res.ok).toBe(true);
    expect(res.value?.installed).toBe(true);
    expect(res.value?.target).toBe(fallbackTarget);
    expect(lstatSync(fallbackTarget).isSymbolicLink()).toBe(true);
    expect(existsSync(primaryTarget)).toBe(false);
  });

  it('reports managed:false for a symlink the app did not create, and refuses to uninstall it', async () => {
    const root = tempDir();
    const dir = join(root, 'bin');
    mkdirSync(dir, { recursive: true });
    const target = join(dir, 'midnite-studio');
    const foreignBin = join(root, 'some-other-tool');
    writeFileSync(foreignBin, '#!/bin/sh\necho hi\n');
    symlinkSync(foreignBin, target);

    preferredTargets.mockReturnValue([target]);
    registerCliHandlers();

    const status = await invoke(CHANNELS.cliStatus);
    expect(status).toMatchObject({ installed: true, managed: false });

    const uninstallRes = (await invoke(CHANNELS.cliUninstall)) as { ok: boolean; kind?: string };
    expect(uninstallRes).toMatchObject({ ok: false, kind: 'error' });

    // Never deleted, never overwritten.
    expect(existsSync(target)).toBe(true);
    expect(readlinkSync(target)).toBe(foreignBin);
  });
});
