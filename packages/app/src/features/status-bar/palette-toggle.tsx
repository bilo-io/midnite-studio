import { GoCommandPalette } from 'react-icons/go';

import { usePaletteStore } from '../../store/palette-store';

import { chordFor, displayChord } from './chord-hint';
import { StatusToggle } from './status-toggle';

const paletteChord = chordFor('palette.open', 'Mod+k');

/**
 * The command palette, on the rail (Phase 39 Theme C).
 *
 * **Moved, not added.** This button existed in the title bar
 * (`app.tsx`, as an `IconButton` with a mono `K` badge) and has been taken out
 * of it — `status-bar.tsx`'s own header comment makes the argument about git
 * status and it applies here unchanged: two readings of the same thing, one at
 * each edge of the window, is one more place to disagree and no more
 * information.
 *
 * `active` is real rather than decorative: `palette-store` carries `isOpen`
 * *and* `mode`, so this button and `FilesToggle` light up for different modes
 * of one surface. **Exactly one of the two is ever lit** — asserted in
 * `palette-toggle.test.tsx`, because `setQuery` re-derives `mode` from a typed
 * sigil, which means typing `>` in the file finder legitimately moves the lit
 * state from this button to the other one mid-keystroke. Correct behaviour,
 * and easy to mistake for a bug.
 */
export function PaletteToggle() {
  const isOpen = usePaletteStore((s) => s.isOpen);
  const mode = usePaletteStore((s) => s.mode);
  const active = isOpen && mode !== 'files';

  return (
    <StatusToggle
      testId="palette-toggle"
      icon={GoCommandPalette}
      name="Palette"
      chord={displayChord(paletteChord)}
      active={active}
      // A control that reports `aria-pressed` and cannot un-press is lying
      // about its own affordance.
      onToggle={() => {
        const palette = usePaletteStore.getState();
        if (active) palette.close();
        else palette.open();
      }}
      ariaLabel="Command Palette"
      tooltip={`Command palette (${displayChord(paletteChord)})`}
    />
  );
}
