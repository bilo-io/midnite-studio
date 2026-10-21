import { useEffect, type MouseEvent } from 'react';
import { LuBot, LuLayoutGrid } from 'react-icons/lu';

import { BrowserPane, useBrowserStore, useWebAppsSync, WebAppsRailRow } from '@midnite/studio-feature-browser/renderer';
import { useFrameChrome, type FrameMenuEntry } from '@midnite/studio-frame';
import { WEB_APP_DEFINITIONS, WEB_APP_IDS } from '@midnite/studio-shared';

import { agentSessionStore, useAgentSession } from '../agent-session-store';
import { browserUiStore, useBrowserAppUi } from '../browser-ui-store';
import { useBrowserOccluder } from '../compose/browser-host';
import { BrowserDialogStore } from '../compose/browser-chrome';
import { useBrowserKeys } from '../use-browser-keys';
import { AgentSessionBar } from './agent-session-bar';
import { WebAppView } from './web-app-view';

/** A dialog or menu from the suite kit is DOM drawn over the page's native view, so it hides the view. */
function KitSurfacesOcclude() {
  const open = BrowserDialogStore((s) => s.request !== null || (s.prompt ?? null) !== null || (s.menu ?? null) !== null);
  useBrowserOccluder(open);
  return null;
}

/**
 * Midnite Browser's window: the browser feature's pane, full-window, with the web apps on a rail beside
 * it and the agent-session strip above it (#853's three settled pieces).
 *
 * - **The pane** is Studio's `BrowserPane` — the same tab strip, toolbar, new-tab page, find bar and
 *   native views — told by the host that it is the whole window (`standalone`), so it offers no layout
 *   picker, no close button and no detach.
 * - **Web apps** are the feature's `WebAppsRailRow`; the app on screen takes the page (`WebAppView`) and
 *   the tabs' native views hide underneath. "Web apps" turns them on and off — Studio's Settings ▸ Apps.
 * - **The agent session** is still a placeholder (`agent-session-store.ts`).
 */
export function BrowserShell() {
  const { IconButton, useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const webAppId = useBrowserAppUi((s) => s.webAppsFlyoutAppId);
  const enabledWebApps = useBrowserAppUi((s) => s.enabledWebApps);
  const agentActive = useAgentSession((s) => s.active);

  useWebAppsSync();
  useBrowserKeys();

  // A first launch (or a store whose last tab closed with the window) opens on the new-tab page.
  useEffect(() => {
    if (useBrowserStore.getState().tabs.length === 0) useBrowserStore.getState().openTab();
  }, []);

  const webAppsMenu = (event: MouseEvent) => {
    const items: FrameMenuEntry[] = WEB_APP_IDS.map((id) => {
      const on = enabledWebApps.includes(id);
      return {
        label: `${on ? 'Turn off' : 'Turn on'} ${WEB_APP_DEFINITIONS[id].label}`,
        onSelect: () => browserUiStore.getState().setWebAppEnabled(id, !on),
      };
    });
    dialogs.openMenu?.({ clientX: event.clientX, clientY: event.clientY }, items);
  };

  const toggleAgent = () => {
    if (agentActive) {
      agentSessionStore.getState().stop();
      return;
    }
    dialogs.prompt?.({
      title: 'Start an agent session',
      label: 'What should the agent do?',
      initialValue: 'Inspect the page and verify its accessibility',
      confirmLabel: 'Start',
      validate: (value) => (value.trim() === '' ? 'Give the agent a goal' : null),
      onConfirm: (goal) => agentSessionStore.getState().start(goal.trim()),
    });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <KitSurfacesOcclude />
      <nav aria-label="Browser rail" className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-border bg-card/40 py-2">
        <IconButton
          icon={LuBot}
          label={agentActive ? 'Stop Agent Session' : 'Start Agent Session'}
          size="sm"
          aria-pressed={agentActive}
          onClick={toggleAgent}
        />
        <div className="mt-auto flex flex-col items-center gap-2">
          <WebAppsRailRow />
          <IconButton icon={LuLayoutGrid} label="Web apps" size="sm" onClick={webAppsMenu} />
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <AgentSessionBar />
        <main className="relative min-h-0 flex-1">
          <BrowserPane shown={webAppId === null} />
          {webAppId !== null ? <WebAppView appId={webAppId} /> : null}
        </main>
      </div>
    </div>
  );
}
