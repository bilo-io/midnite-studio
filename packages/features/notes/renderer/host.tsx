import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

import type { RepoDescriptor } from '@midnite/studio-shared';

/**
 * The notes feature's host port — what this feature needs from the app that
 * composes it, beyond the frame (Phase 113 Theme M).
 *
 * Notes are kept against a repository id. Studio has many repositories and an
 * editor, a markdown renderer and an agent hand-off; Mind has one notebook, a
 * plain textarea and no agents. So the feature declares the seams and each app
 * fills them in — Studio's adapter is `packages/app/src/compose/notes-host.tsx`,
 * Mind's is `apps/mind/src/compose/mind-host.tsx`.
 */

/** The agent skills a note can be handed to. */
export type NoteHandoff = (request: {
  skillId: 'brainstorm' | 'execAdhoc';
  repo: RepoDescriptor;
  body: string;
}) => void;

export type NotesListWidth = {
  width: number;
  setWidth: (value: number) => void;
  /** What a double-click on the resize handle returns to. */
  initial: number;
  min: number;
  max: number;
};

export type NotesEditorProps = {
  fileName: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
};

export type NotesHost = {
  /** The repository the user is in, and the ones that exist. A hook. */
  useRepoContext: () => { selectedRepoId: string | null; repos: readonly RepoDescriptor[] };
  /** The sidenav's persisted width. A hook. */
  useListWidth: () => NotesListWidth;
  /** Hands a note to an agent, or `null` when this app has no agents — the actions then disable. A hook. */
  useHandoff: () => NoteHandoff | null;
  /** The note body editor (Studio: Monaco; Mind: a textarea). May suspend; the view wraps it. */
  Editor: ComponentType<NotesEditorProps>;
  /** Renders a note body as markdown. */
  Preview: ComponentType<{ content: string }>;
  /** Shown under "Nothing captured yet" — Mind says why its notebook starts empty. */
  emptyHint?: string;
  /** Shown when no repository is open (Studio only; an app with a fixed notebook never reaches it). */
  noRepoHint?: string;
};

const NotesHostContext = createContext<NotesHost | null>(null);

export function NotesHostProvider({ host, children }: { host: NotesHost; children: ReactNode }) {
  return <NotesHostContext.Provider value={host}>{children}</NotesHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, Notes would edit a notebook nobody can see. */
export function useNotesHost(): NotesHost {
  const host = useContext(NotesHostContext);
  if (!host) throw new Error('The notes feature must be rendered inside <NotesHostProvider>');
  return host;
}
