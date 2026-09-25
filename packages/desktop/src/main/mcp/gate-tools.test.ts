import { afterEach, describe, expect, it, vi } from 'vitest';

import * as workflowService from '../workflow-service';
import { McpToolError } from './errors';
import { workflowGateDecide, workflowGatesList } from './tools';
import { resetMcpAllowUiStateForTests, setMcpAllowGateDecideState } from './ui-gate';

/**
 * Unit coverage for the two `workflow_gate*` tool handlers (Phase 97 Theme
 * D), isolated from `workflow-service.ts`'s real in-memory store — mirrors
 * `ui-tools.test.ts`'s own shape exactly: mock the one call underneath,
 * assert the `allowGateDecide` gate and the McpToolError mapping.
 */
vi.mock('../workflow-service', () => ({ listWaitingGates: vi.fn(), decideGate: vi.fn() }));

const listWaitingGates = vi.mocked(workflowService.listWaitingGates);
const decideGate = vi.mocked(workflowService.decideGate);

afterEach(() => {
  resetMcpAllowUiStateForTests();
  listWaitingGates.mockReset();
  decideGate.mockReset();
});

describe('workflowGatesList', () => {
  it('answers regardless of the allowGateDecide switch — it is read-only', async () => {
    setMcpAllowGateDecideState(false);
    listWaitingGates.mockResolvedValue([
      {
        runId: 'r1',
        workflowId: 'w1',
        workflowName: 'Ship it',
        nodeId: 'g',
        label: 'Gate',
        title: 'Ship it?',
        instructions: '',
        startedAt: 1,
      },
    ]);

    const result = await workflowGatesList();
    expect(result).toHaveLength(1);
    expect(result[0]!.runId).toBe('r1');
  });
});

describe('workflowGateDecide', () => {
  it('refuses before deciding anything while allowGateDecide is off', async () => {
    setMcpAllowGateDecideState(false);
    await expect(
      workflowGateDecide({ runId: 'r1', nodeId: 'g', decision: 'approved' }),
    ).rejects.toMatchObject({
      kind: 'refused',
      message: 'Gate decide is off — Settings ▸ MCP ▸ Let agents decide workflow gates',
    });
    expect(decideGate).not.toHaveBeenCalled();
  });

  it('decides once allowGateDecide is on, and marks the channel "mcp"', async () => {
    setMcpAllowGateDecideState(true);
    decideGate.mockResolvedValue({ ok: true });

    const result = await workflowGateDecide({ runId: 'r1', nodeId: 'g', decision: 'approved', note: 'lgtm' });
    expect(result).toEqual({ decided: true });
    expect(decideGate).toHaveBeenCalledWith('r1', 'g', 'approved', 'lgtm', 'mcp');
  });

  it('maps a GitOpResult failure onto a not-found McpToolError', async () => {
    setMcpAllowGateDecideState(true);
    decideGate.mockResolvedValue({ ok: false, kind: 'error', message: 'This gate is not waiting for a decision.' });

    try {
      await workflowGateDecide({ runId: 'r1', nodeId: 'g', decision: 'approved' });
      throw new Error('expected workflowGateDecide to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(McpToolError);
      expect((err as McpToolError).kind).toBe('not-found');
      expect((err as McpToolError).message).toBe('This gate is not waiting for a decision.');
    }
  });
});
