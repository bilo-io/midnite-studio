/**
 * Phase 91 Theme D — DevTools are a development tool, not a feature of the
 * packaged app. The app windows carry the full preload bridge, so DevTools on
 * one is a console with every IPC channel in it; an embedded page's DevTools
 * (Phase 117 Theme A) follow the same rule so a packaged build opens an
 * inspector on nothing.
 *
 * `MSTUDIO_DEVTOOLS=1` is the deliberate support escape hatch: an env var is
 * something a user cannot trip over by accident.
 *
 * Pure (takes `isPackaged` and the env) so it tests without Electron. Lives in
 * the runtime so every suite app's main answers it the same way; desktop's
 * `devtools-policy.ts` re-exports it.
 */
export function devToolsAllowed(
  isPackaged: boolean,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !isPackaged || env['MSTUDIO_DEVTOOLS'] === '1';
}
