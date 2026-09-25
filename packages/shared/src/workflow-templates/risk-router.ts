import type { WorkflowTemplate } from './types';

/**
 * The Graph Engineering article's risk router: a classifier picks among a
 * closed set of routes — low risk gets a quick review, high risk a full
 * parallel audit, anything it cannot place goes to a human. The classifier
 * is probabilistic; the routes are not.
 *
 * The trigger ships as `manual`: a `forge-pr` trigger needs a registered
 * repo id this template cannot know, so the setup checklist says how to
 * switch it rather than the run failing on a blank `repoId`.
 */
export const riskRouterTemplate: WorkflowTemplate = {
  id: 'risk-router',
  title: 'Risk router',
  blurb: 'Classify a pull request by risk — quick review for low, a parallel audit for high, a human for anything else.',
  source: 'Graph Engineering — "The classifier is probabilistic. The allowed routes are deterministic."',
  tags: ['router', 'fan-out', 'join', 'gate', 'trigger'],
  setupChecklist: [
    'Switch the Start node to "On pull request" and pick a registered repo to run this on every new or updated PR.',
    'Until then, press Run to route the demo change by hand.',
  ],
  workflow: {
    name: 'Risk router',
    description: 'Classify a change by risk, then route it to a quick review, a parallel audit or a human.',
    nodes: [
      {
        id: 'note-router',
        label: 'Note',
        x: 0,
        y: -160,
        kind: 'note',
        config: { text: 'Graph Engineering — "The classifier is probabilistic. The allowed routes are deterministic." An unknown label goes to default, never to the nearest guess.' },
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
        id: 'fetch-change',
        label: 'Fetch change',
        x: 220,
        y: 0,
        kind: 'http',
        config: { method: 'GET', url: '{{demo.baseUrl}}/demo/research/company', headers: {}, params: {}, queryShaped: false },
      },
      {
        id: 'classify',
        label: 'Classify risk',
        x: 440,
        y: 0,
        kind: 'router',
        config: {
          mode: 'agent-label',
          cases: [
            { id: 'low', label: 'Low risk' },
            { id: 'high', label: 'High risk' },
          ],
          agent: { agentId: 'claude', prompt: 'Classify the risk of this change as low or high.' },
        },
      },
      {
        id: 'quick-review',
        label: 'Quick review',
        x: 700,
        y: -160,
        kind: 'agent',
        config: { agentId: 'claude', prompt: 'Give this low-risk change a quick review.' },
      },
      {
        id: 'audit-security',
        label: 'Security audit',
        x: 700,
        y: 0,
        kind: 'agent',
        config: { agentId: 'claude', prompt: 'Audit this change for security issues.' },
      },
      {
        id: 'audit-tests',
        label: 'Test audit',
        x: 700,
        y: 120,
        kind: 'agent',
        config: { agentId: 'codex', prompt: 'Audit the test coverage of this change.' },
      },
      {
        id: 'audit-join',
        label: 'Join audits',
        x: 940,
        y: 60,
        kind: 'join',
        // allSettled, not all: on a low-risk or unclassified change neither
        // audit runs, and an `all` join fails on an input that was not taken.
        config: { mode: 'allSettled', inputs: 2 },
      },
      {
        id: 'human',
        label: 'Human review',
        x: 700,
        y: 280,
        kind: 'gate',
        config: { title: 'Unclassified change', instructions: 'The classifier could not place this change. Review it yourself.', onTimeout: 'reject' },
      },
    ],
    edges: [
      { id: 'e-trigger-fetch', from: 'trigger', to: 'fetch-change' },
      { id: 'e-fetch-classify', from: 'fetch-change', to: 'classify' },
      { id: 'e-classify-quick', from: 'classify', to: 'quick-review', fromPort: 'low', kind: 'conditional' },
      { id: 'e-classify-security', from: 'classify', to: 'audit-security', fromPort: 'high', kind: 'conditional' },
      { id: 'e-classify-tests', from: 'classify', to: 'audit-tests', fromPort: 'high', kind: 'conditional' },
      { id: 'e-classify-human', from: 'classify', to: 'human', fromPort: 'default', kind: 'conditional' },
      { id: 'e-security-join', from: 'audit-security', to: 'audit-join', toPort: 'in-1' },
      { id: 'e-tests-join', from: 'audit-tests', to: 'audit-join', toPort: 'in-2' },
    ],
  },
};
