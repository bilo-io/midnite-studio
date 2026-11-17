import type { McpResponse } from '@midnite/studio-shared';

import { MCP_NOT_RUNNING_MESSAGE } from './client';
import type { SuiteSocket } from './suite-sockets';

export type SuiteRouterDeps = {
  resolve: () => Promise<SuiteSocket[]>;
  /** One request over a socket — `callMcpTool` with `socketPath`. */
  call: (socketPath: string, tool: string, input: unknown, timeoutMs?: number) => Promise<McpResponse>;
  /** Whether an id has a definition the shim can list (`MCP_TOOLS`); an app's unknown id is skipped. */
  isKnown: (id: string) => boolean;
  /** The app that owns a tool (`mcpToolOwner`); the tie-break when two sockets offer one id. */
  ownerOf: (id: string) => string;
  log: (line: string) => void;
};

/** The shortest gap between two miss-driven re-lists. */
export const RELIST_MIN_MS = 2000;

/** The shim's half of the suite join: which running app owns which tool, learnt from each app's own list. */
export class SuiteRouter {
  private routes = new Map<string, SuiteSocket>();
  private pending: Promise<void> | null = null;
  private listedAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly deps: SuiteRouterDeps) {}

  /**
   * Ask every live suite socket for its tools and rebuild the tool → socket map. Returns the ids the
   * apps offer that `baseIds` (Studio's own list) does not already carry, in socket order. A tool id two
   * apps both offer stays with its owner (`ownerOf`), else the first; the other is logged to stderr.
   */
  extraTools(baseIds: ReadonlySet<string>): Promise<string[]> {
    const run = this.rebuild(baseIds);
    // A call that arrives while a list is in flight waits for it rather than racing a half-built map.
    const settled = run.then(() => undefined, () => undefined);
    this.pending = settled;
    void settled.then(() => {
      if (this.pending === settled) this.pending = null;
    });
    return run;
  }

  private async rebuild(baseIds: ReadonlySet<string>): Promise<string[]> {
    this.listedAt = Date.now();
    const sockets = await this.deps.resolve();
    const lists = await Promise.all(
      sockets.map(async (socket) => ({ socket, ids: await this.listOf(socket) })),
    );
    const next = new Map<string, SuiteSocket>();
    for (const { socket, ids } of lists) {
      for (const id of ids) {
        const held = next.get(id);
        if (!held) {
          next.set(id, socket);
          continue;
        }
        this.deps.log(`tool "${id}" is offered by ${held.displayName} and ${socket.displayName}`);
        if (this.deps.ownerOf(id) === socket.app && this.deps.ownerOf(id) !== held.app) next.set(id, socket);
      }
    }
    this.routes = next;
    return [...next.keys()].filter((id) => !baseIds.has(id));
  }

  /**
   * The socket that owns `tool`; `null` means Studio's default path. A miss re-lists once — an app may have
   * started since the last list — but at most once per {@link RELIST_MIN_MS}, so a run of Studio calls does
   * not dial every app each time.
   */
  async routeOf(tool: string): Promise<SuiteSocket | null> {
    if (this.pending) await this.pending;
    const held = this.routes.get(tool);
    if (held) return held;
    if (Date.now() - this.listedAt < RELIST_MIN_MS) return null;
    await this.extraTools(new Set());
    return this.routes.get(tool) ?? null;
  }

  /** A socket that died mid-call is dropped, and its tools with it, until the next list finds it again. */
  drop(socket: SuiteSocket): void {
    for (const [id, held] of this.routes) if (held.socketPath === socket.socketPath) this.routes.delete(id);
  }

  async call(socket: SuiteSocket, tool: string, input: unknown, timeoutMs?: number): Promise<McpResponse> {
    const response = await this.deps.call(socket.socketPath, tool, input, timeoutMs);
    if (!response.ok && response.message === MCP_NOT_RUNNING_MESSAGE) {
      this.drop(socket);
      return { id: response.id, ok: false, kind: 'error', message: `${socket.displayName} is not running.` };
    }
    return response;
  }

  private async listOf(socket: SuiteSocket): Promise<string[]> {
    const response = await this.deps.call(socket.socketPath, 'tools/list', {});
    if (!response.ok) return [];
    const tools = (response.value as { tools?: unknown } | null)?.tools;
    if (!Array.isArray(tools)) return [];
    return tools.filter((id): id is string => typeof id === 'string' && this.deps.isKnown(id));
  }
}
