/**
 * Everything Capture reaches outside plain Node, as one structural port (Phase 113 Theme K).
 *
 * The feature's main half never imports `electron`: the composer (Studio's desktop, `apps/capture`'s
 * main) builds this from the real `desktopCapturer`, `systemPreferences`, `screen`, `globalShortcut`,
 * `clipboard`, `nativeImage` and `shell`, and a test builds it from fakes. That is the whole reason no
 * test in this package can capture a real screen, prompt for the real Screen Recording permission,
 * register a real global shortcut or touch the real clipboard.
 *
 * The shapes are the narrowest Electron's own satisfy — Electron's types are wider (and Buffer-typed),
 * so each composer casts once, as the browser feature's composers do.
 */

/** A `NativeImage`'s surface, as far as Capture uses it. */
export type CaptureImage = {
  isEmpty(): boolean;
  getSize(): { width: number; height: number };
  toPNG(): Uint8Array;
  toJPEG(quality: number): Uint8Array;
  toDataURL(): string;
  crop(rect: { x: number; y: number; width: number; height: number }): CaptureImage;
  resize(options: {
    width?: number;
    height?: number;
    quality?: 'good' | 'better' | 'best';
  }): CaptureImage;
};

/** A `DesktopCapturerSource`. `display_id` is the screen's id ('' for a window). */
export type CaptureDesktopSource = {
  id: string;
  name: string;
  display_id: string;
  thumbnail: CaptureImage;
};

export type CaptureDisplay = {
  id: number;
  /** Size in points; multiply by `scaleFactor` for pixels. */
  size: { width: number; height: number };
  scaleFactor: number;
};

/** The clipboard, as far as the history reads it — and the two writes a copy-back needs. */
export type CaptureClipboard = {
  availableFormats(): string[];
  /** `clipboard.has(format)` — how a custom pasteboard type (the nspasteboard markers) is detected. */
  has(format: string): boolean;
  readText(): string;
  readImage(): CaptureImage;
  writeText(text: string): void;
  writeImage(image: CaptureImage): void;
};

export type CaptureGlobalShortcut = {
  /** False when the chord could not be taken (another app holds it). May throw on a malformed chord. */
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
};

export type CaptureElectron = {
  /** `process.platform` — the permission gate is macOS's. */
  platform: string;
  /** `desktopCapturer.getSources` — never called before the user asks for something. */
  getSources(options: {
    types: Array<'screen' | 'window'>;
    thumbnailSize: { width: number; height: number };
  }): Promise<CaptureDesktopSource[]>;
  /** `systemPreferences.getMediaAccessStatus('screen')`. */
  screenAccessStatus(): string;
  /** Opens System Settings ▸ Privacy & Security ▸ Screen Recording. */
  openScreenRecordingSettings(): Promise<void>;
  /** `screen.getAllDisplays()`. */
  displays(): CaptureDisplay[];
  /** The display under the pointer (`screen.getDisplayNearestPoint(screen.getCursorScreenPoint())`). */
  displayUnderPointer(): CaptureDisplay;
  globalShortcut: CaptureGlobalShortcut;
  clipboard: CaptureClipboard;
  /** `nativeImage.createFromBuffer` — to copy a saved capture back onto the clipboard. */
  imageFromPng(bytes: Uint8Array): CaptureImage;
  /** `shell.showItemInFolder`. */
  showItemInFolder(path: string): void;
  /**
   * Hides this app's own windows for a screen grab and returns the function that brings them back.
   * Absent, nothing is hidden.
   */
  hideOwnWindows?: () => Promise<() => void>;
  /** Brings this app's window forward (the shortcut opens the region picker in it). */
  focusApp?: () => void;
};
