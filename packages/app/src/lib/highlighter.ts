import { createHighlighter, type Highlighter } from 'shiki';

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

export const HIGHLIGHT_THEME = (dark: boolean): 'github-dark' | 'github-light' =>
  dark ? 'github-dark' : 'github-light';
