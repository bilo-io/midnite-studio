import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Coder's Tailwind config: the frame's preset plus the globs of what this build
 * compiles from source (the frame, the forge and tests features) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, ['forge', 'tests']),
};

export default config;
