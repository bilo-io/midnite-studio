import { useRef } from 'react';

import { useFocusTrap } from '../../components/use-focus-trap';
import { useOccluder } from '../../components/use-occluder';

const ROWS: { keys: string; label: string }[] = [
  { keys: '→ / Space / Enter', label: 'Next step, then next slide' },
  { keys: '← / Backspace', label: 'Previous step, then previous slide' },
  { keys: 'Home', label: 'First slide' },
  { keys: 'End', label: 'Last slide, fully revealed' },
  { keys: '?', label: 'Toggle this help' },
  { keys: 'Esc', label: 'Close the presentation' },
];

/**
 * The `?`-triggered shortcut list, on top of the deck. Styled to the app's own
 * overlay conventions (`z-dialog`, the `confirm-dialog.tsx` shape) rather than
 * midnite's — this is a new component, not a port.
 */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  /*
    The overlay already announced itself as a dialog; without a trap, Tab still
    walked out of it and into the deck behind (Phase 68 Theme D). The Close
    button's `autoFocus` survives untouched — the trap only claims the container
    when nothing inside it already holds focus.
  */
  useFocusTrap(containerRef, true);
  useOccluder(true);

  return (
    <div
      className="fixed inset-0 z-dialog grid place-items-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Presentation shortcuts"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl"
      >
        <h2 className="text-sm font-semibold">Shortcuts</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
          {ROWS.map((row) => (
            <div className="contents" key={row.keys}>
              <dt className="whitespace-nowrap font-mono text-muted-foreground">{row.keys}</dt>
              <dd>{row.label}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-4 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}
