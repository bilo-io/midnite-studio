import type { McpServerStatus, MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { diffLines, McpServersSection } from './mcp-servers-section';

const server = (over: Partial<McpServerStatus> = {}): McpServerStatus => ({
  repoId: 'r1',
  serverName: 'files',
  source: 'repo-mcp-json',
  sourcePath: '/r/.mcp.json',
  transport: 'stdio',
  command: 'npx -y fs-mcp',
  configHash: 'hash-1',
  toolsHash: null,
  verdict: 'new',
  findings: [],
  diff: { config: { before: null, after: '{\n  "command": "npx"\n}' }, tools: [] },
  approvedAt: null,
  ...over,
});

function install(servers: McpServerStatus[], approveResult: unknown = { ok: true, value: {} }) {
  const list = vi.fn().mockResolvedValue({ ok: true, value: { servers } });
  const approve = vi.fn().mockResolvedValue(approveResult);
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = { mcpTrust: { list, approve } } as Partial<MidniteStudioBridge>;
  return { list, approve };
}

const wrap = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('diffLines', () => {
  it('marks added, removed and unchanged lines', () => {
    expect(diffLines('a\nb\nc', 'a\nB\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'same', text: 'c' },
    ]);
    expect(diffLines(null, 'x')).toEqual([{ kind: 'add', text: 'x' }]);
  });
});

describe('McpServersSection', () => {
  it('shows a new server with its command and an Approve button that sends the hash it showed', async () => {
    const { approve } = install([server()]);
    render(<McpServersSection repoId="r1" repoName="app" />, { wrapper: wrap });
    const card = await screen.findByTestId('mcp-server-files');
    expect(card.getAttribute('data-verdict')).toBe('new');
    expect(card.textContent).toContain('npx -y fs-mcp');
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith({ repoId: 'r1', serverName: 'files', configHash: 'hash-1' }));
  });

  it('shows the before/after of an edited entry as a diff', async () => {
    install([
      server({
        verdict: 'config-changed',
        diff: { config: { before: '{\n  "command": "npx",\n  "args": ["fs-mcp"]\n}', after: '{\n  "command": "npx",\n  "args": ["fs-mcp", "--evil"]\n}' }, tools: [] },
      }),
    ]);
    render(<McpServersSection repoId="r1" />, { wrapper: wrap });
    const diff = await screen.findByTestId('mcp-server-diff');
    expect(screen.getByTestId('mcp-server-verdict').textContent).toBe('Config changed');
    expect(diff.querySelectorAll('[data-diff="add"]').length).toBe(1);
    expect(diff.querySelectorAll('[data-diff="del"]').length).toBe(1);
    expect(diff.querySelector('[data-diff="add"]')?.textContent).toContain('--evil');
  });

  it('holds a poisoned server: findings listed, Approve disabled', async () => {
    const { approve } = install([
      server({
        verdict: 'held',
        findings: [{ kind: 'instruction', tool: 'add', field: 'description', evidence: '<IMPORTANT>', message: 'The description of "add" instructs the model (important-block).' }],
      }),
    ]);
    render(<McpServersSection repoId="r1" />, { wrapper: wrap });
    expect((await screen.findByTestId('mcp-server-findings')).textContent).toContain('instructs the model');
    const button = screen.getByRole('button', { name: /approve/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(approve).not.toHaveBeenCalled();
  });

  it('lists an approved server with no Approve button, and says so when none are configured', async () => {
    install([server({ verdict: 'approved', diff: { config: null, tools: [] } })]);
    render(<McpServersSection repoId="r1" />, { wrapper: wrap });
    expect((await screen.findByTestId('mcp-server-files')).getAttribute('data-verdict')).toBe('approved');
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    cleanup();
    install([]);
    render(<McpServersSection repoId="r1" />, { wrapper: wrap });
    expect(await screen.findByTestId('mcp-servers-empty')).toBeTruthy();
  });

  it('shows the reason when an approval is refused', async () => {
    install([server()], { ok: false, kind: 'error', message: 'files changed since you reviewed it.' });
    render(<McpServersSection repoId="r1" />, { wrapper: wrap });
    fireEvent.click(await screen.findByRole('button', { name: /approve/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('changed since you reviewed');
  });
});
