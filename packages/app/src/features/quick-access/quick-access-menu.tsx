import type { CompanionState } from '@midnite/studio-shared';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { LuBug, LuCompass, LuInfinity, LuNotebookPen, LuRepeat2 } from 'react-icons/lu';

import type { MenuEntry } from '../../components/context-menu';
import { useDismiss } from '../../components/use-dismiss';
import { useFocusTrap } from '../../components/use-focus-trap';
import { COMPANION_LOOK, CompanionGlyph } from '../companion/companion-look';
import { companionPorts } from '../companion/companion-ports';
import { useCompanionStore } from '../../store/companion-store';
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

/**
 * The rows, as a function of the one thing that can disable any of them.
 *
 * Was a frozen module-level `ROWS` array (Phase 58 Theme E), and could not
 * stay one: the companion's row is disabled while `companionEnabled` is false,
 * and its Repeat row is absent entirely when there is nothing to repeat — both
 * are store reads, and a module-scope array is evaluated once at import.
 * `firstStop`/`step` below take the rows as an argument for the same reason.
 *
 * Order is `L · C · N · —— · I · G`: the companion sits between Loops and
 * Notes, which is where the phase puts it, and the two not-yet-built leaves
 * stay below the separator.
 */
function buildRows(options: {
  companionEnabled: boolean;
  canRepeat: boolean;
}): readonly QuickAccessRow[] {
  const rows: QuickAccessRow[] = [
    {
      mnemonic: 'L',
      label: 'Loops',
      description: 'The four agent loops and their consoles',
      icon: LuInfinity,
      onSelect: () => useUiStore.getState().setFabPanelOpen(true),
    },
    {
      mnemonic: 'C',
      label: 'Companion',
      description: 'A chat thread that greets you and hands work to an agent',
      icon: CompanionGlyph,
      ...(options.companionEnabled
        ? {}
        : { disabled: true, disabledReason: 'Enable in Settings ▸ Companion' }),
      onSelect: () => useUiStore.getState().setCompanionPanelOpen(true),
    },
    {
      mnemonic: 'N',
      label: 'Notes',
      description: 'Capture a thought against this repository',
      icon: LuNotebookPen,
      onSelect: () => useUiStore.getState().setNotesOpen(true),
    },
  ];

  /*
    Repeat is offered only when there is a companion turn to repeat — an
    absent row rather than a disabled one, unlike the two "Coming soon" leaves
    below. Those two teach something by being visible (the feature is planned);
    this one would only ever say "there is nothing to say again", which the
    empty thread above it already says better.
  */
  if (options.companionEnabled && options.canRepeat) {
    rows.push({
      mnemonic: 'R',
      label: 'Repeat',
      description: 'Say the last thing again',
      icon: LuRepeat2,
      onSelect: () => companionPorts().repeat(),
    });
  }

  rows.push(
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
  );

  return rows;
}

function isRow(entry: QuickAccessRow): entry is QuickAccessItem {
  return entry.type !== 'separator';
}

/** First row a keyboard user should land on — every row is a valid stop, disabled ones included. */
function firstStop(rows: readonly QuickAccessRow[]): number | null {
  const index = rows.findIndex(isRow);
  return index === -1 ? null : index;
}

/** Next row in `direction`, wrapping past either end — separators are the only rows skipped. */
function step(
  rows: readonly QuickAccessRow[],
  from: number | null,
  direction: 1 | -1,
): number | null {
  if (rows.length === 0) return null;
  const origin = from ?? (direction === 1 ? -1 : rows.length);
  for (let hop = 1; hop <= rows.length; hop += 1) {
    const index = (((origin + direction * hop) % rows.length) + rows.length) % rows.length;
    if (isRow(rows[index]!)) return index;
  }
  return null;
}

/**
 * The menu behind the FAB (Phase 58 Theme E) — opened by the large FAB
 * button (`app.tsx`) or the `Mod+l` chord (`fab.toggle`).
 *
 * Self-contained: it portals itself, positions itself near the corner the
 * FAB sits in, registers as an occluder and owns Escape for as long as it is
 * open (`useDismiss`, Phase 62), and traps focus — a caller only ever needs
 * to mount it and hand it an `onClose`.
 *
 * `app.tsx` mounts the single instance, once, gated on the shared
 * `quickAccessOpen` flag (also what `use-keybindings.ts` gates the global
 * dispatcher on) — this component does not touch that flag itself; `onClose`
 * is always `() => setQuickAccessOpen(false)`. The statusbar's
 * `assistant-menu.tsx` used to carry a second trigger reading the same flag
 * — removed as a redundant control once its own `onClick` was found to call
 * the identical action the FAB's already did (see that file's doc comment)
 * — so this is a single render site with a single trigger now, not the "one
 * component, two entry points" shape it used to be.
 *
 * Disabled rows (`Report Issue`, `Guided tour`) stay reachable by arrow key
 * and by their own mnemonic — unlike `ContextMenu`, which skips a disabled
 * row entirely — because a menu that cannot even be *looked at* on the
 * keyboard is the wrong way to say "not yet". Activating one shows its
 * `disabledReason` as a transient hint and leaves the menu open (Decision 4);
 * it never reads as an error for a feature that does not exist yet.
 *
 * **This popover is also the "status-bar assistant popover" Phase 79 Theme H
 * asks to fill in, and that took reading the tree rather than the phase doc.**
 * Theme H was written against a placeholder body reading "Midnite Assistant
 * Menu (Blank for now)" — which Phase 58 Theme E had already replaced by the
 * time it executed. So the companion strip Theme H specifies — state label
 * with the FAB's own glyph, the last turn ellipsised, a Repeat row and an
 * "open companion" row — lands here, on the surface that actually exists,
 * with the `C` leaf doubling as that open row rather than a second one
 * beside it.
 */
export function QuickAccessMenu({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const companionEnabled = useUiStore((s) => s.companionEnabled);
  const companionState = useCompanionStore((s) => s.state);
  const transcript = useCompanionStore((s) => s.transcript);
  const lastCompanionTurn = useMemo(
    () => [...transcript].reverse().find((turn) => turn.role === 'companion') ?? null,
    [transcript],
  );

  const rows = useMemo(
    () => buildRows({ companionEnabled, canRepeat: lastCompanionTurn !== null }),
    [companionEnabled, lastCompanionTurn],
  );

  useDismiss(true, onClose, { layer: 'popover' });
  useFocusTrap(containerRef, true);

  useEffect(() => {
    const index = firstStop(rows);
    setActiveIndex(index);
    if (index !== null) rowRefs.current[index]?.focus({ preventScroll: true });
    return () => window.clearTimeout(hintTimer.current);
    // Mount only: `rows` changes identity whenever the transcript does, and
    // re-running this would steal focus back to the first row while the user
    // was arrowing through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveTo = (index: number | null) => {
    setActiveIndex(index);
    if (index !== null) rowRefs.current[index]?.focus({ preventScroll: true });
  };

  const activate = (index: number | null) => {
    if (index === null) return;
    const row = rows[index];
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
        moveTo(step(rows, activeIndex, 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        moveTo(step(rows, activeIndex, -1));
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
      const index = rows.findIndex((row) => isRow(row) && row.mnemonic === letter);
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
      <CompanionStrip
        enabled={companionEnabled}
        state={companionState}
        lastText={lastCompanionTurn?.text ?? null}
      />
      {rows.map((row, index) => {
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

/**
 * The companion's own header inside the popover (Phase 79 Theme H).
 *
 * Not a menu row — it is a readout, not something you activate, so it sits
 * above the `role="menuitem"` list and outside the arrow-key ring. Two lines
 * of the last thing said, clamped rather than truncated to one: a spoken
 * sentence rarely fits in a 256px row, and one line of it usually stops before
 * the verb.
 *
 * With the companion switched off it collapses to the single row the phase
 * asks for. The `C` leaf below stays visible-but-disabled in that state, which
 * is deliberately the other half of the same message: this line says what to
 * do, that row says where the thing you are enabling will appear.
 */
function CompanionStrip({
  enabled,
  state,
  lastText,
}: {
  enabled: boolean;
  state: CompanionState;
  lastText: string | null;
}) {
  if (!enabled) {
    return (
      <div
        data-testid="companion-strip"
        className="border-b border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground"
      >
        Enable the companion in Settings
      </div>
    );
  }

  const look = COMPANION_LOOK[state];
  const Glyph = look.icon;
  return (
    <div
      data-testid="companion-strip"
      className="border-b border-border/70 px-3 py-1.5"
    >
      <div className="flex items-center gap-1.5">
        <Glyph aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate text-[11px] font-medium text-muted-foreground">
          {look.label}
        </span>
      </div>
      {lastText !== null ? (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-foreground/80">
          {lastText}
        </p>
      ) : null}
    </div>
  );
}
