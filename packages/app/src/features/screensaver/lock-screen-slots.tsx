import type { ReactNode } from 'react';

/**
 * The lock screen's corner layout, as data — Phase 46 Theme D.
 *
 * Three hard-coded `absolute` positions were already spread across
 * `lock-screen-chrome.tsx` (day/date, the clock) and `lock-screen-widgets.tsx`
 * (fintech, system monitor) before this phase adds two more surfaces to them
 * (weather, battery). A slot is declared once, here, rather than as an inline
 * `absolute bottom-8 right-8` repeated at each call site — this is a map, not
 * a drag-and-drop layout editor: nothing here lets a slot move at runtime.
 *
 * The pointer-events rule is a property of the slot rather than of each
 * widget: `LockScreen`'s corners render over the whole screen so a click
 * anywhere reaches the dismiss/unlock handler, and each occupied slot has to
 * opt back in individually. Getting that backwards per-widget is exactly the
 * mistake this theme exists to make impossible for the next surface to add.
 */
export type LockScreenSlot = 'top-left' | 'top-centre' | 'top-right' | 'bottom-left' | 'bottom-right';

const SLOT_CLASS: Record<LockScreenSlot, string> = {
  'top-left': 'left-8 top-8 items-start text-left',
  'top-centre': 'left-1/2 top-8 -translate-x-1/2 items-center text-center',
  'top-right': 'right-8 top-8 items-end text-right',
  'bottom-left': 'bottom-8 left-8 items-start text-left',
  'bottom-right': 'bottom-8 right-8 items-end text-right',
};

/**
 * One occupied slot. Multiple children stack vertically in slot order —
 * `bottom-right` is exactly how battery joins the corner above the system
 * monitor widget (Theme B) without either widget knowing the other exists.
 */
export function LockScreenSlotIsland({
  slot,
  children,
}: {
  slot: LockScreenSlot;
  children: ReactNode;
}) {
  return (
    <div className={`pointer-events-auto absolute z-10 flex flex-col gap-3 ${SLOT_CLASS[slot]}`}>
      {children}
    </div>
  );
}
