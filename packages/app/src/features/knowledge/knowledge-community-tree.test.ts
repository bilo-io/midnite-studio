// Layer: vitest — pure data, no DOM (see knowledge-community-tree.ts).
import { describe, expect, it } from 'vitest';

import { flattenCommunityTree } from './knowledge-community-tree';

const communityNames = ['core', 'graph'];
const nodesByCommunity = new Map([
  ['core', [{ id: 'a', label: 'useNow' }, { id: 'b', label: 'useNowTick' }]],
  ['graph', [{ id: 'c', label: 'layoutRows' }]],
]);

describe('flattenCommunityTree', () => {
  it('lists every community collapsed by default, with its member count', () => {
    const rows = flattenCommunityTree({ communityNames, nodesByCommunity, expanded: new Set(), query: '' });
    expect(rows).toEqual([
      { kind: 'community', name: 'core', memberCount: 2, expanded: false },
      { kind: 'community', name: 'graph', memberCount: 1, expanded: false },
    ]);
  });

  it('inlines an expanded community’s members right after its row', () => {
    const rows = flattenCommunityTree({
      communityNames,
      nodesByCommunity,
      expanded: new Set(['core']),
      query: '',
    });
    expect(rows.map((r) => (r.kind === 'node' ? r.id : r.name))).toEqual(['core', 'a', 'b', 'graph']);
    expect(rows[0]).toMatchObject({ kind: 'community', expanded: true });
  });

  it('a community name hit keeps the community (collapsed) and drops the rest', () => {
    const rows = flattenCommunityTree({ communityNames, nodesByCommunity, expanded: new Set(), query: 'GRA' });
    expect(rows).toEqual([{ kind: 'community', name: 'graph', memberCount: 1, expanded: false }]);
  });

  it('a member hit force-expands its community showing only the matching members', () => {
    const rows = flattenCommunityTree({ communityNames, nodesByCommunity, expanded: new Set(), query: 'tick' });
    expect(rows).toEqual([
      { kind: 'community', name: 'core', memberCount: 2, expanded: true },
      { kind: 'node', id: 'b', label: 'useNowTick', communityName: 'core' },
    ]);
  });

  it('a community whose name matches AND is expanded lists all its members', () => {
    const rows = flattenCommunityTree({
      communityNames,
      nodesByCommunity,
      expanded: new Set(['core']),
      query: 'cor',
    });
    expect(rows.map((r) => (r.kind === 'node' ? r.id : r.name))).toEqual(['core', 'a', 'b']);
  });

  it('a community with no known members still lists, with count 0', () => {
    const rows = flattenCommunityTree({
      communityNames: ['ghost'],
      nodesByCommunity: new Map(),
      expanded: new Set(['ghost']),
      query: '',
    });
    expect(rows).toEqual([{ kind: 'community', name: 'ghost', memberCount: 0, expanded: true }]);
  });
});
