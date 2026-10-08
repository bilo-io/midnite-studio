import { describe, expect, it } from 'vitest';

import { fromFrame } from './frame';
import { osmToBuildings, parseOsmLength } from './osm-buildings';
import type { OsmResponse } from './osm-roads';

const CENTER: [number, number] = [18.4, -34];

function ring(id: number, pts: [number, number][], tags: Record<string, string>, first = id * 10): OsmResponse['elements'] {
  const nodes = pts.map(([x, z], i) => {
    const [lon, lat] = fromFrame(CENTER, [x, z]);
    return { type: 'node' as const, id: first + i, lat, lon };
  });
  const ids = nodes.map((n) => n.id);
  return [...nodes, { type: 'way', id, nodes: [...ids, ids[0]!], tags }];
}
const sq = (x: number, z: number, s = 10): [number, number][] => [[x, z], [x + s, z], [x + s, z + s], [x, z + s]];

describe('parseOsmLength', () => {
  it('reads metres, decimals, comma decimals and feet', () => {
    expect(parseOsmLength('12')).toBe(12);
    expect(parseOsmLength('12.5 m')).toBe(12.5);
    expect(parseOsmLength('12,5')).toBe(12.5);
    expect(parseOsmLength('10 ft')).toBeCloseTo(3.048);
    expect(parseOsmLength('tall')).toBeUndefined();
    expect(parseOsmLength(undefined)).toBeUndefined();
  });
});

describe('osmToBuildings', () => {
  it('projects closed building ways, preferring height over levels, wound positively', () => {
    const osm: OsmResponse = {
      elements: [
        ...ring(1, sq(0, 0), { building: 'yes', height: '20' }),
        ...ring(2, sq(50, 0).reverse(), { building: 'house', 'building:levels': '3' }),
        ...ring(3, sq(100, 0), { building: 'yes' }),
      ],
    };
    const out = osmToBuildings(osm, CENTER, 1000);
    expect(out.worldSize).toBe(1000);
    expect(out.buildings.map((b) => [b.id, b.heightM])).toEqual([[1, 20], [2, 9], [3, undefined]]);
    for (const b of out.buildings) {
      expect(b.polygon).toHaveLength(4);
      let a = 0;
      b.polygon.forEach(([x0, z0], i) => {
        const [x1, z1] = b.polygon[(i + 1) % 4]!;
        a += x0 * z1 - x1 * z0;
      });
      expect(a).toBeGreaterThan(0);
    }
    expect(out.buildings[0]!.polygon[0]![0]).toBeCloseTo(0, 0);
  });

  it('drops building=no, unclosed ways, tiny sheds and buildings outside the frame', () => {
    const open = ring(5, sq(0, 0), { building: 'yes' });
    const way = open!.find((e) => e.type === 'way') as { nodes: number[] };
    way.nodes.pop();
    const osm: OsmResponse = {
      elements: [
        ...ring(1, sq(0, 0), { building: 'no' }),
        ...open!,
        ...ring(3, sq(0, 0, 1), { building: 'shed' }),
        ...ring(4, sq(900, 0), { building: 'yes' }),
        ...ring(6, sq(10, 10), { building: 'yes' }),
      ],
    };
    expect(osmToBuildings(osm, CENTER, 1000).buildings.map((b) => b.id)).toEqual([6]);
  });

  it('keeps min_height only for parts that float below their roof', () => {
    const osm: OsmResponse = {
      elements: [
        ...ring(1, sq(0, 0), { building: 'roof', height: '10', min_height: '6' }),
        ...ring(2, sq(30, 0), { building: 'yes', height: '10', min_height: '12' }),
      ],
    };
    const [a, b] = osmToBuildings(osm, CENTER, 1000).buildings;
    expect(a).toMatchObject({ heightM: 10, minHeightM: 6 });
    expect(b!.minHeightM).toBeUndefined();
  });
});
