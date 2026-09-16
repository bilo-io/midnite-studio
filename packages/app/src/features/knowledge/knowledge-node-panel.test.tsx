// vitest/jsdom: DOM text/roles over a mocked bridge and a mocked FilePreview
// (Monaco-adjacent, its own bridge test coverage elsewhere) — no canvas here.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getNodeDetail: vi.fn() }));

vi.mock('../files/preview/file-preview', () => ({
  FilePreview: ({ relPath, targetLine }: { relPath: string; targetLine?: number }) => (
    <div data-testid="file-preview-stub">
      {relPath}:{targetLine ?? 'no-line'}
    </div>
  ),
}));

import { KnowledgeNodePanel } from './knowledge-node-panel';

describe('KnowledgeNodePanel', () => {
  beforeEach(() => {
    mocks.getNodeDetail.mockReset();
    // @ts-expect-error test bridge mock — partial `knowledge` shape is enough for this component
    window.midniteStudio = { knowledge: { getNodeDetail: mocks.getNodeDetail } };
  });

  afterEach(() => {
    cleanup();
    window.midniteStudio = undefined;
  });

  it('mounts FilePreview at the parsed line once the detail resolves', async () => {
    mocks.getNodeDetail.mockResolvedValue({
      ok: true,
      value: { sourceFile: 'src/a.ts', sourceLocation: 'L35' },
    });
    render(<KnowledgeNodePanel repoId="repo:1" nodeId="a" onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByTestId('file-preview-stub').textContent).toBe('src/a.ts:35'),
    );
  });

  it('shows a distinct message for a node with no source location', async () => {
    mocks.getNodeDetail.mockResolvedValue({ ok: false, kind: 'not-found' });
    render(<KnowledgeNodePanel repoId="repo:1" nodeId="ghost" onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/no source location to open/i)).toBeDefined(),
    );
  });

  it('surfaces an error message distinctly from not-found', async () => {
    mocks.getNodeDetail.mockResolvedValue({ ok: false, kind: 'error', message: 'boom' });
    render(<KnowledgeNodePanel repoId="repo:1" nodeId="a" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('boom')).toBeDefined());
  });

  it('calls onClose from the close button', async () => {
    mocks.getNodeDetail.mockResolvedValue({
      ok: true,
      value: { sourceFile: 'src/a.ts', sourceLocation: 'L1' },
    });
    const onClose = vi.fn();
    render(<KnowledgeNodePanel repoId="repo:1" nodeId="a" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('file-preview-stub')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('re-fetches when the nodeId prop changes', async () => {
    mocks.getNodeDetail.mockResolvedValue({
      ok: true,
      value: { sourceFile: 'src/a.ts', sourceLocation: 'L1' },
    });
    const { rerender } = render(<KnowledgeNodePanel repoId="repo:1" nodeId="a" onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.getNodeDetail).toHaveBeenCalledWith({ repoId: 'repo:1', nodeId: 'a' }));

    rerender(<KnowledgeNodePanel repoId="repo:1" nodeId="b" onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.getNodeDetail).toHaveBeenCalledWith({ repoId: 'repo:1', nodeId: 'b' }));
  });
});
