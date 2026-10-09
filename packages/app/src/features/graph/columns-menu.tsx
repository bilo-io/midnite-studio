import { useEffect, useRef, useState } from 'react';

import { LuCheck, LuSlidersHorizontal } from 'react-icons/lu';

import { useDismiss } from '../../components/use-dismiss';
import { useUiStore } from '../../store/ui-store';
import { GRAPH_COLUMN_MENU, type MenuColumn } from './column-visibility';

/**
 * The header's "config" dials button: a dropdown of checkable columns.
 *
 * Commit message, Date and Graph are the table's spine — shown checked and
 * disabled. CI is backed by the pre-existing `graphShowCi` (also a Settings
 * switch); the rest by `graphColumnVisibility`.
 */
export function ColumnsMenu() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const visibility = useUiStore((s) => s.graphColumnVisibility);
  const setVisible = useUiStore((s) => s.setGraphColumnVisible);
  const showCi = useUiStore((s) => s.graphShowCi);
  const setShowCi = useUiStore((s) => s.setGraphShowCi);

  useDismiss(open, () => setOpen(false), { layer: 'menu' });
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown, true);
    return () => window.removeEventListener('mousedown', onPointerDown, true);
  }, [open]);

  const isOn = (id: MenuColumn, locked: boolean): boolean =>
    locked ? true : id === 'ci' ? showCi : visibility[id as keyof typeof visibility];
  const toggle = (id: MenuColumn) => (id === 'ci' ? setShowCi(!showCi) : setVisible(id, !visibility[id as keyof typeof visibility]));

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label="Configure columns"
        title="Columns"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
          open ? 'bg-accent text-foreground' : ''
        }`}
      >
        <LuSlidersHorizontal aria-hidden className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Visible columns"
          className="absolute right-0 top-full z-menu mt-1 w-48 animate-fade-in overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
        >
          {GRAPH_COLUMN_MENU.map(({ id, label, locked }) => {
            const on = isOn(id, locked);
            return (
              <button
                key={id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                disabled={locked}
                onClick={() => toggle(id)}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-accent disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {on ? <LuCheck aria-hidden className="h-3.5 w-3.5" /> : null}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
