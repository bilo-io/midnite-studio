import { useEffect, useState, type ReactNode } from 'react';

import { useTheme } from '@bilo-io/ui/theme';
import { LuCheck, LuCopy } from 'react-icons/lu';
import type { Highlighter } from 'shiki';

import { getHighlighter, resolveHighlightTheme } from '../../../lib/highlighter';

/**
 * `pre`/`code` overrides for the Files markdown preview. Fenced blocks are
 * highlighted through the app's one shiki instance (grammars load lazily, so
 * nothing joins the entry chunk); ```diff / ```patch blocks and blocks whose
 * content is plainly a unified diff render as line-styled diffs using the same
 * `success` / `destructive` tokens as `features/diff/diff-cell.tsx`.
 */

const DIFF_LANGS = new Set(['diff', 'patch', 'udiff']);

export type DiffLineKind = 'add' | 'del' | 'ctx' | 'hunk' | 'file';

export function classifyDiffLine(line: string): DiffLineKind {
  if (/^(diff --git |index [0-9a-f]+\.\.|--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename (from|to) )/.test(line)) {
    return 'file';
  }
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'ctx';
}

/** True when untagged/unknown-language content is clearly a unified diff. */
export function looksLikeUnifiedDiff(code: string): boolean {
  const lines = code.split('\n');
  return (
    lines.some((l) => l.startsWith('@@ ')) &&
    lines.some((l) => l.startsWith('+') || l.startsWith('-')) ||
    (lines.some((l) => l.startsWith('--- ')) && lines.some((l) => l.startsWith('+++ ')))
  );
}

const DIFF_ROW: Record<DiffLineKind, string> = {
  add: 'bg-success/10 text-success',
  del: 'bg-destructive/10 text-destructive',
  ctx: 'text-muted-foreground',
  hunk: 'bg-primary/10 text-primary',
  file: 'font-semibold text-foreground',
};
const DIFF_MARKER: Record<DiffLineKind, string> = { add: '+', del: '−', ctx: ' ', hunk: '', file: '' };

function DiffBlock({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <div className="font-mono text-xs" data-testid="md-diff">
      {lines.map((line, i) => {
        const kind = classifyDiffLine(line);
        const body = kind === 'add' || kind === 'del' || kind === 'ctx' ? line.slice(1) : line;
        return (
          <div key={i} data-diff-kind={kind} className={`flex whitespace-pre px-2 ${DIFF_ROW[kind]}`}>
            <span
              aria-hidden
              className={`mr-2 w-3 shrink-0 select-none ${kind === 'add' ? 'text-success' : kind === 'del' ? 'text-destructive' : ''}`}
            >
              {DIFF_MARKER[kind]}
            </span>
            <span>{body || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}

async function highlight(code: string, lang: string, dark: boolean): Promise<string | null> {
  const highlighter = await getHighlighter();
  if (!highlighter.getLoadedLanguages().includes(lang)) {
    try {
      await highlighter.loadLanguage(lang as Parameters<Highlighter['loadLanguage']>[0]);
    } catch {
      return null; // unknown grammar: plain monospace
    }
  }
  const theme = await resolveHighlightTheme(highlighter, dark);
  return highlighter.codeToHtml(code, { lang, theme });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy code"
      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? <LuCheck className="size-3.5" /> : <LuCopy className="size-3.5" />}
    </button>
  );
}

/** react-markdown `pre` override: passthrough, `MarkdownCode` supplies the wrapper. */
export function MarkdownPre({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function MarkdownCode({ className, children }: { className?: string; children?: ReactNode }) {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  const match = /language-([\w+#-]+)/.exec(className ?? '');
  const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : '';
  const isBlock = match !== null || text.includes('\n');
  const code = text.replace(/\n$/, '');
  const lang = match?.[1]?.toLowerCase() ?? null;
  const isDiff = isBlock && ((lang !== null && DIFF_LANGS.has(lang)) || (lang === null && looksLikeUnifiedDiff(code)));
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    setHtml(null);
    if (!isBlock || isDiff || lang === null) return;
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
  }, [isBlock, isDiff, code, lang, dark]);

  if (!isBlock) return <code className={className}>{children}</code>;

  return (
    <div className="my-2 overflow-hidden rounded border border-border bg-muted/40" data-selectable data-testid="md-code-block">
      <div className="flex items-center justify-between border-b border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span data-testid="md-code-lang">{isDiff ? 'diff' : (lang ?? '')}</span>
        <CopyButton text={code} />
      </div>
      <div className="overflow-x-auto p-2">
        {isDiff ? (
          <DiffBlock code={code} />
        ) : html !== null ? (
          <div
            className="[&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:text-xs"
            // shiki output over our own document text — same trust boundary as code-preview.tsx.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="!m-0 !bg-transparent !p-0 font-mono text-xs">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
