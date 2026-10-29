// vitest/node: no browser capability needed — reads package manifests, the page and the bundle script as text.
import { describe, expect, it } from 'vitest';
import { STUDIO_COMPOSITION, STUDIO_FEATURES, STUDIO_MODULES } from './composition';

const featurePackages = import.meta.glob('../../../packages/features/*/package.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const modulePackages = import.meta.glob('../../../packages/modules/*/package.json', {
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

  it('composes every module package under packages/modules, and only those', () => {
    const onDisk = Object.keys(modulePackages)
      .map((p) => /modules\/([^/]+)\/package\.json$/.exec(p)?.[1])
      .sort();
    expect([...STUDIO_MODULES].sort()).toEqual(onDisk);
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

  /*
    Phase 113 Theme G: Studio's entries are this app's, and both builds boot them. Read as text, so the
    composition imports neither internal (the app layer's rules forbid it outside entry/).
  */
  const raw = (glob: Record<string, string>) => Object.values(glob)[0] ?? '';
  const page = raw(import.meta.glob('../../../packages/app/index.html', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>);
  const bundleScript = raw(import.meta.glob('../../../packages/desktop/scripts/bundle.mjs', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>);
  const entries = import.meta.glob('../entry/*.ts', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

  it("index.html loads Studio's renderer entry, and nothing else", () => {
    const modules = [...page.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]);
    expect(modules).toEqual([`../../apps/studio/${STUDIO_COMPOSITION.entries.renderer}`]);
  });

  it("desktop's main bundle is built from Studio's main entry", () => {
    expect(bundleScript).toContain(`'../../apps/studio/${STUDIO_COMPOSITION.entries.main}'`);
  });

  it('each entry hands over through its one seam', () => {
    expect(entries[`../${STUDIO_COMPOSITION.entries.renderer}`]).toMatch(/import \{ bootStudioRenderer \} from '@midnite\/studio-app\/boot';[\s\S]*bootStudioRenderer\(container\);/);
    expect(entries[`../${STUDIO_COMPOSITION.entries.main}`]).toMatch(/import \{ startStudioMain \} from '@midnite\/studio-desktop\/main';[\s\S]*\nstartStudioMain\(\);/);
  });
});
