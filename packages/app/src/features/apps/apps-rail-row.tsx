import { useEffect, useState } from 'react';

import { APP_DEFINITIONS, APP_IDS, APP_ROLE, type AppId } from '@midnite/studio-shared';

import { IconButton } from '../../components/icon-button';
import { APP_ICON } from '../../components/icons';
import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';

/**
 * The bottom-of-rail app switcher. At rest it keeps only the most recently
 * opened app visible; hovering or moving keyboard focus into the region
 * reveals the complete set. Before any app has been opened, every enabled app
 * remains visible so the switcher is discoverable. A disabled app (not in
 * `enabledApps`) has no icon here at all — Settings ▸ Apps is the only place
 * to turn one on — so the rail never shows a control that only points
 * elsewhere.
 *
 * Two states per icon, checked in this order:
 * 1. **Detached** — a click calls `window.focusRole`, the same
 *    taskbar-style "bring to front" `PageDetachMark` uses for an already-open
 *    popout, rather than opening a flyout for a view that has moved out of
 *    this window entirely.
 * 2. **Docked** — a click opens the flyout on this app (enabling its view if
 *    this is the first time this session) and switches the flyout's active
 *    app if a different one was already open; clicking the ALREADY-active
 *    app's icon again closes the flyout, the toggle the phase doc's own
 *    "toggle row" wording describes.
 *
 * Always a vertical stack, collapsed OR expanded — unlike a `NavItem` row,
 * which only ever shows or hides a text label beside a fixed icon. A row
 * layout while expanded was tried first and reverted: the footer sits
 * bottom-anchored, so shrinking this block's height when the rail expands
 * (stacked icons → one row) shifts every OTHER footer control (the lock
 * button, Settings, the version pill) down by the difference — moving them
 * out from under a pointer that was already hovering one, which is exactly
 * the trap `nav-chord-tooltips.spec.ts`'s "gives the footer's lock button its
 * chord too" case caught. The reserved height stays constant, for however
 * many apps are enabled, even when only the recent app is rendered — keeping
 * the rest of the footer still as the switcher reveals and collapses.
 */
export function AppsRailRow({ expanded = false }: { expanded?: boolean }) {
  const enabledApps = useUiStore((s) => s.enabledApps);
  const detachedApps = useUiStore((s) => s.detachedApps);
  const flyoutAppId = useUiStore((s) => s.appsFlyoutAppId);
  const lastOpenedAppId = useUiStore((s) => s.lastOpenedAppId);
  /*
    Hover and focus are tracked as two independent booleans, not one `revealed`
    flag either can clear.

    Clicking a rail icon focuses that button AND opens the flyout, which then
    takes focus for itself — so the button blurs to a `relatedTarget` outside
    this group while the pointer has never left it. A single flag meant that
    blur collapsed the switcher out from under the pointer, and the very next
    click (on a second app's icon, to switch the flyout) landed on an element
    that no longer existed. `apps-rail-shots.spec.ts`'s "flyout switches its
    active app on a second rail click" is what caught it.
  */
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const revealed = hovered || focusWithin;

  // Disabling an app (Settings, Theme E) while its flyout is open must close
  // the flyout — there is no view left in this window to show. Detaching it
  // (Theme D) moves it out of this window's flyout the same way; main hides
  // the view on its own (`reparentAppView`'s `visible: false`), so this only
  // has to stop the flyout claiming a view that is no longer here.
  useEffect(() => {
    if (flyoutAppId === null) return;
    const stillDocked = enabledApps.includes(flyoutAppId) && !detachedApps.includes(flyoutAppId);
    if (!stillDocked) useUiStore.getState().closeAppsFlyout();
  }, [flyoutAppId, enabledApps, detachedApps]);

  const onClick = (id: AppId) => {
    if (detachedApps.includes(id)) {
      useUiStore.setState({ lastOpenedAppId: id });
      bridge()?.window.focusRole({ role: APP_ROLE[id] });
      return;
    }
    if (flyoutAppId === id) {
      useUiStore.getState().closeAppsFlyout();
      bridge()?.apps.activate({ id: null });
      return;
    }
    useUiStore.getState().openAppsFlyout(id);
    void bridge()
      ?.apps.enable({ id })
      .then(() => bridge()?.apps.activate({ id }));
  };

  // Disabled apps are filtered out of the rail entirely (below), so
  // `lastOpenedAppId` can still name one it just disabled in Settings — the
  // recent app is only worth collapsing to while it remains in that set.
  // Falling through to `null` here, rather than trusting the stale id, is
  // what stops a since-disabled app from being the switcher's single
  // collapsed icon: `railAppIds` would filter it out anyway, but a
  // `visibleAppIds` filter keyed on an absent id renders nothing rather than
  // falling back to the discoverable all-apps state.
  const recentAppId =
    lastOpenedAppId !== null && enabledApps.includes(lastOpenedAppId) ? lastOpenedAppId : null;
  const railAppIds = APP_IDS.filter((id) => enabledApps.includes(id));
  if (railAppIds.length === 0) return null;
  const visibleAppIds =
    revealed || recentAppId === null ? railAppIds : railAppIds.filter((id) => id === recentAppId);

  // The reserved height keeps the footer still as the switcher reveals and
  // collapses (see the doc comment above) — sized to the enabled count, not
  // always three, now that a disabled app has no row to reserve for. 24px
  // rows with a 4px `gap-1`: n rows is `n * 24 + (n - 1) * 4`.
  const reservedHeight = railAppIds.length * 24 + (railAppIds.length - 1) * 4;

  return (
    <div
      role="group"
      aria-label="Apps"
      className={`flex flex-col justify-center gap-1 ${expanded ? 'items-stretch' : 'items-center'}`}
      style={{ minHeight: reservedHeight }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        // `:focus-visible`, not plain focus: Chromium focuses a `<button>` on
        // mouse-down, so a plain-focus reveal would pin the switcher open for
        // the rest of the session after one click — the pointer leaves, the
        // DOM focus the user cannot see stays, and it never collapses again.
        // Tabbing in matches; clicking does not, which is exactly the split
        // this wants. (jsdom answers `true` for a focused button, so the unit
        // tests below still exercise the keyboard path.)
        if (event.target.matches(':focus-visible')) setFocusWithin(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
    >
      {visibleAppIds.map((id) => {
        const definition = APP_DEFINITIONS[id];
        const detached = detachedApps.includes(id);
        const label = detached
          ? `Focus the detached ${definition.label} window`
          : flyoutAppId === id
            ? `Close ${definition.label}`
            : `Open ${definition.label}`;
        return (
          <IconButton
            key={id}
            icon={APP_ICON[id]}
            label={label}
            size="sm"
            aria-pressed={!detached && flyoutAppId === id}
            data-testid={`apps-rail-${id}`}
            className={expanded ? 'w-full justify-start px-2' : ''}
            onClick={() => onClick(id)}
          >
            {expanded ? <span className="truncate text-xs">{definition.label}</span> : null}
          </IconButton>
        );
      })}
    </div>
  );
}
