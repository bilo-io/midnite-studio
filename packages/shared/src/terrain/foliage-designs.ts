import { ModelSpecSchema, type ModelSpec } from '../media-model';

/**
 * Built-in low-poly foliage and detail designs (Phase 105 Theme G).
 *
 * Authored purely as {@link ModelSpec} values using `model-geometry` primitives so they render
 * through the existing 3D kernel and export directly to glTF. Each design is kept under 300
 * triangles for instanced terrain rendering.
 */

export const PINE_DESIGN: ModelSpec = ModelSpecSchema.parse({
  name: 'pine',
  description: 'Coniferous pine tree with layered needle foliage.',
  parts: [
    {
      name: 'trunk',
      shape: 'cylinder',
      radiusTop: 0.15,
      radiusBottom: 0.25,
      height: 2.0,
      position: [0, 1.0, 0],
      color: '#5c4033',
      segments: 8,
    },
    {
      name: 'needles_bottom',
      shape: 'cone',
      radius: 1.6,
      height: 2.0,
      position: [0, 2.4, 0],
      color: '#2d6a4f',
      segments: 8,
    },
    {
      name: 'needles_middle',
      shape: 'cone',
      radius: 1.2,
      height: 1.8,
      position: [0, 3.6, 0],
      color: '#386641',
      segments: 8,
    },
    {
      name: 'needles_top',
      shape: 'cone',
      radius: 0.8,
      height: 1.5,
      position: [0, 4.7, 0],
      color: '#40916c',
      segments: 8,
    },
  ],
});

export const BROADLEAF_DESIGN: ModelSpec = ModelSpecSchema.parse({
  name: 'broadleaf',
  description: 'Deciduous broadleaf oak tree.',
  parts: [
    {
      name: 'trunk',
      shape: 'cylinder',
      radiusTop: 0.3,
      radiusBottom: 0.4,
      height: 2.2,
      position: [0, 1.1, 0],
      color: '#6f4e37',
      segments: 8,
    },
    {
      name: 'canopy_main',
      shape: 'sphere',
      radius: 1.7,
      position: [0, 3.4, 0],
      scale: [1.1, 0.9, 1.1],
      color: '#40916c',
      segments: 8,
    },
    {
      name: 'canopy_accent',
      shape: 'sphere',
      radius: 1.2,
      position: [0.6, 3.2, 0.4],
      color: '#52b788',
      segments: 8,
    },
  ],
});

export const BIRCH_DESIGN: ModelSpec = ModelSpecSchema.parse({
  name: 'birch',
  description: 'Slender birch tree with pale bark.',
  parts: [
    {
      name: 'trunk',
      shape: 'cylinder',
      radiusTop: 0.15,
      radiusBottom: 0.2,
      height: 3.2,
      position: [0, 1.6, 0],
      color: '#e9ecef',
      segments: 8,
    },
    {
      name: 'canopy_lower',
      shape: 'cone',
      radius: 1.1,
      height: 2.2,
      position: [0, 3.6, 0],
      color: '#74c69d',
      segments: 8,
    },
    {
      name: 'canopy_upper',
      shape: 'cone',
      radius: 0.8,
      height: 1.8,
      position: [0, 4.7, 0],
      color: '#95d5b2',
      segments: 8,
    },
  ],
});

export const BUSH_DESIGN: ModelSpec = ModelSpecSchema.parse({
  name: 'bush',
  description: 'Low-poly leafy shrub.',
  parts: [
    {
      name: 'foliage_center',
      shape: 'sphere',
      radius: 0.9,
      position: [0, 0.7, 0],
      color: '#2d6a4f',
      segments: 8,
    },
    {
      name: 'foliage_side_1',
      shape: 'sphere',
      radius: 0.7,
      position: [0.5, 0.6, 0.3],
      color: '#40916c',
      segments: 8,
    },
    {
      name: 'foliage_side_2',
      shape: 'sphere',
      radius: 0.6,
      position: [-0.4, 0.5, -0.2],
      color: '#52b788',
      segments: 8,
    },
  ],
});

export const GRASS_CLUMP_DESIGN: ModelSpec = ModelSpecSchema.parse({
  name: 'grass-clump',
  description: 'Clump of wild grass tufts.',
  parts: [
    {
      name: 'blade_1',
      shape: 'cone',
      radius: 0.08,
      height: 0.7,
      position: [-0.15, 0.35, 0],
      rotation: [0, 0, 12],
      color: '#74c69d',
      segments: 6,
    },
    {
      name: 'blade_2',
      shape: 'cone',
      radius: 0.08,
      height: 0.85,
      position: [0, 0.42, 0],
      color: '#52b788',
      segments: 6,
    },
    {
      name: 'blade_3',
      shape: 'cone',
      radius: 0.08,
      height: 0.65,
      position: [0.15, 0.32, 0],
      rotation: [0, 0, -15],
      color: '#40916c',
      segments: 6,
    },
    {
      name: 'blade_4',
      shape: 'cone',
      radius: 0.07,
      height: 0.6,
      position: [0, 0.3, 0.15],
      rotation: [-12, 0, 0],
      color: '#74c69d',
      segments: 6,
    },
  ],
});

export const ROCK_DESIGN: ModelSpec = ModelSpecSchema.parse({
  name: 'rock',
  description: 'Low-poly terrain boulder.',
  parts: [
    {
      name: 'main_rock',
      shape: 'sphere',
      radius: 0.8,
      position: [0, 0.5, 0],
      scale: [1.2, 0.7, 0.9],
      color: '#8d99ae',
      segments: 6,
    },
    {
      name: 'sub_rock',
      shape: 'sphere',
      radius: 0.5,
      position: [0.5, 0.35, 0.3],
      scale: [0.9, 0.6, 1.1],
      color: '#6c757d',
      segments: 6,
    },
  ],
});

/** All built-in foliage designs keyed by their canonical and alias names. */
export const BUILT_IN_FOLIAGE_DESIGNS: Record<string, ModelSpec> = {
  pine: PINE_DESIGN,
  broadleaf: BROADLEAF_DESIGN,
  oak: BROADLEAF_DESIGN,
  birch: BIRCH_DESIGN,
  bush: BUSH_DESIGN,
  'grass-clump': GRASS_CLUMP_DESIGN,
  'grass-tuft': GRASS_CLUMP_DESIGN,
  rock: ROCK_DESIGN,
};

/** Default asset lists per foliage class. */
export const DEFAULT_FOLIAGE_ASSETS: Record<'tree' | 'grass', string[]> = {
  tree: ['pine', 'broadleaf', 'birch'],
  grass: ['grass-clump', 'bush'],
};
