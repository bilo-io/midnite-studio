import type { WorkflowTemplate } from './types';

/**
 * The Harness Engineering article's own frame — Contract and Context set
 * once, an agent builds inside it, a `test-counts` verifier checks the
 * result, a bounded loop retries a failure up to three times, and an
 * exhausted loop escalates to a human gate rather than failing the run
 * silently. See `docs/agentic_engineering/Harness Engineering.md` and
 * `docs/agentic_engineering/Loop Engineering.md`.
 */
export const harnessBoundedBuildTemplate: WorkflowTemplate = {
  id: 'harness-bounded-build',
  title: 'Harness bounded build',
  blurb: 'A contract + context frame around a build step, checked by test counts, retried up to three times, escalated to a human on exhaustion.',
  source: 'Harness Engineering — "1. Turn The Request Into A Contract" / "The contract protects the task from silent redefinition."',
  tags: ['harness', 'frame', 'loop', 'gate'],
  workflow: {
    name: 'Harness bounded build',
    description: 'Contract + context frame, bounded build/verify loop, human escalation on exhaustion.',
    nodes: [
      {
        id: 'note-harness',
        label: 'Note',
        x: 0,
        y: -160,
        kind: 'note',
        config: { text: 'Harness Engineering — "The contract protects the task from silent redefinition."' },
      },
      { id: 'trigger', label: 'Start', x: 0, y: 0, kind: 'trigger', config: { on: 'manual' } },
      {
        id: 'frame',
        label: 'THE AGENT HARNESS',
        x: 220,
        y: 0,
        kind: 'frame',
        config: {
          contract: 'Implement exactly the requested change. Do not expand scope beyond what is described.',
          context: 'This is a bounded build step inside a verify/retry loop — up to three attempts, then a human decides.',
          state: '',
          tools: 'Repo write access, test runner.',
          permissions: 'No network beyond the demo API.',
          evidence: 'A test-counts verifier checks this step — see the Verify node.',
          width: 420,
          height: 260,
        },
      },
      {
        id: 'build',
        label: 'Build',
        x: 280,
        y: 60,
        kind: 'agent',
        config: { agentId: 'claude', prompt: 'Implement the requested change per the contract above.' },
        frameId: 'frame',
      },
      {
        id: 'note-loop',
        label: 'Note',
        x: 720,
        y: -160,
        kind: 'note',
        config: { text: 'Loop Engineering — "Closed loops are bounded." Three attempts, then escalate.' },
      },
      {
        id: 'verify',
        label: 'Verify',
        x: 720,
        y: 0,
        kind: 'verify',
        config: { check: 'test-counts', command: 'true', env: {}, parser: 'vitest', minPassed: 1 },
      },
      {
        id: 'record',
        label: 'Record result',
        x: 940,
        y: -80,
        kind: 'state',
        config: { op: 'set', key: 'shipped', value: 'true' },
      },
      {
        id: 'gate',
        label: 'Escalate',
        x: 940,
        y: 80,
        kind: 'gate',
        config: { title: 'Build exhausted its retries', instructions: 'The build failed verification three times. Review it and approve or reject continuing.', onTimeout: 'reject' },
      },
    ],
    edges: [
      { id: 'e-trigger-build', from: 'trigger', to: 'build' },
      { id: 'e-build-verify', from: 'build', to: 'verify' },
      { id: 'e-verify-record', from: 'verify', to: 'record', fromPort: 'pass', kind: 'conditional' },
      {
        id: 'e-verify-loop',
        from: 'verify',
        to: 'build',
        fromPort: 'fail',
        kind: 'loop',
        loop: { maxIterations: 3, budgetMs: 3_600_000 },
      },
      { id: 'e-verify-gate', from: 'verify', to: 'gate', fromPort: 'exhausted' },
    ],
  },
};
