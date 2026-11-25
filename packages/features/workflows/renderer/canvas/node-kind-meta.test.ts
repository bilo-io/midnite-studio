import { WORKFLOW_NODE_KINDS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import type { WorkflowNode } from '@midnite/studio-shared';

import { nodeSummary } from './node-kind-meta';

import { NODE_GROUPS, NODE_KIND_META } from './node-kind-meta';
import { paletteGroups } from './node-palette';

describe('NODE_KIND_META palette groups', () => {
  const groupIds = new Set<string>(NODE_GROUPS.map((group) => group.id));

  it('gives every node kind a group that NODE_GROUPS declares', () => {
    for (const kind of WORKFLOW_NODE_KINDS) {
      const meta = NODE_KIND_META[kind];
      expect(meta, kind).toBeDefined();
      expect(groupIds.has(meta.group), `${kind} → ${meta.group}`).toBe(true);
    }
  });

  it('leaves no declared group empty', () => {
    for (const group of NODE_GROUPS) {
      const members = WORKFLOW_NODE_KINDS.filter((kind) => NODE_KIND_META[kind].group === group.id);
      expect(members.length, group.id).toBeGreaterThan(0);
    }
  });

  it('declares unique group ids and labels', () => {
    expect(groupIds.size).toBe(NODE_GROUPS.length);
    expect(new Set(NODE_GROUPS.map((group) => group.label)).size).toBe(NODE_GROUPS.length);
  });

  it('places every kind in exactly one palette group when unfiltered', () => {
    const placed = paletteGroups('').flatMap((group) => group.kinds);
    expect([...placed].sort()).toEqual([...WORKFLOW_NODE_KINDS].sort());
  });
});

describe('nodeSummary — a custom agent (#1713)', () => {
  const agent = (config: Record<string, unknown>) =>
    ({ id: 'n', label: 'A', x: 0, y: 0, kind: 'agent', config: { agentId: 'claude', prompt: 'p', ...config } }) as WorkflowNode;
  const names = (id: string) => (id === 'profile-rev' ? 'Reviewer' : undefined);

  it('names the custom agent rather than its base CLI', () => {
    expect(nodeSummary(agent({ agentProfileId: 'profile-rev' }), names)).toBe('Run Reviewer');
  });

  it('falls back to the roster id when the agent is unknown, deleted or the list is absent', () => {
    expect(nodeSummary(agent({ agentProfileId: 'profile-gone' }), names)).toBe('Run claude');
    expect(nodeSummary(agent({ agentProfileId: 'profile-rev' }))).toBe('Run claude');
    expect(nodeSummary(agent({}), names)).toBe('Run claude');
  });

  it('names a verify agent check the same way', () => {
    const verify = { id: 'v', label: 'V', x: 0, y: 0, kind: 'verify', config: { check: 'agent', agentId: 'claude', agentProfileId: 'profile-rev', prompt: 'p' } } as WorkflowNode;
    expect(nodeSummary(verify, names)).toBe('Agent verdict · Reviewer');
  });
});
