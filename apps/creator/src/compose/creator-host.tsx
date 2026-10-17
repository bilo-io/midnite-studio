import { createStandaloneMediaHost } from '@midnite/studio-feature-media-core/renderer';
import type { AudioHost } from '@midnite/studio-feature-media-audio/renderer';
import { PresentButton, type SlidesHost } from '@midnite/studio-feature-slides/renderer';
import type { VideoHost } from '@midnite/studio-feature-media-video/renderer';
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

/** "Present as slides" beside a doc's export: the Slides feature's own button over the draft as it stands. */
function PresentDoc({ content, label }: { content: string; label: string }) {
  return <PresentButton source={{ content, label }} />;
}

export const CREATOR_DOCS_HOST: DocsHost = {
  getLastDoc: (repoId) => lastDocs.getState().lastDoc[repoId],
  setLastDoc: (repoId, doc) => lastDocs.getState().set(repoId, doc),
  PresentButton: PresentDoc,
};

/**
 * Slides over Creator's own overlay rules: the feature's defaults — Escape closes the topmost overlay, the
 * dialog takes focus, links are plain anchors, code stays unhighlighted — plus the dark theme Creator ships in.
 */
export const CREATOR_SLIDES_HOST: SlidesHost = { useIsDark: () => true };

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

/**
 * Audio's plain prompt form and the sub-tab held in memory. The music editor is the feature's own, so
 * Creator has it too — arrangement, piano roll, mixer, GM sampler, export — with no song chat (that
 * needs agents, which Creator does not have) and the frame's simple popover for the instrument picker.
 */
export const CREATOR_AUDIO_HOST: AudioHost = {};

type LastVideoProjects = { lastProject: Record<string, string> };
const lastVideoProjects = createPersistedStore<LastVideoProjects & { set: (repoId: string, id: string) => void }, LastVideoProjects>({
  key: 'midnite-creator.video',
  defaults: { lastProject: {} },
  pick: ({ lastProject }) => ({ lastProject }),
  state: (set, initial) => ({
    ...initial,
    set: (repoId, id) => set((s) => ({ lastProject: { ...s.lastProject, [repoId]: id } })),
  }),
});

/**
 * Video with what Creator has: it remembers the last project, hosts the studio in an iframe (the
 * feature's default) and draws with its plain chrome. No terminal — Setup Video shows the
 * `npm install` to run instead — and no agents, so no Edit thread or skill buttons.
 */
export const CREATOR_VIDEO_HOST: VideoHost = {
  getLastProject: (repoId) => lastVideoProjects.getState().lastProject[repoId],
  setLastProject: (repoId, id) => lastVideoProjects.getState().set(repoId, id),
};
