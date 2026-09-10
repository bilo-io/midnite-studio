import { useEffect } from 'react';

import { APP_DEFINITIONS, APP_IDS, APP_ROLE, type AppId } from '@midnite/studio-shared';

import { IconButton } from '../../components/icon-button';
import { APP_ICON } from '../../components/icons';
import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';

/**
 * The bottom-of-rail toggle row (Phase 83 Theme C) — one icon per app,
 * always all three: a disabled icon is the "enable this in Settings"
 * affordance, not an absent one, matching E.1's "removes/disables its rail
 * icon" wording for the disable direction.
 *
 * Three states per icon, checked in this order:
 * 1. **Disabled** (not in `enabledApps`) — inert, points at Settings.
 * 2. **Detached** — a click calls `window.focusRole`, the same
 *    taskbar-style "bring to front" `PageDetachMark` uses for an already-open
 *    popout, rather than opening a flyout for a view that has moved out of
 *    this window entirely.
 * 3. **Docked** — a click opens the flyout on this app (enabling its view if
 *    this is the first time this session) and switches the flyout's active
 *    app if a different one was already open; clicking the ALREADY-active
 *    app's icon again closes the flyout, the toggle the phase doc's own
 *    "toggle row" wording describes.
 */
export function AppsRailRow({ expanded }: { expanded: boolean }) {
  const enabledApps = useUiStore((s) => s.enabledApps);
  const detachedApps = useUiStore((s) => s.detachedApps);
  const flyoutAppId = useUiStore((s) => s.appsFlyoutAppId);

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

  return (
    <div
      role="group"
      aria-label="Apps"
      className={`flex items-center justify-center gap-1 ${expanded ? 'flex-row' : 'flex-col'}`}
    >
      {APP_IDS.map((id) => {
        const definition = APP_DEFINITIONS[id];
        const enabled = enabledApps.includes(id);
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
            disabled={!enabled}
            disabledReason={enabled ? undefined : 'turn it on in Settings ▸ Apps'}
            size="sm"
            aria-pressed={enabled && !detached && flyoutAppId === id}
            data-testid={`apps-rail-${id}`}
            onClick={() => onClick(id)}
          />
        );
      })}
    </div>
  );
}
