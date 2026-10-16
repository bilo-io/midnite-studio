import { WORKFLOW_NODE_KINDS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

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
