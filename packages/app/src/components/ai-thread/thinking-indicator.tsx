import { useEffect, useState } from 'react';
import { LuLoaderCircle } from 'react-icons/lu';

import { useUiStore } from '../../store/ui-store';
import { CLAUDE_GLYPHS, type ThinkingStyle } from './thinking-style';

const GLYPH_INTERVAL_MS = 140;

function ClaudeGlyph() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % CLAUDE_GLYPHS.length), GLYPH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span aria-hidden data-testid="thinking-glyph" className="inline-block w-3 text-center text-primary">
      {CLAUDE_GLYPHS[index]}
    </span>
  );
}

/**
 * The "Thinking…" line shared by every AI thread (docs, companion, media).
 * The style comes from Settings ▸ Appearance (`aiThinkingStyle`) unless a
 * caller pins one with `style`.
 */
export function ThinkingIndicator({
  label = 'Thinking',
  style,
  className = '',
}: {
  label?: string;
  style?: ThinkingStyle;
  className?: string;
}) {
  const stored = useUiStore((s) => s.aiThinkingStyle);
  const kind = style ?? stored;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="thinking-indicator"
      data-style={kind}
      className={`flex items-center gap-1.5 px-1 text-xs text-muted-foreground ${className}`}
    >
      {kind === 'spinner' ? (
        <LuLoaderCircle aria-hidden data-testid="thinking-spinner" className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      ) : null}
      {kind === 'claude' ? <ClaudeGlyph /> : null}
      <span>
        {label}
        {kind === 'ellipsis' ? (
          <span aria-hidden data-testid="thinking-dots" className="thinking-dots" />
        ) : (
          '…'
        )}
      </span>
    </div>
  );
}
