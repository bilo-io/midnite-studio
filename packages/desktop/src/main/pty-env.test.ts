import { describe, expect, it } from 'vitest';

import { agentFingerprintEnv } from './pty-env';

describe('agentFingerprintEnv', () => {
  it('is empty for a shell session', () => {
    expect(agentFingerprintEnv('shell', 'session-1', undefined)).toEqual({});
  });

  it('is empty for an agent kind missing an agentId (should not happen, but no fingerprint without one)', () => {
    expect(agentFingerprintEnv('agent', 'session-1', undefined)).toEqual({});
  });

  it('is empty for an undefined kind', () => {
    expect(agentFingerprintEnv(undefined, 'session-1', 'claude')).toEqual({});
  });

  it('stamps both vars for an agent session', () => {
    expect(agentFingerprintEnv('agent', 'session-1', 'claude')).toEqual({
      MSTUDIO_SESSION_ID: 'session-1',
      MSTUDIO_AGENT_ID: 'claude',
    });
  });
});
