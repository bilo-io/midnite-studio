import { describe, expect, it } from 'vitest';

import { CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { workflowsManifest } from './manifest';
import { workflowsViews } from './renderer';

/** The template's contract (see the monitor's): manifest and shared registrations agree. */
describe('workflows manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[workflowsManifest.feature])[0]).toBe(workflowsManifest.owner);
  });

  it('lists exactly its shared view registration', () => {
    expect(workflowsManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.workflows]);
  });

  it('gives the renderer a loader for every view, and nothing else', () => {
    expect(Object.keys(workflowsViews).sort()).toEqual(workflowsManifest.views.map((v) => v.id).sort());
  });

  it('names only real channels', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of workflowsManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel).toMatch(/^mstudio:(workflow|workflow-templates|workflow-runs|demo-api):/);
    }
  });

  it('lists no channel that would hand a key to a renderer', () => {
    for (const channel of workflowsManifest.ipc) expect(channel).not.toMatch(/secrets|api-?key/i);
  });
});
