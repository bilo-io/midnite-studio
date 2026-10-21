import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Gamer's Tailwind config: the frame's preset plus the globs of what this build compiles from source
 * (the frame and the five game feature packages, with media-core's shell) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, ['media-core', 'media-map', 'media-terrain', 'media-sprite', 'media-model', 'media-game']),
};

export default config;
