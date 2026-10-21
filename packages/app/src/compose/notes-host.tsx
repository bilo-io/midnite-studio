import { lazy } from 'react';

import type { NotesHost } from '@midnite/studio-feature-notes/renderer';

import { useSkillHandoff } from '../features/agent/use-skill-handoff';
import { MarkdownPreview } from '../features/files/preview/markdown-preview';
import { useRepos } from '../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';

/**
 * Monaco — lazy-loaded so the Notes editor adds no weight to the initial
 * bundle; the feature's view wraps the editor in its own `Suspense`.
 */
const CodeEditor = lazy(() =>
  import('../features/files/preview/code-editor').then((m) => ({ default: m.CodeEditor })),
);

/**
 * Studio's side of the notes feature's host port (Phase 113 Theme M): its
 * repositories, the persisted sidenav width, the agent hand-off, Monaco and
 * the markdown preview. Notes themselves keep their storage — main's
 * `userData/notes/<repoId>.json` — so nothing a user has stored moved.
 */
export const STUDIO_NOTES_HOST = {
  useRepoContext: () => {
    const selectedRepoId = useUiStore((s) => s.selectedRepoId);
    const repos = useRepos().data;
    return { selectedRepoId, repos: repos ?? [] };
  },
  useListWidth: () => {
    const width = useUiStore((s) => s.layout.notesListWidth);
    const setLayout = useUiStore((s) => s.setLayout);
    return {
      width,
      setWidth: (value: number) => setLayout('notesListWidth', value),
      initial: DEFAULT_LAYOUT.notesListWidth,
      ...LAYOUT_BOUNDS.notesListWidth,
    };
  },
  useHandoff: () => useSkillHandoff(),
  Editor: CodeEditor,
  Preview: MarkdownPreview,
} satisfies NotesHost;
