import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Capture exposes — the capture channels and their one event, and
 * nothing else: no `secrets` (Capture holds no credential and reads no vault), no fs, git, pty, browser
 * or media store (`bridge.test.ts` holds the list). The three region-overlay channels are not here: they
 * belong to the overlay window's own preload (`overlay-bridge.ts`), never the app window's.
 */
export type CaptureBridge = { capture: MidniteStudioBridge['capture'] };

export type { RendererIpc };

export function createCaptureBridge(ipc: RendererIpc): CaptureBridge {
  const { call, subscribe } = createBridgeSlice(ipc);
  return {
    capture: {
      status: () => call(CHANNELS.captureStatus),
      requestPermission: () => call(CHANNELS.captureRequestPermission),
      openPermissionSettings: () => call(CHANNELS.captureOpenPermissionSettings),
      sources: (req) => call(CHANNELS.captureSources, req),
      still: (req) => call(CHANNELS.captureStill, req),
      regionBegin: (req) => call(CHANNELS.captureRegionBegin, req),
      regionPending: () => call(CHANNELS.captureRegionPending),
      regionFinish: (req) => call(CHANNELS.captureRegionFinish, req),
      regionCancel: (req) => call(CHANNELS.captureRegionCancel, req),
      regionStart: () => call(CHANNELS.captureRegionStart),
      recordingArm: (req) => call(CHANNELS.captureRecordingArm, req),
      recordingBegin: (req) => call(CHANNELS.captureRecordingBegin, req),
      recordingChunk: (req) => call(CHANNELS.captureRecordingChunk, req),
      recordingFinish: (req) => call(CHANNELS.captureRecordingFinish, req),
      recordingAbort: (req) => call(CHANNELS.captureRecordingAbort, req),
      list: () => call(CHANNELS.captureList),
      remove: (req) => call(CHANNELS.captureDelete, req),
      reveal: (req) => call(CHANNELS.captureReveal, req),
      copy: (req) => call(CHANNELS.captureCopy, req),
      setSettings: (req) => call(CHANNELS.captureSettingsSet, req),
      clipboard: {
        list: () => call(CHANNELS.captureClipboardList),
        copy: (req) => call(CHANNELS.captureClipboardCopy, req),
        remove: (req) => call(CHANNELS.captureClipboardDelete, req),
        clear: () => call(CHANNELS.captureClipboardClear),
      },
      attachment: (req) => call(CHANNELS.captureAttachment, req),
      sendToCreator: (req) => call(CHANNELS.captureSendToCreator, req),
      openInStudio: (req) => call(CHANNELS.captureOpenInStudio, req),
      importFromApp: (req) => call(CHANNELS.captureImport, req),
      onChanged: (handler) => subscribe(EVENT_CHANNELS.captureChanged, handler),
    },
  };
}
