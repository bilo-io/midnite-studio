import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { featurePackagePlacement, PLACEMENT_APP_IDS } from '../packages/shared/src/domain/placement.ts';
import {
  ALL_APPS,
  PLACEMENT_APPS,
  appsForProjects,
  changedFilesArgs,
  moonMajor,
  parseMoonProjects,
} from './affected-apps.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('appsForProjects', () => {
  it('maps app-<id> tags to those apps, in launcher order then studio', () => {
    const { apps, unknownTags } = appsForProjects([
      { id: 'feature-optimizer', tags: ['layer-feature', 'app-cleaner', 'app-studio'] },
      { id: 'feature-monitor', tags: ['app-monitor', 'app-studio'] },
    ]);
    expect(apps).toEqual(['cleaner', 'monitor', 'studio']);
    expect(unknownTags).toEqual([]);
  });

  it('app-all reaches every app', () => {
    expect(appsForProjects([{ id: 'frame', tags: ['layer-frame', 'app-all'] }]).apps).toEqual(ALL_APPS);
  });

  it('projects with no app tag name no app', () => {
    expect(appsForProjects([{ id: 'git-engine', tags: [] }, { id: 'website', tags: null }, { id: 'root' }]).apps).toEqual(
      [],
    );
  });

  it('reports an app-* tag that names no app instead of dropping it silently', () => {
    const { apps, unknownTags } = appsForProjects([{ id: 'feature-x', tags: ['app-cleanr', 'app-studio'] }]);
    expect(apps).toEqual(['studio']);
    expect(unknownTags).toEqual([{ project: 'feature-x', tag: 'app-cleanr' }]);
  });
});

describe('moon plumbing', () => {
  it('reads the project list both moon majors print', () => {
    const json = JSON.stringify({
      projects: [
        { id: 'frame', config: { tags: ['app-all'] } },
        { id: 'app', config: { tags: null } },
      ],
      options: {},
    });
    expect(parseMoonProjects(json)).toEqual([
      { id: 'frame', tags: ['app-all'] },
      { id: 'app', tags: [] },
    ]);
  });

  it('reads the major from either version banner', () => {
    expect(moonMajor('moon 1.41.7\n')).toBe(1);
    expect(moonMajor('moon 2.5.6')).toBe(2);
    expect(() => moonMajor('nope')).toThrow();
  });

  it('picks touched-files --json on moon 1 and changed-files on moon 2', () => {
    expect(changedFilesArgs(1, 'origin/main', 'HEAD')).toEqual([
      'query',
      'touched-files',
      '--json',
      '--base',
      'origin/main',
      '--head',
      'HEAD',
    ]);
    expect(changedFilesArgs(2, 'origin/main', 'HEAD')).toEqual([
      'query',
      'changed-files',
      '--base',
      'origin/main',
      '--head',
      'HEAD',
    ]);
  });
});

describe('the repo', () => {
  it("the script's app list is shared's placement map", () => {
    expect(PLACEMENT_APPS).toEqual([...PLACEMENT_APP_IDS]);
  });

  it('every app-* tag in a moon.yml names a known app', () => {
    const roots = ['packages', 'packages/features', 'apps'];
    const tagged = [];
    for (const root of roots) {
      const dir = path.join(repoRoot, root);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        const file = path.join(dir, name, 'moon.yml');
        if (!existsSync(file)) continue;
        const tags = [...readFileSync(file, 'utf8').matchAll(/^\s+-\s+'(app-[a-z-]+)'/gm)].map((m) => m[1]);
        tagged.push({ id: `${root}/${name}`, tags });
      }
    }
    expect(appsForProjects(tagged).unknownTags).toEqual([]);
    // The layers beneath every app say so.
    const byId = Object.fromEntries(tagged.map((t) => [t.id, t.tags]));
    expect(byId['packages/shared']).toContain('app-all');
    expect(byId['packages/runtime']).toContain('app-all');
    expect(byId['packages/frame']).toContain('app-all');
    expect(byId['packages/features/optimizer']).toEqual(expect.arrayContaining(['app-cleaner', 'app-studio']));
  });

  it("a feature package's app-* tags are its placement-map apps plus studio", () => {
    const dir = path.join(repoRoot, 'packages/features');
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name, 'moon.yml');
      if (!existsSync(file)) continue;
      const tags = [...readFileSync(file, 'utf8').matchAll(/^\s+-\s+'(app-[a-z-]+)'/gm)].map((m) => m[1]);
      const placement = featurePackagePlacement(name);
      expect(placement, `packages/features/${name} has no FEATURE_PLACEMENT (or FEATURE_PACKAGE_SPLITS) entry`).toBeDefined();
      // A frame feature reaches every app; an app feature its owner(s) and Studio.
      const expected =
        placement === 'frame' ? ['app-all'] : [...[placement].flat().map((app) => `app-${app}`), 'app-studio'];
      expect(tags.sort(), `packages/features/${name}/moon.yml`).toEqual(expected.sort());
    }
  });
});
