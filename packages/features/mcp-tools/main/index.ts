import { defineFeatureMain } from '@midnite/studio-runtime';
import {
  CHANNELS,
  failure,
  schemas,
  type AgentAuditExportRequest,
  type AgentAuditListRequest,
  type AgentAuditListResponse,
  type AgentLimitResolveRequest,
  type GitOpResult,
  type McpCallEntry,
  type McpServerStatus,
  type McpTrustApproveRequest,
  type ToolApprovalAnswerRequest,
  type ToolApprovalHookInfo,
} from '@midnite/studio-shared';
import type { z } from 'zod';

import { mcpToolsManifest } from '../manifest';

export { mcpToolsManifest, type McpToolsManifest } from '../manifest';

/** What `mcp:get` answers — the enable flag, whether the socket is up, and every allow switch. */
export type McpToolsStatus = z.infer<typeof schemas.McpGetResponse>;
/** What `mcp:set` answers: the status after the change, and `error` when turning a switch on failed to bind. */
export type McpToolsSetResult = McpToolsStatus & { error?: string };
export type McpToolsSetRequest = z.output<typeof schemas.McpSetRequest>;

/**
 * The server the Tools view reads and writes (Phase 113 Theme N). The MCP
 * server is Studio's today; this is the seam between it and the three channels,
 * so an app that has no server of its own (Agents) can still answer the view —
 * with a server that reports itself as off — instead of leaving the channels
 * unregistered.
 */
export type McpToolsServer = {
  status(): McpToolsStatus;
  /** Applies the fields the request carries, persisting each before acting; an absent field keeps its value. */
  set(request: McpToolsSetRequest): Promise<McpToolsSetResult>;
  /** The last tool calls, newest first. */
  calls(): McpCallEntry[] | Promise<McpCallEntry[]>;
};

/**
 * The agent audit trail the Audit tab reads (Phase 121 Theme G). The trail itself is the runtime's
 * (`security/agent-audit.ts`); the composer supplies it, and the save dialog for the export (a main-side
 * `dialog.showSaveDialog`, so the renderer never names a path to write).
 */
export type AgentAuditPort = {
  list(request: AgentAuditListRequest): Promise<AgentAuditListResponse>;
  /** Asks the user for a path, writes the redacted NDJSON; `path: null` when the dialog was dismissed. */
  exportTo(request: AgentAuditExportRequest): Promise<GitOpResult<{ path: string | null; count: number }>>;
};

/** What the port needs from the runtime trail (`createAgentAudit`); structural, so a test passes a fake. */
export type AgentAuditSource = {
  list(filter: AgentAuditListRequest): Promise<AgentAuditListResponse>;
  exportTo(path: string, filter: AgentAuditExportRequest): Promise<number>;
};

/**
 * The audit port over a trail and a save dialog. `trail` is read lazily because the trail exists only once
 * `userData` is known; before then the viewer sees an empty list and an export says so.
 */
export function createAgentAuditPort(options: {
  trail: () => AgentAuditSource | null;
  /** The main-side save dialog; `null` when dismissed. */
  pickSavePath: (defaultName: string) => Promise<string | null>;
  now?: () => number;
}): AgentAuditPort {
  return {
    async list(request) {
      return (await options.trail()?.list(request)) ?? { records: [], truncated: false };
    },
    async exportTo(request) {
      const trail = options.trail();
      if (!trail) return failure('The audit trail is not ready yet.');
      const day = new Date((options.now ?? Date.now)()).toISOString().slice(0, 10);
      const path = await options.pickSavePath(`agent-audit-${day}.ndjson`);
      if (path === null) return { ok: true, value: { path: null, count: 0 } };
      return { ok: true, value: { path, count: await trail.exportTo(path, request) } };
    },
  };
}

/**
 * The agent breaker's answer path (Phase 121 Theme F). The breaker itself is the runtime's
 * (`security/agent-breaker.ts`) and lives where the ptys are (Studio's main); this is the one call the
 * tripped-limit notification makes back. An app without pty sessions passes none and every answer fails.
 */
export type AgentLimitsPort = {
  /** `false` when the trip is unknown or was already answered. */
  resolve(request: AgentLimitResolveRequest): Promise<boolean>;
};

/**
 * The MCP allowlist's two calls (Phase 121 Theme C). The allowlist itself is the runtime's
 * (`security/mcp-trust.ts`); the composer resolves a repo id to its checkout, owns `userData`, and passes the
 * ledger and (once Theme A lands) the injection scorer in. An app with no repositories passes none.
 */
export type McpTrustPort = {
  /** Every server the repo's agents will load, each with its verdict and diff. */
  list(repoId: string): Promise<GitOpResult<{ servers: McpServerStatus[] }>>;
  approve(request: McpTrustApproveRequest): Promise<GitOpResult<Record<string, never>>>;
};

/**
 * The approval card's answer path (Phase 121 Theme B). The policy and its broker are the runtime's, wired by the
 * composer where the windows are; this is the one call the card makes back. An app with no tool policy passes none.
 */
export type ToolApprovalsPort = {
  /** `false` when no live card has that id: it was already answered, or it timed out. */
  answer(request: ToolApprovalAnswerRequest): boolean;
  /** Returns the CLI hook script path and config snippets for the Setup wizard. */
  hookInfo?(): ToolApprovalHookInfo | Promise<ToolApprovalHookInfo>;
};

export type McpToolsMainServices = { server: McpToolsServer; audit?: AgentAuditPort; limits?: AgentLimitsPort; trust?: McpTrustPort; approvals?: ToolApprovalsPort };

/**
 * A server that is never running and refuses every change — what an app with no
 * MCP server of its own installs. The view reads `running: false` and `shimPath: null`
 * and renders its "this app has no server" state; `set` answers the same status with
 * the reason, so a stray caller sees why instead of a silent no-op.
 */
export function createNoMcpServer(reason = 'This app does not run the MCP server.'): McpToolsServer {
  const status: McpToolsStatus = {
    enabled: false,
    running: false,
    socketPath: null,
    shimPath: null,
    allowUi: false,
    allowGateDecide: false,
    allowModels: false,
    allowGames: false,
    allowTerrains: false,
    allowSprites: false,
    allowMaps: false,
    allowMusic: false,
    allowCompanionSettings: false,
  };
  return {
    status: () => status,
    set: async () => ({ ...status, error: reason }),
    calls: () => [],
  };
}

export const mcpToolsMain = defineFeatureMain<McpToolsMainServices>({
  feature: mcpToolsManifest.feature,
  channels: mcpToolsManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    const { server } = services;

    ipc.handleBare(CHANNELS.mcpGet, () => server.status());
    ipc.handle(
      CHANNELS.mcpSet,
      schemas.McpSetRequest,
      (request) => server.set(request),
      () => ({ ...server.status(), error: 'invalid request' }),
    );
    ipc.handleBare(CHANNELS.mcpCalls, async () => ({ calls: await server.calls() }));

    const { audit } = services;
    ipc.handle(
      CHANNELS.agentAuditList,
      schemas.AgentAuditListRequest,
      async (request) => (audit ? audit.list(request) : { records: [], truncated: false }),
      () => ({ records: [], truncated: false }),
    );
    ipc.handle(
      CHANNELS.agentAuditExport,
      schemas.AgentAuditExportRequest,
      async (request) => {
        if (!audit) return failure('This app keeps no audit trail.');
        try {
          return await audit.exportTo(request);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
      },
      (issue) => failure(issue),
    );

    const { trust } = services;
    ipc.handle(
      CHANNELS.mcpTrustList,
      schemas.McpTrustListRequest,
      async (request) => {
        if (!trust) return { ok: true, value: { servers: [] } };
        try {
          return await trust.list(request.repoId);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
      },
      (issue) => failure(issue),
    );
    ipc.handle(
      CHANNELS.mcpTrustApprove,
      schemas.McpTrustApproveRequest,
      async (request) => {
        if (!trust) return failure('This app has no repositories to approve MCP servers for.');
        try {
          return await trust.approve(request);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
      },
      (issue) => failure(issue),
    );

    const { limits } = services;
    ipc.handle(
      CHANNELS.agentLimitResolve,
      schemas.AgentLimitResolveRequest,
      async (request) => {
        if (!limits) return failure('This app has no agent sessions to limit.');
        return (await limits.resolve(request)) ? { ok: true, value: {} } : failure('That limit notification was already answered.');
      },
      (issue) => failure(issue),
    );

    const { approvals } = services;
    ipc.handle(
      CHANNELS.toolApprovalAnswer,
      schemas.ToolApprovalAnswerRequest,
      async (request) => {
        if (!approvals) return failure('This app has no tool-call policy to answer.');
        return approvals.answer(request) ? { ok: true, value: {} } : failure('That approval was already answered or has timed out.');
      },
      (issue) => failure(issue),
    );
    ipc.handleBare(
      CHANNELS.toolApprovalHookInfo,
      async () => {
        if (!approvals?.hookInfo) return failure('This app has no tool policy hook configuration.');
        try {
          const value = await approvals.hookInfo();
          return { ok: true, value };
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
      },
    );
  },
});
