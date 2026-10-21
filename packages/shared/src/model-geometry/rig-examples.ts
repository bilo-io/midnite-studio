import { ModelSpecSchema, type ModelSpec } from '../media-model';

/**
 * Three small designs, one per riggable anatomy, built the way an LLM writes them (named primitives,
 * no rig). Tests run the auto-rig, weights, clips and exports over them; the editor's screenshots and
 * the mock bridge show them. Facing +Z, Y up, ~1.8 units tall for the biped.
 */

const limb = (name: string, x: number, y: number, h: number, r: number, color: string) => ({
  name,
  shape: 'capsule' as const,
  radius: r,
  height: h,
  position: [x, y, 0] as [number, number, number],
  color,
  segments: 12,
});

export const RIG_EXAMPLE_BIPED: ModelSpec = ModelSpecSchema.parse({
  name: 'robot',
  parts: [
    { name: 'head', shape: 'roundedBox', size: [0.26, 0.28, 0.26], radius: 0.05, segments: 8, position: [0, 1.66, 0], color: '#c9ccd6' },
    { name: 'neck', shape: 'cylinder', radiusTop: 0.05, radiusBottom: 0.06, height: 0.08, position: [0, 1.5, 0], color: '#5b5f6b' },
    { name: 'torso', shape: 'roundedBox', size: [0.44, 0.5, 0.24], radius: 0.06, segments: 8, position: [0, 1.22, 0], color: '#3b82f6' },
    { name: 'pelvis', shape: 'roundedBox', size: [0.36, 0.16, 0.22], radius: 0.04, segments: 8, position: [0, 0.92, 0], color: '#5b5f6b' },
    limb('left upper arm', 0.3, 1.27, 0.2, 0.055, '#c9ccd6'),
    limb('left forearm', 0.3, 0.98, 0.2, 0.05, '#c9ccd6'),
    { name: 'left hand', shape: 'sphere', radius: 0.06, segments: 12, position: [0.3, 0.8, 0], color: '#5b5f6b' },
    limb('right upper arm', -0.3, 1.27, 0.2, 0.055, '#c9ccd6'),
    limb('right forearm', -0.3, 0.98, 0.2, 0.05, '#c9ccd6'),
    { name: 'right hand', shape: 'sphere', radius: 0.06, segments: 12, position: [-0.3, 0.8, 0], color: '#5b5f6b' },
    limb('left thigh', 0.1, 0.66, 0.24, 0.07, '#c9ccd6'),
    limb('left shin', 0.1, 0.3, 0.26, 0.06, '#c9ccd6'),
    { name: 'left foot', shape: 'roundedBox', size: [0.12, 0.08, 0.24], radius: 0.03, segments: 8, position: [0.1, 0.04, 0.05], color: '#5b5f6b' },
    limb('right thigh', -0.1, 0.66, 0.24, 0.07, '#c9ccd6'),
    limb('right shin', -0.1, 0.3, 0.26, 0.06, '#c9ccd6'),
    { name: 'right foot', shape: 'roundedBox', size: [0.12, 0.08, 0.24], radius: 0.03, segments: 8, position: [-0.1, 0.04, 0.05], color: '#5b5f6b' },
  ],
});

const wheel = (name: string, x: number, z: number) => ({
  name,
  shape: 'cylinder' as const,
  radiusTop: 0.32,
  radiusBottom: 0.32,
  height: 0.22,
  rotation: [0, 0, 90] as [number, number, number],
  position: [x, 0.32, z] as [number, number, number],
  color: '#1f2937',
});

export const RIG_EXAMPLE_VEHICLE: ModelSpec = ModelSpecSchema.parse({
  name: 'car',
  parts: [
    { name: 'chassis', shape: 'roundedBox', size: [1.7, 0.45, 4], radius: 0.12, position: [0, 0.62, 0], color: '#dc2626' },
    { name: 'cabin', shape: 'roundedBox', size: [1.5, 0.45, 2], radius: 0.15, position: [0, 1.05, -0.2], color: '#1e293b' },
    { name: 'steering wheel', shape: 'torus', radius: 0.17, tube: 0.025, rotation: [60, 0, 0], position: [0.35, 1.0, 0.5], color: '#111827' },
    wheel('wheel front left', 0.85, 1.35),
    wheel('wheel front right', -0.85, 1.35),
    wheel('wheel rear left', 0.85, -1.35),
    wheel('wheel rear right', -0.85, -1.35),
  ],
});

const leg = (name: string, x: number, z: number) => ({
  name,
  shape: 'capsule' as const,
  radius: 0.05,
  height: 0.3,
  position: [x, 0.22, z] as [number, number, number],
  color: '#a16207',
});

export const RIG_EXAMPLE_QUADRUPED: ModelSpec = ModelSpecSchema.parse({
  name: 'dog',
  parts: [
    { name: 'body', shape: 'capsule', radius: 0.16, height: 0.5, segments: 16, rotation: [90, 0, 0], position: [0, 0.55, 0], color: '#ca8a04' },
    { name: 'head', shape: 'roundedBox', size: [0.2, 0.2, 0.26], radius: 0.06, segments: 8, position: [0, 0.82, 0.45], color: '#ca8a04' },
    leg('front left leg', 0.1, 0.25),
    leg('front right leg', -0.1, 0.25),
    leg('hind left leg', 0.1, -0.25),
    leg('hind right leg', -0.1, -0.25),
    { name: 'tail', shape: 'tube', path: [[0, 0.6, -0.4], [0, 0.72, -0.55], [0, 0.8, -0.65]], radius: 0.03, color: '#a16207' },
  ],
});
