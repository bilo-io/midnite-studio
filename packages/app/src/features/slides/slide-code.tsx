import { useEffect, useState, type ReactNode } from 'react';

import { useTheme } from '@bilo-io/ui/theme';
import type { Highlighter } from 'shiki';

import { getHighlighter, HIGHLIGHT_THEME } from '../../lib/highlighter';

/** Matches `code-preview.tsx`'s own `highlight()` — same highlighter instance, same fallback-to-plain-on-any-failure rule. */
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
  return highlighter.codeToHtml(code, { lang: language ?? 'text', theme: HIGHLIGHT_THEME(dark) });
}

/**
 * react-markdown's `pre` override for a slide step: a passthrough, so `code`
 * below supplies the whole wrapper rather than nesting inside react-markdown's
 * default `<pre>`.
 */
export function SlidePre({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

/**
 * react-markdown's `code` override for a slide step. A fenced block (carries
 * a `language-*` className, per remark's own convention) is highlighted
 * through the app's one shiki instance — matching `code-preview.tsx`'s
 * highlighter, not a second dependency. Inline code stays a plain `<code>`.
 */
export function SlideCode({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match?.[1] ?? null;
  const code = typeof children === 'string' ? children.replace(/\n$/, '') : '';
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (lang === null && match === null) return;
    let cancelled = false;
    highlight(code, lang, dark)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang, dark, match]);

  if (match === null) return <code className={className}>{children}</code>;

  if (html === null) {
    return (
      <pre className="overflow-auto rounded-md bg-muted/40 p-3 text-xs" data-selectable>
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <div
      className="[&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:!bg-muted/40 [&_pre]:p-3 [&_pre]:text-xs"
      data-selectable
      // shiki's output is generated markup over our own step's source text —
      // the same trust boundary `code-preview.tsx` already accepts.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
