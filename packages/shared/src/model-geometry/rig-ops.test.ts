import { describe, expect, it } from 'vitest';

import type { ModelSpec } from '../media-model';
import { applyClipOps, applyRigOps, copyClips, setAnatomy } from './rig-ops';
import { RIG_EXAMPLE_BIPED, RIG_EXAMPLE_QUADRUPED, RIG_EXAMPLE_VEHICLE } from './rig-examples';

const ok = (out: ReturnType<typeof setAnatomy>): ModelSpec => {
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.spec;
};

const biped = ok(setAnatomy(RIG_EXAMPLE_BIPED, 'biped'));
const walking = ok(applyClipOps(biped, [{ op: 'add', clip: { kind: 'walk' } }, { op: 'add', clip: { name: 'wave', kind: 'custom' } }]));

describe('rig edits', () => {
  it('setAnatomy places a rig, and static removes rig and clips', () => {
    expect(biped.anatomy).toBe('biped');
    expect(biped.rig!.bones.map((b) => b.name)).toContain('hips');
    const flat = ok(setAnatomy(walking, 'static'));
    expect(flat.anatomy).toBe('static');
    expect(flat.rig).toBeUndefined();
    expect(flat.animations).toBeUndefined();
  });

  it('switching anatomy keeps only the clips the new one offers', () => {
    const dog = ok(setAnatomy({ ...walking, parts: RIG_EXAMPLE_QUADRUPED.parts }, 'quadruped'));
    expect(dog.animations!.map((c) => c.name)).toEqual(['walk', 'wave']);
    const car = ok(setAnatomy({ ...walking, parts: RIG_EXAMPLE_VEHICLE.parts }, 'vehicle'));
    expect(car.animations!.map((c) => c.name)).toEqual(['wave']);
  });

  it('moves, binds and tunes falloff; rejects unknown names, missing required bones and static designs', () => {
    const moved = ok(applyRigOps(biped, [{ op: 'setBone', name: 'head', head: [0, 1.6, 0] }, { op: 'bind', part: 'torso', bone: 'chest' }, { op: 'falloff', value: 0 }]));
    expect(moved.rig!.bones.find((b) => b.name === 'head')!.head).toEqual([0, 1.6, 0]);
    expect(moved.rig!.bind).toEqual({ torso: 'chest' });
    expect(moved.rig!.falloff).toBe(0);
    const bad = applyRigOps(biped, [{ op: 'setBone', name: 'leftEar', head: [0, 0, 0], tail: [0, 1, 0] }]);
    expect(bad.ok === false && bad.errors[0]!.opIndex).toBe(0);
    const gutted = applyRigOps(biped, [{ op: 'removeBone', name: 'hips' }]);
    expect(gutted.ok === false && gutted.errors.some((e) => e.message.includes('"hips"'))).toBe(true);
    expect(applyRigOps(RIG_EXAMPLE_BIPED, [{ op: 'falloff', value: 0.5 }]).ok).toBe(false);
  });

  it('removing a bone drops its bindings and keys', () => {
    const keyed = ok(applyClipOps(ok(applyRigOps(walking, [{ op: 'bind', part: 'neck', bone: 'neck' }])), [
      { op: 'setKeys', name: 'wave', keys: [{ bone: 'neck', time: 0.5, rotation: [0, 0, 30] }, { bone: 'head', time: 0.5, rotation: [10, 0, 0] }] },
    ]));
    const out = ok(applyRigOps(keyed, [{ op: 'removeBone', name: 'neck' }]));
    expect(out.rig!.bind).toEqual({});
    expect(out.animations!.find((c) => c.name === 'wave')!.keys!.map((k) => k.bone)).toEqual(['head']);
  });
});

describe('clip edits', () => {
  it('adds, updates, keys and removes; names stay unique', () => {
    expect(walking.animations!.map((c) => c.name)).toEqual(['walk', 'wave']);
    const faster = ok(applyClipOps(walking, [{ op: 'update', name: 'walk', fields: { speed: 2, name: 'fast walk' } }]));
    expect(faster.animations![0]).toMatchObject({ name: 'fast walk', speed: 2 });
    const keyed = ok(applyClipOps(walking, [
      { op: 'setKeys', name: 'wave', keys: [{ bone: 'head', time: 0.2, rotation: [5, 0, 0] }] },
      { op: 'setKeys', name: 'wave', keys: [{ bone: 'head', time: 0.2, rotation: [9, 0, 0] }] },
    ]));
    expect(keyed.animations![1]!.keys).toEqual([{ bone: 'head', time: 0.2, rotation: [9, 0, 0] }]);
    expect(ok(applyClipOps(keyed, [{ op: 'clearKeys', name: 'wave' }])).animations![1]!.keys).toBeUndefined();
    expect(ok(applyClipOps(walking, [{ op: 'remove', name: 'walk' }, { op: 'remove', name: 'wave' }])).animations).toBeUndefined();
    const dup = applyClipOps(walking, [{ op: 'add', clip: { kind: 'walk' } }]);
    expect(dup.ok).toBe(false);
  });

  it('rejects a kind the anatomy does not offer, a key past the end, and a bad field', () => {
    expect(applyClipOps(biped, [{ op: 'add', clip: { kind: 'drive' } }]).ok).toBe(false);
    expect(applyClipOps(walking, [{ op: 'setKeys', name: 'walk', keys: [{ bone: 'head', time: 9 }] }]).ok).toBe(false);
    const bad = applyClipOps(walking, [{ op: 'update', name: 'walk', fields: { speed: 99 } }]);
    expect(bad.ok === false && bad.errors[0]!.path).toBe('fields.speed');
    expect(applyClipOps(walking, [{ op: 'remove', name: 'nope' }]).ok).toBe(false);
  });

  it('copyClips retargets onto another rig, renaming collisions and skipping foreign kinds', () => {
    const other = ok(setAnatomy({ ...RIG_EXAMPLE_BIPED, name: 'other' }, 'biped'));
    const once = copyClips(walking, other);
    expect(once.ok && once.spec.animations!.map((c) => c.name)).toEqual(['walk', 'wave']);
    const twice = copyClips(walking, (once as { spec: ModelSpec }).spec);
    expect(twice.ok && twice.spec.animations!.map((c) => c.name)).toEqual(['walk', 'wave', 'walk 2', 'wave 2']);
    const replaced = copyClips(walking, (once as { spec: ModelSpec }).spec, true);
    expect(replaced.ok && replaced.spec.animations).toHaveLength(2);
    const car = ok(setAnatomy(RIG_EXAMPLE_VEHICLE, 'vehicle'));
    const onCar = copyClips(walking, car);
    expect(onCar.ok && onCar.skipped).toEqual(['walk']);
    expect(copyClips(RIG_EXAMPLE_BIPED, biped).ok).toBe(false);
  });
});
