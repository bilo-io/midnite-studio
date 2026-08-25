import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[13rem] rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-lg"
      style={{ left: placed.x, top: placed.y }}
    >
      {items.map((item, index) =>
        item.type === 'separator' ? (
          <hr key={`sep-${index}`} className="my-1 border-border" />
        ) : (
          <MenuRow
            key={item.label}
            item={item}
            open={openSubmenu === index}
            onOpenSubmenu={() => setOpenSubmenu('submenu' in item && item.submenu ? index : null)}
            onClose={onClose}
          />
        ),
      )}
    </div>
  );
}

function MenuRow({
  item,
  open,
  onOpenSubmenu,
  onClose,
}: {
  item: MenuEntry;
  open: boolean;
  onOpenSubmenu: () => void;
  onClose: () => void;
}) {
  const disabled = item.disabled ?? false;

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
        <span className="flex-1 truncate">{item.label}</span>
        {item.submenu ? <span aria-hidden>›</span> : null}
      </button>

      {item.submenu && open ? (
        <div
          role="menu"
          className="absolute left-full top-0 ml-px min-w-[11rem] rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          {item.submenu.map((sub, index) =>
            sub.type === 'separator' ? (
              <hr key={`sub-sep-${index}`} className="my-1 border-border" />
            ) : (
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
                className={`flex w-full px-3 py-1 text-left transition-colors disabled:opacity-40 ${
                  sub.danger ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-accent'
                }`}
              >
                {sub.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
