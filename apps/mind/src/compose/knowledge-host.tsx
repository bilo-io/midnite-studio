import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand';

import { LuNotebookText } from 'react-icons/lu';

import {
  createPersistedStore,
  EmptyState,
  safeLocalStorage,
  SimplePopover,
  useKnowledgeFiltersStore,
  type KnowledgeHost,
  type KnowledgeSettings,
  type KnowledgeSourcePreviewProps,
} from '@midnite/studio-frame';
import { MIND_NOTEBOOK_ID } from '@midnite/studio-shared';

import { MindNotePreview } from './note-preview';

/**
 * Mind's implementation of the frame's Knowledge host port (Phase 113 Theme M).
 *
 * The corpus is the one notebook: its id is the fixed `MIND_NOTEBOOK_ID`, and main builds the graph
 * from the notes themselves (`main/notes-graph.ts`), so there is no worktree and nothing to run. The
 * view's preferences persist beside the notes' own, under their own storage key.
 */

export const MIND_KNOWLEDGE_SETTINGS_KEY = 'midnite-mind.knowledge';

const BOUNDS = {
  filtersWidth: { initial: 260, min: 200, max: 420 },
  detailWidth: { initial: 340, min: 260, max: 560 },
} as const;

const DEFAULTS: KnowledgeSettings = {
  rendererVariant: 'atlas',
  layoutId: 'force-atlas2',
  detailId: 'core',
  filtersWidth: BOUNDS.filtersWidth.initial,
  detailWidth: BOUNDS.detailWidth.initial,
};

type State = KnowledgeSettings & { patch: (patch: Partial<KnowledgeSettings>) => void };

function subscribeFocus(listener: () => void): () => void {
  window.addEventListener('focus', listener);
  window.addEventListener('blur', listener);
  return () => {
    window.removeEventListener('focus', listener);
    window.removeEventListener('blur', listener);
  };
}

/** What the view shows before the notebook has a note to graph. */
function EmptyNotebook() {
  return (
    <EmptyState
      icon={LuNotebookText}
      title="Nothing to graph yet"
      body="Write a note, add a #tag, or link one note to another with [[its first line]] - the graph builds itself from your notebook."
    />
  );
}

export function createMindKnowledgeHost(storage: Storage | undefined = safeLocalStorage()): KnowledgeHost {
  const store = createPersistedStore<State, KnowledgeSettings>({
    key: MIND_KNOWLEDGE_SETTINGS_KEY,
    defaults: DEFAULTS,
    storage,
    pick: (s) => ({
      rendererVariant: s.rendererVariant,
      layoutId: s.layoutId,
      detailId: s.detailId,
      filtersWidth: s.filtersWidth,
      detailWidth: s.detailWidth,
    }),
    state: (set, initial) => ({ ...initial, patch: (patch) => set(patch) }),
  });
  const read = (): KnowledgeSettings => {
    const s = store.getState();
    return {
      rendererVariant: s.rendererVariant,
      layoutId: s.layoutId,
      detailId: s.detailId,
      filtersWidth: s.filtersWidth,
      detailWidth: s.detailWidth,
    };
  };
  const corpus = { repoId: MIND_NOTEBOOK_ID };
  return {
    useFocus: () => useSyncExternalStore(subscribeFocus, () => document.hasFocus(), () => true),
    useCorpus: () => corpus,
    useSettings: () => useStore(store, (s) => s) as KnowledgeSettings,
    getSettings: read,
    setSettings: (patch) => {
      store.getState().patch(patch);
      if (patch.rendererVariant !== undefined) {
        useKnowledgeFiltersStore.setState({ rendererVariant: patch.rendererVariant });
      }
      if (patch.layoutId !== undefined) {
        useKnowledgeFiltersStore.setState({ layoutId: patch.layoutId });
      }
      if (patch.detailId !== undefined) {
        useKnowledgeFiltersStore.setState({ detailId: patch.detailId });
      }
    },
    prefersReducedMotion: () =>
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    panelBounds: BOUNDS,
    Absent: EmptyNotebook,
    Popover: SimplePopover,
    SourcePreview: ({ sourceFile }: KnowledgeSourcePreviewProps) => <MindNotePreview noteId={sourceFile} />,
  };
}

export const MIND_KNOWLEDGE_HOST = createMindKnowledgeHost();
