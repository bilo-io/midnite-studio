// vitest/node: no browser capability needed — reads package manifests as text.
import { describe, expect, it } from 'vitest';
import { STUDIO_COMPOSITION, STUDIO_FEATURES } from './composition';

const featurePackages = import.meta.glob('../../../packages/features/*/package.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

describe('studio composition', () => {
  it('composes every feature package under packages/features, and only those', () => {
    const onDisk = Object.keys(featurePackages)
      .map((p) => /features\/([^/]+)\/package\.json$/.exec(p)?.[1])
      .sort();
    expect([...STUDIO_FEATURES].sort()).toEqual(onDisk);
  });

  it('names the renderer and main internals by their real package names', () => {
    const names = import.meta.glob('../../../packages/{app,desktop}/package.json', {
      eager: true,
      query: '?raw',
      import: 'default',
    }) as Record<string, string>;
    const found = Object.values(names).map((raw) => (JSON.parse(raw) as { name: string }).name);
    expect(found).toContain(STUDIO_COMPOSITION.renderer);
    expect(found).toContain(STUDIO_COMPOSITION.main);
  });
});
