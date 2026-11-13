import { afterEach, describe, expect, it, vi } from 'vitest';

import { isNearBottom, NEAR_BOTTOM_PX, scrollToBottom } from './stick-to-bottom';

/** Vitest: the stick-to-bottom arithmetic Chats and Councils share (moved down from Chats in Phase 133). */

afterEach(() => document.documentElement.removeAttribute('data-motion'));

describe('isNearBottom', () => {
  it('is true within the threshold of the bottom, false beyond it', () => {
    expect(isNearBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 - NEAR_BOTTOM_PX })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 - NEAR_BOTTOM_PX - 1 })).toBe(false);
  });
});

describe('scrollToBottom', () => {
  it('scrolls smoothly unless reduced motion is on', () => {
    const scrollTo = vi.fn();
    const el = { scrollHeight: 800, scrollTo } as unknown as HTMLElement;
    scrollToBottom(el, true);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 800, behavior: 'smooth' });
    document.documentElement.setAttribute('data-motion', 'reduced');
    scrollToBottom(el, true);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 800, behavior: 'auto' });
  });
});
