import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

import type { DocRef, DocSession } from './use-doc-session';

/**
 * The Docs feature's host port (Phase 113 Theme Q) — what Docs needs from the
 * app that composes it, beyond the frame and the media kit.
 *
 * Studio remembers the last-edited doc per repository in its `ui-store`
 * (`mediaLastDoc`) and has an AI thread pane built on its agent roster, the
 * ai-thread composer and voice — none of which a feature may import. So the
 * feature declares the seams and each app fills them: Studio's adapter is
 * `packages/app/src/compose/media-docs-host.tsx`. An app with no agents
 * (Creator today) leaves `ThreadPanel` out and Docs is a two-pane editor.
 */
export type DocThreadPanelProps = {
  doc: DocRef | null;
  session: DocSession;
  /** Markdown of the selection Ask AI was invoked on, if any. */
  selection: string | undefined;
  onClearSelection: () => void;
  getMarkdown: () => string;
  /** Changes whenever Ask AI is invoked — focuses the prompt. */
  focusToken: number;
};

/** What the host's Present button is given: the draft as it stands, and the doc's name. */
export type DocPresentButtonProps = { content: string; label: string };

export type LastDoc = { project: string; path: string };

export type DocsHost = {
  /** The last-edited doc in a repository — read once when the explorer opens it. Callable outside render. */
  getLastDoc: (repoId: string) => LastDoc | undefined;
  /** Records the doc a real edit landed in. Callable outside render. */
  setLastDoc: (repoId: string, doc: LastDoc) => void;
  /** The right pane: the doc's AI thread. Absent → Docs has no detail pane and no "Ask AI". */
  ThreadPanel?: ComponentType<DocThreadPanelProps>;
  /**
   * "Present as slides" for the open doc, in the toolbar. Absent → no button. Studio leaves it out (its Docs
   * toolbar has never had one); Creator composes the Slides feature's button here.
   */
  PresentButton?: ComponentType<DocPresentButtonProps>;
};

const DocsHostContext = createContext<DocsHost | null>(null);

export function DocsHostProvider({ host, children }: { host: DocsHost; children: ReactNode }) {
  return <DocsHostContext.Provider value={host}>{children}</DocsHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, Docs would forget where you were. */
export function useDocsHost(): DocsHost {
  const host = useContext(DocsHostContext);
  if (!host) throw new Error('The Docs tab must be rendered inside <DocsHostProvider>');
  return host;
}
