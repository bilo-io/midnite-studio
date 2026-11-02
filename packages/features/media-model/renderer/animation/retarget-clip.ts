import { AnimationClip, KeyframeTrack, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';

import { buildBoneMap, canonicalBone, parseTrackName, type BoneMap } from './bone-names';
import type { SkeletonSpec } from './skeleton-spec';

/** The distinct bones a clip animates, in the order its tracks first name them. */
export function clipBones(clip: Pick<AnimationClip, 'tracks'>): string[] {
  const seen = new Set<string>();
  for (const track of clip.tracks) {
    const target = parseTrackName(track.name);
    if (target) seen.add(target.bone);
  }
  return [...seen];
}

/** Height of the target's root (hips) above the ground in its rest pose; `null` when it has no bones. */
export function restRootHeight(skeleton: SkeletonSpec): number | null {
  const hips = skeleton.bones.findIndex((b) => canonicalBone(b.name) === 'hips');
  const start = hips >= 0 ? hips : skeleton.bones.findIndex((b) => b.parent === null);
  if (start < 0) return null;
  let y = 0;
  for (let at: number | null = start; at !== null; at = skeleton.bones[at]?.parent ?? null) y += skeleton.bones[at]?.position[1] ?? 0;
  return y;
}

export type RetargetResult = BoneMap & {
  clip: AnimationClip;
  /** Bones driven on the target. */
  matched: number;
  /** The factor the root's translation was scaled by (the target's hips height over the clip's first-frame hips height). */
  rootScale: number;
};

/**
 * Re-addresses a clip's tracks to a target skeleton by bone name. Rotations carry over as they are; only the
 * root keeps its translation (scaled to the target's height) because every other bone's translation is the
 * source rig's bone length, which would stretch the target. Tracks for bones the target lacks are dropped.
 */
export function retargetClip(clip: AnimationClip, target: SkeletonSpec): RetargetResult {
  const targetBones = target.bones.map((b) => b.name);
  const { map, unmatched } = buildBoneMap(clipBones(clip), targetBones);
  const rootHeight = restRootHeight(target);
  const rootName = (() => {
    const hips = target.bones.find((b) => canonicalBone(b.name) === 'hips');
    return (hips ?? target.bones.find((b) => b.parent === null))?.name;
  })();

  let rootScale = 1;
  const tracks: KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const parsed = parseTrackName(track.name);
    const to = parsed ? map.get(parsed.bone) : undefined;
    if (!parsed || !to || parsed.property === 'scale') continue;
    const name = `${to}.${parsed.property}`;
    if (parsed.property === 'quaternion') {
      tracks.push(new QuaternionKeyframeTrack(name, Array.from(track.times), Array.from(track.values)));
      continue;
    }
    if (to !== rootName) continue;
    const firstY = Math.abs(track.values[1] ?? 0);
    rootScale = rootHeight !== null && firstY > 1e-6 ? rootHeight / firstY : 1;
    tracks.push(new VectorKeyframeTrack(name, Array.from(track.times), Array.from(track.values, (v) => v * rootScale)));
  }
  return { map, unmatched, clip: new AnimationClip(clip.name, clip.duration, tracks), matched: map.size, rootScale };
}
