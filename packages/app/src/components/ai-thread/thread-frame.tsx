import type { ReactNode } from 'react';

/**
 * The container every AI thread sits in. While `loading`, it wears the same
 * rotating inner arc + glow border the Loops panel uses (`.gradient-frame`
 * driven by `data-loops-running` / `data-loop-state='thinking'`). When idle the
 * frame keeps a transparent border of the same width, so nothing reflows.
 */
export function AiThreadFrame({
  loading,
  children,
  className = '',
  testId,
}: {
  loading: boolean;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      data-ai-loading={loading ? 'true' : 'false'}
      data-loops-running={loading ? 'true' : undefined}
      data-loop-state={loading ? 'thinking' : undefined}
      className={`ai-thread-frame relative ${loading ? 'gradient-frame' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
