import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { LuLock } from 'react-icons/lu';

import { useFocusTrap } from '@midnite/studio-frame';
import { COUNCIL_FREE_MEMBERS, COUNCIL_PRO_MEMBERS, MIDNITE_PRICING_URL } from '@midnite/studio-shared';

import { useCouncilsHost } from './host';

/**
 * "Upgrade to Pro" (Phase 134 Theme D): what the member-count slider opens when
 * it is pushed past the free tier's cap. It sells nothing itself — "See
 * pricing" opens the website's pricing page in the user's browser.
 *
 * Portalled to the body for the same reason the new-council modal is: the
 * config pane sits inside a transformed panel-stack pane.
 */
export function CouncilUpgradeDialog({ onClose }: { onClose: () => void }) {
  const host = useCouncilsHost();
  host.useOccluder(true);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, true);

  return createPortal(
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="council-upgrade-title"
        aria-describedby="council-upgrade-body"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
        className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl outline-none"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LuLock aria-hidden className="h-3.5 w-3.5" />
          </span>
          <h2 id="council-upgrade-title" className="text-sm font-semibold">
            Upgrade to Pro
          </h2>
        </div>
        <p id="council-upgrade-body" className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Free councils hold up to {COUNCIL_FREE_MEMBERS} members. Councils Pro seats up to {COUNCIL_PRO_MEMBERS}, so a
          debate can bring a judge's panel or a review every critic it needs.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Not now
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => {
              host.openExternal(MIDNITE_PRICING_URL);
              onClose();
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            See pricing
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
