// vitest/jsdom: DOM text assertions over a mocked bridge + react-query cache
// — no canvas, no pointer interaction, none of the browser capabilities that
// would force this into Playwright.
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { KnowledgeView } from './knowledge-view';

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

describe('KnowledgeView (Phase 87 Theme F)', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useUiStore.setState({ selectedRepoId: null, selectedWorktreePath: null });
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
        value: {
          nodes: [{ id: 'a', label: 'A', community: 0, communityName: 'core', fileType: 'code' }],
          links: [],
          positions: { a: { x: 0, y: 0 } },
          builtAtCommit: 'deadbeef',
          cached: true,
          commitsBehind: 5,
        },
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
        value: {
          nodes: [],
          links: [],
          positions: {},
          builtAtCommit: 'deadbeef',
          cached: true,
          commitsBehind: 0,
        },
      }),
    });

    renderView();

    await waitFor(() => expect(screen.getByText('Knowledge')).toBeDefined());
    expect(screen.queryByText(/commits behind/)).toBeNull();
  });

  it('shows no staleness banner when commitsBehind could not be determined (null)', async () => {
    useUiStore.setState({ selectedRepoId: 'repo:1' });
    installBridge({
      getGraph: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          nodes: [],
          links: [],
          positions: {},
          builtAtCommit: 'deadbeef',
          cached: true,
          commitsBehind: null,
        },
      }),
    });

    renderView();

    await waitFor(() => expect(screen.getByText('Knowledge')).toBeDefined());
    expect(screen.queryByText(/commits behind/)).toBeNull();
  });
});
