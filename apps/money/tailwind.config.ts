import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Money's Tailwind config: the frame's preset plus the globs of what this build
 * compiles from source (the frame and the finance and ledger features) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(__dirname, ['finance', 'ledger'], ['money', 'accountant']),
};

export default config;
