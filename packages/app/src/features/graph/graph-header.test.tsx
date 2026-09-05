import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphHeader, useGraphColumns } from './graph-header';
import { GRAPH_THEMES } from './graph-themes';

const mocks = vi.hoisted(() => ({
  windowRole: 'main' as string,
}));

vi.mock('../../services/bridge', () => ({
  bridge: () => ({ windowRole: mocks.windowRole }),
}));

vi.mock('../../store/ui-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/ui-store')>();
  return {
    ...actual,
    useUiStore: (
      selector: (s: {
        graphColumns: Record<string, number>;
        setGraphColumn: (key: string, value: number) => void;
        graphRefFilter: readonly string[];
        setGraphRefFilter: (next: string[]) => void;
        graphAuthorFilter: readonly string[];
        setGraphAuthorFilter: (next: string[]) => void;
        detachedPages: readonly string[];
      }) => unknown,
    ) =>
      selector({
        graphColumns: actual.DEFAULT_GRAPH_COLUMNS,
        setGraphColumn: vi.fn(),
        graphRefFilter: [],
        setGraphRefFilter: vi.fn(),
        graphAuthorFilter: [],
        setGraphAuthorFilter: vi.fn(),
        detachedPages: [],
      }),
  };
});

/** Builds real `Resizable`s (via the header's own hook) around a plain theme. */
function Harness() {
  const columns = useGraphColumns({ min: 32, max: 96 });
  return (
    <GraphHeader
      refs={[]}
      authors={[]}
      gutterWidth={48}
      columns={columns}
      theme={GRAPH_THEMES.classic}
    />
  );
}

describe('GraphHeader', () => {
  beforeEach(() => {
    mocks.windowRole = 'main';
  });

  afterEach(cleanup);

  it('shows its own detach mark when docked in the main window', () => {
    render(<Harness />);

    expect(screen.getByLabelText('Detach Graph into its own window')).toBeDefined();
  });

  it('hides its own detach mark once popped out — the merged title bar mark already docks it', () => {
    mocks.windowRole = 'graph';
    render(<Harness />);

    expect(screen.queryByLabelText('Detach Graph into its own window')).toBeNull();
    expect(screen.queryByLabelText('Close the Graph window')).toBeNull();
    expect(screen.queryByLabelText('Focus the detached Graph window')).toBeNull();
  });
});
