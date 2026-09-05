import { createHighlighter, type BundledTheme, type Highlighter } from 'shiki';

import { resolveActiveHighlightTheme } from '../features/themes/resolve-palette';

/**
 * shiki, as one lazy singleton shared by every highlighted surface in the app
 * — the Files preview pane (`code-preview.tsx`) and diff rows
 * (`features/diff/line-highlight.ts`) alike.
 *
 * Built with both themes and NO grammars: `loadLanguage`/`codeToTokensBase`
 * pull each grammar on first use and Vite code-splits every one, so the
 * initial bundle carries the engine and nothing else. One instance rather
 * than one per caller — two would double the WASM engine and duplicate every
 * grammar the other already loaded.
 */
/**
 * Grammars are never unloaded once `loadLanguage` pulls one in, so this grows
 * with the number of distinct languages viewed in a session — accepted in
 * Phase 36 F's memory sweep rather than capped: the bound is the language
 * count (tens, not thousands), and evicting a grammar only means re-paying its
 * dynamic import the next time that file type is opened.
 */
let highlighterPromise: Promise<Highlighter> | null = null;
export const getHighlighter = (): Promise<Highlighter> =>
  (highlighterPromise ??= createHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: [],
  }));

/**
 * The Shiki theme id for a resolved dark/light mode — widened from a literal
 * `'github-dark' | 'github-light'` union to `BundledTheme` (Decision 8, x1):
 * the id now comes from the ACTIVE studio palette
 * (`features/themes/palette-store.ts`), not a hard-coded pair, so selecting
 * "Monokai" reaches the read-only preview, diff rows and slide code blocks
 * too — the three consumers TypeScript lists at every call site once the
 * return type stops being a two-value literal.
 *
 * Async because a non-default palette's theme may not be loaded into the
 * shared highlighter yet — see `resolveHighlightTheme`, which every consumer
 * must call instead of using this id directly against `codeToTokens`/
 * `codeToHtml`.
 */
export const HIGHLIGHT_THEME = async (dark: boolean): Promise<BundledTheme> =>
  resolveActiveHighlightTheme(dark);

/**
 * Ensures `theme` is loaded into the shared highlighter before a caller hands
 * it to `codeToTokens`/`codeToHtml` — Shiki throws if a theme id was never
 * loaded at creation or via `loadTheme`, and the highlighter is created with
 * only `github-dark`/`github-light` to keep every other bundled theme
 * code-split. Falls back to the github pair on a failed load (an unbundled
 * or misspelled id) rather than throwing into a render path — the same
 * degrade-gracefully rule this file's callers already follow for grammars.
 */
export async function resolveHighlightTheme(
  highlighter: Highlighter,
  dark: boolean,
): Promise<BundledTheme> {
  const theme = await HIGHLIGHT_THEME(dark);
  if (highlighter.getLoadedThemes().includes(theme)) return theme;
  try {
    await highlighter.loadTheme(theme);
    return theme;
  } catch {
    return dark ? 'github-dark' : 'github-light';
  }
}
