import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GLOW_LAYER_ATTR, RefAgentGlowBleed } from './ref-agent-glow-bleed';

/**
 * `RefAgentGlowBleed` portals to `document.body`, positioned from the
 * anchor's own `getBoundingClientRect()` — the same escape hatch
 * `ref-badge.tsx`'s `SyncOverlay` and `ref-agent-avatar.tsx`'s
 * `RefAgentAvatar` use for the identical pair of traps (an `overflow-hidden`
 * cell, a `transform`-bearing virtualized row). These are the pure
 * positioning contracts: it reads the anchor's rect when active, renders
 * nothing when inactive or unmeasured, and recomputes that rect on scroll —
 * jsdom, no real layout engine needed for any of it.
 */
describe('RefAgentGlowBleed', () => {
  afterEach(cleanup);

  function makeAnchor(rect: Partial<DOMRect>) {
    const anchor = createRef<HTMLElement>();
    const node = document.createElement('span');
    node.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {}, ...rect }) as DOMRect;
    document.body.appendChild(node);
    (anchor as { current: HTMLElement }).current = node;
    return anchor;
  }

  it('renders nothing while inactive', () => {
    const anchor = makeAnchor({ left: 10, top: 20, width: 60, height: 18 });
    const { queryByTestId } = render(
      <RefAgentGlowBleed anchor={anchor} active={false} colorIdx={0} palette="vivid" />,
    );
    expect(queryByTestId('ref-agent-glow-bleed')).toBeNull();
  });

  it('positions the portalled halo at the anchor chip\'s own rect', () => {
    const anchor = makeAnchor({ left: 12, top: 34, width: 64, height: 20 });
    const { getByTestId } = render(
      <RefAgentGlowBleed anchor={anchor} active={true} colorIdx={0} palette="vivid" />,
    );

    const glow = getByTestId('ref-agent-glow-bleed');
    expect(glow.style.left).toBe('12px');
    expect(glow.style.top).toBe('34px');
    expect(glow.style.width).toBe('64px');
    expect(glow.style.height).toBe('20px');
    // Portalled to <body>, not nested under the anchor's own tree.
    expect(glow.parentElement).toBe(document.body);
  });

  it('recomputes the rect on scroll rather than closing, throttled to a single rAF', () => {
    const anchor = makeAnchor({ left: 0, top: 0, width: 50, height: 16 });
    const { getByTestId } = render(
      <RefAgentGlowBleed anchor={anchor} active={true} colorIdx={0} palette="vivid" />,
    );

    let raf: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      raf = cb;
      return 1;
    });

    anchor.current!.getBoundingClientRect = () =>
      ({ left: 99, top: 88, width: 50, height: 16, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      raf?.(0);
    });

    const glow = getByTestId('ref-agent-glow-bleed');
    expect(glow.style.left).toBe('99px');
    expect(glow.style.top).toBe('88px');

    vi.unstubAllGlobals();
  });

  it('stops rendering once active flips back to false', () => {
    const anchor = makeAnchor({ left: 1, top: 2, width: 3, height: 4 });
    const { queryByTestId, rerender } = render(
      <RefAgentGlowBleed anchor={anchor} active={true} colorIdx={0} palette="vivid" />,
    );
    expect(queryByTestId('ref-agent-glow-bleed')).not.toBeNull();

    rerender(<RefAgentGlowBleed anchor={anchor} active={false} colorIdx={0} palette="vivid" />);
    expect(queryByTestId('ref-agent-glow-bleed')).toBeNull();
  });

  it("carries the branch's own lane colour, not a fixed identity colour — the portal is not a DOM descendant of the chip, so it cannot inherit --lane-h/s/l and sets its own copy", () => {
    const anchor = makeAnchor({ left: 0, top: 0, width: 40, height: 16 });
    const { getByTestId } = render(
      <RefAgentGlowBleed anchor={anchor} active={true} colorIdx={4} palette="vivid" />,
    );

    const glow = getByTestId('ref-agent-glow-bleed');
    expect(glow.className).toContain('ref-badge-agent-arc-glow');
    expect(glow.style.getPropertyValue('--lane-h')).not.toBe('');
    expect(glow.style.getPropertyValue('--lane-s')).toMatch(/%$/);
    expect(glow.style.getPropertyValue('--lane-l')).toMatch(/%$/);
  });

  it('carries z-graph-glow class to stack below terminal frame (z-10) and does not use hardcoded z-[46]', () => {
    const anchor = makeAnchor({ left: 10, top: 20, width: 60, height: 18 });
    const { getByTestId } = render(
      <RefAgentGlowBleed anchor={anchor} active={true} colorIdx={0} palette="vivid" />,
    );

    const glow = getByTestId('ref-agent-glow-bleed');
    expect(glow.className).toContain('z-graph-glow');
    expect(glow.className).not.toContain('z-[46]');
  });

  it('renders nothing when the anchor has zero width and height (hidden/unrendered)', () => {
    const anchor = makeAnchor({ left: 0, top: 0, width: 0, height: 0 });
    const { queryByTestId } = render(
      <RefAgentGlowBleed anchor={anchor} active={true} colorIdx={0} palette="vivid" />,
    );
    expect(queryByTestId('ref-agent-glow-bleed')).toBeNull();
  });

  it('does not render when anchor is scrolled out of its role="grid" container', () => {
    const grid = document.createElement('div');
    grid.setAttribute('role', 'grid');
    grid.getBoundingClientRect = () =>
      ({ left: 0, top: 100, width: 800, height: 400, right: 800, bottom: 500, x: 0, y: 100, toJSON() {} }) as DOMRect;
    document.body.appendChild(grid);

    const anchor = createRef<HTMLElement>();
    const node = document.createElement('span');
    // Anchor scrolled far below grid bottom (e.g. top: 600 > 500 + 12):
    node.getBoundingClientRect = () =>
      ({ left: 50, top: 600, width: 60, height: 20, right: 110, bottom: 620, x: 50, y: 600, toJSON() {} }) as DOMRect;
    grid.appendChild(node);
    (anchor as { current: HTMLElement }).current = node;

    let raf: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      raf = cb;
      return 1;
    });

    const { queryByTestId } = render(
      <RefAgentGlowBleed anchor={anchor} active={true} colorIdx={0} palette="vivid" />,
    );
    expect(queryByTestId('ref-agent-glow-bleed')).toBeNull();

    // Now position within grid bounds and trigger scroll update:
    node.getBoundingClientRect = () =>
      ({ left: 50, top: 200, width: 60, height: 20, right: 110, bottom: 220, x: 50, y: 200, toJSON() {} }) as DOMRect;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      raf?.(0);
    });
    expect(queryByTestId('ref-agent-glow-bleed')).not.toBeNull();

    vi.unstubAllGlobals();
  });
  describe('inside a glow layer (the graph scroller content)', () => {
    function makeLayered(layerTop: number, chipTop: number) {
      const layer = document.createElement('div');
      layer.setAttribute(GLOW_LAYER_ATTR, '');
      let origin = { left: 200, top: layerTop };
      layer.getBoundingClientRect = () =>
        ({ ...origin, width: 800, height: 4000, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
      const node = document.createElement('span');
      let chip = { left: 212, top: chipTop };
      node.getBoundingClientRect = () =>
        ({ ...chip, width: 64, height: 20, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
      layer.appendChild(node);
      document.body.appendChild(layer);
      const anchor = createRef<HTMLElement>();
      (anchor as { current: HTMLElement }).current = node;
      return {
        layer,
        anchor,
        move(dy: number) {
          origin = { ...origin, top: origin.top + dy };
          chip = { ...chip, top: chip.top + dy };
        },
      };
    }

    it('portals into the layer, positioned relative to it, so it is clipped by the scroller and goes behind the uncommitted/stash rows above it', () => {
      const { layer, anchor } = makeLayered(100, 144);
      const { getByTestId } = render(
        <RefAgentGlowBleed anchor={anchor} active={true} colorIdx={0} palette="vivid" />,
      );
      const glow = getByTestId('ref-agent-glow-bleed');
      expect(glow.parentElement).toBe(layer);
      expect(glow.className).toContain('absolute');
      expect(glow.className).not.toContain('fixed');
      expect(glow.style.left).toBe('12px');
      expect(glow.style.top).toBe('44px');
    });

    it('stays on target when the whole graph shifts with no scroll or resize event (e.g. the uncommitted row mounting above it at launch)', () => {
      const { anchor, move } = makeLayered(100, 144);
      const { getByTestId } = render(
        <RefAgentGlowBleed anchor={anchor} active={true} colorIdx={0} palette="vivid" />,
      );
      move(43);
      const glow = getByTestId('ref-agent-glow-bleed');
      expect(glow.style.top).toBe('44px');
      expect(glow.style.left).toBe('12px');
    });
  });
});
