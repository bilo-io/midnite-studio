import { defineConfig } from 'vitest/config';
import { NODE_PROJECTS, projectDir } from './scripts/gate-projects-check.mjs';

export const NODE_GATE_PROJECTS = [
  ...NODE_PROJECTS.filter((id) => id !== 'app').map((id) => `${projectDir(id)}/vitest.config.ts`),
  './vitest.config.ts',
];

export default defineConfig({
  test: {
    projects: NODE_GATE_PROJECTS,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
