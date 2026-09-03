import type { WorkflowNodeRun } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RunNodeDetail } from './run-node-detail';

function run(over: Partial<WorkflowNodeRun> = {}): WorkflowNodeRun {
  return {
    nodeId: 'n1',
    kind: 'http',
    label: 'Fetch users',
    status: 'succeeded',
    truncated: false,
    gatedDownstream: false,
    ...over,
  };
}

describe('RunNodeDetail', () => {
  afterEach(() => cleanup());

  it('shows the empty state when no node is selected', () => {
    render(<RunNodeDetail node={null} />);
    expect(screen.getByText('Select a node on the canvas to see its result.')).not.toBeNull();
  });

  it('shows the node label and status', () => {
    render(<RunNodeDetail node={run({ status: 'failed' })} />);
    expect(screen.getByText('Fetch users')).not.toBeNull();
    expect(screen.getByText('Failed')).not.toBeNull();
  });

  it('renders duration from startedAt/endedAt', () => {
    render(<RunNodeDetail node={run({ startedAt: 1000, endedAt: 2500 })} />);
    expect(screen.getByText('1.5s')).not.toBeNull();
  });

  it('renders the error and never the output when both differ', () => {
    render(<RunNodeDetail node={run({ status: 'failed', error: 'connection refused' })} />);
    expect(screen.getByText('connection refused')).not.toBeNull();
  });

  it('surfaces the truncated flag next to the output rather than dropping it', () => {
    render(<RunNodeDetail node={run({ output: { status: 200 }, truncated: true })} />);
    expect(screen.getByText('Output truncated.')).not.toBeNull();
  });

  it('explains a gated-downstream condition', () => {
    render(<RunNodeDetail node={run({ kind: 'condition', gatedDownstream: true })} />);
    expect(screen.getByText(/everything downstream of it was skipped/)).not.toBeNull();
  });
});
