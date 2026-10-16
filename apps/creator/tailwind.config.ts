import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Creator's Tailwind config: the frame's preset plus the globs of what this build
 * compiles from source (the frame and the creator feature) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, ['media-core', 'media-docs', 'media-images']),
};

export default config;
