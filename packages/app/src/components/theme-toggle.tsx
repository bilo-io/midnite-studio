import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTheme, type ThemePreference } from '@bilo-io/ui/theme';
import type { IconType } from 'react-icons';
import { LuCheck, LuClock, LuMonitor, LuMoon, LuSun } from 'react-icons/lu';

/**
 * The light/dark/system/time switch, in the title bar's right cluster.
 *
 * Replaces `<ThemeToggle>` from `@bilo-io/ui`, whose menu is anchored
 * `bottom-0 left-full` — a flyout to the RIGHT of its trigger, growing upward.
 * That is the correct geometry for the sidenav rail it was written for, and the
 * wrong one here: this app's trigger sits in the top-right corner of the window,
 * so the menu opened past the right edge and above the top one, and none of the
 * four options could be seen or clicked. The library takes no placement prop, so
 * the fix is a local control rather than a prop.
 *
 * Positioned the way <Tooltip> and <ContextMenu> already are — `fixed`, measured
 * against the trigger, clamped to the window — because a control this close to
 * two edges overflows as the NORMAL case, not the edge case.
 */
type Option = { value: ThemePreference; label: string; Icon: IconType };

const OPTIONS: readonly Option[] = [
  { value: 'light', label: 'Light', Icon: LuSun },
  { value: 'dark', label: 'Dark', Icon: LuMoon },
  { value: 'system', label: 'System', Icon: LuMonitor },
  // The library's fourth mode: light between 08:00 and 18:00, dark otherwise.
  { value: 'time', label: 'Time of day', Icon: LuClock },
];

export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * Right-aligned to the trigger, then clamped — a menu wider than the button
   * would otherwise start at the button's left edge and run off the window.
   * `useLayoutEffect` so the correction lands before paint instead of visibly
   * jumping, the same reason <ContextMenu> uses it.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = triggerRef.current?.getBoundingClientRect();
    const box = menuRef.current?.getBoundingClientRect();
    if (!anchor || !box) return;
    const margin = 8;
    setPlaced({
      x: clamp(anchor.right - box.width, margin, window.innerWidth - box.width - margin),
      y: clamp(anchor.bottom + 4, margin, window.innerHeight - box.height - margin),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const close = () => setOpen(false);
    // `capture`, matching <ContextMenu>: the click still reaches the option's
    // own handler, but a click anywhere else closes the menu first.
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // The trigger shows what you are LOOKING at, not what you picked: under
  // `system` and `time` the preference names a rule, and the rule's current
  // answer is the more useful thing for an icon to carry.
  const Trigger = resolved === 'dark' ? LuMoon : LuSun;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Toggle theme"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Trigger aria-hidden className="h-4 w-4" />
      </button>

      {/*
        Portalled to <body>, the same conclusion <Tooltip> reached: `fixed`
        coordinates are only viewport coordinates while no ancestor is a
        containing block, and a transform, a filter or a `backdrop-blur`
        anywhere up the title bar would silently turn them into local ones. The
        trigger sits in chrome this app does not own.
      */}
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Theme"
              className="fixed z-menu min-w-[10rem] animate-fade-in gradient-border gradient-border--always rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-lg"
              style={{ left: placed.x, top: placed.y }}
            >
              {OPTIONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={preference === value}
                  onClick={() => {
                    setPreference(value);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1 text-left transition-colors hover:bg-accent"
                >
                  <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{label}</span>
                  {/* Kept in the layout when unchecked, so the labels do not
                      shift as the tick moves between rows. */}
                  <LuCheck
                    aria-hidden
                    className={`h-3.5 w-3.5 shrink-0 ${preference === value ? '' : 'invisible'}`}
                  />
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));
