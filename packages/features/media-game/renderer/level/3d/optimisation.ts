/**
 * The 3D view's Optimisation slider (Phase 136 Theme G): five presets, 1 = quality … 5 = performance. Every value
 * moves one way across the steps, so a step up never costs more than the step below it.
 */
export type OptimisationStep = 1 | 2 | 3 | 4 | 5;

export type OptimisationPreset = {
  step: OptimisationStep;
  label: string;
  /** Metres from the camera's focus: props, models and terrain tiles beyond it are not drawn; fog closes in on it. */
  drawDistance: number;
  /** An item smaller than this on screen (px) draws as its box, not its model. */
  fullAbovePx: number;
  /** An item smaller than this on screen (px) is not drawn at all. */
  hideBelowPx: number;
  /** Ground tile grid segments per side. */
  terrainSegments: number;
  /** Ground tile edge, metres. */
  terrainTile: number;
  shadows: boolean;
  /** The most level lights (`light` entities) lit at once, nearest first. */
  maxLights: number;
  /** The most full models drawn at once, nearest first. */
  maxModels: number;
  /** Upper bound on the canvas pixel ratio. */
  pixelRatio: number;
};

export const OPTIMISATION_PRESETS: readonly OptimisationPreset[] = [
  { step: 1, label: 'Quality', drawDistance: 600, fullAbovePx: 16, hideBelowPx: 0.5, terrainSegments: 32, terrainTile: 32, shadows: true, maxLights: 16, maxModels: 600, pixelRatio: 2 },
  { step: 2, label: 'High', drawDistance: 400, fullAbovePx: 32, hideBelowPx: 1, terrainSegments: 16, terrainTile: 32, shadows: true, maxLights: 8, maxModels: 300, pixelRatio: 1.5 },
  { step: 3, label: 'Balanced', drawDistance: 250, fullAbovePx: 56, hideBelowPx: 2, terrainSegments: 8, terrainTile: 48, shadows: false, maxLights: 4, maxModels: 150, pixelRatio: 1.25 },
  { step: 4, label: 'Fast', drawDistance: 150, fullAbovePx: 96, hideBelowPx: 4, terrainSegments: 4, terrainTile: 64, shadows: false, maxLights: 2, maxModels: 60, pixelRatio: 1 },
  { step: 5, label: 'Performance', drawDistance: 90, fullAbovePx: 160, hideBelowPx: 6, terrainSegments: 2, terrainTile: 64, shadows: false, maxLights: 0, maxModels: 20, pixelRatio: 0.75 },
];

export const DEFAULT_OPTIMISATION: OptimisationStep = 3;

export function presetFor(step: number): OptimisationPreset {
  const clamped = Math.min(5, Math.max(1, Math.round(Number.isFinite(step) ? step : DEFAULT_OPTIMISATION)));
  return OPTIMISATION_PRESETS[clamped - 1]!;
}

/** The canvas pixel ratio a preset allows on a display of `device` pixel ratio. */
export const pixelRatioFor = (preset: OptimisationPreset, device: number): number => Math.min(preset.pixelRatio, Math.max(0.5, device || 1));
