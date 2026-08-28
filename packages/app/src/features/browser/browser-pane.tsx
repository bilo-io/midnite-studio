import { useEffect, useRef, useState, type FormEvent } from 'react';

import { GoArrowLeft, GoArrowRight, GoSync, GoX } from 'react-icons/go';

import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { useFocusTrap } from '../../components/use-focus-trap';
import { motionMs } from '../../components/use-reveal';
import { useUiStore } from '../../store/ui-store';

/**
 * A chrome stub with no engine — back/forward/reload disabled, a URL field
 * that accepts text and navigates nowhere, and a plate saying so. Proves the
 * field is wired end to end rather than silently swallowing input, which
 * would be indistinguishable from a broken browser.
 *
 * Mounted as a child of the content row with `absolute inset-0`, over the
 * repositories panel and the view/terminal column alike — the status bar
 * stays visible below it, which is the whole demonstration.
 */
export function BrowserPane({ shown }: { shown: boolean }) {
  const [url, setUrl] = useState('');
  const [submitted, setSubmitted] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(containerRef, shown);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useUiStore.getState().setBrowserOpen(false);
    };
    // No `stopPropagation`: `Ctrl+`` must still reach the terminal's global
    // escape allow-list while this pane is open.
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Restore focus to the toggle the moment the pane stops being shown —
  // Escape, the close button, or Mod+b again all funnel through `shown`
  // flipping false, matching the half of Popover's close() this pane cannot
  // share directly (its trigger lives in a sibling component).
  useEffect(() => {
    if (!shown) return;
    return () => {
      document.querySelector<HTMLButtonElement>('[data-testid="browser-toggle"]')?.focus();
    };
  }, [shown]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(url);
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Browser"
      // z-20: one rung above the terminal frame's z-10 (app.tsx) within this
      // same content row — a local ordering, not the global menu/popover/
      // dialog/tooltip scale in tailwind.config.ts, which is for layers
      // portalled to document.body and unrelated to this row's own stacking.
      className={`absolute inset-0 z-20 flex flex-col bg-background outline-none transition-opacity ${
        shown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{ transitionDuration: `${motionMs()}ms` }}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <IconButton icon={GoArrowLeft} label="Back" disabled size="sm" />
        <IconButton icon={GoArrowRight} label="Forward" disabled size="sm" />
        <IconButton icon={GoSync} label="Reload" disabled size="sm" />
        <form onSubmit={onSubmit} className="min-w-0 flex-1">
          <input
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="No web engine yet"
            aria-label="Address"
            className="w-full rounded border border-border bg-card px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </form>
        <IconButton
          icon={GoX}
          label="Close browser"
          size="sm"
          onClick={() => useUiStore.getState().setBrowserOpen(false)}
        />
      </div>
      <div className="min-h-0 flex-1">
        <EmptyState
          title={submitted ? `No web engine yet — ${submitted} would load here.` : 'No web engine yet.'}
        />
      </div>
    </div>
  );
}
