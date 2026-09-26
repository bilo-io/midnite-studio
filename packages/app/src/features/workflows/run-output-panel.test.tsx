import type { MidniteStudioBridge, WorkflowNode, WorkflowRun } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunOutputPanel, runToMarkdown } from './run-output-panel';

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'r1',
    workflowId: 'w1',
    workflowName: 'My workflow',
    status: 'completed',
    startedAt: 1000,
    endedAt: 3500,
    nodes: [
      {
        nodeId: 'n1',
        kind: 'http',
        label: 'Call API',
        status: 'succeeded',
        output: { status: 200 },
        truncated: false,
        gatedDownstream: false,
        startedAt: 1000,
        endedAt: 2000,
      },
      {
        nodeId: 'n2',
        kind: 'transform',
        label: 'Reshape',
        status: 'failed',
        error: 'boom',
        truncated: false,
        gatedDownstream: false,
        startedAt: 2000,
        endedAt: 3500,
      },
    ],
    edges: [],
    ...overrides,
  };
}

describe('RunOutputPanel', () => {
  afterEach(() => cleanup());

  it('shows an empty state when collapsed is false and there is no run', () => {
    render(<RunOutputPanel run={null} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
    expect(screen.getByText('No run yet')).not.toBeNull();
  });

  it('renders nothing but the header when collapsed', () => {
    render(<RunOutputPanel run={run()} collapsed onToggleCollapsed={() => {}} height={200} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByText('Run output')).not.toBeNull();
  });

  it('toggles collapsed on header click', () => {
    const onToggleCollapsed = vi.fn();
    render(<RunOutputPanel run={run()} collapsed={false} onToggleCollapsed={onToggleCollapsed} height={200} />);
    fireEvent.click(screen.getByText('Run output'));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('the Nodes tab lists every node with its status', () => {
    render(<RunOutputPanel run={run()} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
    expect(screen.getByRole('tab', { name: 'nodes' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Call API')).not.toBeNull();
    expect(screen.getByText('Succeeded')).not.toBeNull();
    expect(screen.getByText('Failed')).not.toBeNull();
  });

  it('switches to the Logs tab and shows a chronological stream', () => {
    render(<RunOutputPanel run={run()} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
    fireEvent.click(screen.getByRole('tab', { name: 'logs' }));
    const log = screen.getByText((_, el) => el?.tagName === 'PRE' && el.textContent!.includes('Call API — started'));
    expect(log.textContent).toContain('Reshape — Failed — boom');
  });

  it('exposes an Export button that downloads markdown once a run exists', () => {
    render(<RunOutputPanel run={run()} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
    expect(screen.getByLabelText('Export run as Markdown')).not.toBeNull();
  });

  describe('a waiting gate (Phase 97 Theme D)', () => {
    const gateNode: WorkflowNode = {
      id: 'g1',
      label: 'Gate',
      x: 0,
      y: 0,
      kind: 'gate',
      config: { title: 'Ship it?', instructions: 'Check the diff.', onTimeout: 'reject' },
    };
    const waitingRun = run({
      status: 'running',
      nodes: [
        { nodeId: 'g1', kind: 'gate', label: 'Gate', status: 'waiting', truncated: false, gatedDownstream: false },
      ],
    });

    afterEach(() => {
      delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    });

    it("shows the gate's own title/instructions and Approve/Reject once workflowNodes carries its config", () => {
      render(
        <RunOutputPanel
          run={waitingRun}
          workflowNodes={[gateNode]}
          collapsed={false}
          onToggleCollapsed={() => {}}
          height={200}
        />,
      );

      expect(screen.getByText('Waiting for approval')).not.toBeNull();
      expect(screen.getByText('Ship it?')).not.toBeNull();
      expect(screen.getByText('Check the diff.')).not.toBeNull();
      expect(screen.getByRole('button', { name: /Approve/ })).not.toBeNull();
      expect(screen.getByRole('button', { name: /Reject/ })).not.toBeNull();
    });

    it('Approve calls bridge().workflow.gateDecide with the run/node id and the typed note', async () => {
      const gateDecide = vi.fn().mockResolvedValue({ ok: true });
      (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
        workflow: { gateDecide } as unknown as MidniteStudioBridge['workflow'],
      } as Partial<MidniteStudioBridge>;

      render(
        <RunOutputPanel
          run={waitingRun}
          workflowNodes={[gateNode]}
          collapsed={false}
          onToggleCollapsed={() => {}}
          height={200}
        />,
      );

      fireEvent.change(screen.getByPlaceholderText('Optional note'), { target: { value: 'lgtm' } });
      fireEvent.click(screen.getByRole('button', { name: /Approve/ }));

      await waitFor(() =>
        expect(gateDecide).toHaveBeenCalledWith({ runId: 'r1', nodeId: 'g1', decision: 'approved', note: 'lgtm' }),
      );
    });
  });

  describe('a looped node\'s runs (Phase 97 Theme K)', () => {
    const loopedRun = run({
      nodes: [
        { nodeId: 'trigger', kind: 'trigger', label: 'Start', status: 'succeeded', truncated: false, gatedDownstream: false, startedAt: 0, endedAt: 10 },
        { nodeId: 'build', kind: 'agent', label: 'Build', status: 'succeeded', truncated: false, gatedDownstream: false, startedAt: 10, endedAt: 100, iteration: 1 },
        { nodeId: 'build', kind: 'agent', label: 'Build', status: 'succeeded', truncated: false, gatedDownstream: false, startedAt: 100, endedAt: 200, iteration: 2 },
      ],
    });

    it('shows one row per iteration with a "Pass N" badge, not a single collapsed row', () => {
      render(<RunOutputPanel run={loopedRun} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
      expect(screen.getAllByText('Build')).toHaveLength(2);
      expect(screen.getByText('Pass 1')).not.toBeNull();
      expect(screen.getByText('Pass 2')).not.toBeNull();
    });

    it('a node that never looped shows no pass badge at all', () => {
      render(<RunOutputPanel run={loopedRun} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
      expect(screen.queryByText('Pass 3')).toBeNull();
      // "Start" (the trigger) has exactly one record — no badge for it.
      const startCell = screen.getByText('Start');
      expect(startCell.parentElement?.textContent).not.toContain('Pass');
    });
  });

  describe('an interrupted run (Phase 97 Theme G)', () => {
    afterEach(() => {
      delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    });

    it('shows a Resume button only when the run is interrupted', () => {
      render(<RunOutputPanel run={run({ status: 'interrupted' })} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
      expect(screen.getByRole('button', { name: 'Resume run' })).not.toBeNull();
    });

    it('does not show Resume for a completed run', () => {
      render(<RunOutputPanel run={run({ status: 'completed' })} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
      expect(screen.queryByRole('button', { name: 'Resume run' })).toBeNull();
    });

    it('Resume calls bridge().workflow.resume with the run id', async () => {
      const resume = vi.fn().mockResolvedValue({ ok: true });
      (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
        workflow: { resume } as unknown as MidniteStudioBridge['workflow'],
      } as Partial<MidniteStudioBridge>;

      render(<RunOutputPanel run={run({ status: 'interrupted' })} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
      fireEvent.click(screen.getByRole('button', { name: 'Resume run' }));

      await waitFor(() => expect(resume).toHaveBeenCalledWith({ runId: 'r1' }));
    });
  });
});

describe('runToMarkdown', () => {
  it('includes the workflow name, status, a node table row and the error', () => {
    const md = runToMarkdown(run());
    expect(md).toContain('My workflow');
    expect(md).toContain('**completed**');
    expect(md).toContain('| Call API | http | Succeeded |');
    expect(md).toContain('boom');
  });

  it('includes a Receipt section (Phase 97 Theme K), with no cost field anywhere in it', () => {
    const md = runToMarkdown(run());
    expect(md).toContain('## Receipt');
    expect(md).toContain('**Node kinds used**: http, transform');
    expect(md).toContain('**Wall-clock**');
    expect(md.toLowerCase()).not.toContain('cost');
  });

  it('reads agentsUsed into the receipt section when workflowNodes is supplied', () => {
    const agentRun = run({
      nodes: [{ nodeId: 'build', kind: 'agent', label: 'Build', status: 'succeeded', truncated: false, gatedDownstream: false, output: 'ok' }],
    });
    const workflowNodes: WorkflowNode[] = [{ id: 'build', label: 'Build', x: 0, y: 0, kind: 'agent', config: { agentId: 'claude', prompt: 'go' } }];
    const md = runToMarkdown(agentRun, workflowNodes);
    expect(md).toContain('**Agents used**: claude');
  });

  it('reads agentsUsed as empty without workflowNodes', () => {
    const md = runToMarkdown(run());
    expect(md).toContain('**Agents used**: —');
  });
});
