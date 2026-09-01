import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffLine } from '@midnite/studio-shared';

/**
 * Phase 36 F. Two properties, both of which the pre-phase implementation broke
 * on a long session: the cache is bounded, and a resolution wakes only the rows
 * showing that one line.
 *
 * The highlighter is mocked rather than driven for real — shiki's WASM engine
 * plus a grammar load per language makes this suite seconds slower for no extra
 * confidence about the two things under test, which are the cache and the
 * listener map, not shiki's tokens.
 */
vi.mock('../../lib/highlighter', () => ({
  getHighlighter: async () => ({
    getLoadedLanguages: () => ['typescript'],
    loadLanguage: async () => undefined,
    codeToTokensBase: async (text: string) => [[{ content: text, color: '#abcdef' }]],
  }),
  HIGHLIGHT_THEME: () => 'github-dark',
}));

const {
  __lineHighlightCacheSize,
  __lineHighlightCached,
  __lineHighlightListenerKeys,
  __readLineHighlight,
  __resetLineHighlights,
  useLineHighlight,
} = await import('./line-highlight');

const line = (text: string): DiffLine => ({
  kind: 'ctx',
  oldNo: 1,
  newNo: 1,
  text,
  ranges: [],
  noNewline: false,
});

/** An extension `languageForFile` has no grammar for, so `snapshot` caches
 *  `null` synchronously — the cheapest way to exercise the LRU without waiting
 *  on a highlight per entry. */
const NO_GRAMMAR = 'notes.zzz';

describe('line-highlight LRU', () => {
  beforeEach(() => {
    __resetLineHighlights();
  });

  it('never grows past the cap', () => {
    for (let i = 0; i < 10_400; i += 1) {
      __readLineHighlight(NO_GRAMMAR, line(`line ${i}`), true);
    }

    expect(__lineHighlightCacheSize()).toBe(10_000);
  });

  it('evicts least-recently-used, not least-recently-added', () => {
    const first = line('line 0');
    for (let i = 0; i < 10_000; i += 1) {
      __readLineHighlight(NO_GRAMMAR, line(`line ${i}`), true);
    }
    expect(__lineHighlightCached(NO_GRAMMAR, first, true)).toBe(true);

    // Re-read entry 0, making it the most recent, then overflow by one.
    __readLineHighlight(NO_GRAMMAR, first, true);
    __readLineHighlight(NO_GRAMMAR, line('overflow'), true);

    expect(__lineHighlightCacheSize()).toBe(10_000);
    // Entry 0 survives because it was touched; entry 1 is now the oldest.
    expect(__lineHighlightCached(NO_GRAMMAR, first, true)).toBe(true);
    expect(__lineHighlightCached(NO_GRAMMAR, line('line 1'), true)).toBe(false);
  });

  it('caches light and dark separately', () => {
    const same = line('const x = 1;');
    __readLineHighlight(NO_GRAMMAR, same, true);
    __readLineHighlight(NO_GRAMMAR, same, false);

    expect(__lineHighlightCacheSize()).toBe(2);
  });
});

describe('line-highlight subscribers', () => {
  beforeEach(() => {
    __resetLineHighlights();
  });

  it('wakes only the rows showing the resolved line', async () => {
    let renderedA = 0;
    let renderedB = 0;

    // A resolves through the mocked highlighter. B is over LINE_HIGHLIGHT_CAP,
    // so it is cached plain immediately and never resolves — with a single
    // global listener set, A's resolution re-rendered B all the same.
    const overCap = 'x'.repeat(4_001);

    renderHook(() => {
      renderedA += 1;
      return useLineHighlight('a.ts', line('const a = 1;'), true);
    });
    renderHook(() => {
      renderedB += 1;
      return useLineHighlight('b.ts', line(overCap), true);
    });

    const rendersBefore = renderedB;

    await waitFor(() => {
      expect(renderedA).toBeGreaterThan(1);
    });

    expect(renderedB).toBe(rendersBefore);
  });

  it('drops a listener bucket once its last row unmounts', () => {
    // A delta, not an absolute: `__resetLineHighlights` deliberately leaves
    // `listeners` alone (clearing it would strand rows still on screen), and
    // the cases above mount thousands of rows they never unmount.
    const before = __lineHighlightListenerKeys();

    const { unmount } = renderHook(() =>
      useLineHighlight('unmount-probe.ts', line('const a = 1;'), true),
    );
    expect(__lineHighlightListenerKeys()).toBe(before + 1);

    unmount();

    expect(__lineHighlightListenerKeys()).toBe(before);
  });
});
