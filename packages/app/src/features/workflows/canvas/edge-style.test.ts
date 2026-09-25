import { WORKFLOW_EDGE_KINDS, WORKFLOW_PORT_TYPES, type WorkflowEdge, type WorkflowNode } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { EDGE_KIND_STYLE, inferEdgeKind, PORT_TYPE_COLOR_VAR, rendererEdgeState } from './edge-style';

function edge(overrides: Partial<WorkflowEdge> & Pick<WorkflowEdge, 'from' | 'to'>): WorkflowEdge {
  return { id: 'e1', ...overrides };
}

function node(kind: WorkflowNode['kind'] = 'http'): WorkflowNode {
  if (kind === 'http') {
    return { id: 'n1', label: 'n1', x: 0, y: 0, kind: 'http', config: { method: 'GET', url: '', headers: {}, params: {}, queryShaped: false } };
  }
  if (kind === 'condition') {
    return { id: 'n1', label: 'n1', x: 0, y: 0, kind: 'condition', config: { left: '', op: 'eq' } };
  }
  throw new Error(`unhandled kind in test fixture: ${kind}`);
}

describe('EDGE_KIND_STYLE', () => {
  it('covers every WorkflowEdgeKind exhaustively', () => {
    expect(Object.keys(EDGE_KIND_STYLE).sort()).toEqual([...WORKFLOW_EDGE_KINDS].sort());
  });

  it('data is a plain solid line with no source-port label and no back-edge routing', () => {
    expect(EDGE_KIND_STYLE.data).toEqual({});
  });

  it('conditional shows the source port label, still solid', () => {
    expect(EDGE_KIND_STYLE.conditional.dashArray).toBeUndefined();
    expect(EDGE_KIND_STYLE.conditional.showSourcePortLabel).toBe(true);
  });

  it('error is dashed and carries the failed-status colour', () => {
    expect(EDGE_KIND_STYLE.error.dashArray).toBeDefined();
    expect(EDGE_KIND_STYLE.error.strokeColorVar).toBe('var(--activity-failed)');
  });

  it('loop is dashed and routed as a back-edge', () => {
    expect(EDGE_KIND_STYLE.loop.dashArray).toBeDefined();
    expect(EDGE_KIND_STYLE.loop.isBackEdge).toBe(true);
  });
});

describe('PORT_TYPE_COLOR_VAR', () => {
  it('covers every WorkflowPortType exhaustively', () => {
    expect(Object.keys(PORT_TYPE_COLOR_VAR).sort()).toEqual([...WORKFLOW_PORT_TYPES].sort());
  });

  it('any falls back to the neutral border token, not a dedicated port token', () => {
    expect(PORT_TYPE_COLOR_VAR.any).toBe('hsl(var(--border))');
  });

  it('every non-any type resolves to its own --port-* token', () => {
    expect(PORT_TYPE_COLOR_VAR.json).toBe('hsl(var(--port-json))');
    expect(PORT_TYPE_COLOR_VAR.text).toBe('hsl(var(--port-text))');
    expect(PORT_TYPE_COLOR_VAR.number).toBe('hsl(var(--port-number))');
    expect(PORT_TYPE_COLOR_VAR.boolean).toBe('hsl(var(--port-boolean))');
    expect(PORT_TYPE_COLOR_VAR.verdict).toBe('hsl(var(--port-verdict))');
  });

  it('artifact-ref reads the "artifact" token — the port type keeps its own -ref suffix', () => {
    expect(PORT_TYPE_COLOR_VAR['artifact-ref']).toBe('hsl(var(--port-artifact))');
  });
});

describe('rendererEdgeState', () => {
  const dataEdge = edge({ from: 'a', to: 'b' });

  it('is pending before the source node has run', () => {
    expect(rendererEdgeState(dataEdge, undefined, undefined)).toBe('pending');
    expect(rendererEdgeState(dataEdge, 'pending', undefined)).toBe('pending');
    expect(rendererEdgeState(dataEdge, 'running', undefined)).toBe('pending');
  });

  it('is dead when the source was skipped, regardless of settledPort', () => {
    expect(rendererEdgeState(dataEdge, 'skipped', 'out')).toBe('dead');
  });

  it('is dead on a legacy-cascade failure — a terminal source with no settledPort', () => {
    expect(rendererEdgeState(dataEdge, 'failed', undefined)).toBe('dead');
    expect(rendererEdgeState(dataEdge, 'timeout', undefined)).toBe('dead');
  });

  it('is taken when the edge\'s own fromPort matches the source\'s settledPort', () => {
    expect(rendererEdgeState(dataEdge, 'succeeded', 'out')).toBe('taken');
  });

  it('is dead when a different port settled — a condition\'s untaken branch', () => {
    const falseBranch = edge({ from: 'a', to: 'c', fromPort: 'false' });
    expect(rendererEdgeState(falseBranch, 'succeeded', 'true')).toBe('dead');
  });

  it('reads a wired error edge as taken once the source settles on the error port', () => {
    const errorEdge = edge({ from: 'a', to: 'errHandler', fromPort: 'error', kind: 'error' });
    expect(rendererEdgeState(errorEdge, 'failed', 'error')).toBe('taken');
  });

  it('normalizes a legacy edge with no fromPort to the default "out" before comparing', () => {
    const legacyEdge = edge({ from: 'a', to: 'b' }); // fromPort undefined -> normalizeEdge defaults it to 'out'
    expect(rendererEdgeState(legacyEdge, 'succeeded', 'out')).toBe('taken');
  });
});

describe('inferEdgeKind', () => {
  it('is "error" off the error port, regardless of node kind', () => {
    expect(inferEdgeKind(node('http'), 'error')).toBe('error');
    expect(inferEdgeKind(node('condition'), 'error')).toBe('error');
  });

  it('is "conditional" off a condition node\'s non-error port', () => {
    expect(inferEdgeKind(node('condition'), 'true')).toBe('conditional');
    expect(inferEdgeKind(node('condition'), 'false')).toBe('conditional');
  });

  it('is "data" for a plain node\'s out port', () => {
    expect(inferEdgeKind(node('http'), 'out')).toBe('data');
  });
});
