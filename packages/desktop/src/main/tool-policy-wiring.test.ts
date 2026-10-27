import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EVENT_CHANNELS, type ToolApprovalRequest, type ToolApprovalResolved } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchMcpCall } from './mcp/dispatch';
import { answerToolApproval, configureToolPolicy, evaluateHookCall, resetToolPolicyForTests } from './tool-policy-wiring';

let dir: string;
const shown: ToolApprovalRequest[] = [];
const dropped: ToolApprovalResolved[] = [];

/** A fake window: records what main pushes; the test plays the user by calling `answerToolApproval`. */
const send = (channel: string, payload: unknown): void => {
  if (channel === EVENT_CHANNELS.toolApprovalRequested) shown.push(payload as ToolApprovalRequest);
  if (channel === EVENT_CHANNELS.toolApprovalResolved) dropped.push(payload as ToolApprovalResolved);
};
const waitForCard = (n: number) => vi.waitFor(() => expect(shown).toHaveLength(n));

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mstudio-policy-'));
  shown.length = 0;
  dropped.length = 0;
  await configureToolPolicy(dir, send);
});
afterEach(() => {
  resetToolPolicyForTests();
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

const gate = { runId: 'r1', nodeId: 'n1', decision: 'approved' as const };

describe('dispatchMcpCall consults the policy before every handler', () => {
  it('suspends an ask-call, raises a card on the event channel, and runs the handler once approved', async () => {
    const pending = dispatchMcpCall('workflow_gate_decide', gate);
    await waitForCard(1);
    expect(shown[0]).toMatchObject({ tool: 'workflow_gate_decide', ruleId: 'workflow-gate-decide' });
    expect(answerToolApproval({ id: shown[0]!.id, decision: 'approve-once' })).toBe(true);
    // The handler ran: the gate switch is off in a bare test, so it refuses for that reason, not the policy's.
    const result = await pending;
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).not.toMatch(/policy|Denied/);
    expect(dropped).toEqual([{ id: shown[0]!.id, decision: 'approve-once' }]);
  });

  it('refuses the call, without running a handler, when the user denies', async () => {
    const pending = dispatchMcpCall('workflow_gate_decide', gate);
    await waitForCard(1);
    answerToolApproval({ id: shown[0]!.id, decision: 'deny' });
    expect(await pending).toEqual({ ok: false, kind: 'refused', message: expect.stringContaining('Denied by the user') });
  });

  it('denies on a ten-minute timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = dispatchMcpCall('workflow_gate_decide', gate);
    await waitForCard(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(await pending).toMatchObject({ ok: false, kind: 'refused', message: expect.stringContaining('in time') });
    expect(dropped[0]).toMatchObject({ decision: 'timeout' });
  });

  it('does not ask about a read-only call', async () => {
    const result = await dispatchMcpCall('repo.list', {});
    expect(result.ok).toBe(true);
    expect(shown).toEqual([]);
  });

  it('is unenforced before boot configures it, so a bare caller never waits on a window that does not exist', async () => {
    resetToolPolicyForTests();
    const result = await dispatchMcpCall('workflow_gate_decide', gate);
    expect(result).toMatchObject({ ok: false });
    expect(shown).toEqual([]);
  });
});

describe('policy.evaluate (the CLI hook)', () => {
  it('allows what the policy allows and asks about the rest through the same card', async () => {
    expect(await evaluateHookCall({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: '/r' })).toMatchObject({ value: { decision: 'allow' } });
    const pending = evaluateHookCall({ tool_name: 'Bash', tool_input: { command: 'git reset --hard HEAD~1' }, cwd: '/r' });
    await waitForCard(1);
    expect(shown[0]).toMatchObject({ tool: 'git.reset', repoPath: '/r' });
    answerToolApproval({ id: shown[0]!.id, decision: 'deny' });
    expect(await pending).toMatchObject({ value: { decision: 'deny' } });
  });

  it('survives garbage input', async () => {
    expect(await evaluateHookCall(null)).toMatchObject({ ok: true, value: { decision: 'allow' } });
  });
});
