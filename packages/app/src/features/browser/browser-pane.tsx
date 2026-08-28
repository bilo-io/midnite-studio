import { useEffect, useState, type FormEvent } from 'react';

import { GoArrowLeft, GoArrowRight, GoSync, GoX } from 'react-icons/go';

import { EmptyState } from '../../components/empty-state';
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useUiStore.getState().setBrowserOpen(false);
    };
    // No `stopPropagation`: `Ctrl+`` must still reach the terminal's global
    // escape allow-list while this pane is open.
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(url);
  };

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col bg-background transition-opacity duration-200 ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <button type="button" disabled aria-label="Back" className="rounded p-1 opacity-40">
          <GoArrowLeft aria-hidden className="h-4 w-4" />
        </button>
        <button type="button" disabled aria-label="Forward" className="rounded p-1 opacity-40">
          <GoArrowRight aria-hidden className="h-4 w-4" />
        </button>
        <button type="button" disabled aria-label="Reload" className="rounded p-1 opacity-40">
          <GoSync aria-hidden className="h-4 w-4" />
        </button>
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
        <button
          type="button"
          onClick={() => useUiStore.getState().setBrowserOpen(false)}
          aria-label="Close browser"
          className="rounded p-1 hover:bg-accent hover:text-foreground"
        >
          <GoX aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <EmptyState
          title={submitted ? `No web engine yet — ${submitted} would load here.` : 'No web engine yet.'}
        />
      </div>
    </div>
  );
}
