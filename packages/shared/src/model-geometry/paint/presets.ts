import type { PbrLayer, PbrPresetName } from '../../media-model-pbr';

/**
 * Material presets as layer stacks (Phase 104 Theme G): a base colour and material for the part, then fill
 * layers — object-space noise for variation, and Theme F's bakes as masks for edge wear (convex curvature)
 * and dirt (cavity). Every preset is plain data, so an agent or the user edits it like any other stack.
 *
 * Noise scales are in features per metre and assume a model about a metre or two tall.
 */
export type PbrPreset = {
  label: string;
  color: string;
  roughness: number;
  metalness: number;
  layers: PbrLayer[];
};

const dirt = (color: string, opacity: number): PbrLayer => ({
  id: 'dirt',
  name: 'Cavity dirt',
  kind: 'fill',
  blend: 'multiply',
  opacity,
  fill: { albedo: color, roughness: 0.95 },
  mask: { source: 'cavity', invert: true, low: 0.4, high: 0.97 },
});

export const PBR_PRESET_STACKS: Record<PbrPresetName, PbrPreset> = {
  skin: {
    label: 'Skin',
    color: '#d8a48c',
    roughness: 0.55,
    metalness: 0,
    layers: [
      { id: 'mottle', name: 'Mottling', kind: 'fill', opacity: 0.6, fill: { albedo: '#d8a48c', noise: { scale: 18, amount: 0.12, octaves: 3, seed: 3 } } },
      { id: 'flush', name: 'Flush', kind: 'fill', blend: 'multiply', opacity: 0.25, fill: { albedo: '#e88a7a', noise: { scale: 4, amount: 0.5, seed: 9 } } },
      { id: 'sheen', name: 'Oily sheen', kind: 'fill', opacity: 0.5, fill: { roughness: 0.42 }, mask: { source: 'curvature', low: 0.5, high: 0.75 } },
      dirt('#9a6a5c', 0.35),
    ],
  },
  metal: {
    label: 'Metal',
    color: '#c4c6ca',
    roughness: 0.32,
    metalness: 1,
    layers: [
      { id: 'brushed', name: 'Brushed', kind: 'fill', opacity: 0.8, fill: { roughness: 0.32, noise: { scale: 40, amount: 0.12, stretch: [1, 20, 1], seed: 5 } } },
      { id: 'polish', name: 'Polished edges', kind: 'fill', opacity: 0.7, fill: { roughness: 0.15, albedo: '#e2e4e8' }, mask: { source: 'curvature', low: 0.55, high: 0.8 } },
      dirt('#6d6a64', 0.4),
    ],
  },
  painted_metal: {
    label: 'Painted metal',
    color: '#2f5d8a',
    roughness: 0.5,
    metalness: 0,
    layers: [
      { id: 'paint', name: 'Paint wear', kind: 'fill', opacity: 0.5, fill: { roughness: 0.5, noise: { scale: 12, amount: 0.15, seed: 2 } } },
      {
        id: 'chips',
        name: 'Edge wear',
        kind: 'fill',
        fill: { albedo: '#b9babd', metalness: 1, roughness: 0.3 },
        mask: { source: 'curvature', low: 0.6, high: 0.72 },
      },
      dirt('#4a4036', 0.5),
    ],
  },
  wood: {
    label: 'Wood',
    color: '#8a5a33',
    roughness: 0.62,
    metalness: 0,
    layers: [
      { id: 'grain', name: 'Grain', kind: 'fill', fill: { albedo: '#8a5a33', noise: { scale: 6, amount: 0.35, stretch: [6, 0.4, 6], octaves: 4, seed: 4 } } },
      { id: 'rings', name: 'Dark rings', kind: 'fill', blend: 'multiply', opacity: 0.35, fill: { albedo: '#6a3e1f', noise: { scale: 30, amount: 0.6, stretch: [1, 0.05, 1], seed: 8 } } },
      dirt('#5c3a20', 0.3),
    ],
  },
  stone: {
    label: 'Stone',
    color: '#8b8984',
    roughness: 0.86,
    metalness: 0,
    layers: [
      { id: 'mottle', name: 'Mottling', kind: 'fill', fill: { albedo: '#8b8984', roughness: 0.86, noise: { scale: 9, amount: 0.3, octaves: 5, seed: 6 } } },
      { id: 'speckle', name: 'Speckle', kind: 'fill', blend: 'multiply', opacity: 0.4, fill: { albedo: '#6e6b66', noise: { scale: 90, amount: 0.8, seed: 12 } } },
      dirt('#4b4842', 0.6),
    ],
  },
  fabric: {
    label: 'Fabric',
    color: '#4f6488',
    roughness: 0.94,
    metalness: 0,
    layers: [
      { id: 'weave', name: 'Weave', kind: 'fill', fill: { albedo: '#4f6488', noise: { scale: 160, amount: 0.12, stretch: [1, 6, 1], seed: 1 } } },
      { id: 'fuzz', name: 'Edge fuzz', kind: 'fill', blend: 'screen', opacity: 0.3, fill: { albedo: '#8fa0bf' }, mask: { source: 'curvature', low: 0.55, high: 0.8 } },
      dirt('#38445c', 0.4),
    ],
  },
  plastic: {
    label: 'Plastic',
    color: '#d6d3cc',
    roughness: 0.4,
    metalness: 0,
    layers: [
      { id: 'scuffs', name: 'Scuffs', kind: 'fill', opacity: 0.6, fill: { roughness: 0.4, noise: { scale: 25, amount: 0.1, seed: 10 } } },
      dirt('#8f8b84', 0.25),
    ],
  },
};
