import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';

import { LuChevronRight } from 'react-icons/lu';

import type { IconComponent } from './icon-button';
import { useDismiss } from './use-dismiss';
import { useFocusTrap } from './use-focus-trap';

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

/*
  ── The keyboard half of `role="menu"` ───────────────────────────────────────

  The menu has advertised the ARIA menu contract since it was written and
  implemented none of it: a screen reader announced "menu", the user pressed
  Down, and nothing happened. Phase 68 Theme C makes the advertisement true.

  Everything below keys off *indices into the `items` array*, not off DOM
  order or `document.activeElement`. Separators occupy an index and are never
  selectable, disabled rows occupy one and are skipped, and the row that owns
  the roving `tabIndex={0}` is the one whose index matches — so "which row is
  current" has exactly one answer and it is React state, which is what makes
  a submenu's focus and its parent's survive a re-render.

  Opening a menu *from* the keyboard (`Shift+F10`, the Menu key) is a change at
  every `onContextMenu` call site and deliberately not here; this makes an open
  menu operable, which is the half that was broken for someone already on the
  keyboard.
*/

/** A row the keyboard may land on: neither a separator nor a disabled item. */
function isSelectable(item: MenuItem | undefined): item is MenuEntry {
  return item !== undefined && item.type !== 'separator' && item.disabled !== true;
}

function firstSelectable(items: MenuItem[]): number | null {
  const index = items.findIndex(isSelectable);
  return index === -1 ? null : index;
}

function lastSelectable(items: MenuItem[]): number | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (isSelectable(items[index])) return index;
  }
  return null;
}

/**
 * The next selectable row in `direction`, wrapping past either end — which is
 * what a menu is expected to do and a list is not.
 *
 * `from === null` means nothing is current yet, so Down starts at the top and
 * Up starts at the bottom. Bounded by `items.length` rather than by a
 * "returned to start" check so an all-disabled menu terminates.
 */
function step(items: MenuItem[], from: number | null, direction: 1 | -1): number | null {
  if (items.length === 0) return null;
  const origin = from ?? (direction === 1 ? -1 : items.length);
  for (let hop = 1; hop <= items.length; hop += 1) {
    const index = (((origin + direction * hop) % items.length) + items.length) % items.length;
    if (isSelectable(items[index])) return index;
  }
  return null;
}

/** The submenu hanging off row `index`, or `null` if that row has none. */
function submenuAt(items: MenuItem[], index: number | null): MenuItem[] | null {
  if (index === null) return null;
  const item = items[index];
  if (item === undefined || item.type === 'separator') return null;
  return item.submenu ?? null;
}

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

  /** Which top-level row holds the roving `tabIndex={0}`. */
  const [activeIndex, setActiveIndex] = useState<number | null>(() => firstSelectable(items));
  /**
   * Which row of the open submenu holds focus, or `null` for "focus is still at
   * the top level" — which is what a *hover*-opened submenu leaves it as. This
   * one flag is the difference between the pointer's submenu and the keyboard's.
   */
  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null);

  const submenuItems = submenuAt(items, openSubmenu);
  /** Focus is inside the submenu, rather than merely near an open one. */
  const inSubmenu = submenuItems !== null && submenuIndex !== null;

  const closeSubmenu = () => {
    setOpenSubmenu(null);
    setSubmenuIndex(null);
  };

  /*
    Focus lives inside the menu for as long as it is open.

    Without this, reaching the first item by keyboard meant tabbing through the
    entire rest of the document: the menu is portalled to the end of `<body>`,
    so DOM order puts it after everything. The trap also hands focus back to
    whatever held it when the menu opened — for a right-click, the row that was
    clicked — which is Theme A's restoration arriving here for free.

    The container's `tabIndex={-1}` is what the trap parks focus on when a menu
    happens to have no selectable row at all.
  */
  useFocusTrap(ref, true);

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

  /*
    Escape closes an open submenu first and the menu itself only once there is
    none — one keypress, one surface, the same rule the dismissal stack applies
    between components applied here between a menu and its own child. Written
    as one callback rather than two registrations because a submenu is not a
    separate overlay: it has no element of its own until it opens and it dies
    with its parent row.

    Delivered by `useDismiss` (Phase 62), which also does the occluder
    bookkeeping this effect used to do by hand: a loaded browser tab's page is
    an Electron `WebContentsView`, an OS-composited layer that paints above the
    whole renderer window regardless of `z-index` (see `use-browser-bounds.ts`),
    and hiding it while a DOM overlay is up is the only way that overlay can
    appear above it.
  */
  useDismiss(
    true,
    () => {
      // Clearing `submenuIndex` alongside is what returns focus to the parent
      // row: the row's `focused` prop is `activeIndex === index && submenuIndex
      // === null`, so the same state change that unmounts the submenu makes the
      // row current again (Phase 68 Theme C).
      if (openSubmenu !== null) closeSubmenu();
      else onClose();
    },
    { layer: 'menu' },
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    // `capture` so a click lands on the menu's own item handler first but still
    // closes menus opened over other interactive elements.
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('resize', onClose);

    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  /*
    One handler for both surfaces, on the container the submenu is rendered
    inside — a submenu is a child of its parent row, so its keystrokes bubble
    here and there is no second listener to keep in step.

    Escape is deliberately absent: `useDismiss` owns it on `window` (Phase 62),
    and the two-step "submenu first, then the menu" rule lives in that callback.
    Enter and Space are absent for the same class of reason — focus is on a real
    `<button>`, so the platform already activates it.
  */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = inSubmenu && submenuItems ? submenuItems : items;
    const current = inSubmenu ? submenuIndex : activeIndex;
    const setCurrent: Dispatch<SetStateAction<number | null>> = inSubmenu
      ? setSubmenuIndex
      : setActiveIndex;

    /** Moving the top-level selection abandons a submenu the pointer opened. */
    const move = (next: number | null) => {
      setCurrent(next);
      if (!inSubmenu) closeSubmenu();
    };

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(step(list, current, 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(step(list, current, -1));
        break;
      case 'Home':
        event.preventDefault();
        move(firstSelectable(list));
        break;
      case 'End':
        event.preventDefault();
        move(lastSelectable(list));
        break;
      case 'ArrowRight': {
        if (inSubmenu) break;
        const nested = submenuAt(items, activeIndex);
        if (!nested) break;
        event.preventDefault();
        setOpenSubmenu(activeIndex);
        // `null` when every nested row is disabled — focus then stays on the
        // parent, which is more useful than opening a surface nothing can hold.
        setSubmenuIndex(firstSelectable(nested));
        break;
      }
      case 'ArrowLeft':
        if (!inSubmenu) break;
        event.preventDefault();
        closeSubmenu();
        break;
      default:
        break;
    }
  };

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
      aria-orientation="vertical"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed z-menu min-w-[10rem] max-w-[24rem] gradient-border gradient-border--always rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-lg outline-none"
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
            // The row is current only while focus is at the top level; once
            // ArrowRight has moved it into the submenu, the submenu's own row
            // is, and two `tabIndex={0}`s would defeat the point of roving one.
            focused={activeIndex === index && submenuIndex === null}
            submenuIndex={openSubmenu === index ? submenuIndex : null}
            onOpenSubmenu={() => {
              // Hover opens the surface but does not move the keyboard into it
              // — the pointer and the keyboard are allowed to be in different
              // places, and yanking focus at every mouse twitch is not a menu.
              setOpenSubmenu('submenu' in item && item.submenu ? index : null);
              setSubmenuIndex(null);
            }}
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
  focused,
  submenuIndex,
  onOpenSubmenu,
  onClose,
}: {
  item: MenuEntry;
  /** Whether this menu reserves an icon gutter — see `ContextMenu`. */
  iconed: boolean;
  open: boolean;
  /** Holds the roving `tabIndex={0}`, and takes focus when it becomes true. */
  focused: boolean;
  /** Which of this row's submenu rows holds focus; `null` for none of them. */
  submenuIndex: number | null;
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
        focused={focused}
        expanded={item.submenu ? open : undefined}
        onClose={onClose}
      />

      {item.submenu && open ? (
        <Submenu
          items={item.submenu}
          iconed={subIconed}
          focusedIndex={submenuIndex}
          onClose={onClose}
        />
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
  focusedIndex,
  onClose,
}: {
  items: MenuItem[];
  iconed: boolean;
  /** Index into `items` of the row holding focus; `null` while the pointer owns it. */
  focusedIndex: number | null;
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
            focused={focusedIndex === index}
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
  focused,
  expanded,
  onClose,
}: {
  item: MenuEntry;
  iconed: boolean;
  /** Absent for a submenu parent, which opens on hover instead. */
  onSelect: (() => void) | undefined;
  /** Holds the roving `tabIndex={0}`, and takes focus when it becomes true. */
  focused: boolean;
  /** `aria-expanded`, for a submenu parent only; `undefined` on a leaf. */
  expanded?: boolean;
  onClose: () => void;
}) {
  const disabled = item.disabled ?? false;
  const Icon = item.icon;
  const descriptionId = useId();
  const described = item.description !== undefined;
  const buttonRef = useRef<HTMLButtonElement>(null);

  /*
    Focus follows the state, rather than the state following focus. Driving it
    from a prop is what makes "the submenu closed, so the parent row is current
    again" a single state change rather than a second imperative call at every
    place that can close one — Escape, ArrowLeft, and an arrow key that moves
    the top-level selection out from under a hover-opened submenu.

    `preventScroll`, matching every other focus call in the repo: a menu placed
    at the cursor has no business scrolling the view behind it.
  */
  useEffect(() => {
    if (focused) buttonRef.current?.focus({ preventScroll: true });
  }, [focused]);

  return (
    <button
      ref={buttonRef}
      type="button"
      role="menuitem"
      // Roving: exactly one row in the menu is a tab stop, and it is the one
      // the arrow keys have moved to. The rest stay reachable programmatically.
      tabIndex={focused ? 0 : -1}
      {...(expanded === undefined ? {} : { 'aria-haspopup': 'menu' as const, 'aria-expanded': expanded })}
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
