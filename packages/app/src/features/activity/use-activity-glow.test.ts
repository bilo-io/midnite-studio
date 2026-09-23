import { describe, expect, it } from 'vitest';

import { resolveActivityGlow, type ActivityGlowSessionInput } from './use-activity-glow';

function session(overrides: Partial<ActivityGlowSessionInput> = {}): ActivityGlowSessionInput {
  return { sessionId: 's1', agentId: 'claude', activity: undefined, running: true, ...overrides };
}

describe('resolveActivityGlow — precedence table', () => {
  it('no sessions, no fallback: idle, no ring colour, no badges', () => {
    expect(resolveActivityGlow({ sessions: [] })).toEqual({
      status: 'idle',
      ringColor: undefined,
      badges: [],
    });
  });

  it('a live agent session with no activity guess yet: agent (actively working)', () => {
    const result = resolveActivityGlow({ sessions: [session()] });
    expect(result.status).toBe('agent');
    expect(result.badges).toEqual([{ sessionId: 's1', kind: 'agent', agentId: 'claude', label: 'claude' }]);
  });

  it('a live agent session between turns: thinking', () => {
    expect(resolveActivityGlow({ sessions: [session({ activity: 'thinking' })] }).status).toBe('thinking');
  });

  it('a live agent session blocked on input: waiting', () => {
    expect(resolveActivityGlow({ sessions: [session({ activity: 'waiting' })] }).status).toBe('waiting');
  });

  it('a live plain shell (no resolved agent id): shell', () => {
    const result = resolveActivityGlow({ sessions: [session({ agentId: undefined })] });
    expect(result.status).toBe('shell');
    expect(result.badges).toEqual([{ sessionId: 's1', kind: 'shell', agentId: undefined, label: 'Terminal' }]);
  });

  it('an ended (not running) session contributes no status and no badge', () => {
    const result = resolveActivityGlow({ sessions: [session({ running: false })] });
    expect(result.status).toBe('idle');
    expect(result.badges).toEqual([]);
  });

  it('an asleep-equivalent (running: false) session falls through to the run-state fallback', () => {
    const result = resolveActivityGlow({
      sessions: [session({ running: false })],
      fallbackStatus: 'failed',
    });
    expect(result.status).toBe('failed');
  });

  it('agent-working beats the run-state fallback', () => {
    const result = resolveActivityGlow({ sessions: [session()], fallbackStatus: 'queued' });
    expect(result.status).toBe('agent');
  });

  it('the run-state fallback beats the status-pill colour', () => {
    const result = resolveActivityGlow({ sessions: [], fallbackStatus: 'done', fallbackColor: '#3B82F6' });
    expect(result.status).toBe('done');
    expect(result.ringColor).toBeUndefined();
  });

  it('with no live session and no run-state fallback, the status-pill colour paints a static idle ring', () => {
    const result = resolveActivityGlow({ sessions: [], fallbackColor: '#3B82F6' });
    expect(result.status).toBe('idle');
    expect(result.ringColor).toBe('#3B82F6');
  });

  it('waiting outranks a second, merely-running session on the same target', () => {
    const result = resolveActivityGlow({
      sessions: [session({ sessionId: 's1', activity: undefined }), session({ sessionId: 's2', activity: 'waiting' })],
    });
    expect(result.status).toBe('waiting');
    expect(result.badges).toHaveLength(2);
  });

  it('an agent session outranks a plain shell on the same target', () => {
    const result = resolveActivityGlow({
      sessions: [session({ sessionId: 's1', agentId: undefined }), session({ sessionId: 's2', agentId: 'codex' })],
    });
    expect(result.status).toBe('agent');
  });

  it('thinking outranks a plain shell', () => {
    const result = resolveActivityGlow({
      sessions: [
        session({ sessionId: 's1', agentId: undefined }),
        session({ sessionId: 's2', activity: 'thinking' }),
      ],
    });
    expect(result.status).toBe('thinking');
  });
});
