import { useEffect, type ReactNode } from 'react';

import { useOccludeWhile } from '../chrome';

/**
 * A small modal for the editor's two prompts (Save changes? and New scene). It counts as an occluder, so the
 * running game's native view — which floats above the DOM — hides while it is open on the Play tab.
 */
export function LevelDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useOccludeWhile(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
