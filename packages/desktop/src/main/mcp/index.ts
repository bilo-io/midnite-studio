import { createMcpStore } from '../mcp-store';
import { defaultLogger, type Logger } from '../log';
import { startMcpServer, type McpServerHandle } from './server';

export type RegisterMcpServerOptions = {
  userDataDir: string;
  appVersion: string;
  buildId: string;
  isPackaged: boolean;
  log?: Logger;
};

/**
 * Start the MCP server if — and only if — the user has turned it on.
 *
 * Called inline from `main/index.ts`'s `app.whenReady()` block, alongside
 * `registerStatusHandlers()` et al. The enable flag lives in `mcp-store.ts`,
 * not `useUiStore`'s `localStorage`, because this decision has to be made
 * before any renderer — and so any `localStorage` — exists (Decision 8). This
 * phase (Themes A–D) ships no UI to flip that flag (Theme F's settings page
 * is a later batch), so in practice `enabled` stays `false` and this resolves
 * to `null` for every user until then — off by default, and nothing about a
 * fresh profile changes.
 */
export async function registerMcpServer(opts: RegisterMcpServerOptions): Promise<McpServerHandle | null> {
  const log = opts.log ?? defaultLogger;
  const store = createMcpStore(opts.userDataDir);
  const settings = await store.load();
  if (!settings.enabled) return null;

  const result = await startMcpServer({
    userDataDir: opts.userDataDir,
    appVersion: opts.appVersion,
    buildId: opts.buildId,
    isPackaged: opts.isPackaged,
    log,
  });

  if (!result.ok) {
    log(`[mcp] failed to start: ${result.message}`);
    return null;
  }

  return result.handle;
}
