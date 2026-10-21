import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Browser exposes — exactly what the browser feature's renderer and
 * Browser's own chrome call, and nothing else: the browser's `browser.*` tabs and the web apps'
 * `webApps.*` views (every channel the feature's manifest declares, bar the Vault's sign-in pair), the write-only `clipboard.writeText`
 * behind the tab menu's "Copy link", and `menu.onCommand` for the Mod+t / Mod+w a focused page hands
 * back. There is no `fs`, `secrets`, `window` or `ops` namespace: Browser holds no credential and opens
 * no repository, so the renderer can reach no file, no vault and no other window (`bridge.test.ts`
 * holds the list).
 */
export type BrowserBridge = {
  /** Report an Issue: the dialog's channels and the Help-menu event (`createReportBridge`). */
  report: ReportBridge;
  browser: MidniteStudioBridge['browser'];
  /**
   * The web apps' views. Not `signIns`/`signOut`: those are the Vault's (Studio's Vault view lists and
   * clears the partitions), and Browser's renderer has no reason to read or clear a sign-in.
   */
  webApps: Omit<MidniteStudioBridge['webApps'], 'signIns' | 'signOut'>;
  clipboard: MidniteStudioBridge['clipboard'];
  menu: MidniteStudioBridge['menu'];
};

export type { RendererIpc };

export function createBrowserBridge(ipc: RendererIpc): BrowserBridge {
  const { call, send, subscribe } = createBridgeSlice(ipc);
  return {
    // Report an Issue — the report feature's own preload half (`@midnite/studio-feature-report/bridge`).
    report: createReportBridge({ call, send, subscribe }),
    browser: {
      create: (req) => call(CHANNELS.browserCreate, req),
      close: (req) => send(CHANNELS.browserClose, req),
      navigate: (req) => send(CHANNELS.browserNavigate, req),
      back: (req) => send(CHANNELS.browserBack, req),
      forward: (req) => send(CHANNELS.browserForward, req),
      reload: (req) => send(CHANNELS.browserReload, req),
      stop: (req) => send(CHANNELS.browserStop, req),
      // Fires per resize frame — a round-trip would add latency for nothing to report back.
      setBounds: (req) => send(CHANNELS.browserSetBounds, req),
      setVisible: (req) => send(CHANNELS.browserSetVisible, req),
      activate: (req) => send(CHANNELS.browserActivate, req),
      devtools: (req) => send(CHANNELS.browserDevtools, req),
      find: (req) => send(CHANNELS.browserFind, req),
      findStop: (req) => send(CHANNELS.browserFindStop, req),
      clearData: () => call(CHANNELS.browserClearData),
      zoom: (req) => send(CHANNELS.browserZoom, req),
      devServerProbe: (req) => call(CHANNELS.browserDevServerProbe, req),
      setKeepAwake: (req) => send(CHANNELS.browserSetKeepAwake, req),
      setDiscardMs: (req) => send(CHANNELS.browserSetDiscardMs, req),
      onEvent: (handler) => subscribe(EVENT_CHANNELS.browserEvent, handler),
    },
    webApps: {
      enable: (req) => call(CHANNELS.webAppsEnable, req),
      disable: (req) => send(CHANNELS.webAppsDisable, req),
      setBounds: (req) => send(CHANNELS.webAppsSetBounds, req),
      activate: (req) => send(CHANNELS.webAppsActivate, req),
    },
    clipboard: {
      writeText: (req) => call(CHANNELS.clipboardWriteText, req),
    },
    menu: {
      onCommand: (handler) => subscribe(EVENT_CHANNELS.menuCommand, handler),
    },
  };
}
