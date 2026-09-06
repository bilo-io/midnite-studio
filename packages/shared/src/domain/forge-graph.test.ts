import { describe, expect, it } from 'vitest';

import {
  FORGE_GRAPH_NODE_CAP,
  describeGraphSources,
  parseBlockerRefs,
  resolveForgeGraph,
  type ForgeGraphOptions,
} from './forge-graph';
import type { ForgeProjectField, ForgeProjectFieldValue, ForgeProjectItem } from './forge-project';

const BOARD_REPO = 'acme/widgets';
const baseOptions: ForgeGraphOptions = { boardRepo: BOARD_REPO };

function link(
  number: number,
  overrides: Partial<{ title: string; state: 'open' | 'closed' | null; repo: string }> = {},
) {
  return {
    number,
    title: overrides.title ?? `Issue ${number}`,
    state: overrides.state === undefined ? 'open' : overrides.state,
    repo: overrides.repo ?? '',
  };
}

function issueItem(
  id: string,
  number: number,
  overrides: {
    title?: string;
    state?: 'open' | 'closed';
    body?: string;
    blockedBy?: ReturnType<typeof link>[];
    parent?: ReturnType<typeof link> | null;
    subIssues?: ReturnType<typeof link>[];
    blockedByTruncated?: boolean;
    subIssuesTruncated?: boolean;
    fieldValues?: Record<string, ForgeProjectFieldValue>;
  } = {},
): ForgeProjectItem {
  return {
    id,
    content: {
      type: 'issue',
      id: `I_${id}`,
      number,
      title: overrides.title ?? `Issue ${number}`,
      url: `https://github.com/${BOARD_REPO}/issues/${number}`,
      state: overrides.state ?? 'open',
      assignees: [],
      body: overrides.body ?? '',
      labels: [],
      dependencies: {
        blockedBy: overrides.blockedBy ?? [],
        parent: overrides.parent ?? null,
        subIssues: overrides.subIssues ?? [],
        blockedByTruncated: overrides.blockedByTruncated ?? false,
        subIssuesTruncated: overrides.subIssuesTruncated ?? false,
      },
    },
    fieldValues: overrides.fieldValues ?? {},
  };
}

function pullItem(
  id: string,
  number: number,
  overrides: { state?: 'open' | 'closed' | 'merged'; body?: string } = {},
): ForgeProjectItem {
  return {
    id,
    content: {
      type: 'pull',
      id: `PR_${id}`,
      number,
      title: `PR ${number}`,
      url: `https://github.com/${BOARD_REPO}/pull/${number}`,
      state: overrides.state ?? 'open',
      assignees: [],
      body: overrides.body ?? '',
      labels: [],
    },
    fieldValues: {},
  };
}

describe('parseBlockerRefs', () => {
  it.each([
    ['Blocked by #12', [{ repo: '', number: 12 }]],
    ['blocked-by:#12', [{ repo: '', number: 12 }]],
    ['Depends on #12', [{ repo: '', number: 12 }]],
    ['Requires #12', [{ repo: '', number: 12 }]],
    ['Blocked by owner/repo#12', [{ repo: 'owner/repo', number: 12 }]],
    ['BLOCKED BY #12', [{ repo: '', number: 12 }]],
  ])('matches %s', (body, expected) => {
    expect(parseBlockerRefs(body)).toEqual(expected);
  });

  it('parses a comma- and `and`-separated list, mixing local and cross-repo refs', () => {
    expect(parseBlockerRefs('Blocked by #12, #13 and owner/repo#14')).toEqual([
      { repo: '', number: 12 },
      { repo: '', number: 13 },
      { repo: 'owner/repo', number: 14 },
    ]);
  });

  it('ignores "Blocks" — the inverse relation', () => {
    expect(parseBlockerRefs('Blocks #12')).toEqual([]);
  });

  it('ignores a ref inside a fenced code block', () => {
    expect(parseBlockerRefs('Blocked by\n```\n#12\n```')).toEqual([]);
  });

  it('ignores a ref inside an inline code span', () => {
    expect(parseBlockerRefs('Blocked by `#12`')).toEqual([]);
  });

  it('ignores a ref that only appears inside a markdown link target', () => {
    expect(parseBlockerRefs('Blocked by [see here](https://example.com/x/y#12)')).toEqual([]);
  });

  it('returns [] for an empty or whitespace-only body', () => {
    expect(parseBlockerRefs('')).toEqual([]);
    expect(parseBlockerRefs('   \n  ')).toEqual([]);
  });
});

describe('resolveForgeGraph — ladder precedence', () => {
  const fields: ForgeProjectField[] = [{ id: 'f1', name: 'Blocked by', dataType: 'text' }];

  it('prefers api over field and body when all three name the same blocker', () => {
    const blocker = issueItem('blocker', 12);
    const dependent = issueItem('dep', 20, {
      blockedBy: [link(12)],
      body: 'Blocked by #12',
      fieldValues: { f1: { fieldId: 'f1', dataType: 'text', text: '#12' } },
    });
    const graph = resolveForgeGraph([blocker, dependent], fields, baseOptions);
    const blocksEdges = graph.edges.filter((e) => e.kind === 'blocks');
    expect(blocksEdges).toHaveLength(1);
    expect(blocksEdges[0]).toMatchObject({ from: '#20', to: '#12', source: 'api' });
  });

  it('promotes field once api is empty', () => {
    const blocker = issueItem('blocker', 12);
    const dependent = issueItem('dep', 20, {
      body: 'Blocked by #12',
      fieldValues: { f1: { fieldId: 'f1', dataType: 'text', text: '#12' } },
    });
    const graph = resolveForgeGraph([blocker, dependent], fields, baseOptions);
    const blocksEdges = graph.edges.filter((e) => e.kind === 'blocks');
    expect(blocksEdges).toHaveLength(1);
    expect(blocksEdges[0]).toMatchObject({ from: '#20', to: '#12', source: 'field' });
  });

  it('promotes body once both api and field are empty', () => {
    const blocker = issueItem('blocker', 12);
    const dependent = issueItem('dep', 20, { body: 'Blocked by #12' });
    const graph = resolveForgeGraph([blocker, dependent], fields, baseOptions);
    const blocksEdges = graph.edges.filter((e) => e.kind === 'blocks');
    expect(blocksEdges).toHaveLength(1);
    expect(blocksEdges[0]).toMatchObject({ from: '#20', to: '#12', source: 'body' });
  });

  it('skips the field layer entirely when no field on the board matches the configured name', () => {
    const dependent = issueItem('dep', 20, { body: '' });
    const graph = resolveForgeGraph([dependent], [], baseOptions);
    expect(describeGraphSources(graph)).toEqual({ api: 0, field: 0, body: 0, contains: 0 });
  });

  it('never reads body once field has already answered, even naming an unrelated blocker', () => {
    const blocker = issueItem('blocker', 12);
    const dependent = issueItem('dep', 20, {
      body: 'Blocked by #99',
      fieldValues: { f1: { fieldId: 'f1', dataType: 'text', text: '#12' } },
    });
    const graph = resolveForgeGraph([blocker, dependent], fields, baseOptions);
    const blocksEdges = graph.edges.filter((e) => e.kind === 'blocks');
    expect(blocksEdges.map((e) => e.to)).toEqual(['#12']);
  });
});

describe('resolveForgeGraph — containment', () => {
  it('parent/subIssues never change blocked, ready, or unmetBlockerCount, and collapse to one edge', () => {
    const child = issueItem('child', 2);
    const parent = issueItem('parent', 1, { subIssues: [link(2)] });
    if (child.content.type === 'issue') {
      child.content.dependencies.parent = link(1);
    }

    const graph = resolveForgeGraph([parent, child], [], baseOptions);
    const containsEdges = graph.edges.filter((e) => e.kind === 'contains');
    // Both sides describe the same relationship; the canonical parent -> child
    // direction is what lets them collapse into exactly one edge.
    expect(containsEdges).toHaveLength(1);
    expect(containsEdges[0]).toMatchObject({ from: '#1', to: '#2', kind: 'contains' });

    for (const node of graph.nodes) {
      expect(node.unmetBlockerCount).toBe(0);
      expect(node.blocked).toBe(false);
    }
    // The parent has no *blocks* edges at all — not "ready", just unconstrained.
    expect(graph.nodes.find((n) => n.number === 1)!.ready).toBe(false);
  });
});

describe('resolveForgeGraph — readiness', () => {
  it('a blocker known only by number (state: null) counts as unmet', () => {
    const dependent = issueItem('dep', 20, { body: 'Blocked by #999' });
    const graph = resolveForgeGraph([dependent], [], baseOptions);
    const depNode = graph.nodes.find((n) => n.number === 20)!;
    expect(depNode.unmetBlockerCount).toBe(1);
    expect(depNode.blocked).toBe(true);
    const blockerNode = graph.nodes.find((n) => n.number === 999)!;
    expect(blockerNode.state).toBeNull();
    expect(blockerNode.foreign).toBe(true);
    expect(blockerNode.title).toBe('');
  });

  it('a closed blocker counts as met', () => {
    const blocker = issueItem('blocker', 12, { state: 'closed' });
    const dependent = issueItem('dep', 20, { blockedBy: [link(12, { state: 'closed' })] });
    const graph = resolveForgeGraph([blocker, dependent], [], baseOptions);
    const depNode = graph.nodes.find((n) => n.number === 20)!;
    expect(depNode.unmetBlockerCount).toBe(0);
    expect(depNode.blocked).toBe(false);
    expect(depNode.ready).toBe(true);
  });

  it('a merged PR blocker (matched by number through the body layer) counts as met', () => {
    const mergedPr = pullItem('pr', 12, { state: 'merged' });
    const dependent = issueItem('dep', 20, { body: 'Blocked by #12' });
    const graph = resolveForgeGraph([mergedPr, dependent], [], baseOptions);
    const depNode = graph.nodes.find((n) => n.number === 20)!;
    expect(depNode.unmetBlockerCount).toBe(0);
    expect(depNode.ready).toBe(true);
  });

  it('ready is false for an open node with zero blockers', () => {
    const lone = issueItem('lone', 5);
    const graph = resolveForgeGraph([lone], [], baseOptions);
    const [node] = graph.nodes;
    expect(node!.ready).toBe(false);
    expect(node!.unmetBlockerCount).toBe(0);
    expect(node!.blocked).toBe(false);
  });

  it('ready is true for an open node whose one blocker is closed', () => {
    const blocker = issueItem('blocker', 1, { state: 'closed' });
    const dependent = issueItem('dep', 2, { blockedBy: [link(1, { state: 'closed' })] });
    const graph = resolveForgeGraph([blocker, dependent], [], baseOptions);
    expect(graph.nodes.find((n) => n.number === 2)!.ready).toBe(true);
  });
});

describe('resolveForgeGraph — foreign nodes', () => {
  it('creates a foreign node from an api-sourced blocker, carrying its real title/state', () => {
    const dependent = issueItem('dep', 20, {
      blockedBy: [link(50, { title: 'Upstream fix', state: 'open', repo: 'other/repo' })],
    });
    const graph = resolveForgeGraph([dependent], [], baseOptions);
    const foreignNode = graph.nodes.find((n) => n.number === 50)!;
    expect(foreignNode).toMatchObject({
      foreign: true,
      title: 'Upstream fix',
      state: 'open',
      repo: 'other/repo',
      kind: 'issue',
    });
  });

  it('creates a foreign node from a field-sourced ref, known only by number', () => {
    const fields: ForgeProjectField[] = [{ id: 'f1', name: 'Blocked by', dataType: 'text' }];
    const dependent = issueItem('dep', 20, {
      fieldValues: { f1: { fieldId: 'f1', dataType: 'text', text: '#77' } },
    });
    const graph = resolveForgeGraph([dependent], fields, baseOptions);
    const foreignNode = graph.nodes.find((n) => n.number === 77)!;
    expect(foreignNode).toMatchObject({ foreign: true, title: '', state: null });
  });

  it('creates a foreign node from a body-sourced ref, known only by number', () => {
    const dependent = issueItem('dep', 20, { body: 'Requires #88' });
    const graph = resolveForgeGraph([dependent], [], baseOptions);
    const foreignNode = graph.nodes.find((n) => n.number === 88)!;
    expect(foreignNode).toMatchObject({ foreign: true, title: '', state: null });
  });

  it('keeps a cross-repo blocker distinct from a same-numbered local issue', () => {
    const local = issueItem('local', 12);
    const dependent = issueItem('dep', 20, { blockedBy: [link(12, { repo: 'other/repo' })] });
    const graph = resolveForgeGraph([local, dependent], [], baseOptions);
    expect(graph.nodes).toHaveLength(3); // local #12, dependent #20, foreign other/repo#12
    const foreignNode = graph.nodes.find((n) => n.repo === 'other/repo');
    expect(foreignNode?.number).toBe(12);
    expect(foreignNode?.foreign).toBe(true);
    const localNode = graph.nodes.find((n) => n.repo === '' && n.number === 12);
    expect(localNode?.foreign).toBe(false);
  });

  it("normalizes an explicit same-repo reference back to the board's own local node", () => {
    const local = issueItem('local', 12);
    const dependent = issueItem('dep', 20, { blockedBy: [link(12, { repo: BOARD_REPO })] });
    const graph = resolveForgeGraph([local, dependent], [], baseOptions);
    expect(graph.nodes).toHaveLength(2); // no separate foreign node minted
    const edge = graph.edges.find((e) => e.kind === 'blocks')!;
    expect(edge.to).toBe('#12');
  });
});

describe('resolveForgeGraph — hygiene', () => {
  it('keeps both edges of a mutual blockedBy pair', () => {
    const a = issueItem('a', 1, { blockedBy: [link(2)] });
    const b = issueItem('b', 2, { blockedBy: [link(1)] });
    const graph = resolveForgeGraph([a, b], [], baseOptions);
    const blocksEdges = graph.edges.filter((e) => e.kind === 'blocks');
    expect(blocksEdges).toHaveLength(2);
    expect(blocksEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: '#1', to: '#2' }),
        expect.objectContaining({ from: '#2', to: '#1' }),
      ]),
    );
  });

  it('drops a self-reference rather than producing a self-edge', () => {
    const selfBlocked = issueItem('a', 1, { blockedBy: [link(1)] });
    const graph = resolveForgeGraph([selfBlocked], [], baseOptions);
    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes).toHaveLength(1);
  });
});

describe('resolveForgeGraph — node cap', () => {
  it('truncates by board order and reports the true totalCount', () => {
    const items = Array.from({ length: FORGE_GRAPH_NODE_CAP + 10 }, (_, i) => issueItem(`i${i}`, i + 1));
    const graph = resolveForgeGraph(items, [], baseOptions);
    expect(graph.totalCount).toBe(FORGE_GRAPH_NODE_CAP + 10);
    expect(graph.truncated).toBe(true);
    expect(graph.nodes).toHaveLength(FORGE_GRAPH_NODE_CAP);
  });

  it('honours a custom nodeCap option', () => {
    const items = Array.from({ length: 5 }, (_, i) => issueItem(`i${i}`, i + 1));
    const graph = resolveForgeGraph(items, [], { ...baseOptions, nodeCap: 3 });
    expect(graph.totalCount).toBe(5);
    expect(graph.truncated).toBe(true);
    expect(graph.nodes).toHaveLength(3);
  });
});

describe('describeGraphSources', () => {
  it('counts each layer separately', () => {
    const fields: ForgeProjectField[] = [{ id: 'f1', name: 'Blocked by', dataType: 'text' }];
    const apiBlocker = issueItem('api-blocker', 1);
    const fieldBlocker = issueItem('field-blocker', 2);
    const bodyBlocker = issueItem('body-blocker', 3);
    const parent = issueItem('parent', 4);
    const apiDep = issueItem('api-dep', 10, { blockedBy: [link(1)], parent: link(4) });
    const fieldDep = issueItem('field-dep', 11, {
      fieldValues: { f1: { fieldId: 'f1', dataType: 'text', text: '#2' } },
    });
    const bodyDep = issueItem('body-dep', 12, { body: 'Blocked by #3' });

    const graph = resolveForgeGraph(
      [apiBlocker, fieldBlocker, bodyBlocker, parent, apiDep, fieldDep, bodyDep],
      fields,
      baseOptions,
    );
    expect(describeGraphSources(graph)).toEqual({ api: 1, field: 1, body: 1, contains: 1 });
  });
});
