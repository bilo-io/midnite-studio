import { homedir } from 'node:os';
import { win32, posix } from 'node:path';

/**
 * Where the app's `userData` lives, computed without Electron.
 *
 * The shim is spawned by an MCP client as plain `node` (Phase 57 Theme C) —
 * it cannot ask a running Electron process for `app.getPath('userData')`, so
 * it has to know Electron's own per-platform rule for it. `app.setName`
 * (`main/index.ts`) pins the app name to `'Midnite Studio'`, which is the one
 * fact this mirrors; everything else is Electron's documented default for
 * where `userData` sits under each OS's own per-user data directory.
 *
 * Joins with `path.win32`/`path.posix` explicitly rather than the ambient
 * `node:path` (which is always the *host* OS's flavour) — this repo only
 * ships macOS builds, but the function's own `platform` parameter exists so
 * its logic is testable on one OS for all three, and that only means
 * anything if a Windows-shaped path actually comes out with backslashes when
 * asked for on a Mac test runner.
 */
export function resolveUserDataDir(
  appName = 'Midnite Studio',
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  switch (platform) {
    case 'darwin':
      return posix.join(home, 'Library', 'Application Support', appName);
    case 'win32':
      return win32.join(process.env['APPDATA'] ?? win32.join(home, 'AppData', 'Roaming'), appName);
    default:
      return posix.join(process.env['XDG_CONFIG_HOME'] ?? posix.join(home, '.config'), appName);
  }
}
