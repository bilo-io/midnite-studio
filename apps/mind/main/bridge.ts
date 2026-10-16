import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Mind exposes — exactly what the notes feature's store reads
 * (`notes.list/save/delete/reorder`), and nothing else. Every other bridge namespace is
 * deliberately absent, so a Mind renderer cannot reach git, the pty or the browser even by
 * accident (`bridge.test.ts` holds the list).
 */
export type MindBridge = {
  notes: MidniteStudioBridge['notes'];
};

export type { RendererIpc };

export function createMindBridge(ipc: RendererIpc): MindBridge {
  const { call, send } = createBridgeSlice(ipc);
  return {
    notes: {
      list: (req) => call(CHANNELS.notesList, req),
      save: (req) => send(CHANNELS.notesSave, req),
      delete: (req) => send(CHANNELS.notesDelete, req),
      reorder: (req) => send(CHANNELS.notesReorder, req),
    },
  };
}
