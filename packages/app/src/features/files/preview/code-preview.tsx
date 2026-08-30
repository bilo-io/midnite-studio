import { useEffect, useRef, useState } from 'react';

import { useTheme } from '@bilo-io/ui/theme';
import type { Highlighter, ThemedToken } from 'shiki';

import { getHighlighter, HIGHLIGHT_THEME } from '../../../lib/highlighter';
import { useBlameStore } from './blame-store';
import { FindBar } from './find-bar';

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
  showBlame = false,
  repoId,
  relPath,
}: {
  content: string;
  language: string | null;
  /** A find-in-files result's 1-based line — scrolled into view and flashed. */
  highlightLine?: number;
  showGutter?: boolean;
  showBlame?: boolean;
  repoId?: string;
  relPath?: string;
}) {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const tooBigToHighlight = content.length > HIGHLIGHT_CAP_BYTES;
  const containerRef = useRef<HTMLDivElement>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findMatches, setFindMatches] = useState<number[]>([]);
  const [findIdx, setFindIdx] = useState(0);

  const fileKey = repoId && relPath ? `${repoId}:${relPath}` : '';
  const blameResult = useBlameStore((s) => (fileKey ? s.blameCache[fileKey] : undefined));
  const setBlame = useBlameStore((s) => s.setBlame);

  const rawLines = content.split('\n');

  useEffect(() => {
    if (!showBlame || !repoId || !relPath || blameResult) return;
    window.midniteStudio?.blame
      .read({ repoId, relPath, followRenames: true })
      .then((res) => {
        if (res.ok) {
          setBlame(fileKey, res.value);
        }
      })
      .catch(() => undefined);
  }, [showBlame, repoId, relPath, fileKey, blameResult, setBlame]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        const root = containerRef.current;
        if (root && root.contains(document.activeElement)) {
          e.preventDefault();
          setFindOpen(true);
        }
      } else if (e.key === 'Escape' && findOpen) {
        setFindOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [findOpen]);

  const handleFindSearch = (query: string, opts: { matchCase: boolean; useRegex: boolean }) => {
    if (!query) {
      setFindMatches([]);
      setFindIdx(0);
      return;
    }
    const matches: number[] = [];
    rawLines.forEach((lineText, idx) => {
      let isMatch = false;
      if (opts.useRegex) {
        try {
          const rx = new RegExp(query, opts.matchCase ? 'g' : 'gi');
          isMatch = rx.test(lineText);
        } catch {
          isMatch = false;
        }
      } else {
        const needle = opts.matchCase ? query : query.toLowerCase();
        const haystack = opts.matchCase ? lineText : lineText.toLowerCase();
        isMatch = haystack.includes(needle);
      }
      if (isMatch) matches.push(idx + 1);
    });
    setFindMatches(matches);
    setFindIdx(0);
    if (matches.length > 0) {
      const firstLine = matches[0]!;
      const target = containerRef.current?.querySelector<HTMLElement>(`[data-line="${firstLine}"]`);
      target?.scrollIntoView({ block: 'center' });
    }
  };

  const handleFindNext = () => {
    if (findMatches.length === 0) return;
    const nextIdx = (findIdx + 1) % findMatches.length;
    setFindIdx(nextIdx);
    const lineNum = findMatches[nextIdx]!;
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-line="${lineNum}"]`);
    target?.scrollIntoView({ block: 'center' });
  };

  const handleFindPrev = () => {
    if (findMatches.length === 0) return;
    const prevIdx = (findIdx - 1 + findMatches.length) % findMatches.length;
    setFindIdx(prevIdx);
    const lineNum = findMatches[prevIdx]!;
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-line="${lineNum}"]`);
    target?.scrollIntoView({ block: 'center' });
  };

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
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      <FindBar
        isOpen={findOpen}
        onClose={() => setFindOpen(false)}
        onSearch={handleFindSearch}
        onNext={handleFindNext}
        onPrev={handleFindPrev}
        matchCount={findMatches.length}
        currentIndex={findIdx}
      />
      <div
        ref={containerRef}
        className="code-preview min-h-0 flex-1 overflow-auto font-mono text-xs leading-relaxed select-text p-2"
        data-selectable
      >
        <div className="flex flex-col min-w-fit">
          {rawLines.map((lineText, idx) => {
            const lineNum = idx + 1;
            const lineTokens = tokens?.[idx];
            const isHighlighted = lineNum === highlightLine || (findMatches.includes(lineNum) && findMatches[findIdx] === lineNum);
            const blameLine = blameResult?.lines[idx];
            const blameCommit = blameLine ? blameResult.commits[blameLine.sha] : undefined;

            return (
              <div
                key={lineNum}
                data-line={lineNum}
                className={`flex items-start px-2 py-0.5 rounded-sm ${
                  isHighlighted ? 'bg-accent/20 code-preview-hit' : 'hover:bg-muted/30'
                }`}
              >
                {showBlame && (
                  <span className="w-48 flex-shrink-0 text-left pr-3 font-mono text-[10px] text-muted-foreground select-none truncate border-r border-border/40 mr-2 opacity-80">
                    {blameCommit ? (
                      <span title={`${blameCommit.sha} - ${blameCommit.authorName}: ${blameCommit.summary}`}>
                        <span className="text-primary font-semibold mr-1.5">{blameLine?.sha.slice(0, 7)}</span>
                        <span>{blameCommit.authorName.slice(0, 12)}</span>
                      </span>
                    ) : (
                      <span className="opacity-40">loading...</span>
                    )}
                  </span>
                )}
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
    </div>
  );
}
