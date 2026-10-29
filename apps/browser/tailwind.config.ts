import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Browser's Tailwind config: the frame's preset plus the globs of what this build compiles from source
 * (the frame and the browser feature) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, ['browser'], ['browser']),
};

export default config;
