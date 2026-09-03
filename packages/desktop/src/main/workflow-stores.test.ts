import { describe, expect, it } from 'vitest';

import { MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW, type WorkflowRun } from '@midnite/studio-shared';

import { parseStoredRuns, trimRunsPerWorkflow } from './workflow-runs-store';
import { parseStoredWorkflows } from './workflows-store';

function workflowEntry(id: string): unknown {
  return {
    id,
    name: id,
    nodes: [
      {
        id: 'a',
        label: 'Call',
        x: 0,
        y: 0,
        kind: 'http',
        config: { method: 'GET', url: 'http://127.0.0.1/x', headers: {}, params: {}, queryShaped: false },
      },
    ],
    edges: [],
    createdAt: 1,
    updatedAt: 2,
  };
}

function run(id: string, workflowId: string): WorkflowRun {
  return {
    id,
    workflowId,
    workflowName: workflowId,
    status: 'completed',
    nodes: [],
    edges: [],
    startedAt: 1,
  };
}

describe('parseStoredWorkflows', () => {
  it('loads exactly the valid entries, dropping one corrupt without losing the file', () => {
    const loaded = parseStoredWorkflows({
      version: 1,
      workflows: [workflowEntry('a'), { id: 'broken' }, workflowEntry('b'), workflowEntry('c')],
    });
    expect(loaded.map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });

  it('answers empty for anything that is not the expected shape', () => {
    expect(parseStoredWorkflows(null)).toEqual([]);
    expect(parseStoredWorkflows({ workflows: 'nope' })).toEqual([]);
    expect(parseStoredWorkflows([workflowEntry('a')])).toEqual([]);
  });
});

describe('parseStoredRuns', () => {
  it('drops one corrupt run rather than the history', () => {
    const loaded = parseStoredRuns({
      version: 1,
      runs: [run('r1', 'w1'), { id: 'r2' }, run('r3', 'w1')],
    });
    expect(loaded.map((r) => r.id)).toEqual(['r1', 'r3']);
  });
});

describe('trimRunsPerWorkflow', () => {
  it('caps each workflow independently, so a busy one cannot evict a quiet one', () => {
    const busy = Array.from({ length: MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW + 10 }, (_, i) =>
      run(`busy-${i}`, 'busy'),
    );
    const quiet = [run('quiet-0', 'quiet'), run('quiet-1', 'quiet')];
    // Interleaved so the quiet workflow's runs are the OLDEST entries — the
    // ones a single global cap would have thrown away first.
    const trimmed = trimRunsPerWorkflow([...quiet, ...busy]);

    expect(trimmed.filter((r) => r.workflowId === 'quiet')).toHaveLength(2);
    expect(trimmed.filter((r) => r.workflowId === 'busy')).toHaveLength(
      MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW,
    );
  });

  it('keeps the newest of each workflow, in the original order', () => {
    const runs = Array.from({ length: MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW + 3 }, (_, i) =>
      run(`r${i}`, 'w'),
    );
    const trimmed = trimRunsPerWorkflow(runs);
    expect(trimmed[0]!.id).toBe('r3');
    expect(trimmed.at(-1)!.id).toBe(`r${MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW + 2}`);
  });
});
