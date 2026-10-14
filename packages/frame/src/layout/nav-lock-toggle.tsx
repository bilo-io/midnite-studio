import { LuChevronLeft } from 'react-icons/lu';

/*
  Moved out of \`app.tsx\` (Phase 113 Theme C): the nav rail is frame chrome,
  so its lock is too.
*/

/**
 * The rail's three modes — \`ui-store.ts\`'s \`NavMode\`, restated here
 * structurally so the frame does not import the app's store. The two are the
 * same union; \`app.tsx\` passes its own straight through.
 */
export type FrameNavMode = 'auto' | 'expanded' | 'collapsed';

/**
 * Locks the nav rail open, or hands it back to hover.
 *
 * The two modes differ in more than persistence: `auto` hover-expands as an
 * OVERLAY, while `expanded` is the only mode that shifts the page content
 * (AppFrame sets `--nav-offset` from it). That asymmetry is what makes the lock
 * feel like a lock rather than a preference — mirroring midnite's own rail.
 *
 * `collapsed` is deliberately not reachable from here: a two-state pin is a
 * pin, a three-state one is a menu wearing a pin's clothes.
 */
export function NavLockToggle({
  navMode,
  onChange,
}: {
  navMode: FrameNavMode;
  onChange: (mode: FrameNavMode) => void;
}) {
  const locked = navMode === 'expanded';
  return (
    <button
      type="button"
      onClick={() => onChange(locked ? 'auto' : 'expanded')}
      aria-pressed={locked}
      aria-label={locked ? 'Unlock navigation' : 'Keep navigation expanded'}
      title={locked ? 'Unlock navigation' : 'Keep navigation expanded'}
      className="ml-auto shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <LuChevronLeft
        aria-hidden
        className={`h-4 w-4 transition-transform duration-200 ease-in-out ${
          locked ? '' : 'rotate-180'
        }`}
      />
    </button>
  );
}
