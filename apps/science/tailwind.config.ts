import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Science's Tailwind config: the frame's preset plus the globs of what this build
 * compiles from source (the frame and the science module) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, [], ['science', 'simulator']),
};

export default config;
