import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appDataDirectory } from '@midnite/studio-runtime/data-directory';
import { startAppMcpServer } from '@midnite/studio-runtime/mcp/app-server';
import type { DispatchResult } from '@midnite/studio-runtime/agent-run/host';
import type { McpToolId } from '@midnite/studio-shared';

/** A throwaway appData base short enough for every `sun_path` the suite layout produces. */
export function makeAppDataBase(): string {
  return mkdtempSync(join(tmpdir(), 'ss-'));
}

/** A real suite-app MCP server (token and all) at `<base>/Midnite Runtime/apps/<id>/mcp/`. */
export async function startFakeApp(
  base: string,
  id: string,
  tools: readonly string[],
  dispatch: (tool: string, input: unknown) => Promise<DispatchResult> = async (tool) => ({ ok: true, value: { from: id, tool } }),
): Promise<{ socketPath: string; close: () => Promise<void> }> {
  const started = await startAppMcpServer({
    userDataDir: appDataDirectory(base, id),
    appVersion: '1',
    buildId: 't',
    isPackaged: true,
    dispatch,
    listTools: () => tools as McpToolId[],
  });
  if (!started.ok) throw new Error(started.message);
  return started.handle;
}
