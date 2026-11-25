import { describe, expect, it } from 'vitest';

import { CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { agentProfilesManifest } from './manifest';
import { agentProfilesViews } from './renderer';

describe('agent-profiles manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[agentProfilesManifest.feature])[0]).toBe(agentProfilesManifest.owner);
  });

  it('lists exactly its shared view registration', () => {
    expect(agentProfilesManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS['agent-profiles']]);
  });

  it('gives the renderer a loader for every view, and nothing else', () => {
    expect(Object.keys(agentProfilesViews).sort()).toEqual(agentProfilesManifest.views.map((v) => v.id).sort());
  });

  it('names only real agent-profile channels', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    expect(agentProfilesManifest.ipc).toHaveLength(6);
    for (const channel of agentProfilesManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel).toMatch(/^mstudio:agent-profile:/);
    }
  });
});
