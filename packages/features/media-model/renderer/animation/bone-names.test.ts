import { describe, expect, it } from 'vitest';

import { buildBoneMap, canonicalBone, normaliseBone, parseTrackName } from './bone-names';

describe('canonicalBone', () => {
  it.each([
    ['mixamorig:Hips', 'hips'],
    ['mixamorigSpine1', 'chest'],
    ['mixamorig:Spine2', 'upperChest'],
    ['mixamorig:LeftArm', 'leftUpperArm'],
    ['mixamorig:RightForeArm', 'rightLowerArm'],
    ['mixamorig:LeftUpLeg', 'leftUpperLeg'],
    ['mixamorig:RightLeg', 'rightLowerLeg'],
    ['mixamorig:LeftToeBase', 'leftToes'],
    ['mixamorig:LeftHandIndex2', 'leftIndexIntermediate'],
    ['mixamorig:RightHandPinky1', 'rightLittleProximal'],
    ['leftUpperArm', 'leftUpperArm'],
    ['rightIndexDistal', 'rightIndexDistal'],
    ['thigh.L', 'leftUpperLeg'],
    ['calf_R', 'rightLowerLeg'],
    ['l_shoulder', 'leftShoulder'],
    ['Pelvis', 'hips'],
    ['Head', 'head'],
  ])('%s -> %s', (name, key) => expect(canonicalBone(name)).toBe(key));

  it('does not know a prop bone', () => {
    expect(canonicalBone('Sword_Socket')).toBeNull();
    expect(canonicalBone('mixamorig:LeftHandIndex9')).toBeNull();
  });
});

describe('buildBoneMap', () => {
  const VRM = ['hips', 'spine', 'chest', 'head', 'leftUpperArm', 'rightUpperArm', 'leftUpperLeg'];

  it('maps Mixamo names onto a VRM-named rig and lists what is left', () => {
    const { map, unmatched } = buildBoneMap(['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:LeftArm', 'mixamorig:LeftUpLeg', 'mixamorig:LeftToeBase'], VRM);
    expect(Object.fromEntries(map)).toEqual({
      'mixamorig:Hips': 'hips',
      'mixamorig:Spine': 'spine',
      'mixamorig:Spine1': 'chest',
      'mixamorig:LeftArm': 'leftUpperArm',
      'mixamorig:LeftUpLeg': 'leftUpperLeg',
    });
    expect(unmatched).toEqual(['mixamorig:LeftToeBase']);
  });

  it('prefers an identical name, and the prefix-stripped name next', () => {
    expect(buildBoneMap(['Hips'], ['Hips', 'hips']).map.get('Hips')).toBe('Hips');
    expect(buildBoneMap(['mixamorigHips'], ['Hips']).map.get('mixamorigHips')).toBe('Hips');
  });

  it('lets one source bone drive a target only once', () => {
    const { map, unmatched } = buildBoneMap(['Spine1', 'Chest'], ['chest']);
    expect([...map]).toEqual([['Spine1', 'chest']]);
    expect(unmatched).toEqual(['Chest']);
  });

  it('normalises namespaces and case', () => {
    expect(normaliseBone('Armature|mixamorig:Hips')).toBe('hips');
  });
});

describe('parseTrackName', () => {
  it('reads node tracks and BVH bone tracks', () => {
    expect(parseTrackName('mixamorigHips.quaternion')).toEqual({ bone: 'mixamorigHips', property: 'quaternion' });
    expect(parseTrackName('.bones[Hips].position')).toEqual({ bone: 'Hips', property: 'position' });
    expect(parseTrackName('Mesh.morphTargetInfluences')).toBeNull();
  });
});
