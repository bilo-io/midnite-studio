#!/usr/bin/env node
/**
 * Midnite Studio's MCP stdio shim (Phase 57 Theme C).
 *
 * A ~100-line adapter between two process lifetimes: an MCP client (an
 * agent CLI) spawns this as a short-lived child and speaks MCP over its
 * stdin/stdout, while the app it talks to is a long-lived GUI process that
 * cannot itself be spawned per-agent (Decision 4). This process forwards
 * every `tools/call` to the app's Unix socket (Theme B) and answers
 * `tools/list` straight from the shared tool registry.
 *
 * Runs under PLAIN `node`, not `ELECTRON_RUN_AS_NODE=1` like the pty broker
 * (`broker/server.ts`) — an MCP client spawns this directly and cannot be
 * expected to have Electron on its `PATH`, only whatever `node` binary the
 * shim's own shebang or invocation resolves to.
 *
 * Emits nothing on stdout that is not an MCP frame: `StdioServerTransport`
 * owns stdout for the protocol stream, so every diagnostic in this file goes
 * to stderr instead — an MCP stdio server that logs to stdout corrupts its
 * own transport.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MCP_CONTENT_KEY, MCP_SERVER_NAME, MCP_TOOLS, ALL_APPS_INSTALLED, listMcpToolIds, type IsAppInstalled, isMcpToolId, isModelMcpToolId, isGameSlowToolId, GAME_CALL_TIMEOUT_MS, isTerrainSlowToolId, TERRAIN_CALL_TIMEOUT_MS, isSpriteSlowToolId, isMapSlowToolId, MAP_CALL_TIMEOUT_MS, McpContentBlockSchema } from '@midnite/studio-shared';
import { MCP_TOOL_MANIFESTS } from '../main/mcp/tool-manifests';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { callMcpTool, SLOW_CALL_TIMEOUT_MS } from './client';

/**
 * `--socket <path>` points the shim at one specific socket instead of finding the app's global one —
 * how an in-app iterative run attaches its agent to that run's private server (Media ▸ Models).
 */
function socketFromArgv(argv: readonly string[]): string | undefined {
  const at = argv.indexOf('--socket');
  return at >= 0 ? argv[at + 1] : undefined;
}
const explicitSocket = socketFromArgv(process.argv);

function logToStderr(message: string): void {
  process.stderr.write(`[mcp-shim] ${message}\n`);
}

/**
 * Which apps are installed — SEAM (Phase 113 Theme D). The runtime's
 * `InstalledAppsSource` (`packages/runtime/src/mcp/installed-apps.ts`) is the
 * app-side twin; this shim runs under plain `node` and may import only
 * `shared`, so it carries its own read. Today every app counts as installed
 * (Studio is the superset build), so `tools/list` is the full registry. When
 * the launcher hosts the runtime, replace this body with a read of the
 * launcher's `installed.json` (`apps/launcher/src/common/installed-state.ts`);
 * nothing below changes.
 */
function readInstalledApps(): IsAppInstalled {
  return ALL_APPS_INSTALLED;
}

const server = new Server(
  { name: MCP_SERVER_NAME, version: '1.0.0' },
  { capabilities: { tools: {} } },
);

/**
 * `tools/list` is answered from `MCP_TOOLS` alone (filtered to the installed apps' tools), socket or no socket — an
 * agent should be able to discover what this server offers even while
 * Midnite Studio is closed or the setting is off.
 */
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: listMcpToolIds(readInstalledApps(), MCP_TOOL_MANIFESTS).map((id) => {
    const tool = MCP_TOOLS[id];
    /*
     * `tool.input` is a union of eight distinct `ZodObject` types across the
     * registry, and `zodToJsonSchema` is typed against `zod/v3`'s `ZodSchema`
     * while this file's zod import resolves to the package root — two
     * type identities zod's 3.25.x transitional dual-export layout keeps
     * nominally distinct even though they describe the same runtime object.
     * `any` here is what actually stops TypeScript short of walking either
     * union or that cross-module structural comparison ("excessively deep").
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema: any = tool.input;
    const inputSchema = zodToJsonSchema(schema, { target: 'jsonSchema7' }) as Record<string, unknown> & {
      type: 'object';
    };
    return { name: tool.id, description: tool.description, inputSchema };
  }),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!isMcpToolId(name)) {
    return {
      content: [{ type: 'text' as const, text: `Unknown tool: "${name}"` }],
      isError: true,
    };
  }

  const response = await callMcpTool(name, args ?? {}, {
    ...(explicitSocket ? { socketPath: explicitSocket } : {}),
    ...(isModelMcpToolId(name) ? { timeoutMs: SLOW_CALL_TIMEOUT_MS } : {}),
    ...(isGameSlowToolId(name) ? { timeoutMs: GAME_CALL_TIMEOUT_MS } : {}),
    ...(isTerrainSlowToolId(name) ? { timeoutMs: TERRAIN_CALL_TIMEOUT_MS } : {}),
    ...(isSpriteSlowToolId(name) ? { timeoutMs: SLOW_CALL_TIMEOUT_MS } : {}),
    ...(isMapSlowToolId(name) ? { timeoutMs: MAP_CALL_TIMEOUT_MS } : {}),
  });

  if (response.ok) {
    // A tool that answers with pictures (`model_render_preview`) hands its content blocks over untouched.
    const value = response.value as Record<string, unknown> | null;
    const blocks = value && typeof value === 'object' ? value[MCP_CONTENT_KEY] : undefined;
    if (Array.isArray(blocks)) {
      const parsed = blocks.map((block) => McpContentBlockSchema.safeParse(block));
      if (parsed.every((p) => p.success)) {
        return { content: parsed.map((p) => (p.success ? p.data : { type: 'text' as const, text: '' })) };
      }
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(response.value) }] };
  }

  return {
    content: [{ type: 'text' as const, text: `[${response.kind}] ${response.message}` }],
    isError: true,
  };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logToStderr('ready');
}

main().catch((err: unknown) => {
  logToStderr(`fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exitCode = 1;
});
