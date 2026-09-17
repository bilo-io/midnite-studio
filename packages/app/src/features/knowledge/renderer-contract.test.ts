// Layer: vitest — pure registry logic, no DOM/canvas involved. `load()`
// itself is deliberately NOT exercised here: it dynamically imports
// `use-sigma-graph.tsx`, and importing sigma at all — not just instantiating
// it — reaches into `WebGL2RenderingContext` at module scope, which jsdom
// does not define (the real coverage for that path is
// `knowledge-canvas.spec.ts`'s Playwright suite, a real browser).
import { describe, expect, it } from 'vitest';

import { DEFAULT_VARIANT_ID, resolveVariant, VARIANTS } from './renderer-contract';

describe('renderer-contract', () => {
  it('registers Theme D’s four sigma looks: atlas, constellation, orbit, clusters', () => {
    expect(VARIANTS.map((v) => v.id)).toEqual(['atlas', 'constellation', 'orbit', 'clusters']);
    expect(DEFAULT_VARIANT_ID).toBe('atlas');
  });

  it('every entry shares engine: sigma and the same load() reference — no remount switching looks', () => {
    expect(VARIANTS.every((v) => v.engine === 'sigma')).toBe(true);
    const loads = new Set(VARIANTS.map((v) => v.load));
    expect(loads.size).toBe(1);
  });

  it('resolves a known id to its own registry entry', () => {
    expect(resolveVariant('atlas').id).toBe('atlas');
    expect(resolveVariant('constellation').id).toBe('constellation');
    expect(resolveVariant('orbit').id).toBe('orbit');
    expect(resolveVariant('clusters').id).toBe('clusters');
  });

  it('falls back to the default variant for an unknown or removed id — Decision 1', () => {
    expect(resolveVariant('some-retired-library').id).toBe(DEFAULT_VARIANT_ID);
    expect(resolveVariant('').id).toBe(DEFAULT_VARIANT_ID);
    // A stale localStorage value from before Theme D's rename falls back too.
    expect(resolveVariant('sigma').id).toBe(DEFAULT_VARIANT_ID);
  });

  it('sigma consumes worker-computed layout coordinates (Phase 89 Theme E, Decision 9)', () => {
    expect(resolveVariant('sigma').consumesWorkerLayout).toBe(true);
  });
});
