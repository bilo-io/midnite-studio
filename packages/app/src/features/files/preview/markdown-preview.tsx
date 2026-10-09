import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useSlidesStore } from '../../slides/slides-store';
import { ExternalLink } from '../../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../../markdown/prose';
import { type FsScopeInput } from '../file-tree';
import { MarkdownCode, MarkdownPre } from './markdown-code-block';
import { MarkdownImage } from './markdown-image';
import { findAnchorTarget, inPageAnchor, resolveMarkdownLinkTarget } from './markdown-links';
import { useFilesStore } from '../files-store';

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
  scope,
  content,
  label,
  currentRelPath,
  onNavigate,
}: {
  /** The tree the file lives in — what relative `![img](…)` srcs resolve within. */
  scope?: FsScopeInput;
  content: string;
  label?: string;
  currentRelPath?: string;
  onNavigate?: (relPath: string, anchor?: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const restore = useFilesStore((s) => s.restore);

  // Apply the scroll target every navigation sets: a heading for `#anchor`, a
  // remembered offset for Back/Forward, otherwise the top.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restore.anchor) {
      findAnchorTarget(el, restore.anchor)?.scrollIntoView?.({ block: 'start' });
    } else {
      el.scrollTop = restore.scrollTop ?? 0;
    }
  }, [restore, content]);

  useEffect(() => {
    if (label === undefined) return;
    useSlidesStore.getState().setActiveMarkdown({ content, label });
    return () => useSlidesStore.getState().setActiveMarkdown(null);
  }, [content, label]);

  const MarkdownLink = useCallback(
    ({ href, children, className }: { href?: string; children?: React.ReactNode; className?: string }) => {
      const anchor = inPageAnchor(href);
      if (anchor !== null) {
        return (
          <a
            href={href}
            className={`text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary ${className ?? ''}`}
            onClick={(event) => {
              event.preventDefault();
              useFilesStore.getState().navigateAnchor(anchor);
            }}
          >
            {children}
          </a>
        );
      }
      const target = resolveMarkdownLinkTarget(href, currentRelPath);
      if (!target && href && !href.startsWith('#')) {
        // A relative link that climbs out of the repo root: inert, never an external open.
        return (
          <a
            href={href}
            title="Outside this repository"
            className={`cursor-not-allowed text-muted-foreground underline decoration-dotted ${className ?? ''}`}
            onClick={(event) => event.preventDefault()}
          >
            {children}
          </a>
        );
      }
      if (target?.kind === 'internal' && onNavigate) {
        return (
          <a
            href={href}
            title={target.relPath}
            className={`text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary ${className ?? ''}`}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(target.relPath, target.anchor);
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

  // Keyed on the scope's fields, not its identity: a fresh `scope` object per
  // parent render must not remount (and so reload) every image in the doc.
  const repoId = scope?.scope === 'repo' ? scope.repoId : undefined;
  const worktreePath = scope?.scope === 'repo' ? scope.worktreePath : undefined;
  const scopeKind = scope?.scope;
  const MarkdownImg = useCallback(
    ({ src, alt, title }: { src?: string; alt?: string; title?: string }) => {
      const imageScope: FsScopeInput | undefined =
        scopeKind === 'repo' && repoId !== undefined
          ? { scope: 'repo', repoId, ...(worktreePath ? { worktreePath } : {}) }
          : scopeKind === 'claude-home'
            ? { scope: 'claude-home' }
            : undefined;
      return <MarkdownImage src={src} alt={alt} title={title} scope={imageScope} currentRelPath={currentRelPath} />;
    },
    [scopeKind, repoId, worktreePath, currentRelPath],
  );

  return (
    <div
      ref={scroller}
      onScroll={(event) => useFilesStore.getState().recordScroll(event.currentTarget.scrollTop)}
      className={`min-h-0 max-w-none overflow-auto p-4 text-sm leading-relaxed ${MARKDOWN_PROSE_CLASSES}`}
      data-selectable
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{ a: MarkdownLink, code: MarkdownCode, pre: MarkdownPre, img: MarkdownImg }}
      >
        {content}
      </Markdown>
    </div>
  );
}
