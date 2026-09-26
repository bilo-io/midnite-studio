import { describe, expect, it } from 'vitest';

import {
  AgentRunSchema,
  AgentRunVerdictSchema,
  fromClosedSession,
  fromLoopRun,
  latestVerdict,
  runsForRepo,
  runsForSkill,
  skillOutcomeTally,
  type AgentRun,
} from './agent-run';
import type { LoopRunRecord } from '../loops';
import type { ClosedSession } from './session-history';

const baseRun: AgentRun = {
  id: 'run-1',
  kind: 'loop',
  repoId: 'repo-1',
  cwd: '/repo/one',
  label: 'medic',
  startedAt: 1000,
  status: 'exited',
};

describe('AgentRunSchema', () => {
  it('round-trips a minimal run (only the required fields)', () => {
    const parsed = AgentRunSchema.parse(baseRun);
    expect(parsed).toEqual(baseRun);
  });

  it('round-trips a fully populated run, including a fail verdict', () => {
    const full: AgentRun = {
      ...baseRun,
      sessionId: 'session-1',
      agentId: 'claude',
      skillId: 'loopPrReview',
      endedAt: 2000,
      exitCode: 1,
      sourceId: 'loop-medic',
      verdict: {
        checkedAt: 2000,
        suiteId: 'suite-1',
        outcome: 'fail',
        passed: 3,
        failed: 1,
        skipped: 0,
        durationMs: 500,
        failures: [{ name: 'does the thing', file: 'src/thing.test.ts', message: 'expected true' }],
        reason: undefined,
      },
    };
    expect(AgentRunSchema.parse(full)).toEqual(full);
  });

  it('rejects an unknown kind', () => {
    expect(() => AgentRunSchema.parse({ ...baseRun, kind: 'nope' })).toThrow();
  });

  it('rejects an unknown skillId', () => {
    expect(() => AgentRunSchema.parse({ ...baseRun, skillId: 'notARealSkill' })).toThrow();
  });
});

describe('AgentRunVerdictSchema', () => {
  it('round-trips an unavailable verdict with a reason', () => {
    const verdict = {
      checkedAt: 1234,
      suiteId: 'suite-x',
      outcome: 'unavailable' as const,
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
      failures: [],
      reason: 'timed-out' as const,
    };
    expect(AgentRunVerdictSchema.parse(verdict)).toEqual(verdict);
  });
});

describe('selectors', () => {
  const runA: AgentRun = { ...baseRun, id: 'a', repoId: 'repo-1', skillId: 'prReview' };
  const runB: AgentRun = { ...baseRun, id: 'b', repoId: 'repo-2', skillId: 'prReview' };
  const runC: AgentRun = { ...baseRun, id: 'c', repoId: 'repo-1', skillId: 'prFeedback' };

  it('runsForRepo filters by repoId', () => {
    expect(runsForRepo([runA, runB, runC], 'repo-1').map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('runsForSkill filters by skillId', () => {
    expect(runsForSkill([runA, runB, runC], 'prReview').map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('latestVerdict returns the run verdict, or undefined when unchecked', () => {
    expect(latestVerdict(runA)).toBeUndefined();
    const withVerdict: AgentRun = {
      ...runA,
      verdict: {
        checkedAt: 1,
        suiteId: 's',
        outcome: 'pass',
        passed: 1,
        failed: 0,
        skipped: 0,
        durationMs: 1,
        failures: [],
      },
    };
    expect(latestVerdict(withVerdict)?.outcome).toBe('pass');
  });

  it('skillOutcomeTally counts pass/fail/unavailable per skill, and a run with no skillId is excluded', () => {
    const pass: AgentRun = {
      ...runA,
      verdict: {
        checkedAt: 1,
        suiteId: 's',
        outcome: 'pass',
        passed: 1,
        failed: 0,
        skipped: 0,
        durationMs: 1,
        failures: [],
      },
    };
    const fail: AgentRun = {
      ...runB,
      verdict: {
        checkedAt: 1,
        suiteId: 's',
        outcome: 'fail',
        passed: 0,
        failed: 1,
        skipped: 0,
        durationMs: 1,
        failures: [],
      },
    };
    const noSkill: AgentRun = { ...baseRun, id: 'd', skillId: undefined };
    const tally = skillOutcomeTally([pass, fail, noSkill]);
    expect(tally.get('prReview')).toEqual({ pass: 1, fail: 1, unavailable: 0 });
    // The no-skillId run contributes no entry at all, of any kind.
    expect(tally.size).toBe(1);
  });

  it('a run with a skillId but no verdict tallies as neither pass nor fail', () => {
    const unchecked: AgentRun = { ...runA, verdict: undefined };
    const tally = skillOutcomeTally([unchecked]);
    expect(tally.get('prReview')).toEqual({ pass: 0, fail: 0, unavailable: 0 });
  });
});

describe('fromLoopRun', () => {
  const loopRecord: LoopRunRecord = {
    id: 'loop-run-1',
    loopId: 'medic',
    sessionId: 'session-9',
    startedAt: 100,
    endedAt: 200,
    composedPrompt: '/loop /pr-review',
    checkedModifierIds: ['run.autoApprove'],
    exitCode: 0,
    status: 'exited',
  };

  it('projects a LoopRunRecord into an AgentRun, keeping loopId as sourceId', () => {
    const run = fromLoopRun(loopRecord, {
      repoId: 'repo-1',
      cwd: '/repo/one',
      label: 'Medic loop',
      agentId: 'claude',
      skillId: 'loopPrReview',
    });
    expect(run).toEqual({
      id: 'loop-run-1',
      kind: 'loop',
      repoId: 'repo-1',
      cwd: '/repo/one',
      sessionId: 'session-9',
      agentId: 'claude',
      skillId: 'loopPrReview',
      label: 'Medic loop',
      startedAt: 100,
      endedAt: 200,
      status: 'exited',
      exitCode: 0,
      verdict: undefined,
      sourceId: 'medic',
    });
    expect(AgentRunSchema.parse(run)).toBeTruthy();
  });
});

describe('fromClosedSession', () => {
  const session: ClosedSession = {
    id: 'closed-1',
    kind: 'agent',
    agentId: 'claude',
    title: 'midnite-studio',
    cwd: '/repo/one',
    repoId: 'repo-1',
    createdAt: 500,
    closedAt: 900,
    exitCode: null,
    reason: 'closed',
    transcriptBytes: 42,
  };

  it('projects a ClosedSession into an AgentRun, falling back to title for the label', () => {
    const run = fromClosedSession(session);
    expect(run.kind).toBe('session');
    expect(run.label).toBe('midnite-studio');
    expect(run.status).toBe('stopped');
    expect(run.exitCode).toBeUndefined();
    expect(run.sourceId).toBeUndefined();
  });

  it('prefers the session name over its title when both are set', () => {
    const named: ClosedSession = { ...session, name: 'my session' };
    expect(fromClosedSession(named).label).toBe('my session');
  });

  it('maps exited and superseded reasons', () => {
    expect(fromClosedSession({ ...session, reason: 'exited', exitCode: 1 }).status).toBe('exited');
    expect(fromClosedSession({ ...session, reason: 'superseded' }).status).toBe('abandoned');
  });
});
