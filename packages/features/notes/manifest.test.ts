import { describe, expect, it } from 'vitest';

import { CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { notesManifest } from './manifest';
import { notesViews } from './renderer';

/** The template's contract (see the optimizer's): manifest, shared registrations and the renderer agree. */
describe('notes manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[notesManifest.feature])[0]).toBe(notesManifest.owner);
  });

  it('lists exactly its shared view registration', () => {
    expect(notesManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.notes]);
  });

  it('gives the renderer a loader for every view, and nothing else', () => {
    expect(Object.keys(notesViews).sort()).toEqual(notesManifest.views.map((v) => v.id).sort());
  });

  it('names only real notes and channels', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of notesManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:notes:/.test(channel), channel).toBe(true);
    }
  });
});
