import type { AgentAuditRecord, MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentAuditView } from './agent-audit-view';

const records: AgentAuditRecord[] = [
  { id: 'a', at: Date.now(), kind: 'command', sessionId: 'sess-1', command: 'npm test', source: 'heuristic' },
  { id: 'b', at: Date.now() - 10, kind: 'mcp-call', tool: 'repo.list', repoPath: '/r', ok: true, ms: 4 },
];

function install(exportResult: unknown = { ok: true, value: { path: '/tmp/a.ndjson', count: 2 } }) {
  const list = vi.fn().mockResolvedValue({ records, truncated: false });
  const exportFn = vi.fn().mockResolvedValue(exportResult);
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    agentAudit: { list, export: exportFn },
  } as Partial<MidniteStudioBridge>;
  return { list, exportFn };
}

const wrap = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('AgentAuditView', () => {
  it('lists records newest first and expands a row to its record', async () => {
    install();
    render(<AgentAuditView />, { wrapper: wrap });
    expect(await screen.findByText('npm test')).toBeTruthy();
    expect(screen.getByText(/repo\.list ok in 4 ms/)).toBeTruthy();
    fireEvent.click(screen.getByText('npm test'));
    expect(screen.getByTestId('audit-record-json').textContent).toContain('"source": "heuristic"');
  });

  it('sends the kind and session filters to the bridge', async () => {
    const { list } = install();
    render(<AgentAuditView />, { wrapper: wrap });
    await screen.findByText('npm test');
    fireEvent.click(screen.getByRole('button', { name: 'Command' }));
    fireEvent.change(screen.getByLabelText('Filter by session id'), { target: { value: 'sess-1' } });
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ kinds: ['command'], sessionId: 'sess-1', limit: 200 })),
    );
  });

  it('exports the filtered trail and says where it went', async () => {
    const { exportFn } = install();
    render(<AgentAuditView />, { wrapper: wrap });
    await screen.findByText('npm test');
    fireEvent.click(screen.getByLabelText('Export the audit trail'));
    expect(await screen.findByText(/Exported 2 records \(redacted\) to \/tmp\/a\.ndjson/)).toBeTruthy();
    expect(exportFn).toHaveBeenCalledTimes(1);
  });

  it('reports a dismissed save dialog', async () => {
    install({ ok: true, value: { path: null, count: 0 } });
    render(<AgentAuditView />, { wrapper: wrap });
    await screen.findByText('npm test');
    fireEvent.click(screen.getByLabelText('Export the audit trail'));
    expect(await screen.findByText('Export cancelled.')).toBeTruthy();
  });
});
