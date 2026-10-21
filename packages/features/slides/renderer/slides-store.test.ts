import { beforeEach, describe, expect, it } from 'vitest';

import { useSlidesStore } from './slides-store';

/**
 * Theme G's net-new suite. Every action already has behavior exercised
 * indirectly (through `PresentButton`, `MarkdownPreview`, `PrOverview`, the
 * `markdown.presentAsSlides` command handler) but nothing asserted the store
 * itself round-trips, or that `presentActive()` is a safe no-op with nothing
 * claimed — the second real gap the phase doc calls out.
 */
describe('useSlidesStore', () => {
  beforeEach(() => {
    useSlidesStore.setState({ deck: null, activeMarkdown: null });
  });

  it('present() opens a deck directly from a source, bypassing activeMarkdown', () => {
    useSlidesStore.getState().present({ content: '# Hello', label: 'Doc' });
    expect(useSlidesStore.getState().deck).toEqual({ content: '# Hello', label: 'Doc' });
  });

  it('setActiveMarkdown() sets and clears the slot', () => {
    useSlidesStore.getState().setActiveMarkdown({ content: '# A', label: 'A' });
    expect(useSlidesStore.getState().activeMarkdown).toEqual({ content: '# A', label: 'A' });

    useSlidesStore.getState().setActiveMarkdown(null);
    expect(useSlidesStore.getState().activeMarkdown).toBeNull();
  });

  it('presentActive() opens the deck from whatever activeMarkdown currently holds', () => {
    useSlidesStore.getState().setActiveMarkdown({ content: '# B', label: 'B' });
    useSlidesStore.getState().presentActive();
    expect(useSlidesStore.getState().deck).toEqual({ content: '# B', label: 'B' });
  });

  it('close() clears the open deck without touching activeMarkdown', () => {
    useSlidesStore.getState().setActiveMarkdown({ content: '# C', label: 'C' });
    useSlidesStore.getState().present({ content: '# C', label: 'C' });
    useSlidesStore.getState().close();
    expect(useSlidesStore.getState().deck).toBeNull();
    expect(useSlidesStore.getState().activeMarkdown).toEqual({ content: '# C', label: 'C' });
  });

  it('presentActive() on an empty slot is a no-op, not a throw — the second Theme G gap', () => {
    expect(useSlidesStore.getState().activeMarkdown).toBeNull();
    expect(() => useSlidesStore.getState().presentActive()).not.toThrow();
    expect(useSlidesStore.getState().deck).toBeNull();
  });
});
