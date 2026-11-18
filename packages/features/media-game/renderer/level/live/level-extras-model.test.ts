// vitest: the editor's overlay data (Phase 140 Themes E and F): switches gate what is derived.
import type { GameEntitySnapshot } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { addObject, createEditState, type EditLevel } from '../level-edit-model';
import { blankLevel3d } from '../test-helpers';
import { levelExtras } from './level-extras-model';

const off = { colliders: false, triggers: false, nav: false };

function level() {
  let s = createEditState(blankLevel3d() as EditLevel);
  const layerId = s.level.layers[0]!.id!;
  s = addObject(s, layerId, { type: 'prop', x: 64, y: 64, width: 32, height: 32 });
  s = addObject(s, layerId, { type: 'hazard', x: 128, y: 64, width: 32, height: 32 });
  return s.level;
}
const ghost = (over: Partial<GameEntitySnapshot> = {}): GameEntitySnapshot => ({ id: 1, type: 'enemy', x: 1, y: 0, z: 1, alive: true, ...over });

describe('levelExtras', () => {
  it('derives nothing while every switch is off and no game is live', () => {
    const { canvas, scene } = levelExtras({ level: level(), is3d: true, overlays: off, ghosts: [], nav: [[[0, 0], [1, 0], [1, 1]]] });
    expect(canvas).toEqual({ colliders: [], triggers: [], nav: [], ghosts: [], links: [] });
    expect(scene).toEqual({ colliderIds: [], triggerIds: [], nav: [], ghosts: [] });
  });

  it('derives collider and trigger shapes only for the switches that are on', () => {
    const l = level();
    const c = levelExtras({ level: l, is3d: true, overlays: { ...off, colliders: true }, ghosts: [], nav: [] });
    expect(c.canvas.colliders.map((s) => s.kind)).toEqual(['rect']);
    expect(c.canvas.triggers).toEqual([]);
    expect(c.scene.colliderIds).toHaveLength(1);
    const t = levelExtras({ level: l, is3d: true, overlays: { ...off, triggers: true }, ghosts: [], nav: [] });
    expect(t.canvas.triggers.map((s) => (s.kind === 'cell' ? null : s.type))).toContain('hazard');
  });

  it('maps metres to plan pixels for the nav-mesh and ghosts, with y-up ghosts keeping their height', () => {
    const { canvas, scene } = levelExtras({ level: level(), is3d: true, overlays: { ...off, nav: true }, ghosts: [ghost({ id: null, y: 2 })], nav: [[[1, 1], [2, 1], [2, 2]]] });
    expect(canvas.nav[0]![0]).toEqual({ x: 32, y: 32 });
    expect(canvas.ghosts[0]!.at).toEqual({ x: 32, y: 32 });
    expect(scene.ghosts[0]).toMatchObject({ y: 2, z: 1 });
  });
});
