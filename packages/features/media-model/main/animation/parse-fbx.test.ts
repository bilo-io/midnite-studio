// @vitest-environment node
// vitest (node): the FBX/glTF/BVH metadata readers against hand-built fixtures — no binary assets in the repo.
import { describe, expect, it } from 'vitest';

import { ClipParseError } from './clip-meta';
import { BVH_TEXT, buildFbx, buildGlb, encodeFbx, GLTF_DOC } from './fixtures';
import { parseBvh } from './parse-bvh';
import { parseFbx } from './parse-fbx';
import { parseGltf } from './parse-gltf';

describe('parseFbx (binary)', () => {
  it('reads duration, key count, fps and the bone names of a Mixamo-shaped clip', () => {
    const meta = parseFbx(buildFbx({ seconds: 2, keys: 61 }));
    expect(meta.durationSec).toBeCloseTo(2, 5);
    expect(meta.frameCount).toBe(61);
    expect(meta.fps).toBe(30);
    expect(meta.boneNames[0]).toBe('mixamorig:Hips');
    expect(meta.boneNames).toHaveLength(6);
    expect(meta.takeName).toBe('mixamo.com');
    expect(meta.hasSkin).toBe(false);
  });

  it('tells a with-skin export from a without-skin one by its mesh, not its name', () => {
    expect(parseFbx(buildFbx({ skin: true })).hasSkin).toBe(true);
    expect(parseFbx(buildFbx({ skin: false })).hasSkin).toBe(false);
  });

  it('reads uncompressed key arrays too', () => {
    expect(parseFbx(buildFbx({ compress: false, seconds: 0.5, keys: 16 })).durationSec).toBeCloseTo(0.5, 5);
  });

  it('falls back to the key times when the stack has no range', () => {
    expect(parseFbx(buildFbx({ noStackRange: true, seconds: 3, keys: 91 })).durationSec).toBeCloseTo(3, 4);
  });

  it('reads the 64-bit node layout of FBX 7.5+ the same way', () => {
    const meta = parseFbx(buildFbx({ wide: true, seconds: 1.5, keys: 46, skin: true }));
    expect(meta).toMatchObject({ frameCount: 46, fps: 30, hasSkin: true });
    expect(meta.durationSec).toBeCloseTo(1.5, 5);
  });

  it('refuses a file with no animation, a truncated file and a non-FBX file, by name rather than a crash', () => {
    expect(() => parseFbx(buildFbx({ noAnimation: true }))).toThrow(ClipParseError);
    const whole = buildFbx();
    expect(() => parseFbx(whole.subarray(0, whole.length - 200))).toThrow(ClipParseError);
    expect(() => parseFbx(Buffer.from('not an fbx at all'))).toThrow('not an FBX');
    expect(() => parseFbx(encodeFbx([]))).toThrow('no Objects');
  });
});

describe('parseFbx (ASCII)', () => {
  const ascii = `; FBX 7.4.0 project file
Objects:  {
  Model: 1, "Model::mixamorig:Hips", "LimbNode" {
  }
  Model: 2, "Model::mixamorig:Spine", "LimbNode" {
  }
  AnimationStack: 3, "AnimStack::Take 001", "" {
    Properties70:  {
      P: "LocalStart", "KTime", "Time", "",0
      P: "LocalStop", "KTime", "Time", "",92372316000
    }
  }
}`;
  it('reads the duration and bones with a warning that the key count is not read', () => {
    const meta = parseFbx(Buffer.from(ascii));
    expect(meta.durationSec).toBeCloseTo(2, 5);
    expect(meta.boneNames).toEqual(['mixamorig:Hips', 'mixamorig:Spine']);
    expect(meta.takeName).toBe('Take 001');
    expect(meta.warnings.join(' ')).toContain('ASCII');
  });
});

describe('parseGltf', () => {
  it('reads a GLB: duration from the sampler accessor, joints as bones, skin from skins + meshes', () => {
    const meta = parseGltf(buildGlb(GLTF_DOC));
    expect(meta.durationSec).toBe(2);
    expect(meta.frameCount).toBe(60);
    expect(meta.fps).toBeCloseTo(29.5, 1);
    expect(meta.boneNames).toEqual(['Hips', 'Spine', 'Head']);
    expect(meta.hasSkin).toBe(true);
    expect(meta.takeName).toBe('Walk');
  });

  it('reads a .gltf JSON document the same way', () => {
    expect(parseGltf(Buffer.from(JSON.stringify(GLTF_DOC))).durationSec).toBe(2);
  });

  it('warns when an input accessor has no max, and refuses a file with no animations or no JSON', () => {
    const noMax = { ...GLTF_DOC, accessors: [{ count: 3 }, { count: 3 }] };
    const meta = parseGltf(buildGlb(noMax));
    expect(meta.durationSec).toBeNull();
    expect(meta.warnings.length).toBeGreaterThan(0);
    expect(() => parseGltf(buildGlb({ asset: { version: '2.0' } }))).toThrow('no animation');
    expect(() => parseGltf(Buffer.from('{ nope'))).toThrow(ClipParseError);
    expect(() => parseGltf(Buffer.from('{"hello":1}'))).toThrow('not a glTF');
  });
});

describe('parseBvh', () => {
  it('reads joints, frame count, frame time and fps without touching the motion data', () => {
    const meta = parseBvh(Buffer.from(BVH_TEXT));
    expect(meta.boneNames).toEqual(['Hips', 'Spine']);
    expect(meta.frameCount).toBe(120);
    expect(meta.durationSec).toBeCloseTo(0.99999, 3);
    expect(meta.fps).toBe(120);
    expect(meta.hasSkin).toBe(false);
  });

  it('refuses a file that is not BVH, or has no motion', () => {
    expect(() => parseBvh(Buffer.from('hello'))).toThrow('not a BVH');
    expect(() => parseBvh(Buffer.from('HIERARCHY\nROOT Hips\n{\n}\n'))).toThrow('no MOTION');
  });
});
