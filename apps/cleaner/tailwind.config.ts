import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Cleaner's Tailwind config: the frame's preset plus the globs of what this build
 * compiles from source (the frame and the optimizer feature) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, ['optimizer']),
};

export default config;
