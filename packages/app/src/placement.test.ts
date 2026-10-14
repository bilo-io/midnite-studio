import { FEATURE_PLACEMENT, placementOwners, PLACEMENT_APP_IDS, type Placement } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

/**
 * Phase 113 Theme A — the placement map (`shared/src/domain/placement.ts`) must
 * name every folder of `features/`, and `docs/APPS.md` must agree with it.
 *
 * Needs vitest/jsdom only, no browser: `import.meta.glob` lists the folders at
 * transform time (the renderer's eslint boundary forbids `node:fs` under
 * `src/`, the same reason `icon-names.test.ts` globs) and reads the doc as raw
 * text. The "guard on the guard" test fails loudly if either glob ever stops
 * matching, so a vacuous pass is impossible.
 */
const featureFiles = Object.keys(import.meta.glob('./features/*/**/*.{ts,tsx}'));
// Phase 113 Theme C: a feature extracted into its own package
// (`packages/features/<name>/`) is still a placed feature folder.
const packagedFeatureFiles = Object.keys(import.meta.glob('../../features/*/manifest.ts'));
const folders = [
  ...new Set([
    ...featureFiles.map((path) => path.split('/')[2] as string),
    ...packagedFeatureFiles.map((path) => path.split('/')[3] as string),
  ]),
].sort();

const docs = import.meta.glob('../../../docs/APPS.md', { query: '?raw', import: 'default', eager: true });
const appsDoc = Object.values(docs)[0] as string | undefined;

const mapped = FEATURE_PLACEMENT as Readonly<Record<string, Placement>>;
const owners = (placement: Placement) => placementOwners(placement).join(', ');

describe('placement map', () => {
  it('guard: the globs see the features and the doc', () => {
    expect(folders.length).toBeGreaterThan(40);
    expect(appsDoc).toBeTypeOf('string');
  });

  it('names every folder in features/', () => {
    expect(folders.filter((folder) => !(folder in mapped))).toEqual([]);
  });

  it('names no folder that no longer exists', () => {
    expect(Object.keys(mapped).filter((folder) => !folders.includes(folder))).toEqual([]);
  });

  it('only places features in the frame or a known app', () => {
    const valid = new Set<string>(['frame', ...PLACEMENT_APP_IDS]);
    for (const [folder, placement] of Object.entries(mapped)) {
      for (const owner of placementOwners(placement)) expect(valid.has(owner), `${folder} -> ${owner}`).toBe(true);
    }
  });
});

describe('docs/APPS.md', () => {
  const rows = new Map<string, string>();
  for (const match of (appsDoc ?? '').matchAll(/^\| `([a-z-]+)` \| ([a-z, -]+?) \|/gm)) {
    rows.set(match[1] as string, match[2] as string);
  }

  it('has a row for every mapped folder and no others', () => {
    expect([...rows.keys()].sort()).toEqual(Object.keys(mapped).sort());
  });

  it('agrees with the const on every row', () => {
    for (const [folder, layer] of rows) expect(layer, folder).toBe(owners(mapped[folder] as Placement));
  });
});
