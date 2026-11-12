import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Health's Tailwind config: the frame's preset plus the globs of what this build
 * compiles from source (the frame and the health module) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, [], ['health']),
};

export default config;
