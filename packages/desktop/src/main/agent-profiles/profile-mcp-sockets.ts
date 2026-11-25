import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  enforcementFor,
  isMcpToolId,
  profileMcpArgs,
  type AgentProfile,
  type NewAgentAuditRecord,
  type ProfileShimLaunch,
} from '@midnite/studio-shared';

import type { McpDispatchResult } from '../mcp/dispatch';
import type { StartMcpServerResult } from '../mcp/server';
import { isSocketPathTooLong } from '../socket-name';

/**
 * A private MCP socket per custom-agent session (Phase 154 Theme G, Decision 8).
 *
 * Which socket an agent dialled is what binds its calls to a session: a session id read from the
 * environment was rejected, since any same-user process can read the shared socket's token and claim any
 * session. So `prepare` starts a server on a fresh socket under `<userData>/mcp-runs/` (never `mcp/`, whose
 * freshest `*.sock` is what every other `midnite` client dials), and the pty that runs the agent `bind`s it
 * to its session. Calls are then stamped with that session id for the audit trail and the breaker.
 *
 * The allowlist is held twice: the shim lists and calls only `--tools` ids, and this socket refuses any
 * other id itself, so a client that dials this socket without the shim is refused too. It scopes the
 * agent's MCP wiring, not the machine: an agent with a shell can still run the `midnite` CLI against the
 * global socket, and a restricted Codex agent keeps any other `mcp_servers.*` the user registered (Codex
 * has no strict flag). It is captured at `prepare` and never re-read: a running CLI cannot change its
 * tools mid-session (Decision 14).
 */

export type ProfileMcpServerOptions = {
  socketPath: string;
  gate: ((tool: string, input: unknown) => McpDispatchResult | null) | undefined;
  sessionId: () => string | undefined;
};

export type ProfileMcpSocketSeams = {
  /** `<userData>/mcp-runs`. */
  runsDir: () => string;
  /** `startMcpServer` with the global registry behind `gate`. */
  startServer: (options: ProfileMcpServerOptions) => Promise<StartMcpServerResult>;
  /** How a CLI starts the shim on `socketPath`, with `toolArgs` appended. */
  shimLaunch: (socketPath: string, toolArgs: string[]) => ProfileShimLaunch;
  recordAudit: (record: NewAgentAuditRecord) => void;
  /** 12 hex characters; injectable for tests. */
  newLaunchId?: () => string;
  /** How long a prepared launch waits for its pty before it is closed. */
  bindTimeoutMs?: number;
};

export type ProfileMcpPrepared = {
  launchId: string;
  /** Shell-quoted words for a typed line; `[]` when the base CLI has no per-launch MCP config. */
  mcpArgs: string[];
  /** The shim launch itself, for a headless argv (`profileMcpArgs(..., { quote: false })`); `null` with no socket. */
  launch: ProfileShimLaunch | null;
};

export type ProfileMcpSockets = {
  prepare(profile: AgentProfile, cwd: string): Promise<ProfileMcpPrepared>;
  /** Ties a prepared launch to the session that runs it. False for an unknown, expired or already-bound id. */
  bind(launchId: string, sessionId: string): boolean;
  /** Closes the socket a session was bound to, if any. */
  closeForSession(sessionId: string): Promise<void>;
  /** Closes one launch by id, bound or not (a headless run that owns its launch). */
  close(launchId: string): Promise<void>;
  closeAll(): Promise<void>;
};

export const PROFILE_BIND_TIMEOUT_MS = 60_000;

type Entry = {
  socketPath: string;
  close: () => Promise<void>;
  sessionId: string | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
};

export function profileAllowlistRefusal(tool: string, agentName: string): McpDispatchResult {
  return { ok: false, kind: 'refused', message: `Tool "${tool}" is not allowed for agent "${agentName}".` };
}

export function createProfileMcpSockets(seams: ProfileMcpSocketSeams): ProfileMcpSockets {
  const entries = new Map<string, Entry>();
  const newLaunchId = seams.newLaunchId ?? (() => randomBytes(6).toString('hex'));
  const bindTimeoutMs = seams.bindTimeoutMs ?? PROFILE_BIND_TIMEOUT_MS;

  const close = async (launchId: string): Promise<void> => {
    const entry = entries.get(launchId);
    if (!entry) return;
    entries.delete(launchId);
    if (entry.timer) clearTimeout(entry.timer);
    try {
      await entry.close();
    } finally {
      // The server unlinks both on close; this covers a close that threw half-way.
      await Promise.all([rm(entry.socketPath, { force: true }), rm(`${entry.socketPath}.token`, { force: true })]);
    }
  };

  const socketPathFor = (launchId: string): string => {
    const preferred = join(seams.runsDir(), `p-${launchId}.sock`);
    return isSocketPathTooLong(preferred) ? join(tmpdir(), `mstudio-p-${launchId}.sock`) : preferred;
  };

  return {
    async prepare(profile, cwd) {
      const launchId = newLaunchId();
      if (!enforcementFor(profile.baseAgentId).tools) return { launchId, mcpArgs: [], launch: null };

      const allow = profile.mcpTools === null ? null : new Set(profile.mcpTools);
      const socketPath = socketPathFor(launchId);
      const sessionId = (): string | undefined => entries.get(launchId)?.sessionId;
      const gate = allow
        ? (tool: string): McpDispatchResult | null => {
            if (allow.has(tool)) return null;
            // Refused either way; only a real tool id is worth an audit row (any string can arrive here).
            if (!isMcpToolId(tool)) return profileAllowlistRefusal(tool, profile.name);
            const session = sessionId();
            seams.recordAudit({
              kind: 'policy-decision',
              tool,
              decision: 'deny',
              rule: 'profile-allowlist',
              repoPath: cwd,
              ...(session ? { sessionId: session } : {}),
            });
            return profileAllowlistRefusal(tool, profile.name);
          }
        : undefined;

      const started = await seams.startServer({ socketPath, gate, sessionId });
      if (!started.ok) throw new Error(`Could not start the agent's MCP socket: ${started.message}`);

      const entry: Entry = { socketPath: started.handle.socketPath, close: started.handle.close, sessionId: undefined, timer: undefined };
      entry.timer = setTimeout(() => void close(launchId).catch(() => undefined), bindTimeoutMs);
      entry.timer.unref?.();
      entries.set(launchId, entry);

      const toolArgs = allow ? ['--tools', [...allow].join(',')] : [];
      const launch = seams.shimLaunch(entry.socketPath, toolArgs);
      const mcpArgs = profileMcpArgs(profile.baseAgentId, launch, { restricted: allow !== null, quote: true });
      return { launchId, mcpArgs, launch };
    },

    bind(launchId, sessionId) {
      const entry = entries.get(launchId);
      if (!entry || entry.sessionId !== undefined) return false;
      entry.sessionId = sessionId;
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = undefined;
      return true;
    },

    async closeForSession(sessionId) {
      const ids = [...entries].filter(([, entry]) => entry.sessionId === sessionId).map(([id]) => id);
      await Promise.all(ids.map((id) => close(id)));
    },

    close,

    async closeAll() {
      await Promise.all([...entries.keys()].map((id) => close(id)));
    },
  };
}
