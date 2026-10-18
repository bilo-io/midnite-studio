import type {
  CaptureClipboard,
  CaptureDesktopSource,
  CaptureDisplay,
  CaptureElectron,
  CaptureGlobalShortcut,
  CaptureImage,
} from './port';

/**
 * Builds {@link CaptureElectron} from Electron's own modules (Phase 113 Theme K), so Studio's desktop
 * and `apps/capture` share one adapter instead of each writing it.
 *
 * Every parameter is structural — the narrowest shape the real module satisfies — so this file still
 * imports no `electron` (the layer rule) and a composer passes `electron`'s modules with one cast. No
 * test calls this with the real modules: it is a straight mapping, and the behaviour it feeds is
 * tested over `test-fixtures.ts`' fakes.
 */
export type CaptureElectronModules = {
  platform: string;
  desktopCapturer: {
    getSources(options: {
      types: Array<'screen' | 'window'>;
      thumbnailSize: { width: number; height: number };
    }): Promise<CaptureDesktopSource[]>;
  };
  systemPreferences: { getMediaAccessStatus(mediaType: 'screen'): string };
  screen: {
    getAllDisplays(): CaptureDisplay[];
    getCursorScreenPoint(): { x: number; y: number };
    getDisplayNearestPoint(point: { x: number; y: number }): CaptureDisplay;
  };
  globalShortcut: CaptureGlobalShortcut;
  clipboard: CaptureClipboard;
  nativeImage: { createFromBuffer(buffer: Uint8Array): CaptureImage };
  shell: { showItemInFolder(path: string): void; openExternal(url: string): Promise<void> };
};

/** A window as far as hiding it for a screen grab goes. */
export type CaptureOwnWindow = {
  isDestroyed(): boolean;
  isVisible(): boolean;
  hide(): void;
  showInactive(): void;
};

/** System Settings ▸ Privacy & Security ▸ Screen Recording — a local URL scheme, not a network call. */
export const SCREEN_RECORDING_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

/** How long the window server is given to take a hidden window off screen before the grab. */
export const HIDE_SETTLE_MS = 180;

export function electronCapturePort(
  modules: CaptureElectronModules,
  options: {
    /** This app's windows — hidden for a screen grab when the user's setting says so. */
    windows?: () => CaptureOwnWindow[];
    focusApp?: () => void;
    settleMs?: number;
  } = {},
): CaptureElectron {
  const {
    desktopCapturer,
    systemPreferences,
    screen,
    globalShortcut,
    clipboard,
    nativeImage,
    shell,
  } = modules;
  const settle = options.settleMs ?? HIDE_SETTLE_MS;
  const windows = options.windows;
  return {
    platform: modules.platform,
    getSources: (request) => desktopCapturer.getSources(request),
    screenAccessStatus: () => systemPreferences.getMediaAccessStatus('screen'),
    openScreenRecordingSettings: () => shell.openExternal(SCREEN_RECORDING_SETTINGS_URL),
    displays: () => screen.getAllDisplays(),
    displayUnderPointer: () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),
    globalShortcut,
    clipboard,
    imageFromPng: (bytes) => nativeImage.createFromBuffer(bytes),
    showItemInFolder: (path) => shell.showItemInFolder(path),
    ...(windows
      ? {
          hideOwnWindows: async () => {
            const hidden = windows().filter((w) => !w.isDestroyed() && w.isVisible());
            for (const w of hidden) w.hide();
            if (hidden.length > 0) await new Promise((resolve) => setTimeout(resolve, settle));
            return () => {
              for (const w of hidden) if (!w.isDestroyed()) w.showInactive();
            };
          },
        }
      : {}),
    ...(options.focusApp ? { focusApp: options.focusApp } : {}),
  };
}
