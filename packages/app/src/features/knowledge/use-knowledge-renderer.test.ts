// Layer: vitest — the generic adapter hook driven against a fake
// `KnowledgeRenderer` (no sigma/WebGL involved), asserting it calls the
// right contract method at the right prop change, matching
// `use-sigma-graph.ts`'s own four effects before this seam existed.
import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import { defaultFilterState } from './knowledge-filters';
import type { KnowledgeRenderer } from './renderer-contract';
import { useKnowledgeRenderer } from './use-knowledge-renderer';

const PAYLOAD: KnowledgeGraphPayload = {
  nodes: [{ id: 'a', label: 'A', community: 0, communityName: 'core', fileType: 'code' }],
  links: [],
  positions: { a: { x: 0, y: 0 } },
  builtAtCommit: 'deadbeef',
  cached: true,
  commitsBehind: 0,
};

// No explicit `KnowledgeRenderer` return-type annotation — that would widen
// each field to its plain function signature and lose the `Mock` type
// `mockClear`/`toHaveBeenCalledWith` need. Structural typing still makes
// this assignable to `KnowledgeRenderer` wherever it is passed as one.
function fakeRenderer() {
  return {
    mount: vi.fn(),
    dispose: vi.fn(),
    applyFilters: vi.fn(),
    applyHighlight: vi.fn(),
    focusNode: vi.fn(),
    setCollapsed: vi.fn(),
    resize: vi.fn(),
    setPaused: vi.fn(),
    playIntro: vi.fn(),
    retarget: vi.fn(),
  };
}

type Props = Parameters<typeof useKnowledgeRenderer>[0];

/**
 * A single, stable base — every field's object identity is fixed for the
 * life of a test unless the test itself replaces it, so a rerender that only
 * changes (say) `selectedNodeId` does not also present a *new* `filters`
 * object and spuriously fire the filters effect too (`Object.is`, which
 * `useEffect`'s own dependency comparison uses, does not care that two
 * objects are structurally equal).
 */
function makeProps(renderer: KnowledgeRenderer, container: HTMLDivElement): Props {
  return {
    containerRef: { current: container } as RefObject<HTMLDivElement | null>,
    renderer,
    payload: PAYLOAD,
    filters: defaultFilterState(),
    focusNodeId: null,
    selectedNodeId: null,
    collapsedCommunities: new Set<string>(),
    onNodeClick: vi.fn(),
    onNodeDoubleClick: vi.fn(),
    paused: false,
  };
}

describe('useKnowledgeRenderer', () => {
  it('mounts once a container and payload are both present, and never before', () => {
    const renderer = fakeRenderer();
    const container = document.createElement('div');
    const props = makeProps(renderer, container);
    const { rerender } = renderHook<void, Props>((p) => useKnowledgeRenderer(p), {
      initialProps: { ...props, payload: null },
    });
    expect(renderer.mount).not.toHaveBeenCalled();

    rerender(props);
    expect(renderer.mount).toHaveBeenCalledTimes(1);
    expect(renderer.mount).toHaveBeenCalledWith(container, PAYLOAD, expect.any(Object));
  });

  it('disposes and remounts on a new payload identity', () => {
    const renderer = fakeRenderer();
    const container = document.createElement('div');
    const props = makeProps(renderer, container);
    const { rerender } = renderHook((p: Props) => useKnowledgeRenderer(p), { initialProps: props });
    expect(renderer.mount).toHaveBeenCalledTimes(1);

    const nextPayload: KnowledgeGraphPayload = { ...PAYLOAD, builtAtCommit: 'cafebabe' };
    rerender({ ...props, payload: nextPayload });
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.mount).toHaveBeenCalledTimes(2);
    expect(renderer.mount).toHaveBeenLastCalledWith(container, nextPayload, expect.any(Object));
  });

  it('applyFilters fires on a filters change, independently of selection', () => {
    const renderer = fakeRenderer();
    const container = document.createElement('div');
    const props = makeProps(renderer, container);
    const { rerender } = renderHook((p: Props) => useKnowledgeRenderer(p), { initialProps: props });
    renderer.applyFilters.mockClear();
    renderer.applyHighlight.mockClear();

    rerender({ ...props, filters: { ...props.filters, query: 'use' } });
    expect(renderer.applyFilters).toHaveBeenCalledTimes(1);
    expect(renderer.applyHighlight).not.toHaveBeenCalled();
  });

  it('applyHighlight fires on a selection change, independently of filters', () => {
    const renderer = fakeRenderer();
    const container = document.createElement('div');
    const props = makeProps(renderer, container);
    const { rerender } = renderHook((p: Props) => useKnowledgeRenderer(p), { initialProps: props });
    renderer.applyFilters.mockClear();
    renderer.applyHighlight.mockClear();

    rerender({ ...props, selectedNodeId: 'a' });
    expect(renderer.applyHighlight).toHaveBeenCalledWith('a');
    expect(renderer.applyFilters).not.toHaveBeenCalled();
  });

  it('focusNode fires only on a focusNodeId change', () => {
    const renderer = fakeRenderer();
    const container = document.createElement('div');
    const props = makeProps(renderer, container);
    const { rerender } = renderHook((p: Props) => useKnowledgeRenderer(p), { initialProps: props });
    renderer.focusNode.mockClear();

    rerender({ ...props, selectedNodeId: 'a' });
    expect(renderer.focusNode).not.toHaveBeenCalled();

    rerender({ ...props, selectedNodeId: 'a', focusNodeId: 'a' });
    expect(renderer.focusNode).toHaveBeenCalledWith('a');
  });

  it('setCollapsed fires on a collapse-set change', () => {
    const renderer = fakeRenderer();
    const container = document.createElement('div');
    const props = makeProps(renderer, container);
    const { rerender } = renderHook((p: Props) => useKnowledgeRenderer(p), { initialProps: props });
    renderer.setCollapsed.mockClear();

    const collapsed = new Set(['core']);
    rerender({ ...props, collapsedCommunities: collapsed });
    expect(renderer.setCollapsed).toHaveBeenCalledWith(collapsed);
  });

  describe('retarget (Phase 89 Theme E — a layout switch under the same graph)', () => {
    it('retargets, without disposing/remounting, when builtAtCommit is unchanged but the payload object is new', () => {
      const renderer = fakeRenderer();
      const container = document.createElement('div');
      const props = makeProps(renderer, container);
      const { rerender } = renderHook((p: Props) => useKnowledgeRenderer(p), { initialProps: props });
      expect(renderer.mount).toHaveBeenCalledTimes(1);
      renderer.mount.mockClear();
      renderer.dispose.mockClear();

      const relaidOut: KnowledgeGraphPayload = {
        ...PAYLOAD,
        positions: { a: { x: 42, y: 42 } },
      };
      rerender({ ...props, payload: relaidOut });

      expect(renderer.dispose).not.toHaveBeenCalled();
      expect(renderer.mount).not.toHaveBeenCalled();
      expect(renderer.retarget).toHaveBeenCalledTimes(1);
      expect(renderer.retarget).toHaveBeenCalledWith(relaidOut.positions);
    });

    it('does not retarget on the render that just mounted', () => {
      const renderer = fakeRenderer();
      const container = document.createElement('div');
      const props = makeProps(renderer, container);
      renderHook((p: Props) => useKnowledgeRenderer(p), { initialProps: { ...props, payload: null } });
      // First render with a real payload — both effect (1) (mount) and
      // effect (1b) (retarget) see a payload/deps change here; only mount
      // should fire.
      const { rerender } = renderHook((p: Props) => useKnowledgeRenderer(p), { initialProps: props });
      expect(renderer.mount).toHaveBeenCalledTimes(1);
      expect(renderer.retarget).not.toHaveBeenCalled();
      rerender(props);
      expect(renderer.retarget).not.toHaveBeenCalled();
    });

    it('still disposes/remounts (never retargets) when builtAtCommit itself changes', () => {
      const renderer = fakeRenderer();
      const container = document.createElement('div');
      const props = makeProps(renderer, container);
      const { rerender } = renderHook((p: Props) => useKnowledgeRenderer(p), { initialProps: props });

      const nextPayload: KnowledgeGraphPayload = { ...PAYLOAD, builtAtCommit: 'cafebabe' };
      rerender({ ...props, payload: nextPayload });

      expect(renderer.dispose).toHaveBeenCalledTimes(1);
      expect(renderer.mount).toHaveBeenCalledTimes(2);
      expect(renderer.retarget).not.toHaveBeenCalled();
    });
  });

  it('setPaused mirrors every render, not just a paused change', () => {
    const renderer = fakeRenderer();
    const container = document.createElement('div');
    const props = makeProps(renderer, container);
    const { rerender } = renderHook((p: Props) => useKnowledgeRenderer(p), { initialProps: props });
    expect(renderer.setPaused).toHaveBeenLastCalledWith(false);

    rerender({ ...props, paused: true });
    expect(renderer.setPaused).toHaveBeenLastCalledWith(true);
  });
});
