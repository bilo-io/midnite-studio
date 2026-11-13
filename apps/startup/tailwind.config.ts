import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Startup's Tailwind config: the frame's preset plus the globs of what this build
 * compiles from source (the frame, the ledger feature, the startup and accountant modules) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, ['ledger'], ['startup', 'accountant']),
};

export default config;
