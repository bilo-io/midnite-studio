import { describe, expect, it } from 'vitest';

import { MapRoadGraphFileSchema } from '../media-map-capture';
import { detectRoadColour, extractRoadMask, maskIoU } from '../terrain';
import { fromFrame } from './frame';
import { classifyHighway, osmToRoadGraph, rasterizeRoads, roadWidthM, type OsmResponse } from './osm-roads';

const CENTER: [number, number] = [18.4, -34];
const SIDE = 2000;

const node = (id: number, x: number, z: number) => {
  const [lon, lat] = fromFrame(CENTER, [x, z]);
  return { type: 'node' as const, id, lat, lon };
};

/** A T-junction (A: 1–2–3 east-west, B: 2–4 south) plus a way C leaving the frame to the east. */
const FIXTURE: OsmResponse = {
  elements: [
    node(1, -500, 0),
    node(2, 0, 0),
    node(3, 500, 0),
    node(4, 0, 400),
    node(5, 1500, 0),
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'primary', name: 'Main Street', lanes: '2' } },
    { type: 'way', id: 11, nodes: [2, 4], tags: { highway: 'residential_link' } },
    { type: 'way', id: 12, nodes: [3, 5], tags: { highway: 'footway' } },
    { type: 'way', id: 13, nodes: [1, 4], tags: { highway: 'pedestrian' } },
  ],
};

describe('osm roads', () => {
  it('classifies and widens', () => {
    expect(classifyHighway('motorway_link')).toBe('motorway');
    expect(classifyHighway('steps')).toBe('path');
    expect(classifyHighway('pedestrian')).toBeNull();
    expect(roadWidthM('primary')).toBe(14);
    expect(roadWidthM('primary', 3)).toBe(10.5);
  });

  it('splits at shared nodes, clips to the square and keeps classes and names', () => {
    const g = osmToRoadGraph(FIXTURE, CENTER, SIDE);
    expect(MapRoadGraphFileSchema.safeParse(g).success).toBe(true);
    expect(g.nodes).toHaveLength(5);
    expect(g.edges).toHaveLength(4);
    const byWay = (id: number) => g.edges.filter((e) => e.osmWayId === id);
    expect(byWay(10)).toHaveLength(2);
    expect(byWay(10)[0]).toMatchObject({ cls: 'primary', name: 'Main Street', lanes: 2, widthM: 7 });
    expect(byWay(11)[0]).toMatchObject({ cls: 'residential', widthM: 7 });
    expect(byWay(13)).toHaveLength(0);
    // The way that leaves the frame ends on the east boundary.
    const clipped = byWay(12)[0]!;
    expect(clipped.cls).toBe('path');
    const end = clipped.points[clipped.points.length - 1]!;
    expect(end[0]).toBeCloseTo(SIDE / 2, 2);
    expect(end[1]).toBeCloseTo(0, 1);
    // z is south: node 4 (400 m south) has a positive z.
    expect(byWay(11)[0]!.points[1]![1]).toBeCloseTo(400, 0);
    // The junction is one shared node.
    expect(new Set([byWay(10)[0]!.b, byWay(10)[1]!.a, byWay(11)[0]!.a]).size).toBe(1);
  });

  it('drops edges shorter than 1 m and ways wholly outside', () => {
    const osm: OsmResponse = {
      elements: [
        node(1, 0, 0),
        node(2, 0.5, 0),
        node(3, 5000, 5000),
        node(4, 5100, 5000),
        { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'service' } },
        { type: 'way', id: 2, nodes: [3, 4], tags: { highway: 'service' } },
      ],
    };
    expect(osmToRoadGraph(osm, CENTER, SIDE).edges).toHaveLength(0);
  });

  it('rasterises a cyan-on-black mask Terrain keys without a hint', () => {
    const g = osmToRoadGraph(FIXTURE, CENTER, SIDE);
    const size = 256;
    const rgba = rasterizeRoads(g, size);
    const img = { width: size, height: size, channels: 4 as const, bitDepth: 8 as const, data: rgba };
    expect(detectRoadColour(img).colour).toBe('#00ffff');
    const mask = extractRoadMask(img, '#00ffff', 0.2);
    const own = new Uint8Array(size * size);
    for (let i = 0; i < own.length; i += 1) own[i] = rgba[i * 4 + 1]! > 128 ? 1 : 0;
    expect(own.reduce((a, b) => a + b, 0)).toBeGreaterThan(200);
    expect(maskIoU(mask, own)).toBeGreaterThanOrEqual(0.98);
    // The primary road runs along the middle row.
    expect(rgba[((size / 2) * size + size / 4) * 4 + 1]).toBe(255);
    expect(rgba[(5 * size + 5) * 4 + 1]).toBe(0);
  });
});
