import { captureModuleMain, createCaptureAppService, type CaptureServiceElectron } from '@midnite/studio-module-capture/main';
import { mindModuleMain, type MindElectron } from '@midnite/studio-module-mind/main';
import { createIpcContext, mountModuleMains, type ModuleMount } from '@midnite/studio-runtime';
import type { NotesStore } from '@midnite/studio-feature-notes/main';
import type { CaptureService } from '@midnite/studio-feature-capture/main';

/** What Mind's host hands the Capture module on top of Mind's own pieces: the electron port, gate, overlay and data dir. */
export type MindCapturePieces = Omit<CaptureServiceElectron, 'trashItem' | 'send' | 'shortcut'>;

export type MindHostElectron = MindElectron & { capture: MindCapturePieces };

/**
 * Mounts the Mind host's modules, Mind and Capture (Phase 124 Theme E.3), through `mountModuleMains`, one
 * registration path for both. Capture's service is built here from the pieces the host composes (its electron
 * port, the display-media gate, the region overlay) and handed to the module's mount. Unlike standalone Capture,
 * Mind ships no default chord: the user can still set one in Capture's settings. Report an Issue stays Mind's own
 * (the Capture module registers none). Returns the pieces the host's file protocol and quit path need.
 */
export function registerMindHost(el: MindHostElectron): { store: NotesStore; capture: CaptureService; shutdown: () => Promise<void> } {
  const { capture: pieces, ...mindEl } = el;
  let store: NotesStore | null = null;
  const capture = createCaptureAppService({ ...pieces, trashItem: el.trashItem, send: el.send });
  const mounts: ModuleMount[] = [
    { module: mindModuleMain, services: { electron: mindEl, onRegistered: (s: NotesStore) => void (store = s) } },
    { module: captureModuleMain, services: { capture } },
  ];
  mountModuleMains(createIpcContext(el), mounts);
  if (store === null) throw new Error('the Mind module did not register');
  const notes: NotesStore = store;
  return {
    store: notes,
    capture,
    // The chord is released and clipboard polling stops, and the debounced note writes reach disk.
    shutdown: async () => {
      await capture.dispose();
      await notes.flush();
    },
  };
}
