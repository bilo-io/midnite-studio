import type { MacPermissionId, MacPermissionState } from '@midnite/studio-shared';

import { createFullDiskAccessProbe, type FullDiskAccessProbe } from '../full-disk-access';

/**
 * Settings ▸ Permissions: what macOS reports for this build, read without ever raising a prompt.
 *
 * Pure over an injected port so it runs under bare vitest. The rules that matter:
 * - `isTrustedAccessibilityClient` is only ever called with `false`; `true` would open the system dialog.
 * - Full Disk Access is an `access()` on a path only that grant can reach (`full-disk-access.ts`); a denied
 *   probe never shows a dialog.
 * - Automation, Files & Folders and Notifications are `unchecked`: no API reads them without asking, and
 *   probing Documents, Desktop or Downloads would itself raise the folder prompt this phase removes.
 */

export const BUNDLE_ID = 'io.bilo.midnite-studio';

const PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_';

export const PANE_URLS: Record<MacPermissionId, string> = {
  screen: `${PANE}ScreenCapture`,
  microphone: `${PANE}Microphone`,
  camera: `${PANE}Camera`,
  accessibility: `${PANE}Accessibility`,
  fullDisk: `${PANE}AllFiles`,
  automation: `${PANE}Automation`,
  files: `${PANE}FilesAndFolders`,
  notifications: 'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
};

/** `tccutil` service names per row. Notifications are not TCC, so they have none. */
export const TCC_SERVICES: Partial<Record<MacPermissionId, readonly string[]>> = {
  screen: ['ScreenCapture'],
  microphone: ['Microphone'],
  camera: ['Camera'],
  accessibility: ['Accessibility'],
  fullDisk: ['SystemPolicyAllFiles'],
  automation: ['AppleEvents'],
  files: [
    'SystemPolicyDocumentsFolder',
    'SystemPolicyDesktopFolder',
    'SystemPolicyDownloadsFolder',
    'SystemPolicyNetworkVolumes',
    'SystemPolicyRemovableVolumes',
  ],
};

export const PERMISSION_IDS: readonly MacPermissionId[] = [
  'screen',
  'microphone',
  'camera',
  'accessibility',
  'fullDisk',
  'automation',
  'files',
  'notifications',
];

export type PermissionProbePort = {
  platform: NodeJS.Platform;
  /** Electron's `systemPreferences.getMediaAccessStatus`. */
  getMediaAccessStatus(kind: 'screen' | 'microphone' | 'camera'): string;
  /** Electron's `systemPreferences.isTrustedAccessibilityClient`. */
  isTrustedAccessibilityClient(prompt: false): boolean;
  /** Home directory, handed to the Full Disk Access probe. */
  home: string;
  /** Overridable for tests; defaults to `fs.access`. */
  access?: (path: string) => Promise<void>;
  now?: () => number;
};

export type PermissionProbeRow = {
  id: MacPermissionId;
  state: MacPermissionState;
  checkedAt: number;
  paneUrl: string;
  resettable: boolean;
};

function mapMedia(status: string): MacPermissionState {
  switch (status) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'not-determined':
      return 'not-determined';
    case 'restricted':
      return 'restricted';
    default:
      return 'unknown';
  }
}

export type PermissionProbe = {
  read(): Promise<PermissionProbeRow[]>;
};

export function createPermissionProbe(port: PermissionProbePort): PermissionProbe {
  const fullDisk: FullDiskAccessProbe = createFullDiskAccessProbe(port.home, port.access);
  const mac = port.platform === 'darwin';

  async function stateOf(id: MacPermissionId): Promise<MacPermissionState> {
    if (!mac) return 'unknown';
    try {
      switch (id) {
        case 'screen':
        case 'microphone':
        case 'camera':
          return mapMedia(port.getMediaAccessStatus(id));
        case 'accessibility':
          return port.isTrustedAccessibilityClient(false) ? 'granted' : 'denied';
        case 'fullDisk':
          return (await fullDisk.refresh()) ? 'granted' : 'denied';
        default:
          return 'unchecked';
      }
    } catch {
      return 'unknown';
    }
  }

  return {
    async read() {
      const checkedAt = (port.now ?? Date.now)();
      return Promise.all(
        PERMISSION_IDS.map(async (id) => ({
          id,
          state: await stateOf(id),
          checkedAt,
          paneUrl: PANE_URLS[id],
          resettable: mac && TCC_SERVICES[id] !== undefined,
        })),
      );
    },
  };
}
