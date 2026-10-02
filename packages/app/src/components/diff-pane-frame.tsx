import { LuX } from 'react-icons/lu';
import type { ReactNode } from 'react';

import { IconButton } from './icon-button';

/**
 * The right-hand column of the graph's inline diff views: a one-line header
 * carrying the viewer's single close button at the far right — further right
 * than any expand/collapse control in the diff below — over the diff itself.
 */
export function DiffPaneFrame({ onClose, children }: { onClose?: () => void; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <header
        className="flex shrink-0 items-center justify-end border-b border-border px-2 py-1"
        data-testid="diff-viewer-header"
      >
        {onClose ? <IconButton icon={LuX} label="Close" size="sm" onClick={onClose} /> : null}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
