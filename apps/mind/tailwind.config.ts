import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Mind's Tailwind config: the frame's preset plus the globs of what this build
 * compiles from source (the frame and the mind feature) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, ['notes']),
};

export default config;
