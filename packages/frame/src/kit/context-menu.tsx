import { useEffect, useRef, useState } from 'react';
import { LuChevronRight } from 'react-icons/lu';

import type { FrameMenuEntry } from '../chrome/types';

/**
 * The context menu an extracted app wears (Phase 113 Theme S): a fixed list at the pointer, one level of
 * submenu opened inline on hover or click, Escape or a click outside to close. A row that acts closes the
 * menu first, then runs. The app's own menu (Studio's `DialogHost`) is richer — keyboard roving, a shortcut
 * column — and is what Studio installs; this is the plain one `createDialogs()` gives every other app.
 */
export type KitContextMenuProps = { x: number; y: number; items: FrameMenuEntry[]; onClose: () => void };

function Rows({ items, onClose, nested = false }: { items: FrameMenuEntry[]; onClose: () => void; nested?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul role="menu" className={nested ? 'absolute left-full top-0 min-w-40 rounded-md border border-border bg-popover p-1 shadow-lg' : ''}>
      {items.map((item, index) => {
        if ('type' in item) return <li key={`sep-${index}`} role="separator" className="my-1 h-px bg-border" />;
        const tone = 'danger' in item && item.danger ? 'text-destructive' : 'text-foreground';
        const Icon = item.icon;
        const label = (
          <>
            {Icon ? <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" /> : null}
            <span className="flex-1 truncate text-left">{item.label}</span>
          </>
        );
        if ('submenu' in item) {
          return (
            <li key={item.label} role="none" className="relative" onMouseEnter={() => setOpen(index)} onMouseLeave={() => setOpen((cur) => (cur === index ? null : cur))}>
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open === index}
                onClick={() => setOpen(index)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent ${tone}`}
              >
                {label}
                <LuChevronRight aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
              {open === index ? <Rows items={item.submenu} onClose={onClose} nested /> : null}
            </li>
          );
        }
        const dead = item.disabled === true;
        return (
          <li key={item.label} role="none">
            <button
              type="button"
              role="menuitem"
              aria-disabled={dead || undefined}
              title={dead ? item.disabledReason : item.description}
              onClick={() => {
                if (dead) return;
                onClose();
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs ${tone} ${dead ? 'cursor-default opacity-40' : 'hover:bg-accent'}`}
            >
              {label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function KitContextMenu({ x, y, items, onClose }: KitContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);
  return (
    <div ref={ref} data-testid="kit-context-menu" style={{ left: x, top: y }} className="fixed z-dialog min-w-44 rounded-md border border-border bg-popover p-1 shadow-lg">
      <Rows items={items} onClose={onClose} />
    </div>
  );
}
