import { afterEach, describe, expect, it } from 'vitest';

import { getMcpCallLog, recordMcpCall, resetMcpCallLog } from './audit';

afterEach(() => {
  resetMcpCallLog();
});

describe('the MCP audit ring', () => {
  it('starts empty', () => {
    expect(getMcpCallLog()).toEqual([]);
  });

  it('returns entries newest-first', () => {
    recordMcpCall({ at: 1, tool: 'repo.list', repoPath: '', ok: true, ms: 5 });
    recordMcpCall({ at: 2, tool: 'status.get', repoPath: '/a', ok: true, ms: 10 });

    expect(getMcpCallLog().map((e) => e.tool)).toEqual(['status.get', 'repo.list']);
  });

  it('keeps only the last 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      recordMcpCall({ at: i, tool: 'repo.list', repoPath: '', ok: true, ms: 1 });
    }
    const log = getMcpCallLog();
    expect(log).toHaveLength(50);
    // Newest first: the last one recorded (at: 59) is first.
    expect(log[0]?.at).toBe(59);
    expect(log[49]?.at).toBe(10);
  });
});
