// Layer: vitest (Phase 82) — pure data transformation, no browser capability needed.
import { describe, expect, it } from 'vitest';

import { buildDetailIndex, jsonByteLength, projectGraph } from './projection';
import type { RawGraph } from './types';

const RAW_GRAPH: RawGraph = {
  nodes: [
    {
      id: 'a',
      label: 'A',
      community: 0,
      community_name: 'core',
      file_type: 'code',
      source_file: 'src/a.ts',
      source_location: 'L1',
      _origin: 'ast',
      _callable: true,
      _callable_class: true,
      norm_label: 'a',
    },
    {
      id: 'b',
      label: 'B',
      community: 1,
      community_name: 'edge',
      file_type: 'code',
      // No source_file/source_location — a node the detail index must skip.
    },
  ],
  links: [
    {
      source: 'a',
      target: 'b',
      relation: 'calls',
      weight: 0.5,
      confidence: 'EXTRACTED',
      confidence_score: 0.85,
      context: 'call',
      source_file: 'src/a.ts',
      source_location: 'L3',
    },
  ],
  built_at_commit: 'deadbeef',
};

describe('projectGraph', () => {
  it('keeps only the fields the picture reads', () => {
    const lean = projectGraph(RAW_GRAPH);

    expect(lean.nodes).toEqual([
      { id: 'a', label: 'A', community: 0, community_name: 'core', file_type: 'code' },
      { id: 'b', label: 'B', community: 1, community_name: 'edge', file_type: 'code' },
    ]);
    expect(lean.links).toEqual([
      { source: 'a', target: 'b', relation: 'calls', weight: 0.5, confidence: 0.85 },
    ]);
    expect(lean.builtAtCommit).toBe('deadbeef');
  });

  it('drops every stripped field — no leftover keys survive', () => {
    const lean = projectGraph(RAW_GRAPH);
    for (const node of lean.nodes) {
      expect(Object.keys(node).sort()).toEqual(
        ['community', 'community_name', 'file_type', 'id', 'label'].sort(),
      );
    }
    for (const link of lean.links) {
      expect(Object.keys(link).sort()).toEqual(
        ['confidence', 'relation', 'source', 'target', 'weight'].sort(),
      );
    }
  });

  it('defaults a missing confidence_score to 1, same as a missing weight', () => {
    const lean = projectGraph({
      ...RAW_GRAPH,
      links: [{ source: 'a', target: 'b', relation: 'calls' }],
    });
    expect(lean.links).toEqual([
      { source: 'a', target: 'b', relation: 'calls', weight: 1, confidence: 1 },
    ]);
  });

  it('produces a strictly smaller payload than the raw graph', () => {
    const lean = projectGraph(RAW_GRAPH);
    expect(jsonByteLength(lean)).toBeLessThan(jsonByteLength(RAW_GRAPH));
  });
});

describe('buildDetailIndex', () => {
  it('indexes source_file/source_location by node id', () => {
    const index = buildDetailIndex(RAW_GRAPH);
    expect(index.get('a')).toEqual({ sourceFile: 'src/a.ts', sourceLocation: 'L1' });
  });

  it('omits a node with no source location rather than a partial entry', () => {
    const index = buildDetailIndex(RAW_GRAPH);
    expect(index.has('b')).toBe(false);
  });
});
