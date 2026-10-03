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
vi.mock('../cli-path.js', async (importActual) => ({
  ...(await importActual<typeof import('../cli-path.js')>()),
  preferredTargets,
}));

import { onPathFields, registerCliHandlers } from './cli-handlers';

// `getCliStatus()` reads the installed symlink with `existsSync`, which
// follows the link — a dangling symlink (pointing at a bundle path that does
// not exist on disk) reports `installed: false` even though the symlink
// itself was created. So the fake app root needs a real file at the exact
// path `getBundleBinPath()` builds from it (`resources/bin/midnite`, and its `midnite-studio` alias beside it).
appRoot = mkdtempSync(join(tmpdir(), 'ms-cli-app-root-'));
mkdirSync(join(appRoot, 'resources', 'bin'), { recursive: true });
writeFileSync(join(appRoot, 'resources', 'bin', 'midnite'), '#!/bin/sh\nexit 0\n');
writeFileSync(join(appRoot, 'resources', 'bin', 'midnite-studio'), '#!/bin/sh\nexit 0\n');
const bundleBin = (name: string): string => join(appRoot, 'resources', 'bin', name);

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
      join(root, 'usr-local-bin', 'midnite'),
      join(root, 'home-local-bin', 'midnite'),
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
    const primaryTarget = join(primaryDir, 'midnite');
    const fallbackTarget = join(fallbackDir, 'midnite');

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
    const target = join(dir, 'midnite');
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

describe('midnite / midnite-studio ownership and migration', () => {
  type Res = { ok: boolean; kind?: string; message?: string; value?: Record<string, unknown> };
  const setup = (): { dir: string; primary: string; alias: string } => {
    const dir = join(tempDir(), 'bin');
    mkdirSync(dir, { recursive: true });
    preferredTargets.mockReturnValue([join(dir, 'midnite')]);
    registerCliHandlers();
    return { dir, primary: join(dir, 'midnite'), alias: join(dir, 'midnite-studio') };
  };

  it('installs midnite plus the deprecated midnite-studio alias, both into this bundle', async () => {
    const { primary, alias } = setup();
    const res = (await invoke(CHANNELS.cliInstall, { target: 'auto' })) as Res;
    expect(res.ok).toBe(true);
    expect(readlinkSync(primary)).toBe(bundleBin('midnite'));
    expect(readlinkSync(alias)).toBe(bundleBin('midnite-studio'));
    expect(res.value).toMatchObject({ installed: true, managed: true, command: 'midnite', aliasInstalled: true });
  });

  it('replaces a midnite symlink it owns', async () => {
    const { primary } = setup();
    // An owned-but-stale link: resolves into a Midnite Studio bundle that moved.
    symlinkSync('/Applications/Midnite Studio.app/Contents/Resources/bin/midnite', primary);
    const res = (await invoke(CHANNELS.cliInstall, { target: 'auto' })) as Res;
    expect(res.ok).toBe(true);
    expect(readlinkSync(primary)).toBe(bundleBin('midnite'));
  });

  it('never overwrites a foreign midnite symlink — installs only the alias and says why', async () => {
    const { dir, primary, alias } = setup();
    const foreign = join(dir, '..', 'original-midnite-cli.js');
    writeFileSync(foreign, '#!/usr/bin/env node\n');
    symlinkSync(foreign, primary);

    const res = (await invoke(CHANNELS.cliInstall, { target: 'auto' })) as Res;
    expect(res.ok).toBe(true);
    expect(readlinkSync(primary)).toBe(foreign);
    expect(readlinkSync(alias)).toBe(bundleBin('midnite-studio'));
    expect(res.value).toMatchObject({ installed: true, managed: true, command: 'midnite-studio', path: alias });
    expect(res.value?.['notice']).toContain('left untouched');
    expect(res.value?.['notice']).toContain('original midnite app');
  });

  it('never overwrites a foreign plain-file midnite binary', async () => {
    const { primary, alias } = setup();
    writeFileSync(primary, '#!/bin/sh\necho original\n');
    const res = (await invoke(CHANNELS.cliInstall, { target: 'auto' })) as Res;
    expect(res.ok).toBe(true);
    expect(lstatSync(primary).isSymbolicLink()).toBe(false);
    expect(lstatSync(alias).isSymbolicLink()).toBe(true);
    expect(res.value?.['notice']).toContain('left untouched');
  });

  it('fails as an error envelope, without touching either file, when both names are foreign', async () => {
    const { primary, alias } = setup();
    writeFileSync(primary, 'a');
    writeFileSync(alias, 'b');
    const res = (await invoke(CHANNELS.cliInstall, { target: 'auto' })) as Res;
    expect(res).toMatchObject({ ok: false, kind: 'error' });
    expect(res.message).toContain('unmanaged');
  });

  it('migrates an old managed midnite-studio install to midnite plus the alias', async () => {
    const { primary, alias } = setup();
    // Pre-rename install: only `midnite-studio`, pointing at the old bundle script.
    symlinkSync(bundleBin('midnite-studio'), alias);
    expect(await invoke(CHANNELS.cliStatus)).toMatchObject({
      installed: true,
      managed: true,
      command: 'midnite-studio',
      aliasInstalled: true,
    });

    const res = (await invoke(CHANNELS.cliInstall, { target: 'auto' })) as Res;
    expect(res.ok).toBe(true);
    expect(readlinkSync(primary)).toBe(bundleBin('midnite'));
    expect(readlinkSync(alias)).toBe(bundleBin('midnite-studio'));
    expect(res.value).toMatchObject({ command: 'midnite', managed: true, aliasInstalled: true });
  });

  it('recognises both the old and the new name as managed', async () => {
    const { primary, alias } = setup();
    symlinkSync(bundleBin('midnite'), primary);
    expect(await invoke(CHANNELS.cliStatus)).toMatchObject({ managed: true, command: 'midnite' });
    rmSync(primary);
    symlinkSync(bundleBin('midnite-studio'), alias);
    expect(await invoke(CHANNELS.cliStatus)).toMatchObject({ managed: true, command: 'midnite-studio' });
  });

  it('uninstall removes both owned links but leaves a foreign midnite alone', async () => {
    const { primary, alias } = setup();
    const foreign = join(tempDir(), 'foreign');
    writeFileSync(foreign, 'x');
    symlinkSync(foreign, primary);
    symlinkSync(bundleBin('midnite-studio'), alias);

    const res = (await invoke(CHANNELS.cliUninstall)) as Res;
    expect(res.ok).toBe(true);
    expect(existsSync(alias)).toBe(false);
    expect(readlinkSync(primary)).toBe(foreign);
  });
});

describe('onPathFields (Phase 98 Theme G)', () => {
  it('is on PATH, with no hint, when the target directory is a PATH entry', () => {
    expect(onPathFields('/usr/local/bin/midnite', '/usr/bin:/usr/local/bin/:/bin')).toEqual({
      onPath: true,
      pathExportLine: null,
    });
  });

  it('names the export line to add when it is not', () => {
    expect(onPathFields('/Users/me/.local/bin/midnite', '/usr/bin:/bin')).toEqual({
      onPath: false,
      pathExportLine: 'export PATH="/Users/me/.local/bin:$PATH"',
    });
    expect(onPathFields('/Users/me/.local/bin/midnite', undefined).onPath).toBe(false);
  });

  it('rides along on an installed status', async () => {
    const root = tempDir();
    preferredTargets.mockReturnValue([join(root, 'bin', 'midnite')]);
    registerCliHandlers();
    await invoke(CHANNELS.cliInstall, { target: 'auto' });
    const status = (await invoke(CHANNELS.cliStatus)) as { onPath?: boolean; pathExportLine?: string | null };
    expect(status.onPath).toBe(false);
    expect(status.pathExportLine).toBe(`export PATH="${join(root, 'bin')}:$PATH"`);
  });
});
