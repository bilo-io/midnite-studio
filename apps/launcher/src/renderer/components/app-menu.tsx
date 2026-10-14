import { useEffect, useRef, useState } from 'react';
import { LuEllipsis } from 'react-icons/lu';

import type { LauncherApp } from '../../common/catalog';

export type MenuItem = { id: string; label: string; onSelect: () => void; danger?: boolean; disabled?: boolean };

/** The "…" beside each primary button. Closes on outside click and Escape. */
export function AppMenu({ app, items }: { app: LauncherApp; items: readonly MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-root" ref={root}>
      <button
        type="button"
        className="btn btn-icon"
        aria-label={`More for Midnite ${app.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <LuEllipsis size={16} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`menu-item${item.danger ? ' menu-item-danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
