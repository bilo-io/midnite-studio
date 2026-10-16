import { useEffect, useState, type ReactNode } from 'react';

import { useSlidesHost } from './host';

/** Without a highlighter from the host a block simply stays as text — the same fallback a failed highlight takes. */
const NO_HIGHLIGHT = async (): Promise<string> => {
  throw new Error('no highlighter');
};

/** The app's dark theme, read from the document when the host has no theme of its own. */
function useDocumentDark(): boolean {
  return document.documentElement.classList.contains('dark');
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
 * through the host's highlighter (Studio's one shiki instance, the one
 * `code-preview.tsx` uses), not a second dependency. Inline code stays a plain `<code>`.
 */
export function SlideCode({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { highlight = NO_HIGHLIGHT, useIsDark = useDocumentDark } = useSlidesHost();
  const dark = useIsDark();
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
  }, [code, lang, dark, match, highlight]);

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
