import type { CapturePermission } from '@midnite/studio-shared';

import type { CaptureElectron } from './port';

/**
 * macOS's Screen Recording permission (Phase 113 Theme K).
 *
 * Read first, always: no capture op runs until {@link readPermission} says it may. macOS shows its own
 * prompt the first time an app asks for screen sources, and never again — once the user has answered,
 * the only way to change it is System Settings. So:
 *
 * - `not-determined`: the renderer explains what is captured and that it stays local, and offers to ask
 *   macOS. {@link requestPermission} then asks **once** (one sources call, the smallest possible
 *   thumbnail) and reads the answer back.
 * - `denied` / `restricted`: asking again would do nothing, so {@link requestPermission} does not ask;
 *   the renderer offers "Open System Settings" instead. No prompt loop either way.
 */
export function readPermission(
  el: Pick<CaptureElectron, 'platform' | 'screenAccessStatus'>,
): CapturePermission {
  if (el.platform !== 'darwin') return 'unsupported';
  let status: string;
  try {
    status = el.screenAccessStatus();
  } catch {
    return 'not-determined';
  }
  switch (status) {
    case 'granted':
    case 'denied':
    case 'restricted':
    case 'not-determined':
      return status;
    default:
      // `unknown` on macOS reads as "not answered yet".
      return 'not-determined';
  }
}

export async function requestPermission(
  el: Pick<CaptureElectron, 'platform' | 'screenAccessStatus' | 'getSources'>,
): Promise<CapturePermission> {
  const before = readPermission(el);
  if (before !== 'not-determined') return before;
  try {
    await el.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
  } catch {
    // The prompt is the OS's; whatever it threw, the status below is the answer.
  }
  return readPermission(el);
}
