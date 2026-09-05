import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { LuBug, LuCompass, LuInfinity, LuNotebookPen } from 'react-icons/lu';

import type { MenuEntry } from '../../components/context-menu';
import { useDismiss } from '../../components/use-dismiss';
import { useFocusTrap } from '../../components/use-focus-trap';
import { useUiStore } from '../../store/ui-store';

/**
 * One row of the quick-access menu.
 *
 * Reuses `context-menu.tsx`'s `MenuEntry` shape (label/icon/description/
 * disabled/disabledReason) rather than a parallel type, extended with the one
 * field this menu adds: the single-letter keystroke that activates it once
 * the menu is open.
 */
type QuickAccessItem = MenuEntry & { mnemonic: string };
type QuickAccessRow = QuickAccessItem | { type: 'separator' };

const ROWS: readonly QuickAccessRow[] = [
  {
    mnemonic: 'L',
    label: 'Loops',
    description: 'The four agent loops and their consoles',
    icon: LuInfinity,
    onSelect: () => useUiStore.getState().setFabPanelOpen(true),
  },
  {
    mnemonic: 'N',
    label: 'Notes',
    description: 'Capture a thought against this repository',
    icon: LuNotebookPen,
    onSelect: () => useUiStore.getState().setNotesOpen(true),
  },
  { type: 'separator' },
  {
    mnemonic: 'I',
    label: 'Report Issue',
    description: 'File it against bilo-io/midnite-apps',
    icon: LuBug,
    disabled: true,
    disabledReason: 'Coming soon',
    onSelect: () => {},
  },
  {
    mnemonic: 'G',
    label: 'Guided tour',
    description: 'A walkthrough of the workspace',
    icon: LuCompass,
    disabled: true,
    disabledReason: 'Coming soon',
    onSelect: () => {},
  },
] as const;

function isRow(entry: QuickAccessRow): entry is QuickAccessItem {
  return entry.type !== 'separator';
}

/** First row a keyboard user should land on — every row is a valid stop, disabled ones included. */
function firstStop(): number | null {
  const index = ROWS.findIndex(isRow);
  return index === -1 ? null : index;
}

/** Next row in `direction`, wrapping past either end — separators are the only rows skipped. */
function step(from: number | null, direction: 1 | -1): number | null {
  if (ROWS.length === 0) return null;
  const origin = from ?? (direction === 1 ? -1 : ROWS.length);
  for (let hop = 1; hop <= ROWS.length; hop += 1) {
    const index = (((origin + direction * hop) % ROWS.length) + ROWS.length) % ROWS.length;
    if (isRow(ROWS[index]!)) return index;
  }
  return null;
}

/**
 * The menu behind the FAB and the (formerly blank) assistant popover —
 * one component, rendered from both places, never forked (Phase 58 Theme E).
 *
 * Self-contained: it portals itself, positions itself near the corner both
 * entry points already sit in, registers as an occluder and owns Escape for
 * as long as it is open (`useDismiss`, Phase 62), and traps focus — a caller
 * only ever needs to mount it and hand it an `onClose`.
 *
 * Disabled rows (`Report Issue`, `Guided tour`) stay reachable by arrow key
 * and by their own mnemonic — unlike `ContextMenu`, which skips a disabled
 * row entirely — because a menu that cannot even be *looked at* on the
 * keyboard is the wrong way to say "not yet". Activating one shows its
 * `disabledReason` as a transient hint and leaves the menu open (Decision 4);
 * it never reads as an error for a feature that does not exist yet.
 */
export function QuickAccessMenu({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useDismiss(true, onClose, { layer: 'popover' });
  useFocusTrap(containerRef, true);

  // `quickAccessOpen` is the flag `use-keybindings.ts` gates the global
  // dispatcher on, so it has to be true for as long as ANY instance of this
  // menu is mounted — not only the FAB's, which is the one entry point that
  // also uses this same flag to decide whether to render at all. Set here
  // rather than only by that caller, so the assistant-menu entry point (which
  // mounts off its own local `useState`) still closes the same gate.
  useEffect(() => {
    useUiStore.getState().setQuickAccessOpen(true);
    return () => useUiStore.getState().setQuickAccessOpen(false);
  }, []);

  useEffect(() => {
    const index = firstStop();
    setActiveIndex(index);
    if (index !== null) rowRefs.current[index]?.focus({ preventScroll: true });
    return () => window.clearTimeout(hintTimer.current);
  }, []);

  const moveTo = (index: number | null) => {
    setActiveIndex(index);
    if (index !== null) rowRefs.current[index]?.focus({ preventScroll: true });
  };

  const activate = (index: number | null) => {
    if (index === null) return;
    const row = ROWS[index];
    if (!row || !isRow(row)) return;
    if (row.disabled) {
      setHint(row.disabledReason ?? 'Coming soon');
      window.clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(null), 2000);
      return;
    }
    row.onSelect?.();
    onClose();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveTo(step(activeIndex, 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        moveTo(step(activeIndex, -1));
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        activate(activeIndex);
        return;
      default:
        break;
    }

    // Mnemonic dispatch: a single letter jumps straight to, and activates,
    // the row it names — the keyboard path is an accelerator, never the only
    // one (clicking a row does the same thing). Case-insensitive so Caps Lock
    // is not a trap. `DEFAULT_KEYMAP` carries no unmodified single-letter
    // chord (see `use-keybindings.ts`'s `quickAccessOpen` gate), so there is
    // no global command this could collide with.
    if (event.key.length === 1) {
      const letter = event.key.toUpperCase();
      const index = ROWS.findIndex((row) => isRow(row) && row.mnemonic === letter);
      if (index !== -1) {
        event.preventDefault();
        moveTo(index);
        activate(index);
      }
    }
  };

  return createPortal(
    <div
      ref={containerRef}
      role="menu"
      aria-label="Quick access"
      aria-orientation="vertical"
      tabIndex={-1}
      data-testid="quick-access-menu"
      onKeyDown={onKeyDown}
      className="fixed bottom-[4.75rem] right-4 z-popover w-64 gradient-border gradient-border--always rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-xl outline-none"
    >
      {ROWS.map((row, index) => {
        if (!isRow(row)) {
          return <hr key={`sep-${index}`} className="my-1 border-border" />;
        }
        const Icon = row.icon;
        const focused = activeIndex === index;
        return (
          <button
            key={row.label}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            type="button"
            role="menuitem"
            data-testid={`quick-access-row-${row.mnemonic.toLowerCase()}`}
            aria-disabled={row.disabled === true ? true : undefined}
            title={row.disabled ? row.disabledReason : undefined}
            tabIndex={focused ? 0 : -1}
            onClick={() => activate(index)}
            onFocus={() => setActiveIndex(index)}
            className={`flex w-full items-start gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-accent ${
              row.disabled ? 'opacity-40' : ''
            }`}
          >
            {Icon ? (
              <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{row.label}</span>
              {row.description !== undefined ? (
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {row.description}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden
              className="shrink-0 rounded border border-border px-1 text-[10px] uppercase text-muted-foreground"
            >
              {row.mnemonic}
            </span>
          </button>
        );
      })}
      {hint !== null ? (
        <div className="border-t border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
