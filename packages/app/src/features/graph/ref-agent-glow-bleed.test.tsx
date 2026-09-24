import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RefAgentGlowBleed } from './ref-agent-glow-bleed';

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
    const { queryByTestId } = render(<RefAgentGlowBleed anchor={anchor} active={false} />);
    expect(queryByTestId('ref-agent-glow-bleed')).toBeNull();
  });

  it('positions the portalled halo at the anchor chip\'s own rect', () => {
    const anchor = makeAnchor({ left: 12, top: 34, width: 64, height: 20 });
    const { getByTestId } = render(<RefAgentGlowBleed anchor={anchor} active={true} />);

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
    const { getByTestId } = render(<RefAgentGlowBleed anchor={anchor} active={true} />);

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
    const { queryByTestId, rerender } = render(<RefAgentGlowBleed anchor={anchor} active={true} />);
    expect(queryByTestId('ref-agent-glow-bleed')).not.toBeNull();

    rerender(<RefAgentGlowBleed anchor={anchor} active={false} />);
    expect(queryByTestId('ref-agent-glow-bleed')).toBeNull();
  });
});
