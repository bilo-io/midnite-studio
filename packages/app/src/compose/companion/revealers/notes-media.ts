import { resourceRefLabel, type MediaKind, type SpriteOpenEvent } from '@midnite/studio-shared';

import { bridge } from '../../../services/bridge';
import { useNotesStore } from '../../../store/notes-store';
import { useUiStore } from '../../../store/ui-store';
import { useMediaOpenRequest, type MediaOpenKind } from '../../../features/media/media-open-request';
import { useModelOpenRequest } from '@midnite/studio-feature-media-model/events';
import { useSpriteOpenRequest } from '@midnite/studio-feature-media-sprite/events';
import { useTerrainOpenRequest } from '@midnite/studio-feature-media-terrain/renderer';
import type { FamilyRevealers } from '@midnite/studio-feature-companion/renderer';

/**
 * Notes + media — Phase 112 Theme E. The engine has already switched repo and
 * view; these only select. Nothing here plays, generates, saves or edits.
 */
export type NotesMediaResourceKind = 'note' | 'media';

/** The first path segment, minus a `/terrain.json`-style leaf — an asset's folder name. */
const assetFolder = (path: string): string => path.split('/')[0] ?? path;

/** The kinds served by the generic one-shot store (the other three keep their own). */
const GENERIC: ReadonlySet<MediaKind> = new Set<MediaOpenKind>(['doc', 'image', 'video', 'audio', 'map', 'game']);

export const NOTES_MEDIA_REVEALERS: FamilyRevealers<NotesMediaResourceKind> = {
  note: {
    view: 'notes',
    reveal: async (ref) => {
      const note = useNotesStore.getState().notes[ref.id];
      if (!note) return { ok: false, reason: 'not-found', say: "I couldn't find that note." };
      // A note belongs to a repo the ref does not carry, so the repo comes from the note itself.
      const ui = useUiStore.getState();
      if (ui.selectedRepoId !== note.repoId) ui.selectRepo(note.repoId);
      useNotesStore.getState().selectNote(ref.id);
      return { ok: true, did: 'revealed', label: resourceRefLabel(ref) };
    },
  },
  media: {
    view: 'media',
    reveal: async (ref) => {
      const label = resourceRefLabel(ref);
      if (ref.media === 'game') {
        // Games are app-global; `project` is the game id. Check it exists before opening an empty pane.
        const games = await bridge()?.games.list();
        if (games && !games.games.some((g) => g.gameId === ref.project)) {
          return { ok: false, reason: 'not-found', say: "I couldn't find that game." };
        }
      }
      useUiStore.getState().openMedia(ref.media);
      if (GENERIC.has(ref.media)) {
        useMediaOpenRequest.getState().open({
          repoId: ref.repoId,
          media: ref.media as MediaOpenKind,
          project: ref.project,
          ...(ref.path === undefined ? {} : { path: ref.path }),
        });
      } else if (ref.media === 'model' && ref.path !== undefined) {
        useModelOpenRequest.getState().open({ repoId: ref.repoId, project: ref.project, path: ref.path });
      } else if (ref.media === 'terrain' && ref.path !== undefined) {
        useTerrainOpenRequest.getState().open({ repoId: ref.repoId, project: ref.project, terrain: assetFolder(ref.path) });
      } else if (ref.media === 'sprite' && ref.path !== undefined) {
        useSpriteOpenRequest.getState().open({ repoId: ref.repoId, group: ref.project as SpriteOpenEvent['group'], asset: assetFolder(ref.path) });
      }
      return { ok: true, did: 'revealed', label };
    },
  },
};
