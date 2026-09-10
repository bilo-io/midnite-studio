import { useEffect } from 'react';

import { useOccluder } from '../../components/use-occluder';
import { useUiStore, type BrowserLayout } from '../../store/ui-store';
import { BROWSER_LAYOUT_OPTIONS } from './browser-layouts';
import { BrowserLayoutIllustration } from './layout-illustration';

/**
 * An App-Switcher-style HUD overlay for cycling browser view modes with Mod+B.
 *
 * While the user holds Mod (Command on macOS, Ctrl on Linux/Windows), each
 * press of B advances through the three layouts ('full', 'left', 'right').
 * When the user releases the modifier, the overlay dismisses and opens the
 * browser in the selected layout.
 *
 * Also supports arrows, 1-3 direct pick, Enter to commit, Esc to cancel, and
 * mouse clicks.
 */
export function BrowserSwitcherOverlay() {
  const open = useUiStore((s) => s.browserSwitcherOpen);
  const selected = useUiStore((s) => s.browserSwitcherSelected);

  // Register as an occluder while the HUD is up so native WebContentsView
  // bounds do not punch through the switcher HUD.
  useOccluder(open);

  useEffect(() => {
    if (!open) return;

    const onKeyUp = (event: KeyboardEvent) => {
      // When Mod (Meta on Mac, Control on Linux/Windows) is released, commit.
      if (
        event.key === 'Meta' ||
        event.key === 'Control' ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        useUiStore.getState().commitBrowserSwitcher();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        useUiStore.getState().closeBrowserSwitcher();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        useUiStore.getState().commitBrowserSwitcher();
        return;
      }
      if (
        event.key === 'ArrowRight' ||
        event.key === 'ArrowDown' ||
        (event.key === 'Tab' && !event.shiftKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        useUiStore.getState().cycleBrowserSwitcher(1);
        return;
      }
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowUp' ||
        (event.key === 'Tab' && event.shiftKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        useUiStore.getState().cycleBrowserSwitcher(-1);
        return;
      }
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= BROWSER_LAYOUT_OPTIONS.length) {
        event.preventDefault();
        event.stopPropagation();
        const option = BROWSER_LAYOUT_OPTIONS[digit - 1];
        if (option) {
          useUiStore.setState({ browserSwitcherSelected: option.layout });
        }
      }
    };

    const onBlur = () => {
      useUiStore.getState().commitBrowserSwitcher();
    };

    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [open]);

  if (!open) return null;

  const handleSelect = (layout: BrowserLayout) => {
    useUiStore.setState({ browserSwitcherSelected: layout });
    useUiStore.getState().commitBrowserSwitcher();
  };

  return (
    <div
      role="region"
      aria-label="Browser view switcher"
      data-testid="browser-switcher-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-xs select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          useUiStore.getState().closeBrowserSwitcher();
        }
      }}
    >
      <div
        role="radiogroup"
        aria-label="Browser layout"
        className="flex flex-col items-center gap-3 rounded-2xl border border-border/80 bg-card/90 dark:bg-card/85 p-5 shadow-2xl backdrop-blur-xl animate-fade-in max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full px-1">
          <span className="text-xs font-semibold text-foreground tracking-wide uppercase">
            Switch Browser View
          </span>
          <span className="text-[10px] text-muted-foreground">
            Release modifier to switch
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 w-full mt-1">
          {BROWSER_LAYOUT_OPTIONS.map((option, index) => {
            const active = option.layout === selected;
            return (
              <button
                key={option.layout}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`browser-switcher-option-${option.layout}`}
                onClick={() => handleSelect(option.layout)}
                className={`group flex flex-col items-center gap-2.5 rounded-xl border p-3 text-center transition-all cursor-pointer ${
                  active
                    ? 'border-primary bg-primary/15 ring-2 ring-primary/50 shadow-lg scale-102'
                    : 'border-border/50 bg-background/40 hover:bg-accent/40 hover:border-border'
                }`}
              >
                <BrowserLayoutIllustration
                  layout={option.layout}
                  className="h-auto w-full rounded-md drop-shadow-xs"
                />
                <div className="flex flex-col items-center">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground">{index + 1}</span>
                    <span
                      className={`text-xs font-medium ${active ? 'text-foreground font-semibold' : 'text-foreground/80'}`}
                    >
                      {option.short}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
