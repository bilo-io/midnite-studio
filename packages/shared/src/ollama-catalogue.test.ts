import { describe, expect, it } from 'vitest';

import { OLLAMA_CATALOGUE, OLLAMA_CATALOGUE_TIERS, OllamaCatalogueModelSchema, ollamaRamFit } from './ollama-catalogue';

const GIB = 2 ** 30;

describe('OLLAMA_CATALOGUE', () => {
  it('round-trips the schema, with unique tags and every tier populated', () => {
    for (const model of OLLAMA_CATALOGUE) {
      expect(OllamaCatalogueModelSchema.parse(JSON.parse(JSON.stringify(model)))).toEqual(model);
    }
    expect(new Set(OLLAMA_CATALOGUE.map((m) => m.tag)).size).toBe(OLLAMA_CATALOGUE.length);
    for (const tier of OLLAMA_CATALOGUE_TIERS) {
      expect(OLLAMA_CATALOGUE.some((m) => m.tier === tier)).toBe(true);
    }
  });
});

describe('ollamaRamFit', () => {
  it('fits at or above the minimum', () => {
    expect(ollamaRamFit(16 * GIB, 16)).toBe('fits');
    expect(ollamaRamFit(32 * GIB, 16)).toBe('fits');
  });

  it('is tight down to three quarters of the minimum', () => {
    expect(ollamaRamFit(12 * GIB, 16)).toBe('tight');
    expect(ollamaRamFit(15 * GIB, 16)).toBe('tight');
  });

  it('is too big below that', () => {
    expect(ollamaRamFit(8 * GIB, 16)).toBe('too-big');
    expect(ollamaRamFit(11.9 * GIB, 16)).toBe('too-big');
  });
});
