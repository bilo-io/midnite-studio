import { useEffect } from 'react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useSlidesStore } from '../../slides/slides-store';
import { ExternalLink } from '../../markdown/external-link';
import { MARKDOWN_PROSE_CLASSES } from '../../markdown/prose';

/**
 * Rendered markdown, GFM flavour. The source ⇄ rendered toggle lives in the
 * preview header, not in this component: this one only ever renders.
 *
 * Links are live, and route through the guarded `shell:open-external` channel —
 * Phase 12 Theme E's deliverable, which has since landed. They deliberately are
 * NOT plain `<a href>`: this renderer is a single-page app loaded from `file://`
 * in production, so a same-window navigation would replace the whole application
 * with the target page and there is no browser chrome to come back with. See
 * `ExternalLink`, which is shared with the commit inspector's message renderer.
 *
 * `label` is optional only because callers outside Files preview (none today)
 * would have no filename to give — when present, mounting this component
 * claims the slides store's `activeMarkdown` slot (Phase 29), so the palette's
 * future "present the markdown in view" command has something to act on
 * without a click. Cleared on unmount, not on every re-render, so switching
 * `showSource` off and back on does not flicker the slot empty in between.
 */
export function MarkdownPreview({ content, label }: { content: string; label?: string }) {
  useEffect(() => {
    if (label === undefined) return;
    useSlidesStore.getState().setActiveMarkdown({ content, label });
    return () => useSlidesStore.getState().setActiveMarkdown(null);
  }, [content, label]);

  return (
    <div
      className={`min-h-0 max-w-none overflow-auto p-4 text-sm leading-relaxed ${MARKDOWN_PROSE_CLASSES}`}
      data-selectable
    >
      <Markdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
        {content}
      </Markdown>
    </div>
  );
}
