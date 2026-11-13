import 'katex/dist/katex.min.css';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

const REMARK = [remarkGfm, remarkMath];
// A typo renders red source, never a crash.
const REHYPE: [typeof rehypeKatex, { throwOnError: boolean; strict: string }][] = [[rehypeKatex, { throwOnError: false, strict: 'ignore' }]];

/**
 * A markdown cell (Phase 126 Theme C.3): rendered by default, a monospace textarea in edit mode.
 * Double-click the rendered view to edit; Shift+Enter in the textarea renders again. That is an editing
 * key of the focused textarea, not a command — `Mod+Enter` stays `status.commit`.
 */
export function MarkdownCell({ source, onChange }: { source: string; onChange: (source: string) => void }) {
  const [editing, setEditing] = useState(source === '');
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = area.current;
    if (editing && el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing, source]);

  if (editing) {
    return (
      <textarea
        ref={area}
        aria-label="Text cell"
        value={source}
        autoFocus
        rows={3}
        spellCheck={false}
        className="w-full resize-none rounded-md border border-border bg-background p-2 font-mono text-sm outline-none focus:border-ring"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <div
      data-testid="markdown-rendered"
      className="prose prose-invert max-w-none cursor-text rounded-md p-2 text-sm"
      onDoubleClick={() => setEditing(true)}
    >
      {source.trim() === '' ? (
        <p className="opacity-50">Empty text cell — double-click to edit.</p>
      ) : (
        <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE as never}>
          {source}
        </ReactMarkdown>
      )}
    </div>
  );
}
