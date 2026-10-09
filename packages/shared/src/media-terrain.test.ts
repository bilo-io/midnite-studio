import { describe, expect, it } from 'vitest';

import { MEDIA_TABS, REPO_SCOPED_MEDIA_TABS } from './media';
import {
  needsHeightSource,
  parseTerrainSpec,
  TERRAIN_SPEC_DEFAULTS,
  TerrainBuildResultSchema,
  TerrainSpecSchema,
  terrainFolderLabel,
  terrainSlug,
  terrainTimeStamp,
} from './media-terrain';

describe('TerrainSpecSchema', () => {
  it('parses an empty object to the defaults', () => {
    const spec = parseTerrainSpec({});
    expect(spec).toEqual(TERRAIN_SPEC_DEFAULTS);
    expect(spec).toMatchObject({
      version: 1,
      resolution: 513,
      worldSize: 1024,
      heightRange: [0, 200],
      textureSize: 2048,
      inputs: {},
      alignment: { roads: 'satellite' },
    });
    expect(spec.noise).toBeUndefined();
    expect(spec.seaLevel).toBeUndefined();
  });

  it('round-trips a full spec through JSON unchanged', () => {
    const full = parseTerrainSpec({
      name: 'Dunes',
      inputs: { heightmap: { file: 'inputs/heightmap.png', sourceName: 'h.png', width: 512, height: 512, bitDepth: 16 } },
      resolution: 1025,
      worldSize: 2048,
      heightRange: [-10, 300],
      seaLevel: 5,
      noise: { kind: 'ridged', seed: 7 },
      preSmooth: 1,
      alignment: { satellite: { offset: [0.1, -0.2], scale: [1, 2], rotationDeg: 45 }, roads: 'satellite' },
      roads: { colour: '#00ffff' },
    });
    expect(parseTerrainSpec(JSON.parse(JSON.stringify(full)))).toEqual(full);
  });

  it('keeps fields it does not know about (an older build rewriting the file)', () => {
    expect(parseTerrainSpec({ futureThing: { a: 1 } })).toMatchObject({ futureThing: { a: 1 } });
  });

  it('rejects a resolution that is not 2^n+1', () => {
    expect(TerrainSpecSchema.safeParse({ resolution: 500 }).success).toBe(false);
  });

  it('rejects an empty or inverted height range', () => {
    expect(TerrainSpecSchema.safeParse({ heightRange: [5, 5] }).success).toBe(false);
    expect(TerrainSpecSchema.safeParse({ heightRange: [9, 1] }).success).toBe(false);
  });

  it('rejects a wrong version and an input outside inputs/', () => {
    expect(() => parseTerrainSpec({ version: 2 })).toThrow();
    expect(
      TerrainSpecSchema.safeParse({ inputs: { heightmap: { file: '../x.png', sourceName: 'x', width: 1, height: 1, bitDepth: 8 } } }).success,
    ).toBe(false);
  });

  it('asks for a height source only when there is no heightmap and no noise', () => {
    expect(needsHeightSource(parseTerrainSpec({}))).toBe(true);
    expect(needsHeightSource(parseTerrainSpec({ noise: {} }))).toBe(false);
    expect(
      needsHeightSource(
        parseTerrainSpec({ inputs: { heightmap: { file: 'inputs/heightmap.png', sourceName: 'h', width: 2, height: 2, bitDepth: 8 } } }),
      ),
    ).toBe(false);
  });
});

describe('TerrainBuildResultSchema', () => {
  const stats = {
    resolution: 129,
    worldSize: 1024,
    vertexCount: 16641,
    triangleCount: 32768,
    chunkCount: 4,
    lodCount: 4,
    buildMs: 12,
    minHeight: 0,
    maxHeight: 200,
    histogram: new Array<number>(16).fill(1),
    warnings: [],
  };
  it('parses both arms', () => {
    expect(TerrainBuildResultSchema.parse({ status: 'built', stats }).status).toBe('built');
    expect(TerrainBuildResultSchema.parse({ status: 'needs-height-source' })).toEqual({ status: 'needs-height-source' });
  });
  it('rejects an unknown status', () => {
    expect(TerrainBuildResultSchema.safeParse({ status: 'maybe' }).success).toBe(false);
  });
});

describe('naming', () => {
  it('slugs a name and labels a folder back', () => {
    expect(terrainSlug('Sand Dunes!')).toBe('sand-dunes');
    expect(terrainSlug('???')).toBe('terrain');
    const folder = `${terrainSlug('Dunes')}-${terrainTimeStamp(new Date(2026, 9, 4, 12, 0, 0))}`;
    expect(folder).toBe('dunes-20261004-120000');
    expect(terrainFolderLabel(folder)).toBe('dunes');
    expect(terrainFolderLabel('plain')).toBe('plain');
  });
});

describe('the Terrain media tab', () => {
  it('sits after Maps and before Models, and is repo-scoped', () => {
    expect(MEDIA_TABS.slice(0, 7)).toEqual(['doc', 'image', 'video', 'audio', 'map', 'terrain', 'model']);
    expect(REPO_SCOPED_MEDIA_TABS).toContain('terrain');
  });
});
