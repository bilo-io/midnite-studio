import type { TerrainShadingMode, TerrainSpec } from '@midnite/studio-shared';

export type ShadingMode = TerrainShadingMode;

export const SHADING_LABEL: Record<ShadingMode, string> = {
  shaded: 'Shaded',
  wireframe: 'Wireframe',
  height: 'Height ramp',
  slope: 'Slope',
  landcover: 'Land cover',
  splat: 'Splat',
  roads: 'Road mask',
};

/** Why a mode cannot be chosen yet, or `null` when it can. Land cover and splat need a satellite image; the road mask needs a roads mask. */
export function shadingNeeds(mode: ShadingMode, spec: Pick<TerrainSpec, 'inputs'>): string | null {
  if ((mode === 'landcover' || mode === 'splat') && !spec.inputs.satellite) return 'Needs a satellite image';
  if (mode === 'roads' && !spec.inputs.roads) return 'Needs a roads mask';
  return null;
}
