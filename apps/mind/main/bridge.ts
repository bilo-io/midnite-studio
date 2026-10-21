import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Mind exposes — exactly what the notes feature's store reads
 * (`notes.list/save/delete/reorder/reviewDue/reviewGrade/capture`) and the Knowledge view reads (`knowledge.*`), and nothing else. Every other bridge namespace is
 * deliberately absent, so a Mind renderer cannot reach git, the pty or the browser even by
 * accident (`bridge.test.ts` holds the list).
 */
export type MindBridge = {
  notes: MidniteStudioBridge['notes'];
  /** The Knowledge tab's graph of the notebook (`main/knowledge.ts`). */
  knowledge: MidniteStudioBridge['knowledge'];
};

export type { RendererIpc };

export function createMindBridge(ipc: RendererIpc): MindBridge {
  const { call, send, subscribe } = createBridgeSlice(ipc);
  return {
    notes: {
      list: (req) => call(CHANNELS.notesList, req),
      save: (req) => send(CHANNELS.notesSave, req),
      delete: (req) => send(CHANNELS.notesDelete, req),
      reorder: (req) => send(CHANNELS.notesReorder, req),
      reviewDue: (req) => call(CHANNELS.notesReviewDue, req),
      reviewGrade: (req) => call(CHANNELS.notesReviewGrade, req),
      capture: (req) => call(CHANNELS.notesCapture, req),
    },
    knowledge: {
      getGraph: (req) => call(CHANNELS.knowledgeGetGraph, req),
      getNodeDetail: (req) => call(CHANNELS.knowledgeGetNodeDetail, req),
      checkGraph: (req) => call(CHANNELS.knowledgeCheckGraph, req),
      onLayoutProgress: (handler) => subscribe(EVENT_CHANNELS.knowledgeLayoutProgress, handler),
    },
  };
}
