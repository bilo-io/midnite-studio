import { captureManifest } from '@midnite/studio-feature-capture/renderer';

/**
 * Midnite Capture's app manifest — pure data (Phase 113 Theme K).
 *
 * `accent` matches the launcher catalog's `capture` tile; the glyph (`PiCameraFill`) is rendered by the
 * home view and baked into `resources/icon.icns` by `scripts/make-icon.mjs`. Capture opens on its one
 * view; it composes the capture feature alone, so Send to… reaches nothing here (`STANDALONE_CAPTURE_HOST`).
 */
export const CAPTURE_APP = {
  id: 'capture',
  name: 'Midnite Capture',
  tagline: 'Screenshots, recordings and clipboard — kept on this machine',
  accent: '#f97316',
  home: 'capture',
  features: [captureManifest.feature],
} as const;

export type CaptureApp = typeof CAPTURE_APP;
