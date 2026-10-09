import type { ModelSpec } from '../../media-model';
import type { ModelFacing } from '../../media-model-rig';
import { facingBasis, resolveRig, type ResolvedRig } from '../rig';
import type { MeshPart } from '../scene';
import type { V3 } from './brush';

/**
 * Landmarks (Phase 104 Theme E): named points on a model an agent can aim at — `top_of_head`, `nose_tip`,
 * `chin`, the ears, hands and feet — found from the geometry and, when there is one, the rig.
 *
 * A landmark is a position in model space, not a vertex: sculpting reshapes the surface, and a point the
 * agent named should still mean "the nose" afterwards. They are detected on demand, so they follow the model as
 * it changes, and `spec.landmarks` overrides any of them (or adds new ones) — the editable part.
 *
 * Detection is geometric and honest about it. Up is +Y. "Forward" is the rig's facing, `+z` by default. With a
 * rig the head band starts at the head bone; without one the model is taken for a bust when it is compact
 * (taller than wide by under 1.6×) and for a standing figure otherwise — a bust's head is most of it, a figure's
 * is its top seventh.
 */

export type Landmark = { name: string; position: V3; source: 'auto' | 'user' };

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The model's solid vertices, as one list of triples. */
function vertices(parts: readonly Pick<MeshPart, 'positions'>[]): V3[] {
  const out: V3[] = [];
  for (const part of parts) for (let i = 0; i < part.positions.length; i += 3) out.push([part.positions[i]!, part.positions[i + 1]!, part.positions[i + 2]!]);
  return out;
}

function pick(points: readonly V3[], score: (p: V3) => number, keep: (p: V3) => boolean = () => true): V3 | null {
  let best: V3 | null = null;
  let bestScore = -Infinity;
  for (const p of points) {
    if (!keep(p)) continue;
    const s = score(p);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return best;
}

export function detectLandmarks(parts: readonly Pick<MeshPart, 'positions'>[], rig: ResolvedRig | null, facing: ModelFacing = '+z'): Record<string, V3> {
  const points = vertices(parts);
  const out: Record<string, V3> = {};
  if (points.length === 0) return out;
  const basis = facingBasis(rig?.facing ?? facing ?? '+z');
  const forward = basis.forward as V3;
  const left = basis.left as V3;
  let min: V3 = [Infinity, Infinity, Infinity];
  let max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    min = [Math.min(min[0], p[0]), Math.min(min[1], p[1]), Math.min(min[2], p[2])];
    max = [Math.max(max[0], p[0]), Math.max(max[1], p[1]), Math.max(max[2], p[2])];
  }
  const height = max[1] - min[1] || 1;
  const width = Math.max(max[0] - min[0], max[2] - min[2], 1e-6);
  out.center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  out.bottom = [out.center[0]!, min[1], out.center[2]!];
  const top = pick(points, (p) => p[1])!;
  out.top = top;
  out.front = pick(points, (p) => dot(p, forward))!;
  out.back = pick(points, (p) => -dot(p, forward))!;
  out.left = pick(points, (p) => dot(p, left))!;
  out.right = pick(points, (p) => -dot(p, left))!;

  // The head band: from the head bone's root (a rig), else the compact/tall rule.
  const headBone = rig?.byName.has('head') ? rig.bones[rig.byName.get('head')!]! : null;
  const compact = height / width < 1.6;
  const headBase = headBone ? Math.min(headBone.head[1], headBone.tail[1]) : max[1] - height * (compact ? 0.62 : 0.15);
  const headHeight = Math.max(max[1] - headBase, 1e-6);
  const inHead = (p: V3): boolean => p[1] >= headBase;
  out.top_of_head = top;
  const headPoints = points.filter(inHead);
  if (headPoints.length > 0) {
    const forwardMax = Math.max(...headPoints.map((p) => dot(p, forward)));
    const forwardMin = Math.min(...headPoints.map((p) => dot(p, forward)));
    const depth = Math.max(forwardMax - forwardMin, 1e-6);
    const nose = pick(headPoints, (p) => dot(p, forward), (p) => p[1] >= headBase + headHeight * 0.2 && p[1] <= headBase + headHeight * 0.8);
    if (nose) out.nose_tip = nose;
    const chin = pick(headPoints, (p) => -p[1], (p) => p[1] <= headBase + headHeight * 0.55 && dot(p, forward) >= forwardMin + depth * 0.6);
    if (chin) out.chin = chin;
    const centre = forwardMin + depth * 0.45;
    const ear = (sign: 1 | -1): V3 | null =>
      pick(headPoints, (p) => sign * dot(p, left), (p) => p[1] >= headBase + headHeight * 0.3 && p[1] <= headBase + headHeight * 0.75 && dot(p, forward) <= centre + depth * 0.15);
    const leftEar = ear(1);
    const rightEar = ear(-1);
    if (leftEar) out.left_ear = leftEar;
    if (rightEar) out.right_ear = rightEar;
  }

  // Hands and feet: from the rig when it names them, else the geometry's extremes at the sides and the floor.
  const bone = (name: string, end: 'head' | 'tail'): V3 | null => (rig?.byName.has(name) ? ((rig.bones[rig.byName.get(name)!]![end] as V3) ?? null) : null);
  const standing = !compact || Boolean(rig);
  const midline = dot(out.center as V3, left);
  if (standing) {
    out.left_hand = bone('leftHand', 'tail') ?? pick(points, (p) => dot(p, left), (p) => p[1] > min[1] + height * 0.3 && p[1] < max[1] - height * 0.1) ?? out.left!;
    out.right_hand = bone('rightHand', 'tail') ?? pick(points, (p) => -dot(p, left), (p) => p[1] > min[1] + height * 0.3 && p[1] < max[1] - height * 0.1) ?? out.right!;
    out.left_foot = bone('leftFoot', 'tail') ?? pick(points, (p) => -p[1], (p) => dot(p, left) >= midline) ?? out.bottom;
    out.right_foot = bone('rightFoot', 'tail') ?? pick(points, (p) => -p[1], (p) => dot(p, left) <= midline) ?? out.bottom;
  }
  return out;
}

/** The detected landmarks with the design's own (`spec.landmarks`) laid over them, sorted by name. */
export function resolveLandmarks(spec: Pick<ModelSpec, 'landmarks' | 'anatomy' | 'rig'>, parts: readonly Pick<MeshPart, 'positions'>[]): Landmark[] {
  const rig = resolveRig(spec);
  const detected = detectLandmarks(parts, rig, spec.rig?.facing ?? '+z');
  const merged = new Map<string, Landmark>();
  for (const [name, position] of Object.entries(detected)) merged.set(name, { name, position, source: 'auto' });
  for (const [name, position] of Object.entries(spec.landmarks ?? {})) merged.set(name, { name, position: [...position] as V3, source: 'user' });
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
