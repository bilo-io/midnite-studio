import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Rendered markdown, GFM flavour — the dependency Phase 12 Theme A planned
 * (`react-markdown` + `remark-gfm`), landed here first. The source ⇄ rendered
 * toggle lives in the preview header, not in this component: this one only
 * ever renders.
 *
 * Links render as styled text with NO anchor behind them: the guarded
 * `shell:open-external` channel is Phase 12 E's deliverable, and until it
 * exists any real `<a href>` — clickable or keyboard-activated — would
 * navigate the whole Electron window to the URL. CSS can't prevent that
 * (pointer-events misses keyboard activation), so the element itself must.
 */
const InertLink = ({ children, href }: { children?: React.ReactNode; href?: string }) => (
  <span className="text-primary underline" title={href ? `${href} — links open in a later phase` : undefined}>
    {children}
  </span>
);

export function MarkdownPreview({ content }: { content: string }) {
  return (
    <div
      className="prose-sm min-h-0 max-w-none overflow-auto p-4 text-sm leading-relaxed
        [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
        [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs
        [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold
        [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold
        [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold
        [&_hr]:my-3 [&_hr]:border-border
        [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2
        [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0
        [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1
        [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left
        [&_ul]:list-disc [&_ul]:pl-5"
      data-selectable
    >
      <Markdown remarkPlugins={[remarkGfm]} components={{ a: InertLink }}>
        {content}
      </Markdown>
    </div>
  );
}
