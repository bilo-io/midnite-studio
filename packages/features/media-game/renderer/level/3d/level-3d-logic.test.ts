// @vitest-environment node
import { levelEntityToWorld } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { addObject, createEditState, findObject, rotateObject, setOptionalNumber, setVolume, undo } from '../level-edit-model';
import { buildBlankLevel } from '../new-scene-model';
import { blendPose, cameraPosition, distanceFor, dollyOffset, focusToPlanView, orbitPose, planPose, planViewToFocus, poseFromCamera, PLAN_FOV } from './camera-transition';
import { gizmoEdit, levelWorldItems, nearestEuler, POINT_SIZE, worldToObjectPoint } from './level-world';
import { fogRange, lodFor, projectedPx, viewOffset } from './level-lod';
import { OPTIMISATION_PRESETS, pixelRatioFor, presetFor } from './optimisation';
import { SpatialGrid, xzRect } from './spatial-grid';

const level3d = () => buildBlankLevel({ width: 40, height: 40, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null });

function withProps() {
  let s = createEditState(level3d());
  const layerId = s.level.layers[0]!.id!;
  s = setVolume(s, layerId, { x: 320, y: 64 }, { x: 448, y: 160 });
  s = rotateObject(s, s.selection!, 30);
  return { s, layerId };
}

describe('levelWorldItems', () => {
  it('places every object where levelEntityToWorld does, base at the ground, box size from the footprint and sizeY', () => {
    const { s } = withProps();
    const items = levelWorldItems(s.level);
    const raw = s.level.layers[0]!.objects!;
    expect(items).toHaveLength(raw.length);
    for (const item of items) {
      const o = raw.find((r) => r.id === item.sel.objectId)!;
      const placed = levelEntityToWorld(o, s.level);
      expect(item.position[0]).toBeCloseTo(placed.position[0]);
      expect(item.position[2]).toBeCloseTo(placed.position[2]);
      expect(item.yaw).toBeCloseTo(placed.yaw);
    }
    const box = items.find((i) => i.kind === 'box')!;
    expect(box.size).toEqual([4, 3, 3]);
    expect(box.position[1]).toBe(0);
    const spawn = items.find((i) => i.kind === 'point')!;
    expect(spawn.size[0]).toBe(POINT_SIZE);
  });

  it('skips a hidden layer and a hidden object', () => {
    const { s } = withProps();
    const hiddenLayer = { ...s.level, layers: s.level.layers.map((l) => ({ ...l, visible: false })) };
    expect(levelWorldItems(hiddenLayer)).toHaveLength(0);
  });

  it('reads midnite.groundY as the base of an object with no elevation', () => {
    const lvl = level3d();
    const level = { ...lvl, properties: [...lvl.properties!, { name: 'midnite.groundY', type: 'float' as const, value: 2.5 }] };
    expect(levelWorldItems(level)[0]!.position[1]).toBe(2.5);
  });
});

describe('gizmoEdit', () => {
  it('moves a rotated box so its world centre lands exactly where the gizmo left it, as one undo step', () => {
    const { s } = withProps();
    const sel = s.selection!;
    const before = s.past.length;
    const next = gizmoEdit(s, sel, { centre: [12.5, 7.25], elevation: 1.5 });
    expect(next.past.length).toBe(before + 1);
    const placed = levelEntityToWorld(findObject(next.level, sel)!, next.level);
    expect(placed.position[0]).toBeCloseTo(12.5, 3);
    expect(placed.position[2]).toBeCloseTo(7.25, 3);
    expect(placed.position[1]).toBe(1.5);
    expect(undo(next).level).toBe(s.level);
  });

  it('writes a yaw as Tiled rotation about the centre, pitch and roll as props', () => {
    const { s } = withProps();
    const sel = s.selection!;
    const centre = levelEntityToWorld(findObject(s.level, sel)!, s.level).position;
    const next = gizmoEdit(s, sel, { yaw: -Math.PI / 2, pitch: Math.PI / 18, roll: 0 });
    const o = findObject(next.level, sel)!;
    expect(o.rotation).toBe(90);
    const placed = levelEntityToWorld(o, next.level);
    expect(placed.position[0]).toBeCloseTo(centre[0], 3);
    expect(placed.position[2]).toBeCloseTo(centre[2], 3);
    expect(placed.pitch).toBeCloseTo(Math.PI / 18, 4);
    expect(o.properties?.some((p) => p.name === 'roll')).toBe(false);
  });

  it('scales a box footprint and sizeY; a point takes a uniform scale', () => {
    const { s, layerId } = withProps();
    const box = gizmoEdit(s, s.selection!, { size: [8, 6, 3] });
    const o = findObject(box.level, s.selection!)!;
    expect(o.width).toBe(256);
    expect(o.properties?.find((p) => p.name === 'sizeY')?.value).toBe(6);
    const withPoint = addObject(box, layerId, { type: 'prop', x: 100, y: 100 });
    const pointSel = withPoint.selection!;
    const scaled = gizmoEdit(withPoint, pointSel, { scale: 2 });
    expect(findObject(scaled.level, pointSel)!.properties?.find((p) => p.name === 'scale')?.value).toBe(2);
  });

  it('changes nothing when the gizmo ends where it started', () => {
    const { s } = withProps();
    const placed = levelEntityToWorld(findObject(s.level, s.selection!)!, s.level).position;
    expect(gizmoEdit(s, s.selection!, { centre: [placed[0], placed[2]] }).level).toBe(s.level);
  });

  it('maps a ground click to object pixels through metresPerTile', () => {
    const lvl = level3d();
    const level = { ...lvl, properties: lvl.properties!.map((p) => (p.name === 'midnite.metresPerTile' ? { ...p, value: 2 } : p)) };
    expect(worldToObjectPoint(level, 10, 4)).toEqual({ x: 160, y: 64 });
  });

  it('round-trips an elevation set in the inspector', () => {
    const { s } = withProps();
    const lifted = setOptionalNumber(s, s.selection!, 'elevation', '3');
    expect(levelWorldItems(lifted.level).find((i) => i.kind === 'box')!.position[1]).toBe(3);
  });
});

describe('SpatialGrid', () => {
  const items = Array.from({ length: 10_000 }, (_, i) => {
    const x = (i % 100) * 10, z = Math.floor(i / 100) * 10;
    return { index: i, bounds: { minX: x, minZ: z, maxX: x + 2, maxZ: z + 2 } };
  });
  const grid = new SpatialGrid(items, 16);

  it('returns each item in a rectangle once, and only nearby ones', () => {
    const found = grid.query({ minX: 0, minZ: 0, maxX: 31, maxZ: 31 });
    expect(new Set(found).size).toBe(found.length);
    expect(found).toEqual(expect.arrayContaining([0, 1, 2, 3, 100, 101, 102, 103]));
    expect(found.length).toBeLessThan(40);
  });

  it('visits only the cells under the query, not the whole level', () => {
    grid.query({ minX: 100, minZ: 100, maxX: 140, maxZ: 140 });
    expect(grid.lastVisited).toBeLessThanOrEqual(9);
    expect(grid.cellCount).toBeGreaterThan(1000);
  });

  it('walks occupied cells for a rectangle bigger than the level', () => {
    const all = grid.query({ minX: -1e6, minZ: -1e6, maxX: 1e6, maxZ: 1e6 });
    expect(all).toHaveLength(10_000);
  });

  it('xzRect bounds points on X and Z', () => {
    expect(xzRect([[1, 9, -2], [-3, 0, 5]])).toEqual({ minX: -3, minZ: -2, maxX: 1, maxZ: 5 });
  });
});

describe('LOD and the presets', () => {
  const preset = presetFor(3);
  it('draws near things full, small things as boxes, specks and far things not at all', () => {
    const base = { radius: 1, fovDeg: 50, viewportHeight: 800 };
    expect(lodFor({ ...base, distance: 5, focusDistance: 5 }, preset)).toBe('full');
    expect(lodFor({ ...base, distance: 60, focusDistance: 60 }, preset)).toBe('box');
    expect(lodFor({ ...base, distance: 1000, focusDistance: 1000 }, { ...preset, drawDistance: 1e6 })).toBe('hidden');
    expect(lodFor({ ...base, distance: 5, focusDistance: preset.drawDistance + 5 }, preset)).toBe('hidden');
    expect(projectedPx(1, 0.5, 50, 800)).toBe(Infinity);
  });

  it('every preset value moves one way from quality to performance', () => {
    const keys = ['drawDistance', 'fullAbovePx', 'hideBelowPx', 'terrainSegments', 'maxLights', 'maxModels', 'pixelRatio'] as const;
    const up = new Set(['fullAbovePx', 'hideBelowPx']);
    for (const key of keys) {
      for (let i = 1; i < OPTIMISATION_PRESETS.length; i++) {
        const a = OPTIMISATION_PRESETS[i - 1]![key], b = OPTIMISATION_PRESETS[i]![key];
        if (up.has(key)) expect(b).toBeGreaterThanOrEqual(a);
        else expect(b).toBeLessThanOrEqual(a);
      }
    }
    expect(OPTIMISATION_PRESETS.filter((p) => p.shadows).every((p) => p.step <= 2)).toBe(true);
  });

  it('clamps a step and caps the pixel ratio', () => {
    expect(presetFor(9).step).toBe(5);
    expect(presetFor(Number.NaN).step).toBe(3);
    expect(pixelRatioFor(presetFor(1), 3)).toBe(2);
    expect(pixelRatioFor(presetFor(5), 2)).toBe(0.75);
  });

  it('puts the fog band at the draw distance past the dolly', () => {
    expect(fogRange(100, 0)).toEqual({ near: 60, far: 100 });
    expect(fogRange(100, 50).far).toBe(150);
  });
});

describe('the Floorplan ↔ 3D camera', () => {
  const scale = { tilewidth: 32, tileheight: 32, mpt: 1 };
  const size = { width: 1000, height: 600 };

  it('a plan view and its focus round-trip', () => {
    const view = { x: -120, y: 40, zoom: 1.5 };
    const focus = planViewToFocus(view, size, scale, 0);
    const back = focusToPlanView(focus.target, focus.span, size, scale);
    expect(back.x).toBeCloseTo(view.x);
    expect(back.y).toBeCloseTo(view.y);
    expect(back.zoom).toBeCloseTo(view.zoom);
    expect(focus.span).toBeCloseTo(600 / 1.5 / 32);
  });

  it('the plan pose looks straight down from above the focus through a narrow lens', () => {
    const pose = planPose([10, 0, 20], 30);
    const at = cameraPosition(pose);
    expect(at[0]).toBeCloseTo(10, 0);
    expect(at[2]).toBeCloseTo(20, 0);
    expect(at[1]).toBeCloseTo(distanceFor(30, PLAN_FOV), 0);
    expect(dollyOffset(pose)).toBeGreaterThan(500);
    expect(dollyOffset(orbitPose([0, 0, 0], 30))).toBe(0);
  });

  it('blends ease in and out, keeps the span (a dolly zoom) and ends exactly on each pose', () => {
    const from = planPose([10, 0, 20], 30), to = orbitPose([10, 0, 20], 30);
    expect(blendPose(from, to, 0)).toEqual(from);
    const end = blendPose(from, to, 1);
    expect(end.fov).toBeCloseTo(to.fov);
    expect(end.pitch).toBeCloseTo(to.pitch);
    const mid = blendPose(from, to, 0.5);
    expect(mid.span).toBe(30);
    expect(mid.fov).toBeGreaterThan(PLAN_FOV);
    expect(mid.fov).toBeLessThan(50);
    // Eased: a tenth of the time moves less than a tenth of the way.
    expect(blendPose(from, to, 0.1).pitch).toBeGreaterThan(from.pitch - (from.pitch - to.pitch) * 0.1);
  });

  it('takes yaw the short way round', () => {
    const a = { ...orbitPose([0, 0, 0], 10), yaw: Math.PI - 0.1 }, b = { ...a, yaw: -Math.PI + 0.1 };
    expect(Math.abs(blendPose(a, b, 0.5).yaw)).toBeGreaterThan(Math.PI - 0.11);
  });

  it('reads a live orbit camera back as a pose', () => {
    const pose = orbitPose([5, 0, 5], 20, 0.7);
    const back = poseFromCamera(cameraPosition(pose), pose.target, pose.fov);
    expect(back.span).toBeCloseTo(20);
    expect(back.pitch).toBeCloseTo(pose.pitch);
    expect(back.yaw).toBeCloseTo(0.7);
  });
});

describe('viewOffset (Phase 136 Theme C)', () => {
  it('is the camera reach close in, and follows the focus once the camera backs off', () => {
    expect(viewOffset(50, 0, 250)).toBe(0);
    expect(viewOffset(860, 0, 250)).toBe(760);
    // The plan camera's dolly wins when it is larger.
    expect(viewOffset(23_000, 22_500, 250)).toBe(22_900);
    expect(viewOffset(100, 300, 250)).toBe(300);
  });

  it('keeps an orbit over a big level drawing at its focus at every step', () => {
    for (const step of [1, 3, 5]) {
      const preset = presetFor(step);
      const offset = viewOffset(860, 0, preset.drawDistance);
      expect(lodFor({ radius: 2, distance: 860, focusDistance: 860 - offset, fovDeg: 50, viewportHeight: 4000 }, preset)).not.toBe('hidden');
      expect(fogRange(preset.drawDistance, offset).far).toBeGreaterThan(860);
    }
  });
});

describe('nearestEuler (Phase 136 Theme D)', () => {
  const d = Math.PI / 180;
  it('keeps a tip past upright as a pitch, not a yaw flip with roll 180', () => {
    // Pitch 120° about a yaw of 46° reads back from three as yaw 226°, pitch 60°, roll 180°.
    const r = nearestEuler({ yaw: -134 * d, pitch: 60 * d, roll: 180 * d }, { yaw: 46 * d, pitch: 0, roll: 0 });
    expect(r.yaw / d).toBeCloseTo(46, 6);
    expect(r.pitch / d).toBeCloseTo(120, 6);
    expect(r.roll / d).toBeCloseTo(0, 6);
  });

  it('leaves an ordinary turn alone and keeps it near the previous angle', () => {
    const r = nearestEuler({ yaw: -170 * d, pitch: 10 * d, roll: 0 }, { yaw: 170 * d, pitch: 0, roll: 0 });
    expect(r.yaw / d).toBeCloseTo(190, 6);
    expect(r.pitch / d).toBeCloseTo(10, 6);
  });
});
