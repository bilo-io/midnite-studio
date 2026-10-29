// vitest/jsdom: the app's manifest against the placement map and the Coder module's own. The composition
// (views, host ports, hand-off) is tested where it lives, in `packages/modules/coder/renderer/`.
import { describe, expect, it } from 'vitest';

import { apiClientManifest } from '@midnite/studio-feature-api-client/renderer';
import { databaseManifest } from '@midnite/studio-feature-database/renderer';
import { forgeManifest } from '@midnite/studio-feature-forge/renderer';
import { sessionsManifest } from '@midnite/studio-feature-sessions/renderer';
import { tasksManifest } from '@midnite/studio-feature-tasks/renderer';
import { testsManifest } from '@midnite/studio-feature-tests/renderer';
import { coderManifest } from '@midnite/studio-module-coder/manifest';
import { FEATURE_PACKAGE_FOLDERS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { CoderApp } from './coder-app';
import { CODER_APP } from './coder-manifest';

describe('Coder app', () => {
  it('is the owner the placement map names for forge, reviews, actions, tests, the API client, the database, sessions and tasks', () => {
    for (const folder of [...FEATURE_PACKAGE_FOLDERS.forge, 'tests', 'api-client', 'database', 'sessions', 'tasks'] as const) {
      expect(placementOwners(FEATURE_PLACEMENT[folder])[0]).toBe(CODER_APP.id);
    }
    expect(CODER_APP.features).toEqual([
      forgeManifest.feature,
      testsManifest.feature,
      apiClientManifest.feature,
      databaseManifest.feature,
      sessionsManifest.feature,
      tasksManifest.feature,
    ]);
  });

  it("wears the launcher catalog's accent, opens on Reviews, and mounts the Coder module", () => {
    expect(CODER_APP.accent).toBe('#2e7cfa');
    expect(CODER_APP.home).toBe('reviews');
    expect(CODER_APP.accent).toBe(coderManifest.accent);
    expect(CODER_APP.views).toEqual(coderManifest.views.map((v) => v.id));
    expect(typeof CoderApp).toBe('function');
  });
});
