/**
 * Lighting rigs for the editor viewport — all procedural, none fetched. (drei's `Environment`
 * presets download HDRIs from a CDN; the app never makes that request.) `environment` turns on a
 * generated room environment map (three's bundled `RoomEnvironment`) so metals have something to
 * reflect.
 */
export type Light = { position: [number, number, number]; intensity: number; color?: string };
export type LightingPreset = {
  id: string;
  label: string;
  hemisphere: { sky: string; ground: string; intensity: number };
  ambient: number;
  directional: Light[];
  /** Strength of the generated environment map (0 = none). */
  environment: number;
};

export const LIGHTING_PRESETS: readonly LightingPreset[] = [
  {
    id: 'studio',
    label: 'Studio',
    hemisphere: { sky: '#ffffff', ground: '#666677', intensity: 1.2 },
    ambient: 0.3,
    directional: [
      { position: [4, 8, 5], intensity: 1.7 },
      { position: [-5, 3, -4], intensity: 0.5, color: '#bcd0ff' },
    ],
    environment: 0.8,
  },
  {
    id: 'softbox',
    label: 'Soft box',
    hemisphere: { sky: '#ffffff', ground: '#aaaaaa', intensity: 1.8 },
    ambient: 0.6,
    directional: [{ position: [0, 9, 2], intensity: 1 }],
    environment: 0.5,
  },
  {
    id: 'sunset',
    label: 'Sunset',
    hemisphere: { sky: '#ffcf9e', ground: '#3b2f4a', intensity: 1 },
    ambient: 0.15,
    directional: [
      { position: [8, 2, 3], intensity: 2.4, color: '#ff9a52' },
      { position: [-6, 4, -5], intensity: 0.4, color: '#6e7fff' },
    ],
    environment: 0.5,
  },
  {
    id: 'night',
    label: 'Night rim',
    hemisphere: { sky: '#1b2a55', ground: '#05060d', intensity: 0.8 },
    ambient: 0.05,
    directional: [
      { position: [-5, 4, -6], intensity: 2.2, color: '#7aa2ff' },
      { position: [6, 2, 4], intensity: 0.6, color: '#ff7ad9' },
    ],
    environment: 0.25,
  },
  {
    id: 'flat',
    label: 'Flat',
    hemisphere: { sky: '#ffffff', ground: '#ffffff', intensity: 2.4 },
    ambient: 0.8,
    directional: [],
    environment: 0,
  },
];

export const DEFAULT_LIGHTING = LIGHTING_PRESETS[0]!.id;
export const lightingById = (id: string): LightingPreset => LIGHTING_PRESETS.find((p) => p.id === id) ?? LIGHTING_PRESETS[0]!;
