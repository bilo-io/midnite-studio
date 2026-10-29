import { captureManifest } from '@midnite/studio-feature-capture/renderer';
import type { NavConfig } from '@midnite/studio-frame';
import { LuCamera } from 'react-icons/lu';

/**
 * The shell's rail (Phase 123 Theme B): its one view (Settings sits below it, so the rail is never one
 * item). Settings is never listed — `AppShell` puts it at the rail's foot. `panels` is absent, so the
 * app carries every panel (decision 12).
 */
const CAPTURE_NAV: NavConfig = {
  views: [
    { id: 'capture', label: 'Capture', icon: LuCamera },
  ],
};

/**
 * Midnite Capture's app manifest — pure data (Phase 113 Theme K).
 *
 * `accent` matches the launcher catalog's `capture` tile; the glyph (`PiCameraFill`) is rendered by the
 * home view and baked into `resources/icon.icns` by the launcher's `scripts/app-icons.cjs`. Capture opens on its one
 * view; it composes the capture feature alone, so Send to… reaches nothing here (`STANDALONE_CAPTURE_HOST`).
 */
export const CAPTURE_APP = {
  id: 'capture',
  name: 'Midnite Capture',
  tagline: 'Screenshots, recordings and clipboard — kept on this machine',
  accent: '#f97316',
  home: 'capture',
  features: [captureManifest.feature],
  nav: CAPTURE_NAV,
} as const;

export type CaptureApp = typeof CAPTURE_APP;
