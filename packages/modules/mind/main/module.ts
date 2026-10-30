import { notesMain, type NotesStore } from '@midnite/studio-feature-notes/main';
import { defineFeatureMain } from '@midnite/studio-runtime';

import { registerMindOn, type MindElectron } from './context';
import { MIND_KNOWLEDGE_CHANNELS } from './knowledge';

/** What the host hands the Mind module: the electron pieces, and a hook for the store (flushed before quit). */
export type MindModuleServices = {
  electron: MindElectron;
  onRegistered?: (store: NotesStore) => void;
};

/**
 * The Mind module's main half (Phase 124 Theme E.3), on the feature seam so a host mounts it through
 * `mountModuleMains`: the notes feature's channels and the Knowledge view's three.
 */
export const mindModuleMain = defineFeatureMain<MindModuleServices>({
  feature: 'mind',
  channels: [...notesMain.channels, ...MIND_KNOWLEDGE_CHANNELS],
  register(ctx, { electron, onRegistered }) {
    onRegistered?.(registerMindOn(ctx, electron));
  },
});
