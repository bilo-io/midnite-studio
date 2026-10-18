import { describe, expect, it } from 'vitest';

import {
  CHANNELS,
  EVENT_CHANNELS,
  FEATURE_PLACEMENT,
  FEATURE_VIEWS,
  placementOwners,
} from '@midnite/studio-shared';

import { captureManifest } from './manifest';
import { captureViews } from './renderer';

/** The template's contract (see the monitor's): manifest, shared registrations and the renderer agree. */
describe('capture manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[captureManifest.feature])[0]).toBe(
      captureManifest.owner,
    );
  });

  it('lists exactly its shared view registration', () => {
    expect(captureManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.capture]);
  });

  it('gives the renderer a loader for every view, and nothing else', () => {
    expect(Object.keys(captureViews).sort()).toEqual(captureManifest.views.map((v) => v.id).sort());
  });

  it('names only real channels, and every capture channel', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of captureManifest.ipc) expect(known.has(channel), channel).toBe(true);
    const all = Object.values(CHANNELS).filter((c) => c.startsWith('mstudio:capture:'));
    expect([...captureManifest.ipc].sort()).toEqual(all.sort());
    expect(captureManifest.events).toEqual([EVENT_CHANNELS.captureChanged]);
  });
});
