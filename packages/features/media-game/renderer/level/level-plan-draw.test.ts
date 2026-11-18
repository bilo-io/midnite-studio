// vitest/node: Phase 137 Theme C — drawPlan's multi-selection drawing against a recording context (real pixels are a human check).
import { describe, expect, it } from 'vitest';

import { addLayer, addObject, createEditState, type EditLevel } from './level-edit-model';
import { SELECTED_COLOUR, drawPlan } from './level-plan-draw';
import { buildBlankLevel } from './new-scene-model';

function recorder() {
  const log = { strokesAmber: 0, dashes: [] as number[][], strokeRects: 0 };
  let strokeStyle = '';
  const ctx = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === 'strokeStyle') return strokeStyle;
        if (prop === 'stroke') return () => { if (strokeStyle === SELECTED_COLOUR) log.strokesAmber += 1; };
        if (prop === 'setLineDash') return (d: number[]) => { log.dashes.push(d); };
        return () => undefined;
      },
      set: (_t, prop: string, value: unknown) => {
        if (prop === 'strokeStyle') strokeStyle = String(value);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

const fixture = () => {
  let s = createEditState(buildBlankLevel({ width: 20, height: 20, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null }));
  s = addLayer(s, 'object', 'fixture');
  const layerId = s.activeLayerId!;
  for (const x of [100, 200, 300]) s = addObject(s, layerId, { type: 'prop', x, y: 100, width: 30, height: 30 });
  const refs = s.level.layers.find((l) => l.id === layerId)!.objects!.map((o) => ({ layerId, objectId: o.id }));
  return { level: s.level as EditLevel, refs };
};
const draw = (level: EditLevel, selected: ReturnType<typeof fixture>['refs'], marquee: { x: number; y: number; width: number; height: number } | null = null) => {
  const { ctx, log } = recorder();
  drawPlan(ctx, {
    level, view: { x: 0, y: 0, zoom: 1 }, selection: selected[selected.length - 1] ?? null, selected, marquee,
    overlay: { terrain: null, terrainImage: null, draft: [], cursor: null, volume: null }, outline: '#6366f1', text: '#fff',
  });
  return log;
};

describe('drawPlan, multi-selection', () => {
  it('C6: strokes amber once per selected object, plus a dashed bounds box from two up', () => {
    const { level, refs } = fixture();
    const one = draw(level, [refs[0]!]);
    expect(one.strokesAmber).toBe(1);
    expect(one.dashes.filter((d) => d.length > 0)).toHaveLength(0);
    const three = draw(level, refs);
    // Three outlines and the group bounds box.
    expect(three.strokesAmber).toBe(4);
    expect(three.dashes.some((d) => d.length > 0)).toBe(true);
  });
  it('draws nothing amber with no selection, and a marquee dashes without amber', () => {
    const { level } = fixture();
    const none = draw(level, [], { x: 0, y: 0, width: 50, height: 50 });
    expect(none.strokesAmber).toBe(0);
    expect(none.dashes.some((d) => d.length > 0)).toBe(true);
  });
});
