import { describe, expect, it } from 'vitest';

import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { modelsManifest } from './manifest';
import { modelsViews } from './renderer';

/** The template's contract (see the monitor's): manifest, shared registrations and the renderer agree. */
describe('models manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[modelsManifest.feature])[0]).toBe(modelsManifest.owner);
  });

  it('lists exactly its shared view registration', () => {
    expect(modelsManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.models]);
  });

  it('gives the renderer a loader for every view, and nothing else', () => {
    expect(Object.keys(modelsViews).sort()).toEqual(modelsManifest.views.map((v) => v.id).sort());
  });

  it('names only real ollama channels and events', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of modelsManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel).toMatch(/^mstudio:ollama:/);
    }
    const events = new Set<string>(Object.values(EVENT_CHANNELS));
    for (const event of modelsManifest.events) expect(events.has(event), event).toBe(true);
  });

  it('never lists a channel that would hand the cloud key to a renderer', () => {
    for (const channel of modelsManifest.ipc) expect(channel).not.toMatch(/secrets|api-?key/i);
  });
});
