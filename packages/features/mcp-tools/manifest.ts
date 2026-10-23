import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The MCP tools feature — the `midnite` MCP server's Tools view (Phase 113
 * Theme N): which tools the suite's one server offers for the installed apps,
 * the master switch and the narrower allow switches, the live status with the
 * shim command a client connects with, and the last calls.
 *
 * One of the packages split out of the `agent` folder (`FEATURE_PACKAGE_SPLITS`):
 * it is a view without a rail row of its own. Studio renders it as Settings ▸
 * MCP Server (the page is unchanged — same switches, same test ids); Agents
 * renders it as its Tools tab. Which sections show, and which tools are listed,
 * follows the apps the host says are installed
 * (`shared/src/mcp-tool-owners.ts`), so Agents lists the frame's tools and its
 * own, never Gamer's.
 *
 * **The server itself is not here.** It reaches into the repository registry,
 * git and the media services, so it stays Studio's (`packages/desktop/src/main/mcp/`)
 * until the runtime daemon (Theme D's successor) can serve it for the suite. This
 * feature owns the three channels the view reads and writes, over a server port the
 * composer fills: Studio with the real server, Agents with one that reports itself
 * as not running.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const mcpToolsManifest = defineFeatureManifest({
  feature: 'agent',
  owner: 'agents',
  views: [],
  settingsPages: [],
  ipc: [CHANNELS.mcpGet, CHANNELS.mcpSet, CHANNELS.mcpCalls, CHANNELS.agentAuditList, CHANNELS.agentAuditExport, CHANNELS.agentLimitResolve],
  events: [EVENT_CHANNELS.agentLimitTripped],
  mcpTools: [],
});

export type McpToolsManifest = typeof mcpToolsManifest;
