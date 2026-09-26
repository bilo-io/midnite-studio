import type { WorkflowTemplate } from './types';

/**
 * The Loop Engineering article's own maker/checker split — a plan feeds a
 * maker agent, a DIFFERENT agent checks its work, and a failed check loops
 * back to planning rather than straight back to the maker, up to three
 * passes. See `docs/agentic_engineering/Loop Engineering.md`.
 */
export const loopMakerCheckerTemplate: WorkflowTemplate = {
  id: 'loop-maker-checker',
  title: 'Loop Engineering maker/checker',
  blurb: 'Discover, plan, make, check with a different agent than the maker — ship on pass, replan on fail.',
  source: 'Loop Engineering — "The maker and checker should not always be the same model."',
  tags: ['loop', 'verify', 'trigger'],
  workflow: {
    name: 'Loop Engineering maker/checker',
    description: 'Discover, plan, make, check — a bounded loop back to planning on a failed check.',
    nodes: [
      {
        id: 'note-loop',
        label: 'Note',
        x: 0,
        y: -160,
        kind: 'note',
        config: { text: 'Loop Engineering — "The maker and checker should not always be the same model."' },
      },
      {
        id: 'trigger',
        label: 'Start',
        x: 0,
        y: 0,
        kind: 'trigger',
        config: { on: 'manual' },
      },
      {
        id: 'discover',
        label: 'Discover',
        x: 220,
        y: 0,
        kind: 'http',
        config: { method: 'GET', url: '{{demo.baseUrl}}/demo/research/company', headers: {}, params: {}, queryShaped: false },
      },
      {
        id: 'plan',
        label: 'Plan',
        x: 440,
        y: 0,
        kind: 'agent',
        config: { agentId: 'claude', prompt: 'Turn the discovery output into a short, concrete plan.' },
      },
      {
        id: 'maker',
        label: 'Maker',
        x: 660,
        y: 0,
        kind: 'agent',
        config: { agentId: 'claude', prompt: 'Carry out the plan.' },
      },
      {
        id: 'checker',
        label: 'Checker',
        x: 880,
        y: 0,
        kind: 'verify',
        config: { check: 'agent', agentId: 'codex', prompt: "Check the maker's output against the plan. Reply ok if it satisfies the plan, fail otherwise." },
      },
      {
        id: 'ship',
        label: 'Ship',
        x: 1100,
        y: 0,
        kind: 'http',
        config: { method: 'POST', url: '{{demo.baseUrl}}/demo/echo', headers: {}, params: {}, queryShaped: false, body: '{{maker.output}}' },
      },
    ],
    edges: [
      { id: 'e-trigger-discover', from: 'trigger', to: 'discover' },
      { id: 'e-discover-plan', from: 'discover', to: 'plan' },
      { id: 'e-plan-maker', from: 'plan', to: 'maker' },
      { id: 'e-maker-checker', from: 'maker', to: 'checker' },
      { id: 'e-checker-ship', from: 'checker', to: 'ship', fromPort: 'pass', kind: 'conditional' },
      {
        id: 'e-checker-loop',
        from: 'checker',
        to: 'plan',
        fromPort: 'fail',
        kind: 'loop',
        loop: { maxIterations: 3, budgetMs: 3_600_000 },
      },
    ],
  },
};
