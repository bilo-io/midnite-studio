import { describe, expect, it, vi } from 'vitest';

import { startAgentCommandAudit } from './agent-command-audit';

describe('agent command audit', () => {
  it('records a command typed into an agent pty and ignores a plain shell', async () => {
    const inputs: ((ptyId: string, data: string) => void)[] = [];
    const records: unknown[] = [];
    const stop = startAgentCommandAudit({
      observeInput: (o) => (inputs.push(o), () => undefined),
      observeOutput: () => () => undefined,
      sessionIdFor: (ptyId) => (ptyId === 'p1' ? 's-agent' : 's-shell'),
      onSessionExit: () => () => undefined,
      listTerminals: async () => [
        { session: { id: 's-agent', kind: 'agent', agentId: 'claude', cwd: '/r' } },
        { session: { id: 's-shell', kind: 'shell' } },
      ],
      record: (r) => records.push(r),
    });
    inputs[0]!('p1', 'npm test\r');
    inputs[0]!('p2', 'ls\r');
    await vi.waitFor(() => expect(records).toHaveLength(1));
    expect(records).toEqual([
      { kind: 'command', sessionId: 's-agent', command: 'npm test', source: 'heuristic', agentId: 'claude', cwd: '/r' },
    ]);
    stop();
  });
});
