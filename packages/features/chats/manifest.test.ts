import { describe, expect, it } from 'vitest';

import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { chatsManifest } from './manifest';
import { chatsViews } from './renderer';

/** The template's contract (see the monitor's): manifest, shared registrations and the renderer agree. */
describe('chats manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[chatsManifest.feature])[0]).toBe(chatsManifest.owner);
  });

  it('lists exactly its shared view registration', () => {
    expect(chatsManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.chats]);
  });

  it('gives the renderer a loader for every view, and nothing else', () => {
    expect(Object.keys(chatsViews).sort()).toEqual(chatsManifest.views.map((v) => v.id).sort());
  });

  it('names only real chat channels and events', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of chatsManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel).toMatch(/^mstudio:chats:/);
    }
    const events = new Set<string>(Object.values(EVENT_CHANNELS));
    for (const event of chatsManifest.events) expect(events.has(event), event).toBe(true);
  });

  it('lists no channel that would hand a key to a renderer', () => {
    for (const channel of chatsManifest.ipc) expect(channel).not.toMatch(/secrets|api-?key/i);
  });
});
