import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { ChevronRight } from 'lucide-react';

import type { IconComponent } from './icon-button';

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
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
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
      className="fixed z-menu min-w-[10rem] gradient-border gradient-border--always rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-lg"
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
  const disabled = item.disabled ?? false;
  const Icon = item.icon;

  return (
    <div className="relative" onMouseEnter={onOpenSubmenu}>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        // The reason belongs on the disabled item itself: a greyed-out
        // "Checkout" with no explanation is the most frustrating thing a menu
        // can show.
        title={disabled ? item.disabledReason : undefined}
        onClick={() => {
          if (disabled || item.submenu) return;
          item.onSelect?.();
          onClose();
        }}
        className={`flex w-full items-center gap-2 px-3 py-1 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          item.danger ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-accent'
        }`}
      >
        {iconed ? (
          Icon ? (
            <Icon
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              {...(item.iconStyle ? { style: item.iconStyle } : {})}
            />
          ) : (
            <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
          )
        ) : null}
        <span className="flex-1 truncate">{item.label}</span>
        {item.submenu ? <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" /> : null}
      </button>

      {item.submenu && open ? (() => {
        const subIconed = item.submenu.some(
          (sub) => sub.type !== 'separator' && sub.icon !== undefined,
        );
        return (
          <div
            role="menu"
            className="absolute left-full top-0 ml-px min-w-[9rem] rounded-md border border-border bg-popover py-1 shadow-lg"
          >
            {item.submenu.map((sub, index) => {
              if (sub.type === 'separator') {
                return <hr key={`sub-sep-${index}`} className="my-1 border-border" />;
              }
              const SubIcon = sub.icon;
              return (
                <button
                  key={sub.label}
                  type="button"
                  role="menuitem"
                  disabled={sub.disabled}
                  title={sub.disabled ? sub.disabledReason : undefined}
                  onClick={() => {
                    sub.onSelect?.();
                    onClose();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    sub.danger ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-accent'
                  }`}
                >
                  {subIconed ? (
                    SubIcon ? (
                      <SubIcon
                        aria-hidden
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        {...(sub.iconStyle ? { style: sub.iconStyle } : {})}
                      />
                    ) : (
                      <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    )
                  ) : null}
                  <span className="flex-1 truncate">{sub.label}</span>
                </button>
              );
            })}
          </div>
        );
      })() : null}
    </div>
  );
}
