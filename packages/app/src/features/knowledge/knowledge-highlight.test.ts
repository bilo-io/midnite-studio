// Layer: vitest — pure data, no canvas (see knowledge-highlight.ts).
import { describe, expect, it } from 'vitest';

import { computeHighlightSets, edgePaint, nodePaint } from './knowledge-highlight';

const adjacency = new Map<string, string[]>([
  ['hub', ['a', 'b']],
  ['a', ['hub']],
  ['b', ['hub', 'c']],
  ['c', ['b']],
  ['lonely', []],
]);
const neighborsOf = (id: string) => adjacency.get(id) ?? [];

describe('computeHighlightSets', () => {
  it('is inactive with nothing focused', () => {
    const sets = computeHighlightSets({
      searchMatchIds: new Set(),
      selectedNodeId: null,
      hoveredNodeId: null,
      neighborsOf,
    });
    expect(sets.active).toBe(false);
    expect(sets.focusIds.size).toBe(0);
    expect(sets.neighborIds.size).toBe(0);
  });

  it('a selection lights itself and its one-hop neighbours', () => {
    const sets = computeHighlightSets({
      searchMatchIds: new Set(),
      selectedNodeId: 'hub',
      hoveredNodeId: null,
      neighborsOf,
    });
    expect(sets.active).toBe(true);
    expect([...sets.focusIds]).toEqual(['hub']);
    expect([...sets.neighborIds].sort()).toEqual(['a', 'b']);
  });

  it('merges search matches, the selection and the hover into one focus set', () => {
    const sets = computeHighlightSets({
      searchMatchIds: new Set(['c']),
      selectedNodeId: 'hub',
      hoveredNodeId: 'lonely',
      neighborsOf,
    });
    expect([...sets.focusIds].sort()).toEqual(['c', 'hub', 'lonely']);
    // `b` neighbours both `hub` and `c`, listed once; focus nodes never appear as neighbours.
    expect([...sets.neighborIds].sort()).toEqual(['a', 'b']);
  });
});

describe('nodePaint', () => {
  const sets = computeHighlightSets({
    searchMatchIds: new Set(),
    selectedNodeId: 'hub',
    hoveredNodeId: null,
    neighborsOf,
  });

  it('the selected node is highlighted, labelled and on top', () => {
    expect(nodePaint('hub', sets, 'hub')).toEqual({
      dimmed: false,
      forceLabel: true,
      highlighted: true,
      zIndex: 3,
    });
  });

  it('a neighbour is lit and labelled but not ringed', () => {
    expect(nodePaint('a', sets, 'hub')).toEqual({
      dimmed: false,
      forceLabel: true,
      highlighted: false,
      zIndex: 2,
    });
  });

  it('everything else dims', () => {
    expect(nodePaint('c', sets, 'hub')).toEqual({
      dimmed: true,
      forceLabel: false,
      highlighted: false,
      zIndex: 1,
    });
  });

  it('with nothing focused, nothing dims and nothing is forced', () => {
    const idle = computeHighlightSets({
      searchMatchIds: new Set(),
      selectedNodeId: null,
      hoveredNodeId: null,
      neighborsOf,
    });
    expect(nodePaint('c', idle, null)).toEqual({
      dimmed: false,
      forceLabel: false,
      highlighted: false,
      zIndex: 1,
    });
  });
});

describe('edgePaint', () => {
  const sets = computeHighlightSets({
    searchMatchIds: new Set(),
    selectedNodeId: 'hub',
    hoveredNodeId: null,
    neighborsOf,
  });

  it('an edge touching a focus node is emphasised', () => {
    expect(edgePaint('hub', 'a', sets)).toEqual({ dimmed: false, emphasised: true, zIndex: 1 });
    expect(edgePaint('a', 'hub', sets)).toEqual({ dimmed: false, emphasised: true, zIndex: 1 });
  });

  it('an edge between two neighbours (not touching the focus) dims', () => {
    expect(edgePaint('b', 'c', sets)).toEqual({ dimmed: true, emphasised: false, zIndex: 0 });
  });

  it('nothing changes while inactive', () => {
    const idle = computeHighlightSets({
      searchMatchIds: new Set(),
      selectedNodeId: null,
      hoveredNodeId: null,
      neighborsOf,
    });
    expect(edgePaint('b', 'c', idle)).toEqual({ dimmed: false, emphasised: false, zIndex: 0 });
  });
});
