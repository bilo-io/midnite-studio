import { useCallback, useSyncExternalStore } from 'react';

import type { DiffLine } from '@midnite/studio-shared';
import type { Highlighter } from 'shiki';

import { getHighlighter, resolveHighlightTheme } from '../../lib/highlighter';
import { languageForFile } from '../../lib/languages';

/** shiki's bundled-language id type — narrower than the plain `string` our own grammar map returns. */
type BundledLanguage = Parameters<Highlighter['codeToTokensBase']>[1]['lang'];

/**
 * Per-line syntax highlighting for diff rows, deferred and cached.
 *
 * Mirrors `services/avatars.ts`: a capped diff is still thousands of rows, and
 * highlighting every one synchronously on open is exactly the scroll-blocking
 * risk `outstanding.md` flagged when this was parked at Phase 12. Instead each
 * row asks for its own highlight the first time it is rendered — scheduled
 * through `requestIdleCallback` so it never competes with a scroll frame — and
 * the result is cached so re-scrolling an already-open diff, or opening the
 * same file again from a different surface (Changes, Graph, Reviews), never
 * re-highlights a row already drawn.
 *
 * Keyed on the file path and the line's own text rather than a hash of it:
 * the text IS the content, so hashing it would only add SubtleCrypto latency
 * (`avatars.ts` hashes because an email is PII it does not want to hold in
 * the clear; a source line has no such reason) for no extra safety — two
 * different lines can never collide on their own literal text.
 *
 * Each line is tokenized on its own, with no grammar state carried from the
 * line before it — so a line continuing a multi-line block comment or a
 * multi-line template literal can render with the wrong colour. Accepted
 * rather than fixed here: a diff's context is capped and hunks can skip
 * arbitrary spans of the file, so there is no reliable "previous line" to
 * carry state from even if this threaded shiki's `GrammarState` through —
 * the same reason GitHub's own diff view tokenizes line-by-line too.
 *
 * Two bounds keep this honest over a long session (Phase 36 F). The cache is a
 * `MAX_ENTRIES`-capped LRU: the key holds the line's full text, so an uncapped
 * map grows for the life of the process as you scroll. And subscribers are
 * keyed, not global: one resolved line used to notify every mounted row, so N
 * rows x M resolutions re-ran N*M snapshots — a virtualized 400-row viewport
 * over a 4000-line diff made that 1.6M calls for one open.
 */

export type HighlightToken = { text: string; color: string | null };

/** Above this, skip highlighting the line and fall back to plain text — a
 *  single minified line can be megabytes, and shiki tokenizes synchronously
 *  once its promise resolves. */
const LINE_HIGHLIGHT_CAP = 4_000;

/** LRU ceiling. A 4000-line diff is ~4k entries per theme, so this holds two
 *  big files in both light and dark before anything is evicted. */
const MAX_ENTRIES = 10_000;

const cache = new Map<string, HighlightToken[] | null>();
const inFlight = new Set<string>();
/** Keyed so a resolution wakes only the rows showing that line. */
const listeners = new Map<string, Set<() => void>>();

/**
 * Read through the LRU. A hit re-inserts, making `cache`'s iteration order
 * least-recently-used first, which is what `cacheSet` evicts from.
 */
function cacheGet(key: string): { hit: boolean; value: HighlightToken[] | null } {
  if (!cache.has(key)) return { hit: false, value: null };
  const value = cache.get(key) ?? null;
  cache.delete(key);
  cache.set(key, value);
  return { hit: true, value };
}

function cacheSet(key: string, value: HighlightToken[] | null): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function notify(key: string): void {
  const forKey = listeners.get(key);
  if (!forKey) return;
  for (const fn of forKey) fn();
}

const cacheKey = (path: string, line: DiffLine, dark: boolean): string =>
  `${dark ? 'd' : 'l'}\0${path}\0${line.kind}\0${line.text}`;

const idle: (fn: () => void) => void =
  typeof requestIdleCallback === 'function'
    ? (fn) => requestIdleCallback(fn)
    : (fn) => setTimeout(fn, 0);

/**
 * Cached tokens for one line, or `null` while unavailable — no grammar for
 * this file, the line is over the cap, highlighting failed, or the row has
 * not been asked for yet. The caller always has `toSegments(line)` to fall
 * back to, so `null` is never a dead end, only "plain for now".
 */
function snapshot(path: string, line: DiffLine | null, dark: boolean): HighlightToken[] | null {
  if (!line) return null;
  const key = cacheKey(path, line, dark);
  const cached = cacheGet(key);
  if (cached.hit) return cached.value;

  const lang = languageForFile(path);
  if (!lang || line.text.length === 0 || line.text.length > LINE_HIGHLIGHT_CAP) {
    cacheSet(key, null);
    return null;
  }

  if (!inFlight.has(key)) {
    inFlight.add(key);
    idle(() => void resolve(key, line.text, lang, dark));
  }
  return null;
}

async function resolve(key: string, text: string, lang: string, dark: boolean): Promise<void> {
  try {
    const highlighter = await getHighlighter();
    // The instance's own `codeToTokensBase` is the CORE method — unlike the
    // module-level shorthand its doc comment reads next to, it does not
    // auto-load a grammar, and throws "Language not found" the first time any
    // particular language is asked for. Same on-demand load `code-preview.tsx`
    // already does for `codeToHtml`.
    if (!highlighter.getLoadedLanguages().includes(lang)) {
      await highlighter.loadLanguage(lang as Parameters<Highlighter['loadLanguage']>[0]);
    }
    const theme = await resolveHighlightTheme(highlighter, dark);
    const lines = await highlighter.codeToTokensBase(text, {
      lang: lang as BundledLanguage,
      theme,
    });
    cacheSet(
      key,
      (lines[0] ?? []).map((token) => ({ text: token.content, color: token.color ?? null })),
    );
  } catch {
    cacheSet(key, null);
  } finally {
    inFlight.delete(key);
    notify(key);
  }
}

function subscribe(key: string, fn: () => void): () => void {
  let forKey = listeners.get(key);
  if (!forKey) {
    forKey = new Set();
    listeners.set(key, forKey);
  }
  forKey.add(fn);
  return () => {
    forKey.delete(fn);
    // Drop the bucket with its last subscriber: `listeners` is keyed on line
    // text too, so leaving empty sets behind would reintroduce the unbounded
    // growth the LRU above exists to stop.
    if (forKey.size === 0) listeners.delete(key);
  };
}

/** Test seam — the LRU's current size, for asserting the cap holds. */
export function __lineHighlightCacheSize(): number {
  return cache.size;
}

/**
 * Test seam — the exact read path `useLineHighlight` takes, minus React.
 * Filling the LRU through `renderHook` means mounting a root per entry, which
 * takes tens of seconds for a cap-sized run; this drives the real `snapshot`
 * instead, so the cache tests exercise production code at data-structure speed.
 */
export function __readLineHighlight(
  path: string,
  line: DiffLine,
  dark: boolean,
): HighlightToken[] | null {
  return snapshot(path, line, dark);
}

/** Test seam — is this line cached, without touching its LRU recency. */
export function __lineHighlightCached(path: string, line: DiffLine, dark: boolean): boolean {
  return cache.has(cacheKey(path, line, dark));
}

/** Test seam — live subscriber buckets, for asserting they do not leak. */
export function __lineHighlightListenerKeys(): number {
  return listeners.size;
}

/** Test seam — the module-level cache would otherwise leak between cases. */
export function __resetLineHighlights(): void {
  cache.clear();
  inFlight.clear();
}

/** A diff row's syntax tokens, re-rendering once a scheduled highlight lands. */
export function useLineHighlight(
  path: string,
  line: DiffLine | null,
  dark: boolean,
): HighlightToken[] | null {
  const key = line ? cacheKey(path, line, dark) : null;
  // Memoized on the key alone: an unstable `subscribe` would make
  // `useSyncExternalStore` tear down and re-add the listener every render.
  const subscribeToKey = useCallback(
    (fn: () => void) => (key === null ? () => {} : subscribe(key, fn)),
    [key],
  );
  return useSyncExternalStore(subscribeToKey, () => snapshot(path, line, dark));
}
