// vitest/jsdom: DOM text assertions over a mocked bridge + react-query cache,
// with `KnowledgeCanvas` (real sigma/WebGL) mocked out — jsdom has no WebGL,
// and Theme E's own phase-doc bullet is "no canvas needed to test what a
// filter selects." None of this needs a real browser.
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { useKnowledgeFiltersStore } from './knowledge-filters-store';
import { KnowledgeView } from './knowledge-view';

vi.mock('./knowledge-canvas', () => ({
  KnowledgeCanvas: () => <div data-testid="knowledge-canvas-stub" />,
}));

vi.mock('./knowledge-node-panel', () => ({
  KnowledgeNodePanel: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="knowledge-node-panel-stub">{nodeId}</div>
  ),
}));

function installBridge(overrides: Partial<MidniteStudioBridge['knowledge']>) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    knowledge: {
      getGraph: vi.fn(),
      getNodeDetail: vi.fn(),
      checkGraph: vi.fn(),
      onLayoutProgress: vi.fn(() => () => {}),
      ...overrides,
    } as unknown as MidniteStudioBridge['knowledge'],
  } as Partial<MidniteStudioBridge>;
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <KnowledgeView />
    </QueryClientProvider>,
  );
}

const READY_PAYLOAD = {
  nodes: [
    { id: 'a', label: 'useNow', community: 0, communityName: 'core', fileType: 'code' },
    { id: 'b', label: 'useNowTick', community: 1, communityName: 'edge', fileType: 'code' },
  ],
  links: [
    { source: 'a', target: 'b', relation: 'calls', weight: 1, confidence: 1 },
    { source: 'a', target: 'b', relation: 'imports', weight: 1, confidence: 0.85 },
  ],
  positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
  builtAtCommit: 'deadbeef',
  cached: true,
  commitsBehind: 0,
};

describe('KnowledgeView (Phase 87 Themes D, E, F)', () => {
  beforeEach(() => {
    useKnowledgeFiltersStore.setState({
      scopeKey: null,
      filters: {
        query: '',
        relations: new Set(['calls']),
        minWeight: 0,
        minConfidence: 0,
        hiddenCommunities: new Set(),
      },
      selectedNodeId: null,
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useUiStore.setState({ selectedRepoId: null, selectedWorktreePath: null });
  });

  it('shows a loading state while the graph is being fetched', () => {
    useUiStore.setState({ selectedRepoId: 'repo:1' });
    installBridge({ getGraph: vi.fn().mockReturnValue(new Promise(() => {})) });

    renderView();

    expect(screen.getByText(/reading the knowledge graph/i)).toBeDefined();
  });

  it('renders instructions, not an error, for the un-graphified repo (absent)', async () => {
    useUiStore.setState({ selectedRepoId: 'repo:1' });
    installBridge({ getGraph: vi.fn().mockResolvedValue({ ok: false, kind: 'absent' }) });

    renderView();

    await waitFor(() => expect(screen.getByText(/hasn.t been graphified yet/i)).toBeDefined());
    expect(screen.getByText('pip install graphifyy')).toBeDefined();
    expect(screen.getByText('graphify update .')).toBeDefined();
    expect(screen.queryByText(/error/i)).toBeNull();
  });

  it('renders malformed distinctly from absent', async () => {
    useUiStore.setState({ selectedRepoId: 'repo:1' });
    installBridge({
      getGraph: vi
        .fn()
        .mockResolvedValue({ ok: false, kind: 'malformed', message: 'not shaped like a graph' }),
    });

    renderView();

    await waitFor(() => expect(screen.getByText(/isn.t a graph/i)).toBeDefined());
    expect(screen.getByText(/not shaped like a graph/)).toBeDefined();
    expect(screen.queryByText(/hasn.t been graphified yet/i)).toBeNull();
  });

  it('renders unreadable with its own message, distinct from absent and malformed', async () => {
    useUiStore.setState({ selectedRepoId: 'repo:1' });
    installBridge({
      getGraph: vi.fn().mockResolvedValue({ ok: false, kind: 'unreadable', message: 'EACCES' }),
    });

    renderView();

    await waitFor(() => expect(screen.getByText(/Can.t read/i)).toBeDefined());
    expect(screen.getByText('EACCES')).toBeDefined();
  });

  it('shows a staleness banner with the real count when commitsBehind is positive', async () => {
    useUiStore.setState({ selectedRepoId: 'repo:1' });
    installBridge({
      getGraph: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...READY_PAYLOAD, nodes: [READY_PAYLOAD.nodes[0]!], links: [], commitsBehind: 5 },
      }),
    });

    renderView();

    await waitFor(() => expect(screen.getByText(/5 commits behind HEAD/)).toBeDefined());
  });

  it('shows no staleness banner when commitsBehind is 0', async () => {
    useUiStore.setState({ selectedRepoId: 'repo:1' });
    installBridge({
      getGraph: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...READY_PAYLOAD, nodes: [], links: [], positions: {}, commitsBehind: 0 },
      }),
    });

    renderView();

    await waitFor(() => expect(screen.getByTestId('knowledge-canvas-stub')).toBeDefined());
    expect(screen.queryByText(/commits behind/)).toBeNull();
  });

  it('shows no staleness banner when commitsBehind could not be determined (null)', async () => {
    useUiStore.setState({ selectedRepoId: 'repo:1' });
    installBridge({
      getGraph: vi.fn().mockResolvedValue({
        ok: true,
        value: { ...READY_PAYLOAD, nodes: [], links: [], positions: {}, commitsBehind: null },
      }),
    });

    renderView();

    await waitFor(() => expect(screen.getByTestId('knowledge-canvas-stub')).toBeDefined());
    expect(screen.queryByText(/commits behind/)).toBeNull();
  });

  it('renders the canvas and filter panel once the graph loads', async () => {
    useUiStore.setState({ selectedRepoId: 'repo:1' });
    installBridge({ getGraph: vi.fn().mockResolvedValue({ ok: true, value: READY_PAYLOAD }) });

    renderView();

    await waitFor(() => expect(screen.getByTestId('knowledge-canvas-stub')).toBeDefined());
    expect(screen.getByLabelText('Search knowledge graph nodes')).toBeDefined();
    // The relation checkbox list, from the fixture's two distinct relations.
    expect(screen.getByText('calls')).toBeDefined();
    expect(screen.getByText('imports')).toBeDefined();
    // Default filter (relations = {'calls'}) shows 1 of 2 fixture edges.
    expect(screen.getByText('1 / 2 edges')).toBeDefined();
  });

  it('opens the node panel once a node is selected in the filters store', async () => {
    useUiStore.setState({ selectedRepoId: 'repo:1' });
    installBridge({ getGraph: vi.fn().mockResolvedValue({ ok: true, value: READY_PAYLOAD }) });

    renderView();
    await waitFor(() => expect(screen.getByTestId('knowledge-canvas-stub')).toBeDefined());

    useKnowledgeFiltersStore.getState().selectNode('a');
    await waitFor(() =>
      expect(screen.getByTestId('knowledge-node-panel-stub').textContent).toBe('a'),
    );
  });
});
