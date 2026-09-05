import { isMcpToolId, MCP_TOOLS, type McpToolId } from '@midnite/studio-shared';
import { z } from 'zod';

import { branchList, diffFile, forgeChecks, forgePulls, graphLog, repoList, repoResolve, statusGet } from './tools';
import { McpToolError } from './errors';

/**
 * `MCP_HANDLERS` — a mapped type over the registry, so a tool added to
 * `MCP_TOOLS` without a matching handler here is a typecheck failure, never a
 * runtime "unknown tool" a caller discovers by asking.
 */
export const MCP_HANDLERS: {
  [K in McpToolId]: (input: z.output<(typeof MCP_TOOLS)[K]['input']>) => Promise<unknown>;
} = {
  'repo.list': repoList,
  'repo.resolve': repoResolve,
  'status.get': statusGet,
  'graph.log': graphLog,
  'diff.file': diffFile,
  'branch.list': branchList,
  'forge.pulls': forgePulls,
  'forge.checks': forgeChecks,
};

export type McpDispatchResult =
  | { ok: true; value: unknown }
  | { ok: false; kind: 'error' | 'not-found' | 'refused'; message: string };

/**
 * Validate → call → never throw. Every handler's input is parsed with
 * `MCP_TOOLS[id].input.safeParse` before it touches the filesystem — the same
 * validate-at-the-boundary discipline `ipc/handle.ts` applies, for a boundary
 * that is *less* trusted than the renderer, not more — and every handler
 * runs inside a try/catch so a tool call can never crash the app or hang the
 * socket on an unhandled rejection.
 */
export async function dispatchMcpCall(tool: string, rawInput: unknown): Promise<McpDispatchResult> {
  if (!isMcpToolId(tool)) {
    return { ok: false, kind: 'error', message: `Unknown tool: "${tool}"` };
  }

  const parsed = MCP_TOOLS[tool].input.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'error',
      message: `Invalid input for "${tool}": ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
    };
  }

  try {
    const handler = MCP_HANDLERS[tool] as (input: unknown) => Promise<unknown>;
    const value = await handler(parsed.data);
    return { ok: true, value };
  } catch (err) {
    if (err instanceof McpToolError) {
      return { ok: false, kind: err.kind, message: err.message };
    }
    return { ok: false, kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
