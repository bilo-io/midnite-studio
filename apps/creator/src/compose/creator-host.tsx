import { createStandaloneMediaHost } from '@midnite/studio-feature-media-core/renderer';
import type { DocsHost, LastDoc } from '@midnite/studio-feature-media-docs/renderer';
import type { ImagesHost } from '@midnite/studio-feature-media-images/renderer';
import { createPersistedStore } from '@midnite/studio-frame';
import { useEffect, type RefObject } from 'react';

/**
 * The host ports Creator implements (Phase 113 Theme Q).
 *
 * Creator has no repository list: its media lives under one root that main registers as the
 * repository `creator` (`main/context.ts`), so the media shell is scoped to that id. Its state —
 * the tab it was on, pane widths, the last-edited doc — persists in Creator's own localStorage,
 * never in Studio's. Docs has no AI thread (Creator has no agents yet) and Images uses the
 * feature's plain create form.
 */
export const CREATOR_REPO_ID = 'creator';

export const CREATOR_MEDIA_HOST = createStandaloneMediaHost({
  repoId: CREATOR_REPO_ID,
  key: 'midnite-creator.media',
  initialTab: 'doc',
  noRepoBody: (_tab, label) => `${label} live in Midnite Creator's media folder.`,
});

type LastDocs = { lastDoc: Record<string, LastDoc> };
const lastDocs = createPersistedStore<LastDocs & { set: (repoId: string, doc: LastDoc) => void }, LastDocs>({
  key: 'midnite-creator.docs',
  defaults: { lastDoc: {} },
  pick: ({ lastDoc }) => ({ lastDoc }),
  state: (set, initial) => ({
    ...initial,
    set: (repoId, doc) => set((s) => ({ lastDoc: { ...s.lastDoc, [repoId]: doc } })),
  }),
});

export const CREATOR_DOCS_HOST: DocsHost = {
  getLastDoc: (repoId) => lastDocs.getState().lastDoc[repoId],
  setLastDoc: (repoId, doc) => lastDocs.getState().set(repoId, doc),
};

/** Escape closes the lightbox, and focus moves into it while it is open. */
function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [ref, onClose]);
}

export const CREATOR_IMAGES_HOST: ImagesHost = { useModal };
