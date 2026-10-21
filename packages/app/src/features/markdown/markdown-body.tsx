import type { ReactNode } from 'react';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { MarkdownCode, MarkdownPre } from '../files/preview/markdown-code-block';
import { ExternalLink } from './external-link';
import { MARKDOWN_PROSE_CLASSES } from './prose';

/**
 * Rendered GFM markdown for a block of text that is not a file — the pretty
 * printing the Files preview does, without its file-tree concerns (relative
 * links, anchors, the slides hand-off).
 *
 * The same pieces, not a second renderer: `react-markdown` + `remark-gfm`,
 * fenced code highlighted through the app's one shiki instance with the copy
 * button (`MarkdownCode`), diffs styled with the diff view's own tokens, links
 * routed through the guarded `ExternalLink`, prose styled by
 * `MARKDOWN_PROSE_CLASSES`. The Chats page's assistant messages are the first
 * caller.
 */
const COMPONENTS = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => <ExternalLink href={href}>{children}</ExternalLink>,
  code: MarkdownCode,
  pre: MarkdownPre,
};

export function MarkdownBody({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`min-w-0 max-w-none break-words text-sm leading-relaxed ${MARKDOWN_PROSE_CLASSES} ${className}`} data-selectable>
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {content}
      </Markdown>
    </div>
  );
}
