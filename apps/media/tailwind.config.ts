import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Media's Tailwind config: the frame's preset plus the globs of what this build compiles from source
 * (the frame, media-core and the Library feature) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, ['media-core', 'media-library'], ['media']),
};

export default config;
