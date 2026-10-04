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
import { MCP_CONTENT_KEY, MCP_SERVER_NAME, MCP_TOOL_IDS, MCP_TOOLS, isMcpToolId, isModelMcpToolId, isGameSlowToolId, GAME_CALL_TIMEOUT_MS, McpContentBlockSchema } from '@midnite/studio-shared';
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

const server = new Server(
  { name: MCP_SERVER_NAME, version: '1.0.0' },
  { capabilities: { tools: {} } },
);

/**
 * `tools/list` is answered from `MCP_TOOLS` alone, socket or no socket — an
 * agent should be able to discover what this server offers even while
 * Midnite Studio is closed or the setting is off.
 */
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: MCP_TOOL_IDS.map((id) => {
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
