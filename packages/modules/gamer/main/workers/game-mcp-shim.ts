#!/usr/bin/env node
/**
 * The stdio MCP shim of one Gamer game-agent run (Phase 113 Theme S slice 3). An agent CLI (Claude Code,
 * Codex) spawns this from the run's MCP config and speaks MCP over its stdin/stdout; this forwards each
 * `tools/call` to the run's private socket and answers `tools/list` itself — with the game agent's tools
 * only (`GAME_AGENT_TOOL_IDS`). It is launched by Gamer's own Electron binary as plain node
 * (`ELECTRON_RUN_AS_NODE=1`) with `--socket <path>`, so it needs no Studio installed, and without
 * `--socket` it has nothing to call: there is no fallback to any global server.
 *
 * Nothing but MCP frames goes to stdout (the transport owns it); diagnostics go to stderr.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { createRunShim, runShimSocketFromArgv } from '@midnite/studio-runtime/agent-run/run-shim';
import { GAME_AGENT_TOOL_IDS, GAME_CALL_TIMEOUT_MS, isGameSlowToolId, MCP_SERVER_NAME } from '@midnite/studio-shared';

/** A fast tool still waits on a page (a seek, a state read): a minute, never the 2 s of a socket round trip. */
const CALL_TIMEOUT_MS = 60_000;

const shim = createRunShim({
  toolIds: GAME_AGENT_TOOL_IDS,
  socketPath: runShimSocketFromArgv(process.argv),
  // `MCP_TOOLS` inputs are a union of distinct zod object types; `any` stops TypeScript walking it (as Studio's shim does).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toJsonSchema: (schema) => zodToJsonSchema(schema as any, { target: 'jsonSchema7' }) as Record<string, unknown>,
  timeoutMs: (tool) => (isGameSlowToolId(tool) ? GAME_CALL_TIMEOUT_MS : CALL_TIMEOUT_MS),
});

const server = new Server({ name: MCP_SERVER_NAME, version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, () => shim.listTools());
server.setRequestHandler(CallToolRequestSchema, async (request) => shim.callTool(request.params.name, request.params.arguments ?? {}));

server
  .connect(new StdioServerTransport())
  .then(() => process.stderr.write('[game-mcp-shim] ready\n'))
  .catch((err: unknown) => {
    process.stderr.write(`[game-mcp-shim] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = 1;
  });
