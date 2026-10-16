import { cloneElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { FileDiff } from '@midnite/studio-shared';

/**
 * Agents' plain chrome (Phase 113 Theme N) — the smallest implementation of each seam the chats,
 * councils and models features declare. Studio's own are wired to its dismiss stack, content-area
 * clamping and Monaco/Shiki; Agents has one window and no embedded browser, so each member here is
 * what does the job: a portalled modal, a click-open popover, the native tooltip, an initials avatar,
 * react-markdown, and a `<pre>` for code and diffs.
 */

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-[420px]', md: 'max-w-[640px]', lg: 'max-w-[900px]', full: 'max-w-none w-full h-full' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className={`max-h-full w-full overflow-auto rounded-lg border border-border bg-card text-card-foreground shadow-xl ${width}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Popover({
  trigger,
  children,
  side = 'top',
  align = 'end',
  label,
  title,
  disabled = false,
  panelClassName = '',
  triggerClassName,
  open: controlled,
  onOpenChange,
  testId,
}: {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  label: string;
  title?: string;
  disabled?: boolean;
  panelClassName?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
}) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const set = (next: boolean): void => {
    setInner(next);
    onOpenChange?.(next);
  };
  const edge = align === 'start' ? 'left-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0';
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={title}
        disabled={disabled}
        className={triggerClassName}
        onClick={() => set(!open)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          data-testid={testId}
          className={`absolute z-40 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg ${edge} ${side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} ${panelClassName}`}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}

/** The native tooltip: a `title` on the one trigger, which is all a plain window needs. */
export function Tooltip({ label, children }: { label: ReactNode; side?: 'top' | 'bottom' | 'right'; children: ReactElement<Record<string, unknown>> }) {
  return typeof label === 'string' ? cloneElement(children, { title: label }) : children;
}

/** Initials on a deterministic hue — no network, no Gravatar. */
export function UserAvatar({ login, name, size = 16 }: { login?: string | null | undefined; name?: string | null | undefined; src?: string | null | undefined; size?: number; withTooltip?: boolean }) {
  const text = (name ?? login ?? '?').trim() || '?';
  const initials = text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  const hue = [...text].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 360, 7);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.42), backgroundColor: `hsl(${hue} 55% 45%)` }}
    >
      {initials}
    </span>
  );
}

export function MarkdownBody({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`min-w-0 max-w-none break-words text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ${className}`} data-selectable>
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
}

/** Plain monospace text — no highlighter, no gutter. */
export function CodePreview({ content }: { content: string; language: string | null; showGutter?: boolean }) {
  return <pre className="m-0 h-full overflow-auto p-3 font-mono text-xs leading-relaxed">{content}</pre>;
}

const LINE_MARK = { add: '+', del: '-', ctx: ' ' } as const;

/** A unified diff as plain rows, with the per-hunk controls the chat review hands in. */
export function DiffView({
  diff,
  isLoading = false,
  emptyMessage,
  renderHunkActions,
}: {
  diff: FileDiff | undefined;
  isLoading?: boolean;
  emptyMessage?: string | null;
  renderHunkActions?: (hunkIndex: number) => ReactNode;
}) {
  if (isLoading || !diff) return <p className="p-3 text-xs text-muted-foreground">{isLoading ? 'Loading the diff…' : (emptyMessage ?? 'No diff.')}</p>;
  if (diff.hunks.length === 0) return <p className="p-3 text-xs text-muted-foreground">{emptyMessage ?? 'No textual changes.'}</p>;
  return (
    <div className="h-full overflow-auto font-mono text-[11px] leading-snug" data-testid="plain-diff">
      {diff.hunks.map((hunk, index) => (
        <section key={`${hunk.oldStart}-${hunk.newStart}-${index}`}>
          <header className="sticky top-0 flex items-center gap-2 bg-muted px-2 py-0.5 text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@ {hunk.heading}
            </span>
            {renderHunkActions?.(index)}
          </header>
          {hunk.lines.map((line, i) => (
            <div
              key={i}
              className={`whitespace-pre px-2 ${line.kind === 'add' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : line.kind === 'del' ? 'bg-red-500/10 text-red-700 dark:text-red-400' : ''}`}
            >
              {LINE_MARK[line.kind as keyof typeof LINE_MARK] ?? ' '}
              {line.text}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
