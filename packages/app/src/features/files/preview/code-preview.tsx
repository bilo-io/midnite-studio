import { useEffect, useRef, useState } from 'react';

import { useTheme } from '@bilo-io/ui/theme';
import type { Highlighter, ThemedToken } from 'shiki';

import { getHighlighter, HIGHLIGHT_THEME } from '../../../lib/highlighter';

/**
 * Tokenize lines via shiki.
 */
async function tokenizeLines(
  code: string,
  lang: string | null,
  dark: boolean,
): Promise<ThemedToken[][] | null> {
  const highlighter = await getHighlighter();
  let language = lang;
  if (language && !highlighter.getLoadedLanguages().includes(language)) {
    try {
      await highlighter.loadLanguage(language as Parameters<Highlighter['loadLanguage']>[0]);
    } catch {
      language = null;
    }
  }
  if (!language) {
    return null;
  }
  const theme = HIGHLIGHT_THEME(dark);
  const result = highlighter.codeToTokens(code, {
    lang: language as Parameters<Highlighter['codeToTokens']>[1]['lang'],
    theme,
  });
  return result.tokens;

}

/**
 * Above this, skip highlighting entirely and fall back to the plain lines.
 */
const HIGHLIGHT_CAP_BYTES = 200 * 1024;

export function CodePreview({
  content,
  language,
  highlightLine,
  showGutter = true,
}: {
  content: string;
  language: string | null;
  /** A find-in-files result's 1-based line — scrolled into view and flashed. */
  highlightLine?: number;
  showGutter?: boolean;
}) {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const tooBigToHighlight = content.length > HIGHLIGHT_CAP_BYTES;
  const containerRef = useRef<HTMLDivElement>(null);

  const rawLines = content.split('\n');


  useEffect(() => {
    let cancelled = false;
    setTokens(null);
    if (tooBigToHighlight) return;
    tokenizeLines(content, language, dark)
      .then((result) => {
        if (!cancelled) setTokens(result);
      })
      .catch(() => {
        if (!cancelled) setTokens(null);
      });
    return () => {
      cancelled = true;
    };
  }, [content, language, dark, tooBigToHighlight]);

  useEffect(() => {
    if (highlightLine === undefined) return;
    const root = containerRef.current;
    const target = root?.querySelector<HTMLElement>(`[data-line="${highlightLine}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    target.classList.add('code-preview-hit');
    return () => target.classList.remove('code-preview-hit');
  }, [tokens, highlightLine]);

  return (
    <div
      ref={containerRef}
      className="code-preview min-h-0 flex-1 overflow-auto font-mono text-xs leading-relaxed select-text p-2"
      data-selectable
    >
      <div className="flex flex-col min-w-fit">
        {rawLines.map((lineText, idx) => {
          const lineNum = idx + 1;
          const lineTokens = tokens?.[idx];
          const isHighlighted = lineNum === highlightLine;

          return (
            <div
              key={lineNum}
              data-line={lineNum}
              className={`flex items-start px-2 py-0.5 rounded-sm ${
                isHighlighted ? 'bg-accent/20 code-preview-hit' : 'hover:bg-muted/30'
              }`}
            >
              {showGutter && (
                <span
                  className="w-10 flex-shrink-0 text-right pr-4 text-muted-foreground select-none font-mono opacity-50"
                  aria-hidden="true"
                >
                  {lineNum}
                </span>
              )}
              <span className="flex-1 whitespace-pre font-mono">
                {lineTokens ? (
                  lineTokens.map((token, tIdx) => (
                    <span
                      key={tIdx}
                      style={{ color: token.color, fontStyle: token.fontStyle === 1 ? 'italic' : undefined }}
                    >
                      {token.content}
                    </span>
                  ))
                ) : (
                  lineText || '\u00A0'
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
