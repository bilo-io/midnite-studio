import { describe, expect, it } from 'vitest';

import {
  CHANNELS,
  FEATURE_PLACEMENT,
  FEATURE_SETTINGS_PAGES,
  FEATURE_VIEWS,
  placementOwners,
} from '@midnite/studio-shared';

import { optimizerManifest } from './manifest';
import { optimizerSettingsPages, optimizerViews } from './renderer';

/**
 * The template's contract (Phase 113 Theme C): the manifest, the shared
 * registrations the wire contract is built from, and both halves of the
 * package all name the same ids. A view, page or channel added to one and
 * not the others fails here, not at runtime as a blank view or an
 * unanswered `invoke`. (The main half is checked in `main/index.test.ts`,
 * which runs it.)
 */
describe('optimizer manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[optimizerManifest.feature])[0]).toBe(optimizerManifest.owner);
  });

  it('lists exactly its shared view and settings page registrations, in order', () => {
    expect(optimizerManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.optimizer]);
    expect([...optimizerManifest.settingsPages]).toEqual([...FEATURE_SETTINGS_PAGES.optimizer]);
  });

  it('gives the renderer a component for every view and settings page, and nothing else', () => {
    expect(Object.keys(optimizerViews).sort()).toEqual(optimizerManifest.views.map((v) => v.id).sort());
    expect(Object.keys(optimizerSettingsPages).sort()).toEqual([...optimizerManifest.settingsPages].sort());
  });

  it('names only real optimizer channels', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of optimizerManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel.startsWith('mstudio:optimizer:'), channel).toBe(true);
    }
  });
});
