import { reportMain, type ReportMainServices } from '@midnite/studio-feature-report/main';
import {
  browserMain,
  destroyAllBrowserTabs,
  destroyAllWebApps,
  startBrowserDiscardSweep,
  startWebAppsDiscardSweep,
  stopBrowserDiscardSweep,
  stopWebAppsDiscardSweep,
  type BrowserElectron,
  type BrowserHostWindow,
  type BrowserLog,
  type BrowserSenderIpc,
} from '@midnite/studio-feature-browser/main';
import { createIpcContext, type IpcContextElectron } from '@midnite/studio-runtime';
import { CHANNELS, schemas } from '@midnite/studio-shared';

/** The electron pieces Browser's main needs, injected so registration is testable under bare vitest. */
export type BrowserAppElectron = IpcContextElectron & {
  /** Report an Issue's services — the crash log sink, home dir, and the three OS calls the dialog needs. */
  report: ReportMainServices;
  /** The real `WebContentsView`/`session`/`screen`/`shell`, behind the feature's structural port. */
  electron: BrowserElectron;
  /** Browser's one window — where tabs attach and the web apps live. Null before it opens and after it closes. */
  getMainWindow: () => BrowserHostWindow | null;
  /** The window that sent an IPC message (`BrowserWindow.fromWebContents(event.sender)`), null when unknown. */
  senderWindow: (event: unknown) => BrowserHostWindow | null;
  /** `clipboard.writeText` — synchronous, as Electron's is. */
  writeClipboard: (text: string) => void;
  log: BrowserLog;
};

/**
 * The browser's sender-resolved registrations over `ipcMain` directly: the runtime's context parses a
 * payload but does not hand a handler its sender, and `create`/`setBounds`/`setVisible` act on the window
 * that asked. Same parse-first rule as {@link createIpcContext}.
 */
function senderIpc(el: BrowserAppElectron): BrowserSenderIpc {
  return {
    handleFromSender: (channel, schema, handler, onInvalid) =>
      el.ipcMain.handle(channel, async (event, raw) => {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
        return handler(parsed.data, el.senderWindow(event));
      }),
    sendFromSender: (channel, schema, handler, onInvalid) =>
      el.ipcMain.on(channel, (event, raw) => {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
          return;
        }
        try {
          handler(parsed.data, el.senderWindow(event));
        } catch (error) {
          onInvalid(`${channel}: handler threw: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
  };
}

/**
 * Registers every channel Browser's renderer can call: the browser feature's (`mstudio:browser:*` tabs
 * and `mstudio:web-apps:*`), and the write-only clipboard behind the tab menu's "Copy link". The services
 * are the feature's own — the same `browser-service.ts`, `web-apps-service.ts` and `browser-security.ts`
 * Studio composes, so every tab is a sandboxed, preload-free view on the `persist:browser` partition with
 * every permission denied and only http(s) navigations allowed, and each web app keeps its own
 * `persist:app-<id>` partition.
 *
 * Browser holds no credential: there is no vault connection, no pairing and no channel that answers a
 * secret. The web apps' idle discard is opt-in per app in Studio's settings; Browser has none, so it
 * reads as off for every app, while a hidden browser tab's discard follows the renderer's
 * `browserDiscardMs` exactly as in Studio.
 */
export function registerBrowserAppHandlers(el: BrowserAppElectron): { shutdown: () => void } {
  const ctx = createIpcContext(el);
  reportMain.register(ctx, el.report);
  browserMain.register(ctx, {
    electron: el.electron,
    log: el.log,
    readDiscardSettings: () => ({}),
    sender: senderIpc(el),
    getMainWindow: el.getMainWindow,
  });
  startBrowserDiscardSweep();
  startWebAppsDiscardSweep();

  ctx.ipc.handle(
    CHANNELS.clipboardWriteText,
    schemas.ClipboardWriteTextRequest,
    ({ text }) => {
      try {
        el.writeClipboard(text);
        return { ok: true as const };
      } catch (error) {
        // A clipboard the OS refuses is the user's environment, not a crash — report it, as Studio does.
        return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
      }
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  return {
    // Quit or last window closed: every tab and web-app view goes with it, as in Studio.
    shutdown: () => {
      stopBrowserDiscardSweep();
      stopWebAppsDiscardSweep();
      destroyAllBrowserTabs();
      destroyAllWebApps();
    },
  };
}
