import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { LuChevronRight } from 'react-icons/lu';

import type { IconComponent } from './icon-button';
import { useUiStore } from '../store/ui-store';

/**
 * A renderer-drawn context menu.
 *
 * Deliberately NOT Electron's native `Menu.popup` (docs/INITIAL_PLAN.md): a
 * native menu can't be styled with the design tokens, so it would sit in a
 * themed app looking like it belongs to a different one — and every item would
 * have to round-trip through IPC to reach the state it acts on, which all lives
 * in the renderer.
 */
/** Shared by leaf items and submenu parents. */
type MenuEntryBase = {
  label: string;
  /**
   * Optional glyph ahead of the label.
   *
   * Optional, and deliberately not defaulted: a menu is either iconless or
   * fully iconed, and a lone icon among plain rows reads as one item being
   * singled out. The gutter is only reserved when at least one item in the
   * menu asks for it — see `ContextMenu`.
   */
  icon?: IconComponent;
  /**
   * Inline style for the icon, overriding its default muted tint.
   *
   * Inline is the only route open to it: the one caller is the terminal's `+`
   * menu, painting each agent's `accent`, and an accent is roster data — a
   * user-added agent brings a colour Tailwind has never seen. The same reason
   * `SessionIcon` styles its mark inline rather than by class.
   */
  iconStyle?: CSSProperties;
  /**
   * One line of sub-text under the label, in a smaller and lighter face.
   *
   * Optional per item, like `icon`, and for the same reason: a menu where one
   * row explains itself and the rest do not reads as that row being singled
   * out. A caller either describes every entry of a menu or none of them.
   */
  description?: string;
  disabled?: boolean;
  /** Reason the item is unavailable, shown on hover. */
  disabledReason?: string;
  danger?: boolean;
};

/**
 * A leaf item does something; a submenu parent opens a submenu. Modelling them
 * as separate arms rather than one shape with two optional fields is what makes
 * "a leaf with no action" and "a submenu that also acts on click" both
 * unrepresentable.
 */
export type MenuItem =
  | { type: 'separator' }
  | (MenuEntryBase & { type?: 'item'; onSelect: () => void; submenu?: never })
  | (MenuEntryBase & { type?: 'item'; submenu: MenuItem[]; onSelect?: never });

/** Every non-separator arm. */
export type MenuEntry = Extract<MenuItem, { label: string }>;

export type MenuPosition = { x: number; y: number };

export function ContextMenu({
  position,
  items,
  onClose,
}: {
  position: MenuPosition;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState(position);
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);

  /**
   * One icon anywhere in the menu indents every row, so labels still line up
   * under each other where a separator-divided group happens to be iconless.
   */
  const iconed = items.some((item) => item.type !== 'separator' && item.icon !== undefined);

  /**
   * Keep the menu inside the window.
   *
   * A right-click near the bottom-right corner is the common case, not an edge
   * case, and a menu that opens off-screen is simply unusable. `useLayoutEffect`
   * so the correction happens before paint — otherwise the menu visibly jumps.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    setPlaced({
      x: Math.min(position.x, window.innerWidth - rect.width - margin),
      y: Math.min(position.y, window.innerHeight - rect.height - margin),
    });
  }, [position]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // `capture` so a click lands on the menu's own item handler first but still
    // closes menus opened over other interactive elements.
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onClose);

    // A loaded browser tab's page is an Electron `WebContentsView`, an
    // OS-composited layer that paints above the whole renderer window
    // regardless of `z-index` (see `use-browser-bounds.ts`). Registering as an
    // occluder — same pattern as `popover.tsx` — hides that native view while
    // this menu is open, which is the only way a DOM overlay can appear above it.
    const store = useUiStore.getState();
    store.incrementOccluders();

    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
      store.decrementOccluders();
    };
  }, [onClose]);

  // Portalled to <body> for the reason spelled out in `popover.tsx` and
  // `tooltip.tsx`: any ancestor carrying a `transform` becomes the containing
  // block for `position: fixed` descendants *and* opens a stacking context, so
  // a menu rendered where it was raised from lands at the wrong coordinates and
  // paints under later siblings. This one is placed at the cursor, which makes
  // a shifted containing block especially visible.
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-menu min-w-[10rem] max-w-[24rem] gradient-border gradient-border--always rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-lg"
      style={{ left: placed.x, top: placed.y }}
    >
      {items.map((item, index) =>
        item.type === 'separator' ? (
          <hr key={`sep-${index}`} className="my-1 border-border" />
        ) : (
          <MenuRow
            key={item.label}
            item={item}
            iconed={iconed}
            open={openSubmenu === index}
            onOpenSubmenu={() => setOpenSubmenu('submenu' in item && item.submenu ? index : null)}
            onClose={onClose}
          />
        ),
      )}
    </div>,
    document.body,
  );
}

function MenuRow({
  item,
  iconed,
  open,
  onOpenSubmenu,
  onClose,
}: {
  item: MenuEntry;
  /** Whether this menu reserves an icon gutter — see `ContextMenu`. */
  iconed: boolean;
  open: boolean;
  onOpenSubmenu: () => void;
  onClose: () => void;
}) {
  /**
   * A submenu reserves its own gutter, independently of its parent: the two are
   * separate surfaces, and an iconless submenu hanging off an iconed menu
   * should not inherit an empty indent.
   */
  const subIconed =
    item.submenu?.some((sub) => sub.type !== 'separator' && sub.icon !== undefined) ?? false;

  return (
    <div className="relative" onMouseEnter={onOpenSubmenu}>
      <MenuItemButton
        item={item}
        iconed={iconed}
        // A submenu parent opens on hover and does nothing on click; the type
        // makes "a parent that also acts" unrepresentable, so there is no
        // `onSelect` to call here.
        onSelect={item.submenu ? undefined : () => item.onSelect?.()}
        onClose={onClose}
      />

      {item.submenu && open ? (
        <Submenu items={item.submenu} iconed={subIconed} onClose={onClose} />
      ) : null}
    </div>
  );
}

/**
 * The second surface, hanging off the row that opened it.
 *
 * It wears the same gradient edge as the menu above it. A submenu is a peer
 * surface floating over the app, not a compartment of its parent — it has its
 * own shadow and its own rounded box already — so a plain grey border beside a
 * gradient one read as the second one being unfinished.
 */
function Submenu({
  items,
  iconed,
  onClose,
}: {
  items: MenuItem[];
  iconed: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** Pixels from the parent row's left edge; `null` until measured. */
  const [left, setLeft] = useState<number | null>(null);

  /**
   * Keep the submenu inside the window — the same correction `ContextMenu`
   * makes for itself, and for the same reason: a surface half off-screen is
   * simply unusable. It matters more here than it used to, because a submenu
   * describing its rows is several times the width of one that only labels
   * them, so the edge it used to clear is now well within reach.
   *
   * Three placements in order of preference: to the right of the row, to its
   * left, or flush against the window with the row overlapped. The last is
   * ugly and deliberate — at a narrow enough window there is no side with room
   * for the surface, and overlapping the parent beats hanging off the edge.
   *
   * `useLayoutEffect` so the correction lands before paint, and measured once
   * per opening: the submenu unmounts when the pointer leaves the row.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    const row = el?.parentElement;
    if (!el || !row) return;
    const rowRect = row.getBoundingClientRect();
    const width = el.getBoundingClientRect().width;
    const margin = 8;

    let next = rowRect.width + 1;
    if (rowRect.left + next + width > window.innerWidth - margin) next = -width - 1;
    if (rowRect.left + next < margin) next = margin - rowRect.left;
    setLeft(next);
  }, []);

  return (
    <div
      ref={ref}
      role="menu"
      /*
        `w-max` because an absolutely-positioned box shrinks to fit the space
        its containing block has left — and `left-full` leaves it none, so
        without this the surface collapses to its longest *word* and every
        description wraps into a column four lines deep.

        `left-full` is only the pre-measurement placement; the effect above
        replaces it with a pixel offset before the first paint.
      */
      className={`absolute top-0 w-max min-w-[9rem] max-w-[22rem] gradient-border gradient-border--always rounded-md border border-border bg-popover py-1 shadow-lg ${
        left === null ? 'left-full ml-px' : ''
      }`}
      {...(left === null ? {} : { style: { left } })}
    >
      {items.map((sub, index) =>
        sub.type === 'separator' ? (
          <hr key={`sub-sep-${index}`} className="my-1 border-border" />
        ) : (
          <MenuItemButton
            key={sub.label}
            item={sub}
            iconed={iconed}
            onSelect={() => sub.onSelect?.()}
            onClose={onClose}
          />
        ),
      )}
    </div>
  );
}

/**
 * One row, drawn identically at both levels.
 *
 * Written once rather than twice because the two copies had already drifted —
 * only the top-level one carried the reserved-gutter spacer — and a row now
 * carries a label, an optional description and an optional chevron, which is
 * three chances for the next drift.
 */
function MenuItemButton({
  item,
  iconed,
  onSelect,
  onClose,
}: {
  item: MenuEntry;
  iconed: boolean;
  /** Absent for a submenu parent, which opens on hover instead. */
  onSelect: (() => void) | undefined;
  onClose: () => void;
}) {
  const disabled = item.disabled ?? false;
  const Icon = item.icon;
  const descriptionId = useId();
  const described = item.description !== undefined;

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      // The reason belongs on the disabled item itself: a greyed-out
      // "Checkout" with no explanation is the most frustrating thing a menu
      // can show.
      title={disabled ? item.disabledReason : undefined}
      /*
        The description is the row's accessible *description*, not part of its
        name: a screen reader announcing "Backlog Task, Pick up the next
        unblocked backlog task and build it" as one name would make every row's
        name a sentence, and `getByRole('menuitem', { name })` would have to
        match one too.
      */
      {...(described ? { 'aria-label': item.label, 'aria-describedby': descriptionId } : {})}
      onClick={() => {
        if (disabled || !onSelect) return;
        onSelect();
        onClose();
      }}
      className={`flex w-full gap-2 px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        described ? 'items-start py-1.5' : 'items-center py-1'
      } ${item.danger ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-accent'}`}
    >
      {iconed ? (
        Icon ? (
          <Icon
            aria-hidden
            // Nudged onto the label's baseline rather than centred against a
            // two-line block, which would leave it floating between the two.
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground ${described ? 'mt-0.5' : ''}`}
            {...(item.iconStyle ? { style: item.iconStyle } : {})}
          />
        ) : (
          <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
        )
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{item.label}</span>
        {item.description !== undefined ? (
          <span id={descriptionId} className="text-[11px] leading-snug text-muted-foreground">
            {item.description}
          </span>
        ) : null}
      </span>
      {item.submenu ? (
        <LuChevronRight
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 ${described ? 'mt-0.5' : ''}`}
        />
      ) : null}
    </button>
  );
}
