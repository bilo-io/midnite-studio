import type { AiPlanBlueprint } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PlanGraphPreview, planBlueprintToForgeGraph } from './plan-graph-preview';

afterEach(cleanup);

const blueprint: AiPlanBlueprint = {
  project: { title: 'Ship auth', description: '' },
  tasks: [
    { key: 'api', title: 'Build the API', body: '', labels: [] },
    { key: 'ui', title: 'Wire up the UI', body: '', labels: [] },
  ],
  edges: [{ from: 'ui', to: 'api', kind: 'blockedBy' }],
};

describe('planBlueprintToForgeGraph', () => {
  it('turns each task into a draft node keyed by its own local key', () => {
    const graph = planBlueprintToForgeGraph(blueprint);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.every((node) => node.kind === 'draft')).toBe(true);
    expect(graph.nodes.map((node) => node.itemId)).toEqual(['api', 'ui']);
  });

  it('marks a task blocked when a blockedBy edge names it as the dependent', () => {
    const graph = planBlueprintToForgeGraph(blueprint);
    const ui = graph.nodes.find((node) => node.itemId === 'ui')!;
    const api = graph.nodes.find((node) => node.itemId === 'api')!;
    expect(ui.blocked).toBe(true);
    expect(ui.unmetBlockerCount).toBe(1);
    expect(api.blocked).toBe(false);
  });

  it('carries the blockedBy edge over as a "blocks" graph edge', () => {
    const graph = planBlueprintToForgeGraph(blueprint);
    expect(graph.edges).toEqual([{ from: 'ui', to: 'api', kind: 'blocks', source: 'field' }]);
  });

  it('produces no nodes for an empty task list', () => {
    const graph = planBlueprintToForgeGraph({ project: { title: 'X', description: '' }, tasks: [], edges: [] } as unknown as AiPlanBlueprint);
    expect(graph.nodes).toEqual([]);
  });
});

describe('PlanGraphPreview', () => {
  it('renders one labelled box per task', () => {
    render(<PlanGraphPreview blueprint={blueprint} />);
    expect(screen.getByText('Build the API')).toBeTruthy();
    expect(screen.getByText('Wire up the UI')).toBeTruthy();
  });

  it('renders a placeholder when there are no tasks yet', () => {
    render(
      <PlanGraphPreview
        blueprint={{ project: { title: 'X', description: '' }, tasks: [], edges: [] } as unknown as AiPlanBlueprint}
      />,
    );
    expect(screen.getByText('No tasks yet.')).toBeTruthy();
  });
});
