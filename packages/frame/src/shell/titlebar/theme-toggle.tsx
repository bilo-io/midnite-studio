import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTheme, type ThemePreference } from '@bilo-io/ui/theme';
import type { IconType } from 'react-icons';
import { LuCheck, LuClock, LuMonitor, LuMoon, LuSun } from 'react-icons/lu';

/**
 * The light/dark/system/time switch for the title bar's right cluster (Phase 123 Theme J.4).
 *
 * `@bilo-io/ui`'s own `ThemeToggle` opens a flyout to the right of its trigger, which is right for a rail
 * and wrong in the top-right corner of a window. This one is portalled to `<body>` and clamped to the
 * viewport. It dismisses on Escape (focus back to the trigger), an outside press, a resize and the window
 * losing focus. Studio keeps its own `components/theme-toggle.tsx` for the layered dismissal stack its
 * dialogs share (`use-dismiss` reads Studio's ui-store, which the frame may not import).
 */
type Option = { value: ThemePreference; label: string; Icon: IconType };

const OPTIONS: readonly Option[] = [
  { value: 'light', label: 'Light', Icon: LuSun },
  { value: 'dark', label: 'Dark', Icon: LuMoon },
  { value: 'system', label: 'System', Icon: LuMonitor },
  { value: 'time', label: 'Time of day', Icon: LuClock },
];

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [open]);

  // The trigger shows what you are looking at, not what you picked: under `system` and `time` the
  // preference names a rule, and the rule's current answer is the more useful thing for an icon to carry.
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
                  <LuCheck aria-hidden className={`h-3.5 w-3.5 shrink-0 ${preference === value ? '' : 'invisible'}`} />
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
