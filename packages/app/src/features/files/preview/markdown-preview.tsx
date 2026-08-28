import { useCallback, useEffect } from 'react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useSlidesStore } from '../../slides/slides-store';
import { ExternalLink } from '../../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../../markdown/prose';
import { resolveMarkdownLinkTarget } from './markdown-links';

/**
 * Rendered markdown, GFM flavour. The source ⇄ rendered toggle lives in the
 * preview header, not in this component: this one only ever renders.
 *
 * External links route through the guarded `shell:open-external` channel —
 * Phase 12 Theme E's deliverable. Internal relative links (e.g. to other docs)
 * trigger `onNavigate` when provided so the file viewer can open the target file.
 *
 * `label` is optional only because callers outside Files preview (none today)
 * would have no filename to give — when present, mounting this component
 * claims the slides store's `activeMarkdown` slot (Phase 29), so the palette's
 * future "present the markdown in view" command has something to act on
 * without a click. Cleared on unmount, not on every re-render, so switching
 * `showSource` off and back on does not flicker the slot empty in between.
 */
export function MarkdownPreview({
  content,
  label,
  currentRelPath,
  onNavigate,
}: {
  content: string;
  label?: string;
  currentRelPath?: string;
  onNavigate?: (relPath: string) => void;
}) {
  useEffect(() => {
    if (label === undefined) return;
    useSlidesStore.getState().setActiveMarkdown({ content, label });
    return () => useSlidesStore.getState().setActiveMarkdown(null);
  }, [content, label]);

  const MarkdownLink = useCallback(
    ({ href, children, className }: { href?: string; children?: React.ReactNode; className?: string }) => {
      const target = resolveMarkdownLinkTarget(href, currentRelPath);
      if (target?.kind === 'internal' && onNavigate) {
        return (
          <a
            href={href}
            title={target.relPath}
            className={`text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary ${className ?? ''}`}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(target.relPath);
            }}
          >
            {children}
          </a>
        );
      }
      return <ExternalLink href={href} className={className}>{children}</ExternalLink>;
    },
    [currentRelPath, onNavigate],
  );

  return (
    <div
      className={`min-h-0 max-w-none overflow-auto p-4 text-sm leading-relaxed ${MARKDOWN_PROSE_CLASSES}`}
      data-selectable
    >
      <Markdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
        {content}
      </Markdown>
    </div>
  );
}
