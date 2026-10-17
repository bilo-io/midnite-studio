import { FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { tasksManifest } from './manifest';
import { tasksViews } from './renderer';

/** The template's contract (see the monitor's): manifest, shared registrations and the renderer agree. */
describe('tasks manifest', () => {
  it('owns what the placement map says it owns — Coder', () => {
    expect(placementOwners(FEATURE_PLACEMENT[tasksManifest.feature])[0]).toBe(tasksManifest.owner);
    expect(tasksManifest.owner).toBe('coder');
  });

  it('lists exactly its shared view registration, and the renderer loads it', () => {
    expect(tasksManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.tasks]);
    expect(Object.keys(tasksViews)).toEqual(['tasks']);
  });

  it('registers no channel of its own — the forge feature owns the issue and board channels', () => {
    expect(tasksManifest.ipc).toEqual([]);
    expect(tasksManifest.events).toEqual([]);
  });
});
