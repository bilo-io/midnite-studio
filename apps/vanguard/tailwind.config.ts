import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Vanguard's Tailwind config: the frame's preset plus the globs of what this build
 * compiles from source (the frame and the vanguard feature) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, ['vanguard'], ['vanguard']),
};

export default config;
