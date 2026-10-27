import { createAgentAudit } from '@midnite/studio-runtime';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { configureMcpAudit, getMcpCallLog, recordMcpCall, resetMcpCallLog } from './audit';

afterEach(() => {
  resetMcpCallLog();
});

describe('the MCP call log without a trail (the memory ring)', () => {
  it('starts empty', async () => {
    expect(await getMcpCallLog()).toEqual([]);
  });

  it('returns entries newest-first', async () => {
    recordMcpCall({ at: 1, tool: 'repo.list', repoPath: '', ok: true, ms: 5 });
    recordMcpCall({ at: 2, tool: 'status.get', repoPath: '/a', ok: true, ms: 10 });

    expect((await getMcpCallLog()).map((e) => e.tool)).toEqual(['status.get', 'repo.list']);
  });

  it('keeps only the last 50 entries', async () => {
    for (let i = 0; i < 60; i++) {
      recordMcpCall({ at: i, tool: 'repo.list', repoPath: '', ok: true, ms: 1 });
    }
    const log = await getMcpCallLog();
    expect(log).toHaveLength(50);
    expect(log[0]?.at).toBe(59);
    expect(log[49]?.at).toBe(10);
  });
});

describe('the MCP call log over the trail', () => {
  it('is the trail tail: calls made before the trail existed move in, and the view equals the last 50', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-audit-'));
    try {
      const base = Date.now() - 1000;
      recordMcpCall({ at: base, tool: 'repo.list', repoPath: '/early', ok: true, ms: 1 });
      const trail = createAgentAudit({ userData: dir });
      configureMcpAudit(trail);
      for (let i = 2; i < 62; i++) recordMcpCall({ at: base + i, tool: 'status.get', repoPath: '/r', ok: i % 2 === 0, ms: i });
      await trail.flush();

      const view = await getMcpCallLog();
      const onDisk = await trail.tail({ kind: 'mcp-call', limit: 50 });
      expect(view).toHaveLength(50);
      expect(view.map((e) => e.ms)).toEqual(onDisk.map((r) => (r.kind === 'mcp-call' ? r.ms : -1)));
      expect(view[0]).toEqual({ at: base + 61, tool: 'status.get', repoPath: '/r', ok: false, ms: 61 });
      // The early call is in the file, just older than the last 50.
      const all = await trail.list({ kinds: ['mcp-call'], limit: 100 });
      expect(all.records.some((r) => r.kind === 'mcp-call' && r.repoPath === '/early')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
