import { buildScene, ModelSpecSchema, rotationMatrix, sceneBounds, signedVolume, triangulatePolygon, type ModelPartInput } from '@midnite/studio-shared';
import { Euler, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';


const part = (input: ModelPartInput) => ModelSpecSchema.parse({ parts: [input] }).parts[0]!;
/** One part, built the way main builds a design — the shared kernel is what `.obj`/`.fbx`/`.glb` are written from. */
const buildPart = (input: ModelPartInput) => buildScene(ModelSpecSchema.parse({ parts: [input] }))[0]!;

const SHAPES: [string, ModelPartInput][] = [
  ['box', { shape: 'box', size: [2, 3, 4] }],
  ['sphere', { shape: 'sphere', radius: 1.5 }],
  ['cylinder', { shape: 'cylinder', radiusTop: 1, radiusBottom: 2, height: 3 }],
  ['cone', { shape: 'cone', radius: 1, height: 2 }],
  ['torus', { shape: 'torus', radius: 2, tube: 0.5 }],
  [
    'lathe (bottom to top)',
    {
      shape: 'lathe',
      profile: [
        [0, 0],
        [1, 0],
        [0.6, 1],
        [0.3, 2],
        [0, 2],
      ],
    },
  ],
  [
    'lathe (top to bottom)',
    {
      shape: 'lathe',
      profile: [
        [0, 2],
        [0.3, 2],
        [0.6, 1],
        [1, 0],
        [0, 0],
      ],
    },
  ],
  [
    'extrude (clockwise L)',
    {
      shape: 'extrude',
      height: 2,
      outline: [
        [0, 0],
        [0, 2],
        [1, 2],
        [1, 1],
        [2, 1],
        [2, 0],
      ],
    },
  ],
];

describe('mesh builders', () => {
  it.each(SHAPES)('%s is a closed, outward-wound solid with unit normals', (_name, input) => {
    const built = buildPart(part(input));
    expect(built.indices.length).toBeGreaterThan(0);
    expect(built.indices.length % 3).toBe(0);
    expect(built.normals).toHaveLength(built.positions.length);
    expect(Math.max(...built.indices)).toBeLessThan(built.positions.length / 3);
    expect(signedVolume(built.positions, built.indices)).toBeGreaterThan(0);
    // Winding and vertex normals agree: every triangle faces the way its corners' normals do.
    for (let i = 0; i < built.indices.length; i += 3) {
      const [a, b, c] = [built.indices[i]! * 3, built.indices[i + 1]! * 3, built.indices[i + 2]! * 3];
      const e1 = [0, 1, 2].map((k) => built.positions[b + k]! - built.positions[a + k]!);
      const e2 = [0, 1, 2].map((k) => built.positions[c + k]! - built.positions[a + k]!);
      const face = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      const along = [0, 1, 2].reduce((sum, k) => sum + face[k]! * (built.normals[a + k]! + built.normals[b + k]! + built.normals[c + k]!), 0);
      expect(along).toBeGreaterThan(0);
    }
    for (let i = 0; i < built.normals.length; i += 3) {
      expect(Math.hypot(built.normals[i]!, built.normals[i + 1]!, built.normals[i + 2]!)).toBeCloseTo(1, 5);
    }
  });

  it('computes exact volumes where they are known', () => {
    const volume = (input: ModelPartInput) => {
      const built = buildPart(part(input));
      return signedVolume(built.positions, built.indices);
    };
    expect(volume({ shape: 'box', size: [2, 3, 4] })).toBeCloseTo(24, 6);
    // A tessellated sphere sits just inside the true 4/3·π·r³.
    const sphere = volume({ shape: 'sphere', radius: 1 });
    expect(sphere).toBeGreaterThan(4.0);
    expect(sphere).toBeLessThan((4 / 3) * Math.PI);
    // L-shaped outline: area 3 × height 2.
    expect(volume(SHAPES[7]![1])).toBeCloseTo(6, 6);
  });

  it('applies scale, then rotation, then translation', () => {
    const built = buildPart(
      part({ shape: 'box', size: [1, 1, 1], scale: [2, 1, 1], rotation: [0, 0, 90], position: [10, 0, 0] }),
    );
    const bounds = sceneBounds([built]);
    // 2 wide in x before a 90° turn about z → 2 tall in y, 1 wide in x, centred on x=10.
    expect(bounds.min[0]).toBeCloseTo(9.5, 6);
    expect(bounds.max[0]).toBeCloseTo(10.5, 6);
    expect(bounds.min[1]).toBeCloseTo(-1, 6);
    expect(bounds.max[1]).toBeCloseTo(1, 6);
  });

  it('keeps normals perpendicular to a non-uniformly scaled face', () => {
    const built = buildPart(part({ shape: 'sphere', radius: 1, scale: [3, 1, 1] }));
    // At the +x pole the surface is still facing +x.
    const index = built.positions.findIndex((_v, i) => i % 3 === 0 && Math.abs(built.positions[i]! - 3) < 1e-6);
    expect(built.normals[index]).toBeCloseTo(1, 4);
  });

  it('rotates like three.js Euler XYZ', () => {
    const degrees: [number, number, number] = [30, 50, 70];
    const m = rotationMatrix(degrees);
    const expected = new Matrix4().makeRotationFromEuler(
      new Euler(...degrees.map((d) => (d * Math.PI) / 180) as [number, number, number], 'XYZ'),
    );
    const v = new Vector3(1, 2, 3).applyMatrix4(expected);
    expect(m[0]! * 1 + m[1]! * 2 + m[2]! * 3).toBeCloseTo(v.x, 6);
    expect(m[3]! * 1 + m[4]! * 2 + m[5]! * 3).toBeCloseTo(v.y, 6);
    expect(m[6]! * 1 + m[7]! * 2 + m[8]! * 3).toBeCloseTo(v.z, 6);
  });

  it('normalises short hex colours and keeps part names', () => {
    const built = buildPart(part({ shape: 'sphere', radius: 1, color: '#F80', name: 'nose' }));
    expect(built.color).toBe('#ff8800');
    expect(built.name).toBe('nose');
  });

  it('builds every part of a spec', () => {
    const spec = ModelSpecSchema.parse({
      parts: [
        { shape: 'box', size: [1, 1, 1] },
        { shape: 'sphere', radius: 1, position: [0, 2, 0] },
      ],
    });
    expect(buildScene(spec)).toHaveLength(2);
  });
});

describe('triangulatePolygon', () => {
  const area = (poly: [number, number][], tris: [number, number, number][]) =>
    tris.reduce((sum, [a, b, c]) => {
      const [pa, pb, pc] = [poly[a]!, poly[b]!, poly[c]!];
      return sum + Math.abs((pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])) / 2;
    }, 0);

  it('covers a concave polygon exactly', () => {
    const l: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ];
    const tris = triangulatePolygon(l);
    expect(tris).toHaveLength(4);
    expect(area(l, tris)).toBeCloseTo(3, 9);
  });

  it('does not hang on a degenerate outline', () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    expect(triangulatePolygon(line)).toBeDefined();
  });
});
