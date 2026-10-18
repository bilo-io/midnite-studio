import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The capture feature — Midnite Capture's one feature (Phase 113 Theme K): screen, window and region
 * screenshots, screen recordings, one global capture shortcut, an opt-in clipboard history, and Send to…
 * an agent chat or a Creator project.
 *
 * **No capture without a user action, and nothing leaves the machine.** Every channel below is answered
 * by the feature's main half against the composer's own data directory; none opens a socket or makes a
 * network call. Clipboard history is off by default — while it is off nothing reads the clipboard.
 * Send to… reaches the other features through the link router and `shared` ids; nothing is sent or
 * posted until the user presses send at the destination.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer reads this file too.
 */
export const captureManifest = defineFeatureManifest({
  feature: 'capture',
  owner: 'capture',
  views: [
    {
      id: 'capture',
      // Global: the screen is the machine's, not one checkout's.
      global: true,
      rail: {
        group: 'workspace',
        label: 'Capture',
        description:
          'Screenshots, screen recordings and clipboard history — taken on your click, kept on this machine',
      },
    },
  ],
  settingsPages: [],
  ipc: [
    CHANNELS.captureStatus,
    CHANNELS.captureRequestPermission,
    CHANNELS.captureOpenPermissionSettings,
    CHANNELS.captureSources,
    CHANNELS.captureStill,
    CHANNELS.captureRegionBegin,
    CHANNELS.captureRegionPending,
    CHANNELS.captureRegionFinish,
    CHANNELS.captureRegionCancel,
    CHANNELS.captureRecordingArm,
    CHANNELS.captureRecordingBegin,
    CHANNELS.captureRecordingChunk,
    CHANNELS.captureRecordingFinish,
    CHANNELS.captureRecordingAbort,
    CHANNELS.captureList,
    CHANNELS.captureDelete,
    CHANNELS.captureReveal,
    CHANNELS.captureCopy,
    CHANNELS.captureSettingsSet,
    CHANNELS.captureClipboardList,
    CHANNELS.captureClipboardCopy,
    CHANNELS.captureClipboardDelete,
    CHANNELS.captureClipboardClear,
    CHANNELS.captureAttachment,
    CHANNELS.captureSendToCreator,
  ],
  events: [EVENT_CHANNELS.captureChanged],
  mcpTools: [],
});

export type CaptureManifest = typeof captureManifest;

export type CaptureChannel = CaptureManifest['ipc'][number];
