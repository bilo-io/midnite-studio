import { describe, expect, it } from 'vitest';

import { captureTextureSize, handoffSpec, type MapCaptureFile } from './media-map-capture';
import { parseTerrainSpec } from './media-terrain';

const capture = (over: Partial<MapCaptureFile> = {}): MapCaptureFile => ({
  version: 1,
  name: 'cape-town-20261007-100000',
  center: [18.4, -33.95],
  sideM: 8000,
  size: 1025,
  mPerPx: 8000 / 1024,
  bbox: [18.36, -33.99, 18.44, -33.91],
  heightMinM: -4,
  heightMaxM: 1086,
  hasSea: true,
  sources: { dem: 'aws-terrarium' },
  demZoom: 13,
  attributions: ['Terrain Tiles'],
  files: [],
  missing: [],
  capturedAt: '2026-10-07T10:00:00.000Z',
  ...over,
});

describe('handoffSpec', () => {
  it('a sea frame sets world size, height range, grid, texture and seaLevel 0', () => {
    const patch = handoffSpec(capture(), { repoId: 'r1', project: 'maps', name: 'Cape Town' });
    expect(patch).toMatchObject({
      name: 'Cape Town',
      worldSize: 8000,
      heightRange: [-4, 1086],
      resolution: 1025,
      textureSize: 2048,
      seaLevel: 0,
      preSmooth: 0,
      geo: { center: [18.4, -33.95], sideM: 8000, capture: { repoId: 'r1', project: 'maps', name: 'cape-town-20261007-100000' } },
    });
    // The patch is a valid Terrain spec, geo block included.
    expect(parseTerrainSpec(patch).geo?.bbox).toEqual([18.36, -33.99, 18.44, -33.91]);
  });

  it('an inland mountain frame has no seaLevel', () => {
    const patch = handoffSpec(capture({ hasSea: false, heightMinM: 1200, heightMaxM: 3400 }), { project: 'maps' });
    expect(patch).not.toHaveProperty('seaLevel');
    expect(patch).not.toHaveProperty('name');
    expect((patch.geo as { capture: object }).capture).toEqual({ project: 'maps', name: 'cape-town-20261007-100000' });
    expect(patch.heightRange).toEqual([1200, 3400]);
  });

  it('a flat frame still rises, matching the PNG encoding', () => {
    expect(handoffSpec(capture({ heightMinM: 12, heightMaxM: 12.2, hasSea: false }), { project: 'maps' }).heightRange).toEqual([12, 13]);
  });

  it('textureSize follows the capture size (Decision 15)', () => {
    expect(captureTextureSize(129)).toBe(2048);
    expect(captureTextureSize(2049)).toBe(2048);
    expect(captureTextureSize(4097)).toBe(4096);
  });
});
