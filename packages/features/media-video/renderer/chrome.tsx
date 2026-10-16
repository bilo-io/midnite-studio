import { useEffect, useId, useState } from 'react';
import { LuFile, LuFolder, LuFolderOpen } from 'react-icons/lu';

import { useVideoHost, type VideoChrome, type VideoModalProps, type VideoTreeSectionProps } from './host';

/**
 * Plain versions of the chrome Video draws with (Phase 113 Theme Q) — what an app
 * that does not hand over its own through the host port shows. Studio's are its
 * Modal, its markdown preview, its file-type glyphs and its skeleton.
 */
function PlainModal({ open, onClose, title, size = 'md', testId, children }: VideoModalProps) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', full: 'h-[90vh] max-w-[95vw]' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className={`w-full overflow-hidden rounded-lg border border-border bg-popover shadow-xl ${width}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span id={titleId} className="sr-only">
          {title}
        </span>
        {children}
      </div>
    </div>
  );
}

function PlainMarkdown({ content }: { content: string }) {
  return <pre className="whitespace-pre-wrap break-words font-sans text-xs text-foreground">{content}</pre>;
}

function PlainTreeSection({ title, collapsible = false, open = true, onToggle, children }: VideoTreeSectionProps) {
  const [local, setLocal] = useState(true);
  const shown = collapsible ? open : local;
  return (
    <section>
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => (collapsible ? onToggle?.() : setLocal((v) => !v))}
        className="w-full py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {title}
      </button>
      {shown ? children : null}
    </section>
  );
}

export const DEFAULT_VIDEO_CHROME: VideoChrome = {
  Modal: PlainModal,
  MarkdownPreview: PlainMarkdown,
  TreeSection: PlainTreeSection,
  FileIcon: () => <LuFile aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
  FolderIcon: ({ open }) =>
    open ? (
      <LuFolderOpen aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    ) : (
      <LuFolder aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    ),
  LoadingRegion: ({ label, className, children }) => (
    <div role="status" aria-label={label} className={className}>
      {children}
    </div>
  ),
  Spinner: ({ className }) => (
    <span role="status" aria-label="Loading" className={`inline-block animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground ${className ?? 'h-4 w-4'}`} />
  ),
  Skeleton: ({ className, style }) => <div aria-hidden className={`animate-pulse rounded bg-muted ${className ?? ''}`} style={style} />,
};

/** The host's chrome over the plain defaults. */
export function useVideoChrome(): VideoChrome {
  const { chrome } = useVideoHost();
  return chrome ? { ...DEFAULT_VIDEO_CHROME, ...chrome } : DEFAULT_VIDEO_CHROME;
}
