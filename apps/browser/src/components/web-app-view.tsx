import { GoX } from 'react-icons/go';

import { useBrowserHost, WebAppPane } from '@midnite/studio-feature-browser/renderer';
import { bridge, useFrameChrome } from '@midnite/studio-frame';
import { WEB_APP_DEFINITIONS, type WebAppId } from '@midnite/studio-shared';

import { useBrowserAppUi } from '../browser-ui-store';

/**
 * A web app, full-window in place of the tabs — Browser's form of Studio's 380px flyout (#853 settled
 * that a web app takes the page, not a strip beside it). The view itself is the feature's `WebAppPane`
 * over its own `persist:app-<id>` partition. The rail's icon enables and activates it (the feature's
 * `WebAppsRailRow`, as in Studio); closing it here, or that icon again, puts the tabs back.
 */
export function WebAppView({ appId }: { appId: WebAppId }) {
  const { appIcon } = useBrowserHost();
  const { IconButton } = useFrameChrome();
  const Icon = appIcon[appId];
  const definition = WEB_APP_DEFINITIONS[appId];

  const close = () => {
    useBrowserAppUi.getState().closeWebAppsFlyout();
    bridge()?.webApps.activate({ id: null });
  };

  return (
    <section aria-label={definition.label} data-testid="web-app-view" className="absolute inset-0 flex flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <Icon aria-hidden className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-xs font-medium">{definition.label}</span>
        <IconButton icon={GoX} label={`Close ${definition.label}`} size="sm" onClick={close} />
      </div>
      <div className="relative min-h-0 flex-1">
        <WebAppPane appId={appId} />
      </div>
    </section>
  );
}
