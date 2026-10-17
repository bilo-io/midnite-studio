import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { sessionsManifest } from './manifest';
import { sessionsViews } from './renderer';

/** The template's contract (see the monitor's): manifest, shared registrations and the renderer agree. */
describe('sessions manifest', () => {
  it('owns what the placement map says it owns — Coder', () => {
    expect(placementOwners(FEATURE_PLACEMENT[sessionsManifest.feature])[0]).toBe(sessionsManifest.owner);
    expect(sessionsManifest.owner).toBe('coder');
  });

  it('lists exactly its shared view registration, and the renderer loads it', () => {
    expect(sessionsManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.sessions]);
    expect(Object.keys(sessionsViews)).toEqual(['sessions']);
  });

  it('names only real channels and events, and never a create or a kill', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of [...sessionsManifest.ipc, ...sessionsManifest.sends]) expect(known.has(channel), channel).toBe(true);
    const events = new Set<string>(Object.values(EVENT_CHANNELS));
    for (const event of sessionsManifest.events) expect(events.has(event), event).toBe(true);
    const all = [...sessionsManifest.ipc, ...sessionsManifest.sends];
    expect(all).not.toContain(CHANNELS.ptyCreate);
    expect(all).not.toContain(CHANNELS.ptyKill);
  });
});
