import { join } from 'node:path';

import { isMcpToolId, PLACEMENT_APP_IDS } from '@midnite/studio-shared';

import {
  createMcpToolListing,
  installedAppsFromLauncherFile,
  launcherInstalledFile,
  startMcpSocketServer,
  studioInstalledApps,
  type McpToolListing,
} from '@midnite/studio-runtime';

import { defaultLogger, type Logger } from '../log';
import { mcpSocketName } from '../socket-name';
import { recordMcpCall } from './audit';
import { dispatchMcpCall, type McpDispatchResult } from './dispatch';
import { MCP_TOOL_MANIFESTS } from './tool-manifests';

/**
 * The Unix-socket server behind Midnite Studio's MCP tools (Phase 57 Theme B). The transport — a
 * build-fingerprinted socket under `userData`, `0o600`, the broker's frame decoder, the caps and the
 * connection limit — is the runtime's `startMcpSocketServer` since Phase 113 Theme S slice 3, shared with
 * Gamer's per-run game-agent server; this file is Studio's side of it: the default socket path, the tool
 * listing per installed app, and the audit ring.
 *
 * Dispatches directly to the services behind `ipcMain` (via `dispatch.ts`), never through `ipcMain` itself:
 * `handle.ts`'s seam expects a renderer `event.sender` to resolve a window against, and an MCP call has no
 * window (Decision 2).
 */

export { MCP_MAX_CONNECTIONS } from '@midnite/studio-runtime';

export type McpServerHandle = {
  socketPath: string;
  close: () => Promise<void>;
};

export type StartMcpServerOptions = {
  userDataDir: string;
  appVersion: string;
  buildId: string;
  isPackaged: boolean;
  log?: Logger;
  /**
   * A private server (Media ▸ Models' iterative runs, Media ▸ Games' agent runs): listen here instead of the
   * fingerprinted default, and answer through `dispatch` instead of the full tool registry. Everything else —
   * the 0o600 socket, the frame limits, the audit ring — is the same code.
   */
  socketPath?: string;
  dispatch?: (tool: string, input: unknown) => Promise<McpDispatchResult>;
  /**
   * Which tools this server serves (Phase 113 Theme D): a tool whose app is not installed is refused as well
   * as unlisted. Defaults to Studio's — every app installed. Applies to the default tool registry only; a
   * private `dispatch` answers for itself.
   */
  listing?: McpToolListing;
  /**
   * The OS appData dir the launcher's `installed.json` lives under. When set, the default listing is Studio's
   * composed apps plus the bundles recorded there (re-read on change); unset (tests, private servers) it is
   * Studio's every-app default.
   */
  launcherAppDataDir?: string;
};

export type StartMcpServerResult = { ok: true; handle: McpServerHandle } | { ok: false; message: string };

/** Every `MCP_TOOLS` input is `McpRepoTarget` or extends it — this is the one field the audit ring is allowed to keep. */
function auditRepoPath(input: unknown): string {
  if (input && typeof input === 'object' && 'repoPath' in input) {
    const value = (input as { repoPath?: unknown }).repoPath;
    if (typeof value === 'string') return value;
  }
  return '';
}

export async function startMcpServer(opts: StartMcpServerOptions): Promise<StartMcpServerResult> {
  const { userDataDir, appVersion, buildId, isPackaged } = opts;
  const log = opts.log ?? defaultLogger;
  const socketPath = opts.socketPath ?? join(userDataDir, 'mcp', mcpSocketName(appVersion, buildId, isPackaged));
  const listing =
    opts.listing ??
    createMcpToolListing({
      installed: opts.launcherAppDataDir
        ? installedAppsFromLauncherFile({
            file: launcherInstalledFile(opts.launcherAppDataDir),
            // Studio composes every app, so it provides every app itself.
            provided: PLACEMENT_APP_IDS,
          })
        : studioInstalledApps,
      manifests: MCP_TOOL_MANIFESTS,
    });
  const dispatch =
    opts.dispatch ??
    (async (tool: string, input: unknown): Promise<McpDispatchResult> =>
      isMcpToolId(tool) && !listing.isListed(tool)
        ? { ok: false, kind: 'refused', message: `"${tool}" belongs to an app that is not installed.` }
        : dispatchMcpCall(tool, input));

  const started = await startMcpSocketServer({
    socketPath,
    dispatch,
    log: (line) => log(line),
    /*
      Theme E's audit ring, plus one `[mcp]` line through the one log seam — only for a recognised tool id
      (an unknown-tool call never reached a handler). `repoPath` is whatever the caller passed as that field
      and nothing deeper, so no payload body or path beyond the repo root is ever kept.
    */
    onCall: ({ tool, input, result, ms }) => {
      if (!isMcpToolId(tool)) return;
      const repoPath = auditRepoPath(input);
      recordMcpCall({ at: Date.now(), tool, repoPath, ok: result.ok, ms });
      log(`[mcp] ${tool} ${result.ok ? 'ok' : 'err'} ${ms}ms ${repoPath || '-'}`);
    },
  });
  if (!started.ok) return started;
  return { ok: true, handle: { socketPath: started.handle.socketPath, close: started.handle.close } };
}
