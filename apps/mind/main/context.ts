import { createNotesStore, notesMain, type NotesStore } from '@midnite/studio-feature-notes/main';
import { createIpcContext, type IpcContextElectron } from '@midnite/studio-runtime';

/** The electron pieces Mind's main needs, injected so registration is testable under bare vitest. */
export type MindElectron = IpcContextElectron & {
  /** Where notes live: `<userData>/notes/<notebook>.json`, under the runtime's data directory. */
  notesDirectory: string;
  /** Where a malformed payload is reported. */
  warn?: (issue: string) => void;
};

/**
 * Registers every channel Mind's renderer can call: the notes feature's four. Returns the store so
 * the caller can flush it before the app quits (writes are debounced).
 */
export function registerMindHandlers(el: MindElectron): NotesStore {
  const store = createNotesStore(el.notesDirectory);
  notesMain.register(createIpcContext(el), { store: () => store, ...(el.warn ? { warn: el.warn } : {}) });
  return store;
}
