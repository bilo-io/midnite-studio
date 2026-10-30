import { describe, expect, it } from 'vitest';
import { NODE_PROJECTS, projectDir } from './gate-projects-check.mjs';
import { buildTypecheckTargets, runWithConcurrency } from './typecheck-node.mjs';

describe('buildTypecheckTargets', () => {
  it('maps node projects to their tsconfig paths correctly', () => {
    const targets = buildTypecheckTargets(['shared', 'feature-optimizer'], projectDir, '/repo');
    expect(targets).toEqual([
      { id: 'shared', configPath: '/repo/packages/shared/tsconfig.json' },
      { id: 'feature-optimizer', configPath: '/repo/packages/features/optimizer/tsconfig.json' },
    ]);
  });

  it('maps all 55 NODE_PROJECTS', () => {
    const targets = buildTypecheckTargets(NODE_PROJECTS, projectDir, '/repo');
    expect(targets).toHaveLength(55);
    expect(targets.every((t) => t.configPath.endsWith('tsconfig.json'))).toBe(true);
  });
});

describe('runWithConcurrency', () => {
  it('processes items concurrently and returns all results', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runWithConcurrency(items, 2, async (item) => item * 2);
    expect(results.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);
  });

  it('handles empty items array', async () => {
    const results = await runWithConcurrency([], 4, async () => 1);
    expect(results).toEqual([]);
  });
});
