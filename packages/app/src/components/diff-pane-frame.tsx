import { LuX } from 'react-icons/lu';
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';

import { IconButton } from './icon-button';

/**
 * One fixed height (and bottom border) for the top bar of both columns of a
 * split diff view — the left panel's commit header and the right panel's
 * files/totals header — so their bottom borders form one straight line.
 */
export const DIFF_BAR_CLASS = 'h-10 shrink-0 border-b border-border';

type FrameContext = { onClose?: () => void; claim: (claimed: boolean) => void };

const Frame = createContext<FrameContext | null>(null);

/**
 * The right-hand column of the graph's inline diff views. The viewer's single
 * Close button lives in the files/totals header of the diff list below
 * (`DiffPaneClose`), as its last item, so no bar of its own is spent on it.
 * Only when the content renders no such header (nothing picked, one file's
 * diff, loading, empty) does the frame fall back to a minimal header row.
 */
export function DiffPaneFrame({ onClose, children }: { onClose?: () => void; children: ReactNode }) {
  const [claimed, setClaimed] = useState(false);
  return (
    <Frame.Provider value={{ onClose, claim: setClaimed }}>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        {claimed || !onClose ? null : (
          <header
            className={`flex items-center justify-end px-2 ${DIFF_BAR_CLASS}`}
            data-testid="diff-viewer-header"
          >
            <IconButton icon={LuX} label="Close" size="sm" onClick={onClose} />
          </header>
        )}
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </Frame.Provider>
  );
}

/** The Close button, for a diff list's header to render last. Nothing outside a frame. */
export function DiffPaneClose() {
  const ctx = useContext(Frame);
  const claim = ctx?.claim;
  const active = Boolean(ctx?.onClose);
  useLayoutEffect(() => {
    if (!claim || !active) return undefined;
    claim(true);
    return () => claim(false);
  }, [claim, active]);
  if (!ctx?.onClose) return null;
  return <IconButton icon={LuX} label="Close" size="sm" onClick={ctx.onClose} />;
}
