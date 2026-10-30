import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Vanguard's Tailwind config: the frame's preset plus the globs of what this build
 * compiles from source (the frame, the features of the modules the host mounts) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, ['vanguard', 'vault', 'optimizer', 'monitor'], ['vanguard', 'vault', 'cleaner', 'monitor']),
};

export default config;
