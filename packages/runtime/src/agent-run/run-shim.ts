import { MCP_CONTENT_KEY, MCP_TOOLS, McpContentBlockSchema, type McpContentBlock, type McpResponse, type McpToolId } from '@midnite/studio-shared';

import { callMcpSocket } from './socket-call';

/**
 * The stdio shim of one in-app agent run (Phase 113 Theme S slice 3), minus the MCP SDK (the entry that
 * ships it wires these two handlers into a `Server` over stdio — Gamer's `main/workers/game-mcp-shim.ts`).
 *
 * Narrower than Studio's general shim on purpose: `tools/list` names **only** the run's tools, a call to any
 * other id is refused here without touching the socket, and the socket is the one `--socket` named — there is
 * no fallback to the app's global server, so a run's agent can never reach the user's `midnite` server. The
 * private server refuses anything outside the run again (`createGameAgentDispatch`); this is the second wall.
 */

export type RunShimTool = { name: string; description: string; inputSchema: Record<string, unknown> & { type: 'object' } };
export type RunShimResult = { content: McpContentBlock[]; isError?: true };

export type RunShimOptions = {
  toolIds: readonly McpToolId[];
  /** The run's socket — required: a shim without one answers every call with an error. */
  socketPath: string | null;
  /** `zod-to-json-schema` over a tool's input schema (injected so this file needs no converter). */
  toJsonSchema: (schema: unknown) => Record<string, unknown>;
  timeoutMs: (tool: McpToolId) => number;
  call?: typeof callMcpSocket;
};

/** `--socket <path>` from the argv, or null. */
export function runShimSocketFromArgv(argv: readonly string[]): string | null {
  const at = argv.indexOf('--socket');
  const value = at >= 0 ? argv[at + 1] : undefined;
  return value && !value.startsWith('--') ? value : null;
}

const error = (text: string): RunShimResult => ({ content: [{ type: 'text', text }], isError: true });

/** An answer as MCP content: a tool's own content blocks untouched (pictures), anything else as JSON text. */
function toContent(response: McpResponse): RunShimResult {
  if (!response.ok) return error(`[${response.kind}] ${response.message}`);
  const value = response.value as Record<string, unknown> | null;
  const blocks = value && typeof value === 'object' ? value[MCP_CONTENT_KEY] : undefined;
  if (Array.isArray(blocks)) {
    const parsed = blocks.map((block) => McpContentBlockSchema.safeParse(block));
    if (parsed.every((p) => p.success)) return { content: parsed.map((p) => (p.success ? p.data : { type: 'text' as const, text: '' })) };
  }
  return { content: [{ type: 'text', text: JSON.stringify(response.value) }] };
}

export function createRunShim(opts: RunShimOptions) {
  const allowed = new Set<string>(opts.toolIds);
  const call = opts.call ?? callMcpSocket;
  return {
    listTools(): { tools: RunShimTool[] } {
      return {
        tools: opts.toolIds.map((id) => ({
          name: id,
          description: MCP_TOOLS[id].description,
          inputSchema: { ...opts.toJsonSchema(MCP_TOOLS[id].input), type: 'object' as const },
        })),
      };
    },
    async callTool(name: string, args: unknown): Promise<RunShimResult> {
      if (!allowed.has(name)) return error(`Unknown tool: "${name}"`);
      if (!opts.socketPath) return error('This shim was started without --socket, so it has no run to call.');
      return toContent(await call({ socketPath: opts.socketPath, tool: name, input: args ?? {}, timeoutMs: opts.timeoutMs(name as McpToolId) }));
    },
  };
}
