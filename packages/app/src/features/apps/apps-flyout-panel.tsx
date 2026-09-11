import { useCallback, useEffect, useRef } from 'react';

import { APP_DEFINITIONS, APP_ROLE } from '@midnite/studio-shared';
import { GoX } from 'react-icons/go';
import { LuSquareArrowOutUpRight } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { APP_ICON } from '../../components/icons';
import { useDismiss } from '../../components/use-dismiss';
import { useFocusTrap } from '../../components/use-focus-trap';
import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';
import { AppPane } from './app-pane';

/**
 * The apps rail's dismiss-on-click-away flyout (Phase 83 Theme C).
 *
 * A bespoke overlay rather than the generic `Popover` component: `Popover`
 * anchors a panel to one trigger button with `place()`'s top/bottom math,
 * and this panel instead sits in the fixed column immediately right of the
 * nav rail — "further left than the repos bar" (the phase doc's own framing
 * of `repos-panel.tsx` as the shape this deliberately is NOT: a resizable
 * `LayoutSizes` layout slot). So it is rendered as an `absolute` sibling
 * inside `app.tsx`'s own content row, at the same `inset-y-0` bounds
 * `BrowserPane`'s full-screen overlay uses, rather than portalled and
 * placed against a rail icon's own rect.
 *
 * There is no tab strip: the rail icons themselves are the switcher (Theme
 * C's own decision), so this panel only ever draws whichever app
 * `appsFlyoutAppId` names.
 */
export function AppsFlyoutPanel() {
  const appId = useUiStore((s) => s.appsFlyoutAppId);
  const open = appId !== null;
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    useUiStore.getState().closeAppsFlyout();
    bridge()?.apps.activate({ id: null });
  }, []);

  useFocusTrap(containerRef, open);
  // Passive, not blocking: a menu or dialog raised over the flyout should
  // take Escape first, mirroring `browser-pane.tsx`'s own reasoning — a
  // blocking registration here would also occlude the flyout's native
  // `WebContentsView` for as long as it is open, i.e. always.
  useDismiss(open, close, { layer: 'inline', blocking: false });

  // `useDismiss` only ever answers Escape (see its own doc) — click-away is
  // this component's own job, the same `pointerdown` pattern `Popover` uses.
  // Rail icon clicks are excluded rather than raced against: a click on a
  // DIFFERENT enabled app's icon should switch the flyout (`apps-rail-row.tsx`'s
  // own `onClick`), not close it out from under that click's own effect, and a
  // click on the CURRENTLY active app's icon already toggles it closed there.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-testid^="apps-rail-"]')) return;
      close();
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, close]);

  if (!open) return null;

  const definition = APP_DEFINITIONS[appId];
  const Icon = APP_ICON[appId];

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-label={definition.label}
      data-testid="apps-flyout"
      className="absolute inset-y-0 left-0 z-popover flex w-[380px] flex-col border-r border-border bg-background shadow-2xl outline-none"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <Icon aria-hidden className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-xs font-medium">{definition.label}</span>
        <IconButton
          icon={LuSquareArrowOutUpRight}
          label={`Detach ${definition.label} into its own window`}
          size="sm"
          onClick={() => {
            // The flyout closes without touching visibility itself: the view
            // is about to be reparented into its own popout by main
            // (`window-handlers.ts`), which shows it there — closing the
            // flyout AND telling main to hide it would race the very move
            // that is meant to keep it visible, just somewhere else.
            useUiStore.getState().closeAppsFlyout();
            bridge()?.window.detach({ role: APP_ROLE[appId] });
          }}
        />
        <IconButton icon={GoX} label={`Close ${definition.label}`} size="sm" onClick={close} />
      </div>
      <div className="relative min-h-0 flex-1">
        <AppPane appId={appId} />
      </div>
    </div>
  );
}
