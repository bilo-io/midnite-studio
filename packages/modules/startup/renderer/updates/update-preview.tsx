import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { MARKDOWN_PROSE_CLASSES } from '@midnite/studio-frame';

/**
 * The update as rendered GFM, with the frame's prose classes. Links never navigate: the pane is not a browser,
 * and the real link is in the markdown the user copies or emails.
 */
export default function UpdatePreview({ markdown }: { markdown: string }) {
  return (
    <div className={`min-w-0 max-w-none break-words text-sm leading-relaxed ${MARKDOWN_PROSE_CLASSES}`} data-selectable aria-label="Preview">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ children, href }) => <span className="underline" title={href}>{children}</span> }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
