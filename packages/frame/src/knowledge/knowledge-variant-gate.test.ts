// Layer: vitest — pure threshold arithmetic and the effective-variant fallback, no DOM.
import { afterEach, describe, expect, it } from 'vitest';

import { effectiveVariant, variantGate } from './knowledge-variant-gate';
import { VARIANTS } from './renderer-contract';

const counts = { nodes: 15_292, edges: 37_036 };

describe('variantGate', () => {
  it('allows a variant with no declared limit', () => {
    expect(variantGate({ label: 'X' }, counts)).toEqual({ allowed: true });
  });

  it('allows a graph exactly at the limit and blocks one node over', () => {
    expect(variantGate({ label: 'X', maxNodes: 15_292 }, counts)).toEqual({ allowed: true });
    const over = variantGate({ label: 'X', maxNodes: 15_291 }, counts);
    expect(over).toEqual({
      allowed: false,
      reason: 'X is limited to 15,291 nodes; this graph has 15,292.',
    });
  });

  it('blocks on edges independently of nodes', () => {
    const gate = variantGate({ label: 'X', maxNodes: 100_000, maxEdges: 10_000 }, counts);
    expect(gate).toEqual({ allowed: false, reason: 'X is limited to 10,000 edges; this graph has 37,036.' });
  });
});

describe('effectiveVariant', () => {
  const target = VARIANTS.find((v) => v.id === 'cytoscape')!;
  afterEach(() => {
    delete target.maxNodes;
  });

  it('keeps the stored variant when it is allowed', () => {
    expect(effectiveVariant('cytoscape', counts)).toEqual({ id: 'cytoscape', gatedReason: null });
  });

  it('falls back to the default, with the reason, when the stored variant is gated, and restores it for a smaller graph', () => {
    target.maxNodes = 1_000;
    const big = effectiveVariant('cytoscape', counts);
    expect(big.id).toBe(VARIANTS[0]!.id);
    expect(big.gatedReason).toContain('1,000 nodes');
    expect(effectiveVariant('cytoscape', { nodes: 900, edges: 10 })).toEqual({ id: 'cytoscape', gatedReason: null });
  });
});
