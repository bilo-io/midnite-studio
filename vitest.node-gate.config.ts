import { defineConfig } from 'vitest/config';
import { NODE_PROJECTS, projectDir } from './scripts/gate-projects-check.mjs';

export const NODE_GATE_PROJECTS = [
  ...NODE_PROJECTS.filter((id) => id !== 'app').map((id) => `${projectDir(id)}/vitest.config.ts`),
  './vitest.config.ts',
  // Phase 146 B4: apps/* are not scanned by NODE_PROJECTS, so the mobile project is listed explicitly.
  './apps/mobile/vitest.config.ts',
];

export default defineConfig({
  test: {
    projects: NODE_GATE_PROJECTS,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
