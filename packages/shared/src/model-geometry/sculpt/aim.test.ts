import { describe, expect, it } from 'vitest';

import { ModelSpecSchema } from '../../media-model';
import { previewCamera, type AimView } from '../camera';
import { identity } from '../math';
import { uvSphere } from '../mesh/pipeline-fixtures';
import { resolveRig } from '../rig';
import { buildScene } from '../scene';
import { lassoVertices, maskVertices, ModelSculptTargetSchema, resizeMask, resolveTarget, runAimedStroke, type AimContext, type ModelSculptTarget } from './aim';
import type { SculptBrush } from './brush';
import { detectLandmarks, resolveLandmarks } from './landmarks';
import { SculptDocument } from './session';

const brush = (over: Partial<SculptBrush> = {}): SculptBrush => ({ brush: 'draw', radius: 0.25, strength: 1, falloff: 'smooth', spacing: 0.1, ...over });

function sphereDoc(): SculptDocument {
  const s = uvSphere(1, 48, 24);
  return new SculptDocument({ positions: s.positions, indices: s.indices });
}

function context(doc: SculptDocument, over: Partial<AimContext> = {}): AimContext {
  const parts = [{ positions: Array.from(doc.mesh.positions) }];
  return {
    doc,
    toWorld: identity(),
    camera: (view: AimView, size: number) => previewCamera(parts, view, size),
    rig: null,
    landmarks: {},
    groupNames: [],
    partBounds: () => null,
    radius: 0.25,
    ...over,
  };
}

const target = (t: ModelSculptTarget): ModelSculptTarget => ModelSculptTargetSchema.parse(t);

describe('screen-space aiming', () => {
  it('puts the centre pixel of the front view on the front pole and the stroke moves only vertices near it', () => {
    const doc = sphereDoc();
    const before = doc.mesh.positions.slice();
    const planned = resolveTarget(context(doc), target({ mode: 'screen', view: 'front', size: 384, points: [[192, 192]] }));
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const hit = planned.plan.steps[0]!;
    expect(hit.kind).toBe('point');
    if (hit.kind !== 'point') return;
    expect(hit.point[2]).toBeGreaterThan(0.97);
    expect(Math.hypot(hit.point[0], hit.point[1])).toBeLessThan(0.1);
    const summary = runAimedStroke(doc, brush(), planned.plan);
    expect(summary?.moved).toBeGreaterThan(0);
    for (let v = 0; v < doc.mesh.vertexCount; v += 1) {
      const moved = [0, 1, 2].some((k) => doc.mesh.positions[v * 3 + k] !== before[v * 3 + k]);
      if (!moved) continue;
      const d = Math.hypot(before[v * 3]! - hit.point[0], before[v * 3 + 1]! - hit.point[1], before[v * 3 + 2]! - hit.point[2]);
      expect(d).toBeLessThanOrEqual(0.25 + 1e-6);
    }
  });

  it('hits the same surface on the back view as the opposite pole, and a pixel off the model is a validation result', () => {
    const doc = sphereDoc();
    const back = resolveTarget(context(doc), target({ mode: 'screen', view: 'back', points: [[192, 192]] }));
    expect(back.ok && back.plan.steps[0]!.kind === 'point' && (back.plan.steps[0] as { point: number[] }).point[2]).toBeLessThan(-0.97);
    const miss = resolveTarget(context(doc), target({ mode: 'screen', view: 'front', points: [[2, 2]] }));
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.errors[0]!.message).toMatch(/hit the surface/);
  });

  it('densifies a drag and follows the surface across it', () => {
    const doc = sphereDoc();
    const planned = resolveTarget(context(doc), target({ mode: 'screen', view: 'front', points: [[120, 192], [264, 192]], radiusPixels: 20 }));
    expect(planned.ok && planned.plan.hits).toBeGreaterThan(5);
    if (!planned.ok) return;
    for (const step of planned.plan.steps) {
      if (step.kind === 'point') expect(Math.hypot(...step.point)).toBeCloseTo(1, 1);
    }
  });
});

describe('region aiming', () => {
  const rigSpec = ModelSpecSchema.parse({
    name: 'figure',
    parts: [{ name: 'body', shape: 'sphere', radius: 1 }],
    anatomy: 'biped',
    rig: {
      bones: [
        { name: 'root', head: [0, -1, 0], tail: [0, -0.9, 0] },
        { name: 'hips', head: [0, -0.9, 0], tail: [0, -0.2, 0] },
        { name: 'leftUpperArm', head: [0.4, 0.1, 0], tail: [1.1, 0.1, 0] },
        { name: 'rightUpperArm', head: [-0.4, 0.1, 0], tail: [-1.1, 0.1, 0] },
      ],
      falloff: 0.1,
    },
  });

  it('keeps a bone stroke inside that bone’s skin influence', () => {
    const doc = sphereDoc();
    const rig = resolveRig(rigSpec);
    const before = doc.mesh.positions.slice();
    const ctx = context(doc, { rig });
    const planned = resolveTarget(ctx, target({ mode: 'region', bone: 'leftUpperArm' }));
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    runAimedStroke(doc, brush({ radius: 0.4 }), planned.plan);
    let moved = 0;
    for (let v = 0; v < doc.mesh.vertexCount; v += 1) {
      if (doc.mesh.positions[v * 3] === before[v * 3] && doc.mesh.positions[v * 3 + 1] === before[v * 3 + 1] && doc.mesh.positions[v * 3 + 2] === before[v * 3 + 2]) continue;
      moved += 1;
      // The left arm is on +x: nothing on the far side of the body moved.
      expect(before[v * 3]!).toBeGreaterThan(0);
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('sweeps along a bone and reports unknown bones, landmarks and rig-less models as validation results', () => {
    const doc = sphereDoc();
    const ctx = context(doc, { rig: resolveRig(rigSpec), landmarks: { nose: [0, 0, 1] } });
    const along = resolveTarget(ctx, target({ mode: 'region', bone: 'leftUpperArm', along: true }));
    expect(along.ok && along.plan.steps.length).toBeGreaterThanOrEqual(2);
    for (const bad of [
      { mode: 'region', bone: 'tail9' },
      { mode: 'region', landmark: 'elbow' },
      { mode: 'region', group: 'torso' },
      { mode: 'region', part: 'nope' },
      { mode: 'region' },
    ] as const) {
      const out = resolveTarget(ctx, target(bad as ModelSculptTarget));
      expect(out.ok).toBe(false);
    }
    const noRig = resolveTarget(context(doc), target({ mode: 'region', bone: 'head' }));
    expect(noRig.ok).toBe(false);
    if (!noRig.ok) expect(noRig.errors[0]!.message).toMatch(/model_auto_rig/);
    const nose = resolveTarget(ctx, target({ mode: 'region', landmark: 'nose' }));
    expect(nose.ok).toBe(true);
  });

  it('aims at a vertex group by name', () => {
    const s = uvSphere(1, 24, 12);
    const groups = new Uint16Array(s.positions.length / 3).map((_, v) => (s.positions[v * 3 + 1]! > 0 ? 1 : 0));
    const doc = new SculptDocument({ positions: s.positions, indices: s.indices, groups });
    const ctx = context(doc, { groupNames: ['lower', 'upper'] });
    const planned = resolveTarget(ctx, target({ mode: 'region', group: 'upper', samples: 6 }));
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    for (const step of planned.plan.steps) if (step.kind === 'point') expect(step.point[1]).toBeGreaterThan(-0.01);
  });
});

describe('world and mask targets, masks', () => {
  it('snaps world points to the surface', () => {
    const doc = sphereDoc();
    const planned = resolveTarget(context(doc), target({ mode: 'world', points: [[3, 0, 0], [0, 4, 0]] }));
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    for (const step of planned.plan.steps) if (step.kind === 'point') expect(Math.hypot(...step.point)).toBeCloseTo(1, 1);
  });

  it('spreads mask-mode dabs over the unmasked area only, and refuses a fully masked mesh', () => {
    const doc = sphereDoc();
    const upper: number[] = [];
    for (let v = 0; v < doc.mesh.vertexCount; v += 1) if (doc.mesh.positions[v * 3 + 1]! > 0) upper.push(v);
    expect(maskVertices(doc, upper, 1)).toBe(true);
    const planned = resolveTarget(context(doc), target({ mode: 'mask', samples: 12 }));
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    for (const step of planned.plan.steps) if (step.kind === 'point') expect(step.point[1]).toBeLessThan(0.3);
    doc.editMask((m) => m.fill(1));
    expect(resolveTarget(context(doc), target({ mode: 'mask' })).ok).toBe(false);
  });

  it('grows, shrinks and lassos the mask as single undo steps', () => {
    const doc = sphereDoc();
    const camera = previewCamera([{ positions: Array.from(doc.mesh.positions) }], 'front', 384)!;
    const inside = lassoVertices(doc, identity(), camera, [[142, 142], [242, 142], [242, 242], [142, 242]]);
    expect(inside.length).toBeGreaterThan(0);
    // Only the visible (front) hemisphere is picked.
    for (const v of inside) expect(doc.mesh.positions[v * 3 + 2]!).toBeGreaterThan(0);
    const start = doc.revision;
    maskVertices(doc, inside, 1);
    const masked = doc.mask.reduce((n, m) => n + (m > 0 ? 1 : 0), 0);
    expect(masked).toBe(inside.length);
    resizeMask(doc, 1, 'grow');
    const grown = doc.mask.reduce((n, m) => n + (m > 0 ? 1 : 0), 0);
    expect(grown).toBeGreaterThan(masked);
    resizeMask(doc, 1, 'shrink');
    expect(doc.mask.reduce((n, m) => n + (m > 0 ? 1 : 0), 0)).toBeLessThan(grown);
    expect(doc.revision).toBe(start + 3);
    doc.seek(start);
    expect(doc.mask.every((m) => m === 0)).toBe(true);
  });
});

describe('landmarks', () => {
  const figure = ModelSpecSchema.parse({
    name: 'figure',
    parts: [
      { name: 'body', shape: 'box', size: [0.5, 1, 0.3], position: [0, 0.5, 0] },
      { name: 'head', shape: 'sphere', radius: 0.15, position: [0, 1.2, 0] },
      { name: 'nose', shape: 'box', size: [0.04, 0.06, 0.08], position: [0, 1.2, 0.17] },
      { name: 'left arm', shape: 'box', size: [0.1, 0.7, 0.1], position: [0.3, 0.6, 0] },
      { name: 'right arm', shape: 'box', size: [0.1, 0.7, 0.1], position: [-0.3, 0.6, 0] },
    ],
  });

  it('finds the head, nose, chin, ears, hands and feet of a standing figure', () => {
    const parts = buildScene(figure);
    const found = detectLandmarks(parts, null);
    expect(found.top_of_head![1]).toBeCloseTo(1.35, 1);
    expect(found.nose_tip![2]).toBeGreaterThan(0.2);
    expect(found.chin![1]).toBeLessThan(found.nose_tip![1]!);
    expect(found.left_ear![0]).toBeGreaterThan(0);
    expect(found.right_ear![0]).toBeLessThan(0);
    expect(found.left_hand![0]).toBeGreaterThan(0.25);
    expect(found.right_hand![0]).toBeLessThan(-0.25);
    expect(found.left_foot![1]).toBeCloseTo(0, 1);
  });

  it('lets the design override a landmark and marks where each came from', () => {
    const all = resolveLandmarks({ ...figure, landmarks: { nose_tip: [0, 1.2, 0.3], brow: [0, 1.28, 0.14] } }, buildScene(figure));
    expect(all.find((l) => l.name === 'nose_tip')).toMatchObject({ position: [0, 1.2, 0.3], source: 'user' });
    expect(all.find((l) => l.name === 'brow')?.source).toBe('user');
    expect(all.find((l) => l.name === 'top_of_head')?.source).toBe('auto');
  });
});
