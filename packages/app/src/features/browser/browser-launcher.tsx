import { useEffect, useRef, useState } from 'react';

import { useFocusTrap } from '../../components/use-focus-trap';
import { useUiStore, type BrowserLayout } from '../../store/ui-store';

import { BROWSER_LAYOUT_OPTIONS, stepBrowserLayout } from './browser-layouts';
import { BrowserLayoutIllustration } from './layout-illustration';

/**
 * Asks where the browser should go, before it goes there.
 *
 * Every other panel in the app can just appear — the terminal takes the
 * bottom of the column, the FAB panel the right edge, and neither choice is
 * the user's to make each time. The browser is different: it is the one
 * surface big enough that WHERE it opens is a decision about the whole
 * window, and the two answers ("give me the screen" vs. "put it beside what
 * I'm working on") are wanted at different moments by the same person.
 *
 * So `browser.toggle` from closed raises this instead of the pane, and the
 * pane opens from whichever option is taken. The cost of the extra keystroke
 * is paid back by pre-selecting the layout chosen last time: the common case
 * is `Mod+B` `Enter`, which is one more key than before and lands in the
 * shape you already wanted.
 *
 * Both input styles reach the same place. A click on a card opens it — a
 * mouse user who has already aimed at the thing they want should not then
 * have to find a confirm button. From the keyboard the row is a radiogroup:
 * arrows (or `1`/`2`/`3`) move the selection, `Enter` opens it, `Escape`
 * leaves everything as it was.
 */
export function BrowserLauncher() {
  const open = useUiStore((s) => s.browserLauncherOpen);
  const remembered = useUiStore((s) => s.browserLayout);

  if (!open) return null;
  // Keyed on the remembered layout so a launcher raised after the layout
  // changed elsewhere (the toolbar picker) starts on the current answer
  // rather than a stale one captured by the first mount.
  return <LauncherDialog key={remembered} remembered={remembered} />;
}

function LauncherDialog({ remembered }: { remembered: BrowserLayout }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<BrowserLayout>(remembered);

  useFocusTrap(containerRef, true);

  // Focus follows selection, which is what makes `Enter` land on the option
  // the arrows moved to — the radiogroup's roving tabindex only says where
  // Tab would go, not where the keyboard currently is.
  useEffect(() => {
    selectedRef.current?.focus({ preventScroll: true });
  }, [selected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useUiStore.getState().closeBrowserLauncher();
    };
    window.addEventListener('keydown', onKeyDown);

    /*
      A loaded browser tab paints as an Electron `WebContentsView` — an
      OS-composited layer above the entire renderer regardless of `z-index`
      (see `use-browser-bounds.ts`) — so any DOM overlay that might share the
      screen with one has to register as an occluder, the way the context menu
      and popover do. Today's only route here is `toggleBrowser` from CLOSED,
      where no view is up; this is what stops that from being a precondition
      of the dialog being visible at all the first time something else raises
      it over a live pane.
    */
    const store = useUiStore.getState();
    store.incrementOccluders();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      store.decrementOccluders();
    };
  }, []);

  const choose = (layout: BrowserLayout) => useUiStore.getState().openBrowser(layout);

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Open browser"
      onClick={(event) => {
        if (event.target === event.currentTarget) useUiStore.getState().closeBrowserLauncher();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        data-testid="browser-launcher"
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-popover shadow-xl outline-none"
      >
        <div className="p-4">
          <h2 className="text-sm font-semibold">Open browser</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a layout — arrows or 1–3 to choose, Enter to open.
          </p>

          <div
            role="radiogroup"
            aria-label="Browser layout"
            className="mt-4 grid gap-3 sm:grid-cols-3"
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected((current) => stepBrowserLayout(current, 1));
                return;
              }
              if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected((current) => stepBrowserLayout(current, -1));
                return;
              }
              // 1/2/3 select without opening, so a digit behaves like an
              // arrow rather than being a third, faster way to commit — the
              // one keystroke that commits is Enter, everywhere.
              const digit = Number(event.key);
              if (Number.isInteger(digit) && digit >= 1 && digit <= BROWSER_LAYOUT_OPTIONS.length) {
                event.preventDefault();
                setSelected(BROWSER_LAYOUT_OPTIONS[digit - 1]!.layout);
              }
            }}
          >
            {BROWSER_LAYOUT_OPTIONS.map((option, index) => {
              const active = option.layout === selected;
              return (
                <button
                  key={option.layout}
                  ref={active ? selectedRef : undefined}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  // Roving tabindex: the group is one stop, and Tab leaves it.
                  tabIndex={active ? 0 : -1}
                  data-testid={`browser-layout-${option.layout}`}
                  onClick={() => choose(option.layout)}
                  className={`flex flex-col gap-2 rounded-md border p-3 text-left transition-colors ${
                    active
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <BrowserLayoutIllustration
                    layout={option.layout}
                    className="h-auto w-full rounded"
                  />
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground">{index + 1}</span>
                    <span className="text-xs font-medium text-foreground">{option.label}</span>
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Remembered for next time — Esc to cancel.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => useUiStore.getState().closeBrowserLauncher()}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => choose(selected)}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Open
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
