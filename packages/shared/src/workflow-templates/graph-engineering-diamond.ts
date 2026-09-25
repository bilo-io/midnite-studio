import type { WorkflowTemplate } from './types';

/**
 * The Graph Engineering article's own diamond: scope, fan out into
 * independent branches, join, synthesize, verify, and either ship or take
 * the NO back-edge into another build pass. See
 * `docs/agentic_engineering/Graph Engineering.md`.
 */
export const graphEngineeringDiamondTemplate: WorkflowTemplate = {
  id: 'graph-engineering-diamond',
  title: 'Graph Engineering diamond',
  blurb:
    'Scope a request, fan out into research/build/checks, join, synthesize, verify — ship on pass, loop back to build on fail.',
  source: 'Graph Engineering — "The graph decides which loops run, in what order, with which branches, joins, and recovery paths."',
  tags: ['fan-out', 'join', 'verify', 'loop'],
  workflow: {
    name: 'Graph Engineering diamond',
    description: 'The diamond: scope, fan out, join, synthesize, verify, ship or loop back.',
    nodes: [
      { id: 'note-graph', label: 'Note', x: 0, y: -140, kind: 'note', config: { text: 'Graph Engineering — "The graph decides which loops run, in what order, with which branches, joins, and recovery paths."' } },
      { id: 'trigger', label: 'Start', x: 0, y: 0, kind: 'trigger', config: { on: 'manual' } },
      {
        id: 'scope',
        label: 'Scope',
        x: 220,
        y: 0,
        kind: 'agent',
        config: { agentId: 'claude', prompt: 'Read the incoming request and scope it into a short research/build/check plan.' },
      },
      {
        id: 'research',
        label: 'Research',
        x: 440,
        y: -120,
        kind: 'http',
        config: { method: 'GET', url: '{{demo.baseUrl}}/demo/research/company', headers: {}, params: {}, queryShaped: false },
      },
      {
        id: 'build',
        label: 'Build',
        x: 440,
        y: 0,
        kind: 'script',
        config: { command: 'echo "building"', env: {} },
      },
      {
        id: 'quick-check',
        label: 'Quick check',
        x: 440,
        y: 120,
        kind: 'http',
        config: { method: 'GET', url: '{{demo.baseUrl}}/demo/echo', headers: {}, params: {}, queryShaped: false },
      },
      {
        id: 'join',
        label: 'Join',
        x: 660,
        y: 0,
        kind: 'join',
        config: { mode: 'all', inputs: 3 },
      },
      {
        id: 'note-join',
        label: 'Note',
        x: 660,
        y: -140,
        kind: 'note',
        config: { text: 'Graph Engineering — "A join is worth the wait only when the next node needs the complete set."' },
      },
      {
        id: 'synthesize',
        label: 'Synthesize',
        x: 880,
        y: 0,
        kind: 'agent',
        config: { agentId: 'claude', prompt: 'Synthesize the joined research, build and check results into a single artifact.' },
      },
      {
        id: 'verify',
        label: 'Verify',
        x: 1100,
        y: 0,
        kind: 'verify',
        config: { check: 'agent', agentId: 'codex', prompt: 'Check the synthesized artifact against the original request. Reply ok if it satisfies it, fail otherwise.' },
      },
      {
        id: 'note-verify',
        label: 'Note',
        x: 1100,
        y: -140,
        kind: 'note',
        config: { text: 'Graph Engineering — "The classifier is probabilistic." A verifier is the same: it grades, it does not redefine the task.' },
      },
      {
        id: 'ship',
        label: 'Ship',
        x: 1320,
        y: 0,
        kind: 'http',
        config: { method: 'POST', url: '{{demo.baseUrl}}/demo/echo', headers: {}, params: {}, queryShaped: false, body: '{{synthesize.output}}' },
      },
    ],
    edges: [
      { id: 'e-trigger-scope', from: 'trigger', to: 'scope' },
      { id: 'e-scope-research', from: 'scope', to: 'research' },
      { id: 'e-scope-build', from: 'scope', to: 'build' },
      { id: 'e-scope-check', from: 'scope', to: 'quick-check' },
      { id: 'e-research-join', from: 'research', to: 'join', toPort: 'in-1' },
      { id: 'e-build-join', from: 'build', to: 'join', toPort: 'in-2' },
      { id: 'e-check-join', from: 'quick-check', to: 'join', toPort: 'in-3' },
      { id: 'e-join-synth', from: 'join', to: 'synthesize' },
      { id: 'e-synth-verify', from: 'synthesize', to: 'verify' },
      { id: 'e-verify-ship', from: 'verify', to: 'ship', fromPort: 'pass', kind: 'conditional' },
      {
        id: 'e-verify-loop',
        from: 'verify',
        to: 'build',
        fromPort: 'fail',
        kind: 'loop',
        loop: { maxIterations: 3, budgetMs: 3_600_000 },
      },
    ],
  },
};
