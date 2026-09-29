import {
  WORKFLOW_EDGE_KINDS,
  WORKFLOW_PORT_TYPES,
  type WorkflowEdge,
  type WorkflowLoopState,
  type WorkflowNode,
} from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  clampEdgeOpacity,
  DEAD_EDGE_OPACITY,
  EDGE_KIND_STYLE,
  EDGE_OPACITY_MAX,
  EDGE_OPACITY_MIN,
  edgeAppearance,
  inferEdgeKind,
  iterationLabelFor,
  loopBoundsTitle,
  PORT_TYPE_COLOR_VAR,
  rendererEdgeState,
  type RendererEdgeState,
} from './edge-style';

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

function loopState(overrides: Partial<WorkflowLoopState> & Pick<WorkflowLoopState, 'edgeId' | 'iteration'>): WorkflowLoopState {
  return { startedAt: 0, seenKeyHashes: [], dryStreak: 0, ...overrides };
}

describe('iterationLabelFor', () => {
  const loopEdge = edge({ from: 'a', to: 'b', kind: 'loop', loop: { maxIterations: 6, budgetMs: 60_000 } });

  it('is undefined for a non-loop edge', () => {
    const states = new Map([['e1', loopState({ edgeId: 'e1', iteration: 2 })]]);
    expect(iterationLabelFor(edge({ from: 'a', to: 'b' }), states)).toBeUndefined();
  });

  it('is undefined before any run has reached the loop', () => {
    expect(iterationLabelFor(loopEdge, undefined)).toBeUndefined();
    expect(iterationLabelFor(loopEdge, new Map())).toBeUndefined();
  });

  it('is "iteration/maxIterations" once a run has an entry for this edge', () => {
    const states = new Map([['e1', loopState({ edgeId: 'e1', iteration: 2 })]]);
    expect(iterationLabelFor(loopEdge, states)).toBe('2/6');
  });

  it('falls back to the bare iteration when the edge carries no loop config', () => {
    const noConfig = edge({ from: 'a', to: 'b', kind: 'loop' });
    const states = new Map([['e1', loopState({ edgeId: 'e1', iteration: 4 })]]);
    expect(iterationLabelFor(noConfig, states)).toBe('4');
  });
});

describe('loopBoundsTitle', () => {
  it('is undefined with no loop config', () => {
    expect(loopBoundsTitle(edge({ from: 'a', to: 'b', kind: 'loop' }))).toBeUndefined();
  });

  it('names both bounds, minutes rounded from the budget', () => {
    const loopEdge = edge({ from: 'a', to: 'b', kind: 'loop', loop: { maxIterations: 6, budgetMs: 5 * 60_000 } });
    expect(loopBoundsTitle(loopEdge)).toBe('Up to 6 iterations, 5m budget.');
  });

  it('falls back to milliseconds under a minute', () => {
    const loopEdge = edge({ from: 'a', to: 'b', kind: 'loop', loop: { maxIterations: 2, budgetMs: 500 } });
    expect(loopBoundsTitle(loopEdge)).toBe('Up to 2 iterations, 500ms budget.');
  });
});

describe('edge opacity clamp', () => {
  it('holds the bounds at 50% and 90%', () => {
    expect(EDGE_OPACITY_MIN).toBe(0.5);
    expect(EDGE_OPACITY_MAX).toBe(0.9);
  });

  it('clamps out-of-range values, and reads NaN as the floor rather than an invisible edge', () => {
    expect(clampEdgeOpacity(0)).toBe(0.5);
    expect(clampEdgeOpacity(0.35)).toBe(0.5);
    expect(clampEdgeOpacity(0.7)).toBe(0.7);
    expect(clampEdgeOpacity(1)).toBe(0.9);
    expect(clampEdgeOpacity(Number.NaN)).toBe(0.5);
  });

  // Every variant the canvas can draw: each kind (data, conditional branch,
  // error, loop) × each run state (pending/default, taken, dead) × running
  // source × selected — and hover, which is each variant's `hoverOpacity`.
  const states: RendererEdgeState[] = ['pending', 'taken', 'dead'];
  const variants = WORKFLOW_EDGE_KINDS.flatMap((kind) =>
    states.flatMap((state) =>
      [false, true].flatMap((running) => [false, true].map((selected) => ({ kind, state, running, selected }))),
    ),
  );

  it.each(variants)('keeps $kind / $state / running=$running / selected=$selected inside [0.5, 0.9], resting and hovered', (variant) => {
    const look = edgeAppearance(variant);
    for (const value of [look.opacity, look.hoverOpacity]) {
      expect(value).toBeGreaterThanOrEqual(EDGE_OPACITY_MIN);
      expect(value).toBeLessThanOrEqual(EDGE_OPACITY_MAX);
    }
    expect(look.hoverOpacity).toBeGreaterThanOrEqual(look.opacity);
  });

  it('never bakes opacity into the colour itself — every stroke is an opaque token', () => {
    for (const variant of variants) {
      expect(edgeAppearance(variant).stroke).not.toMatch(/rgba|color-mix|\/\s*0?\.\d|transparent/);
    }
  });

  it('draws a dead edge at the floor, un-animated, and a selected one at the ceiling', () => {
    const dead = edgeAppearance({ kind: 'data', state: 'dead', running: false, selected: false });
    expect(dead.opacity).toBe(DEAD_EDGE_OPACITY);
    expect(dead.animated).toBe(false);
    const selected = edgeAppearance({ kind: 'data', state: 'pending', running: false, selected: true });
    expect(selected.opacity).toBe(EDGE_OPACITY_MAX);
    expect(selected.strokeWidth).toBeGreaterThan(dead.strokeWidth);
  });

  it('keeps each kind\'s own dash pattern and the error kind\'s colour', () => {
    const error = edgeAppearance({ kind: 'error', state: 'pending', running: false, selected: false });
    expect(error.stroke).toBe(EDGE_KIND_STYLE.error.strokeColorVar);
    expect(error.dashArray).toBe(EDGE_KIND_STYLE.error.dashArray);
    expect(edgeAppearance({ kind: 'loop', state: 'pending', running: false, selected: false }).dashArray).toBe(
      EDGE_KIND_STYLE.loop.dashArray,
    );
  });
});
