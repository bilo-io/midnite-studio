import { join } from 'node:path';

import { createMcpStore, type McpSettings } from '../mcp-store';
import { defaultLogger, type Logger } from '../log';
import { startMcpServer, type McpServerHandle } from './server';
import { getMcpAllowUi, resetMcpAllowUiStateForTests, setMcpAllowUiState } from './ui-gate';

export { getMcpAllowUi } from './ui-gate';

/**
 * Where this build's stdio shim lives on disk (Theme F). Same resolution
 * `broker-client.ts`'s `getBrokerScript()` uses for `broker.js`: every
 * `bundle.mjs` outfile — `main`, `preload`, `broker`, `mcp-shim` — lands
 * beside `main.js`, so `__dirname` at runtime (this module is bundled INTO
 * `main.js`) already points at the right directory in dev and packaged
 * builds alike; `.asar.unpacked` is the one packaged-only wrinkle, since a
 * spawned child process cannot read a file out of the asar archive.
 */
function mcpShimScriptPath(): string {
  return join(__dirname, 'mcp-shim.js').replace('app.asar', 'app.asar.unpacked');
}

export type RegisterMcpServerOptions = {
  userDataDir: string;
  appVersion: string;
  buildId: string;
  isPackaged: boolean;
  log?: Logger;
};

export type McpStatus = {
  enabled: boolean;
  running: boolean;
  socketPath: string | null;
  shimPath: string | null;
  /** Phase 81 Theme F's second switch — whether `ui.navigate`/`ui.command` may actually act. */
  allowUi: boolean;
};

export type SetMcpEnabledResult = { ok: true; status: McpStatus } | { ok: false; message: string };

/**
 * Boot-time options, remembered so Theme F's Settings switch
 * (`setMcpEnabled`) can start or stop the server later without a restart —
 * `registerMcpServer` is the only caller with `userDataDir`/`appVersion`/
 * `buildId`/`isPackaged` in hand, at `app.whenReady()`.
 */
let bootOpts: RegisterMcpServerOptions | null = null;
let boundLog: Logger = defaultLogger;
let handle: McpServerHandle | null = null;
/** Mirrors `mcp-store.ts`'s persisted flag, kept in memory so `getMcpStatus` needs no disk read. */
let enabled = false;
/*
  `allowUi` itself lives in `./ui-gate` (`setMcpAllowUiState`/`getMcpAllowUi`),
  not as a local module variable here — `tools.ts` needs to read it and sits
  below this file in the package's own call graph (`index.ts` → `server.ts` →
  `dispatch.ts` → `tools.ts`), so a `tools.ts` import of this module would be
  a cycle. This file still owns *writing* it (`setMcpAllowUi`, below), which
  is what persists it through `mcp-store.ts`.
*/

/**
 * Start the MCP server if — and only if — the user has turned it on.
 *
 * Called inline from `main/index.ts`'s `app.whenReady()` block, alongside
 * `registerStatusHandlers()` et al. The enable flag lives in `mcp-store.ts`,
 * not `useUiStore`'s `localStorage`, because this decision has to be made
 * before any renderer — and so any `localStorage` — exists (Decision 8).
 */
export async function registerMcpServer(opts: RegisterMcpServerOptions): Promise<McpServerHandle | null> {
  bootOpts = opts;
  boundLog = opts.log ?? defaultLogger;

  const store = createMcpStore(opts.userDataDir);
  const settings = await store.load();
  enabled = settings.enabled;
  setMcpAllowUiState(settings.allowUi);
  if (!enabled) return null;

  const result = await startMcpServer({ ...opts, log: boundLog });
  if (!result.ok) {
    boundLog(`[mcp] failed to start: ${result.message}`);
    return null;
  }

  handle = result.handle;
  return handle;
}

/** The live handle, if the server is currently listening — `null` while off. Read by `main/index.ts`'s `before-quit`. */
export function getMcpServerHandle(): McpServerHandle | null {
  return handle;
}

export function getMcpStatus(): McpStatus {
  return {
    enabled,
    running: handle !== null,
    socketPath: handle?.socketPath ?? null,
    shimPath: mcpShimScriptPath(),
    allowUi: getMcpAllowUi(),
  };
}

/**
 * Theme F's Settings switch. Persists the flag through `mcp-store.ts`
 * **before** acting — Theme E's own rule — so a crash between the write and
 * the bind/close leaves the app off rather than listening with the UI saying
 * otherwise.
 */
export async function setMcpEnabled(next: boolean): Promise<SetMcpEnabledResult> {
  if (!bootOpts) {
    // Boot hasn't reached the MCP wiring yet — should not happen once
    // `main/index.ts` has registered the IPC handlers after `registerMcpServer`.
    return { ok: false, message: 'The MCP server has not finished starting up yet.' };
  }

  const settings: McpSettings = { version: 2, enabled: next, allowUi: getMcpAllowUi() };
  await createMcpStore(bootOpts.userDataDir).save(settings);
  enabled = next;

  if (next) {
    if (!handle) {
      const result = await startMcpServer({ ...bootOpts, log: boundLog });
      if (!result.ok) {
        boundLog(`[mcp] failed to start: ${result.message}`);
        return { ok: false, message: result.message };
      }
      handle = result.handle;
    }
  } else if (handle) {
    const closing = handle;
    handle = null;
    await closing.close();
  }

  return { ok: true, status: getMcpStatus() };
}

/**
 * Theme F's second Settings switch. Unlike `setMcpEnabled`, this never
 * starts or stops the socket — `allowUi` only gates whether `ui.navigate`/
 * `ui.command` will act once a call reaches them, so flipping it is a
 * persisted-flag write and nothing else.
 */
export async function setMcpAllowUi(next: boolean): Promise<SetMcpEnabledResult> {
  if (!bootOpts) {
    return { ok: false, message: 'The MCP server has not finished starting up yet.' };
  }

  const settings: McpSettings = { version: 2, enabled, allowUi: next };
  await createMcpStore(bootOpts.userDataDir).save(settings);
  setMcpAllowUiState(next);

  return { ok: true, status: getMcpStatus() };
}

/** Test-only: module state otherwise survives across a suite's test cases. */
export function resetMcpServerStateForTests(): void {
  bootOpts = null;
  boundLog = defaultLogger;
  handle = null;
  enabled = false;
  resetMcpAllowUiStateForTests();
}
