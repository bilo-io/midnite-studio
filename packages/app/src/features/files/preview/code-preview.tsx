import { useEffect, useState } from 'react';

import { useTheme } from '@bilo-io/ui/theme';
import type { Highlighter } from 'shiki';

import { getHighlighter, HIGHLIGHT_THEME } from '../../../lib/highlighter';

/**
 * Failures at any stage degrade to a plain <pre>: a preview that can't colour
 * code should still show it.
 */
async function highlight(code: string, lang: string | null, dark: boolean): Promise<string> {
  const highlighter = await getHighlighter();
  let language = lang;
  if (language && !highlighter.getLoadedLanguages().includes(language)) {
    try {
      await highlighter.loadLanguage(language as Parameters<Highlighter['loadLanguage']>[0]);
    } catch {
      language = null;
    }
  }
  return highlighter.codeToHtml(code, {
    lang: language ?? 'text',
    theme: HIGHLIGHT_THEME(dark),
  });
}

/**
 * Above this, skip highlighting entirely and fall back to the plain <pre>.
 * The IPC cap (1.5 MB) is about what may cross the boundary; this one is
 * about the render thread — shiki tokenizes synchronously and a minified
 * bundle would freeze the UI and inject a span-per-token DOM.
 */
const HIGHLIGHT_CAP_BYTES = 200 * 1024;

export function CodePreview({ content, language }: { content: string; language: string | null }) {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  const [html, setHtml] = useState<string | null>(null);
  const tooBigToHighlight = content.length > HIGHLIGHT_CAP_BYTES;

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    if (tooBigToHighlight) return;
    highlight(content, language, dark)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [content, language, dark, tooBigToHighlight]);

  if (html === null) {
    return (
      <pre className="overflow-auto p-3 font-mono text-xs leading-relaxed" data-selectable>
        {content}
      </pre>
    );
  }

  return (
    <div
      className="code-preview min-h-0 overflow-auto text-xs [&_pre]:!bg-transparent [&_pre]:p-3"
      data-selectable
      // shiki's output is generated markup over OUR text content — the exact
      // use dangerouslySetInnerHTML exists for. No user HTML passes through.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
