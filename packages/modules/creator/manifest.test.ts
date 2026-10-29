import { describe, expect, it } from 'vitest';
import { APP_MODULES, MODULE_IDS } from '@midnite/studio-shared';

import { CREATOR_REPO_ID, creatorManifest } from './manifest';

describe('creator manifest', () => {
  it('names a real module id', () => {
    expect(MODULE_IDS).toContain(creatorManifest.module);
  });

  it('is mounted by exactly agents, media and gamer (and Studio, which mounts every module)', () => {
    const hosts = Object.entries(APP_MODULES)
      .filter(([, modules]) => modules.includes(creatorManifest.module))
      .map(([host]) => host)
      .sort();
    expect(hosts).toEqual(['agents', 'gamer', 'media', 'studio']);
  });

  it('scopes media to one repo id', () => {
    expect(CREATOR_REPO_ID).toBe('creator');
  });
});
