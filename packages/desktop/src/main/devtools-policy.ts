/**
 * Phase 91 Theme D — DevTools are a development tool, not a feature of the
 * packaged app. The app windows carry the full preload bridge, so DevTools on
 * one is a console with every IPC channel in it.
 *
 * `MSTUDIO_DEVTOOLS=1` is the deliberate support escape hatch: an env var is
 * something a user cannot trip over by accident.
 *
 * Pure (takes `isPackaged` and the env) so it tests without Electron.
 */
export function devToolsAllowed(
  isPackaged: boolean,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !isPackaged || env['MSTUDIO_DEVTOOLS'] === '1';
}
