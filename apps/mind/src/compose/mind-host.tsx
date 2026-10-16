import { useStore } from 'zustand';

import { createPersistedStore, safeLocalStorage } from '@midnite/studio-frame';
import type { NotesEditorProps, NotesHost } from '@midnite/studio-feature-notes/renderer';
import { MIND_NOTEBOOK_ID, type RepoDescriptor } from '@midnite/studio-shared';

/**
 * Mind's {@link NotesHost}: one notebook, a plain textarea and no agents.
 *
 * Notes are stored against a repository id, and Mind has no repositories, so
 * it keeps everything in one fixed notebook. Studio's own notes are not in
 * it — they live in Studio's `userData` — until the migration into the
 * runtime's data directory is switched on, which is why the empty state says
 * the notebook starts empty.
 */
export { MIND_NOTEBOOK_ID };

export const MIND_NOTEBOOK: RepoDescriptor = {
  id: MIND_NOTEBOOK_ID,
  name: 'Notebook',
  path: '',
  headRef: '',
  worktrees: [],
};

export const MIND_SETTINGS_KEY = 'midnite-mind.settings';
const LIST_WIDTH = { initial: 320, min: 220, max: 560 } as const;

type MindSettings = { listWidth: number; setListWidth: (value: number) => void };

export function createMindHost(storage: Storage | undefined = safeLocalStorage()): NotesHost {
  const store = createPersistedStore<MindSettings, { listWidth: number }>({
    key: MIND_SETTINGS_KEY,
    defaults: { listWidth: LIST_WIDTH.initial },
    storage,
    pick: (s) => ({ listWidth: s.listWidth }),
    state: (set, initial) => ({ ...initial, setListWidth: (listWidth) => set({ listWidth }) }),
  });
  const repos = [MIND_NOTEBOOK];
  return {
    useRepoContext: () => ({ selectedRepoId: MIND_NOTEBOOK_ID, repos }),
    useListWidth: () => ({
      width: useStore(store, (s) => s.listWidth),
      setWidth: store.getState().setListWidth,
      ...LIST_WIDTH,
    }),
    // Mind has no agents: the notes' "draft a plan" and "adhoc task" actions disable themselves.
    useHandoff: () => null,
    Editor: MindEditor,
    Preview: MindPreview,
    emptyHint:
      'Your notebook is empty. Mind keeps its own notes; the ones you wrote in Studio move across in a later release.',
  };
}

function MindEditor({ fileName, value, onChange, autoFocus }: NotesEditorProps) {
  return (
    <textarea
      data-filename={fileName}
      aria-label="Note"
      value={value}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-0 flex-1 resize-none border-0 bg-background p-4 font-mono text-sm leading-6 outline-none"
    />
  );
}

/** Plain text, wrapped: Mind has no markdown renderer yet, and a faithful one is not worth a guess. */
function MindPreview({ content }: { content: string }) {
  return <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-6">{content}</div>;
}

export const MIND_HOST = createMindHost();
