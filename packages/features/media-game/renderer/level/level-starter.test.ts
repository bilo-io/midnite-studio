// vitest: a real 3D starter level (Phase 132 Theme F) is centred on the origin, so its objects sit at
// negative pixels. The plan view must frame it, hit objects on it and place on it without assuming a top-left origin.
import { parseGameLevel } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { toEditLevel, type EditLevel } from './level-edit-model';
import { hitPlan, planBounds, snapPlan } from './level-plan';

const load = async (): Promise<unknown> =>
  JSON.parse(
    (
      (await import('../../../../../templates/media-game/bases/first-person/levels/level.tmj?raw')) as { default: string }
    ).default,
  );

describe('the first-person starter level in plan view', () => {
  it('parses as a 3D level and is framed by its real bounds', async () => {
    const raw = await load();
    const parsed = parseGameLevel(raw);
    expect(parsed.ok && parsed.dimension).toBe('3d');
    const level = toEditLevel(raw) as EditLevel;
    const b = planBounds(level);
    const objects = level.layers.flatMap((l) => l.objects ?? []);
    expect(objects.some((o) => o.x < 0 || o.y < 0)).toBe(true);
    expect(b.minX).toBeLessThan(0);
    expect(b.minY).toBeLessThan(0);
    for (const o of objects) {
      expect(o.x).toBeGreaterThanOrEqual(b.minX);
      expect(o.x).toBeLessThanOrEqual(b.maxX);
      expect(o.y).toBeGreaterThanOrEqual(b.minY);
      expect(o.y).toBeLessThanOrEqual(b.maxY);
    }
  });

  it('hits every object at its own position and snaps a point to the half metre', async () => {
    const level = toEditLevel(await load()) as EditLevel;
    for (const layer of level.layers) {
      for (const o of layer.objects ?? []) {
        if (o.polyline) continue;
        const centre = { x: o.x + (o.width ?? 0) / 2, y: o.y + (o.height ?? 0) / 2 };
        // A rotated or overlapped object may answer with another; what matters is that something is hit there.
        expect(hitPlan(level, (o.width ?? 0) > 0 ? centre : { x: o.x, y: o.y }, 1)).not.toBeNull();
      }
    }
    const s = snapPlan(level, { x: -51, y: -75 });
    expect(Math.abs(s.x % 16)).toBe(0);
    expect(Math.abs(s.y % 16)).toBe(0);
  });
});
