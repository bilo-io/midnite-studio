// @vitest-environment node
// vitest, not Playwright: pure mapping plus a temp-dir record; the real broker attach is proven in
// desktop's broker-guest.test.ts, beside the pty server.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { schemas } from '@midnite/studio-shared';

import { createMonitorSessions, readHostSessions, terminalListFromShared, usageSessionsFrom } from './shared-sessions';

const live = (sessionId: string, cwd: string) => ({ ptyId: `p-${sessionId}`, sessionId, pid: 42, cols: 80, rows: 24, cwd, legacy: false, owner: 'studio' });

describe('Monitor’s shared sessions', () => {
  it('titles a live session from the host’s terminal list, and shows an unknown one by its folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mon-ss-'));
    const file = join(dir, 'terminals.json');
    const agent = { id: 's1', kind: 'agent', agentId: 'claude', title: 'widgets', cwd: '/w', repoId: 'r1', createdAt: 1000 };
    writeFileSync(file, JSON.stringify({ version: 1, sessions: [agent, { id: 'bad' }] }));
    const known = readHostSessions(file);
    expect([...known.keys()]).toEqual(['s1']);

    const list = terminalListFromShared(
      { sessions: [live('s1', '/w'), live('s2', '/tmp/scratch')], status: { mode: 'broker' } },
      known,
      () => 5000,
    );
    expect(schemas.TerminalListResponse.safeParse(list).success).toBe(true);
    expect(list.broker).toEqual({ mode: 'broker' });
    expect(list.sessions.map((s) => [s.session.id, s.session.title, s.session.createdAt, s.live?.ptyId])).toEqual([
      ['s1', 'widgets', 1000, 'p-s1'],
      ['s2', 'scratch', 5000, 'p-s2'],
    ]);
    // No output crosses: scrollback stays empty.
    expect(list.sessions.every((s) => s.scrollback.length === 0)).toBe(true);
    expect(usageSessionsFrom(list)).toEqual([{ id: 's1', agentId: 'claude', title: 'widgets', cwd: '/w', agentConversationId: undefined }]);
  });

  it('reads nothing from a missing or malformed list', () => {
    expect(readHostSessions(null).size).toBe(0);
    expect(readHostSessions('/nope/terminals.json').size).toBe(0);
    const dir = mkdtempSync(join(tmpdir(), 'mon-ss-'));
    writeFileSync(join(dir, 't.json'), '{');
    expect(readHostSessions(join(dir, 't.json')).size).toBe(0);
  });

  it('with no runtime host recorded, lists nothing and says there is no shared broker', async () => {
    const sessions = createMonitorSessions(mkdtempSync(join(tmpdir(), 'mon-ss-')));
    expect(await sessions.listSessions()).toEqual({
      sessions: [],
      broker: { mode: 'inproc', reason: 'no shared terminal broker is running' },
    });
    expect(await sessions.agentSessions()).toEqual([]);
  });
});
