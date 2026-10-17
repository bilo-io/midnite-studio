import { beforeEach, describe, expect, it } from 'vitest';

import { useNotesStore } from '../../../../store/notes-store';
import { useUiStore } from '../../../../store/ui-store';
import { useMediaOpenRequest } from '../../../media/media-open-request';
import { useModelOpenRequest } from '@midnite/studio-feature-media-model/events';
import { useTerrainOpenRequest } from '@midnite/studio-feature-media-terrain/renderer';
import { NOTES_MEDIA_REVEALERS } from './notes-media';

const ctx = { caller: 'companion', focusedWindow: false } as const;

beforeEach(() => {
  useMediaOpenRequest.getState().clear();
  useModelOpenRequest.getState().clear();
  useTerrainOpenRequest.getState().clear();
  useNotesStore.setState({ notes: {}, selectedNoteId: null });
  useUiStore.setState({ selectedRepoId: 'r1', mediaTab: 'doc' });
});

describe('note revealer', () => {
  it('lives in the notes view and selects the note in the store, switching to its repo', async () => {
    useNotesStore.setState({ notes: { n1: { id: 'n1', repoId: 'r2', body: 'x', status: 'idea', order: 0, createdAt: 1, updatedAt: 1 } as never } });
    expect(NOTES_MEDIA_REVEALERS.note.view).toBe('notes');
    const out = await NOTES_MEDIA_REVEALERS.note.reveal({ kind: 'note', id: 'n1' }, ctx);
    expect(out.ok).toBe(true);
    expect(useNotesStore.getState().selectedNoteId).toBe('n1');
    expect(useUiStore.getState().selectedRepoId).toBe('r2');
  });

  it('is not-found for an unknown note and selects nothing', async () => {
    const out = await NOTES_MEDIA_REVEALERS.note.reveal({ kind: 'note', id: 'nope' }, ctx);
    expect(out).toMatchObject({ ok: false, reason: 'not-found' });
    expect(useNotesStore.getState().selectedNoteId).toBeNull();
  });
});

describe('media revealer', () => {
  it.each(['doc', 'image', 'video', 'audio', 'map'] as const)('%s: picks the tab and queues the selection', async (media) => {
    const out = await NOTES_MEDIA_REVEALERS.media.reveal({ kind: 'media', repoId: 'r1', media, project: 'p', path: 'a/b' }, ctx);
    expect(out.ok).toBe(true);
    expect(useUiStore.getState().mediaTab).toBe(media);
    expect(useMediaOpenRequest.getState().request).toMatchObject({ repoId: 'r1', media, project: 'p', path: 'a/b' });
  });

  it('keeps the existing model and terrain stores for those kinds', async () => {
    await NOTES_MEDIA_REVEALERS.media.reveal({ kind: 'media', repoId: 'r1', media: 'model', project: 'g', path: 'fox/fox.obj' }, ctx);
    expect(useModelOpenRequest.getState().request).toMatchObject({ project: 'g', path: 'fox/fox.obj' });
    await NOTES_MEDIA_REVEALERS.media.reveal({ kind: 'media', repoId: 'r1', media: 'terrain', project: 'g', path: 'hills/terrain.json' }, ctx);
    expect(useTerrainOpenRequest.getState().request).toMatchObject({ project: 'g', terrain: 'hills' });
    expect(useMediaOpenRequest.getState().request).toBeNull();
  });

  it('repeat requests for the same item are still a change', async () => {
    const ref = { kind: 'media', repoId: 'r1', media: 'doc', project: 'p' } as const;
    await NOTES_MEDIA_REVEALERS.media.reveal(ref, ctx);
    const first = useMediaOpenRequest.getState().request?.n;
    await NOTES_MEDIA_REVEALERS.media.reveal(ref, ctx);
    expect(useMediaOpenRequest.getState().request?.n).toBe((first ?? 0) + 1);
  });
});
