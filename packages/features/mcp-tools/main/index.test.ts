// @vitest-environment node
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { mcpToolsManifest } from '../manifest';
import { createNoMcpServer, mcpToolsMain, type McpToolsServer } from './index';

describe('mcp-tools main', () => {
  it('registers exactly the manifest channels', () => {
    const ctx = createRecordingContext();
    mcpToolsMain.register(ctx, { server: createNoMcpServer() });
    expect([...ctx.channels].sort()).toEqual([...mcpToolsManifest.ipc].sort());
  });

  it('answers the status, the calls and a set from the server it is given', async () => {
    const status = { ...createNoMcpServer().status(), enabled: true, running: true, socketPath: '/tmp/x.sock' };
    const server: McpToolsServer = {
      status: () => status,
      set: vi.fn(async (request) => ({ ...status, allowUi: request.allowUi ?? false })),
      calls: () => [{ at: 1, tool: 'repo.list', repoPath: '/r', ok: true, ms: 3 }],
    };
    const ctx = createRecordingContext();
    mcpToolsMain.register(ctx, { server });

    expect(await ctx.invoke(CHANNELS.mcpGet)).toMatchObject({ enabled: true, running: true });
    expect(await ctx.invoke(CHANNELS.mcpSet, { allowUi: true })).toMatchObject({ allowUi: true });
    expect(server.set).toHaveBeenCalledWith({ allowUi: true });
    expect(await ctx.invoke(CHANNELS.mcpCalls)).toEqual({ calls: [{ at: 1, tool: 'repo.list', repoPath: '/r', ok: true, ms: 3 }] });
  });

  it('answers a malformed set with the status and an error, never a throw', async () => {
    const ctx = createRecordingContext();
    mcpToolsMain.register(ctx, { server: createNoMcpServer() });
    expect(await ctx.invoke(CHANNELS.mcpSet, { enabled: 'yes' })).toMatchObject({ running: false, error: 'invalid request' });
  });

  it('the no-server server refuses every change and says why', async () => {
    const ctx = createRecordingContext();
    mcpToolsMain.register(ctx, { server: createNoMcpServer('No server here.') });
    expect(await ctx.invoke(CHANNELS.mcpSet, { enabled: true })).toMatchObject({ enabled: false, error: 'No server here.' });
    expect(await ctx.invoke(CHANNELS.mcpCalls)).toEqual({ calls: [] });
  });

  it('answers the audit channels from the port, and an empty trail without one', async () => {
    const list = vi.fn(async () => ({ records: [], truncated: true }));
    const exportTo = vi.fn(async () => ({ ok: true as const, value: { path: '/tmp/a.ndjson', count: 2 } }));
    const ctx = createRecordingContext();
    mcpToolsMain.register(ctx, { server: createNoMcpServer(), audit: { list, exportTo } });
    expect(await ctx.invoke(CHANNELS.agentAuditList, { kinds: ['command'], limit: 5 })).toEqual({ records: [], truncated: true });
    expect(list).toHaveBeenCalledWith({ kinds: ['command'], limit: 5 });
    expect(await ctx.invoke(CHANNELS.agentAuditExport, {})).toEqual({ ok: true, value: { path: '/tmp/a.ndjson', count: 2 } });

    const bare = createRecordingContext();
    mcpToolsMain.register(bare, { server: createNoMcpServer() });
    expect(await bare.invoke(CHANNELS.agentAuditList, {})).toEqual({ records: [], truncated: false });
    expect(await bare.invoke(CHANNELS.agentAuditExport, {})).toMatchObject({ ok: false });
    expect(await bare.invoke(CHANNELS.agentAuditList, { limit: 0 })).toEqual({ records: [], truncated: false });
  });
});
