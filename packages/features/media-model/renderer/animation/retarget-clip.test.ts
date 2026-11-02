import { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';

import { clipBones, restRootHeight, retargetClip } from './retarget-clip';
import { mannequinSkeleton, rigSkeleton } from './skeleton-spec';

const mixamoClip = () =>
  new AnimationClip('Walk', 1, [
    new VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 100, 0, 0, 100, 50]),
    new QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new QuaternionKeyframeTrack('mixamorigLeftArm.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new VectorKeyframeTrack('mixamorigLeftArm.position', [0, 1], [10, 0, 0, 10, 0, 0]),
    new QuaternionKeyframeTrack('mixamorigProp.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);

describe('retarget-clip', () => {
  it('lists the bones a clip animates', () => {
    expect(clipBones(mixamoClip())).toEqual(['mixamorigHips', 'mixamorigLeftArm', 'mixamorigProp']);
  });

  it('builds a 1.8 m mannequin with Mixamo-style bones, parents first', () => {
    const m = mannequinSkeleton();
    expect(m.bones[0]).toMatchObject({ name: 'Hips', parent: null });
    expect(m.bones.every((b, i) => b.parent === null || b.parent < i)).toBe(true);
    expect(restRootHeight(m)).toBe(1);
    expect(m.bones.map((b) => b.name)).toContain('LeftUpLeg');
  });

  it('retargets Mixamo tracks onto the mannequin, keeping only the root translation, scaled to its height', () => {
    const r = retargetClip(mixamoClip(), mannequinSkeleton());
    expect(r.clip.tracks.map((t) => t.name).sort()).toEqual(['Hips.position', 'Hips.quaternion', 'LeftArm.quaternion']);
    expect(r.matched).toBe(2);
    expect(r.unmatched).toEqual(['mixamorigProp']);
    expect(r.rootScale).toBeCloseTo(0.01);
    const pos = r.clip.tracks.find((t) => t.name === 'Hips.position')!;
    expect(Array.from(pos.values)).toEqual([0, 1, 0, 0, 1, 0.5].map((v) => expect.closeTo(v, 5)));
    expect(r.clip.duration).toBe(1);
  });

  it('retargets onto a Models rig by VRM names', () => {
    const rig = rigSkeleton({
      bones: [
        { name: 'hips', parent: null, head: [0, 1, 0], tail: [0, 1.1, 0] },
        { name: 'leftUpperArm', parent: 0, head: [0.2, 1.4, 0], tail: [0.4, 1.4, 0] },
      ],
    });
    expect(rig.bones[1]!.position).toEqual([expect.closeTo(0.2), expect.closeTo(0.4), 0]);
    const r = retargetClip(mixamoClip(), rig);
    expect(r.clip.tracks.map((t) => t.name).sort()).toEqual(['hips.position', 'hips.quaternion', 'leftUpperArm.quaternion']);
    expect(r.rootScale).toBeCloseTo(0.01);
  });

  it('matches nothing for a foreign rig', () => {
    const r = retargetClip(mixamoClip(), { bones: [{ name: 'wheel_fl', parent: null, position: [0, 0, 0] }] });
    expect(r.matched).toBe(0);
    expect(r.clip.tracks).toHaveLength(0);
  });
});
