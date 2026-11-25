import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
 * global socket. A restricted Codex agent (no strict flag) has each of the user's other `mcp_servers.*`
 * turned off by name (#1697, `codexServers`). It is captured at `prepare` and never re-read: a running CLI cannot change its
 * tools mid-session (Decision 14).
 *
 * #1697: the socket outlives the moment it is needed in two ways. A launch nobody bound in time is parked,
 * not forgotten, so a terminal view that mounts late can still `ensureBound` it: the server comes back on
 * the same path the typed line names. And a bound launch writes a manifest beside its socket
 * (`<runsDir>/p-<id>.json`: session, cwd, the agent's name, base and allowlist as prepared), which app quit
 * leaves behind (`suspendAll`) so that after a restart `restore` brings back the socket of every session the
 * pty broker kept alive — same path, same allowlist, same session id — since the shim dials per call.
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
  /** How long a prepared launch waits for its pty before its server is stopped (and parked). */
  bindTimeoutMs?: number;
  /** How many parked launches are kept (oldest dropped first); injectable for tests. */
  parkedMax?: number;
  /** #1697: the user's other Codex servers, which a restricted Codex agent turns off by name. */
  codexServers?: (cwd: string) => Promise<{ names: string[] }>;
};

export type ProfileMcpPrepared = {
  launchId: string;
  /** Shell-quoted words for a typed line; `[]` when the base CLI has no per-launch MCP config. */
  mcpArgs: string[];
  /** The shim launch itself, for a headless argv (`profileMcpArgs(..., { quote: false })`); `null` with no socket. */
  launch: ProfileShimLaunch | null;
  /** #1697: the user's other MCP servers a restricted Codex agent turns off; pass to `buildProfileHeadlessArgv`. */
  otherMcpServers: string[];
};

/** What a socket was started for, captured at `prepare` and never re-read (Decision 14). */
type LaunchSnapshot = { name: string; baseAgentId: string; mcpTools: string[] | null };

type Manifest = { launchId: string; sessionId: string; socketPath: string; cwd: string; agent: LaunchSnapshot };

export type ProfileMcpSockets = {
  prepare(profile: AgentProfile, cwd: string): Promise<ProfileMcpPrepared>;
  /** Ties a prepared launch to the session that runs it. False for an unknown, expired or already-bound id. */
  bind(launchId: string, sessionId: string): boolean;
  /**
   * `bind`, but a launch whose 60 s wait ran out is started again on its original socket first (#1697), so a
   * queued line typed into a terminal that mounted late still reaches its tools. False for an unknown or
   * already-bound id.
   */
  ensureBound(launchId: string, sessionId: string): Promise<boolean>;
  /** Closes the socket a session was bound to, if any. */
  closeForSession(sessionId: string): Promise<void>;
  /** Closes one launch by id, bound or not (a headless run that owns its launch). */
  close(launchId: string): Promise<void>;
  closeAll(): Promise<void>;
  /** App quit: closes every server but keeps bound launches' manifests for `restore` (#1697). */
  suspendAll(): Promise<void>;
  /**
   * After a restart: starts the socket again for every manifest whose session is still live, and deletes the
   * rest. Resolves with the session ids restored. Safe to call again (a launch already open is skipped).
   */
  restore(isLive: (sessionId: string) => boolean): Promise<string[]>;
};

export const PROFILE_BIND_TIMEOUT_MS = 60_000;
/**
 * #1713: a parked (expired, unbound) launch can be revived by `ensureBound` until app quit, not for 1 h. It
 * holds no server and no file — a path, a cwd and the allowlist — and the queued line that names it lives as
 * long as the renderer keeps it, which no clock here can know. A cap bounds the map instead of a clock.
 */
export const PROFILE_PARKED_MAX = 100;

type Entry = {
  socketPath: string;
  close: () => Promise<void>;
  sessionId: string | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  cwd: string;
  agent: LaunchSnapshot;
};

/** `stopped` settles once the old server has let go of the path, so a revival never races its cleanup. */
type Parked = { socketPath: string; cwd: string; agent: LaunchSnapshot; stopped: Promise<void> };

export function profileAllowlistRefusal(tool: string, agentName: string): McpDispatchResult {
  return { ok: false, kind: 'refused', message: `Tool "${tool}" is not allowed for agent "${agentName}".` };
}

const MANIFEST = /^p-([0-9a-f]{1,32})\.json$/;

export function createProfileMcpSockets(seams: ProfileMcpSocketSeams): ProfileMcpSockets {
  const entries = new Map<string, Entry>();
  const parked = new Map<string, Parked>();
  const newLaunchId = seams.newLaunchId ?? (() => randomBytes(6).toString('hex'));
  const bindTimeoutMs = seams.bindTimeoutMs ?? PROFILE_BIND_TIMEOUT_MS;
  const parkedMax = seams.parkedMax ?? PROFILE_PARKED_MAX;

  const manifestPath = (launchId: string): string => join(seams.runsDir(), `p-${launchId}.json`);
  const dropManifest = (launchId: string): Promise<void> => rm(manifestPath(launchId), { force: true });
  const writeManifest = async (manifest: Manifest): Promise<void> => {
    await mkdir(seams.runsDir(), { recursive: true });
    await writeFile(manifestPath(manifest.launchId), JSON.stringify(manifest), { mode: 0o600 });
  };

  const stopServer = async (entry: Entry): Promise<void> => {
    if (entry.timer) clearTimeout(entry.timer);
    try {
      await entry.close();
    } finally {
      // The server unlinks both on close; this covers a close that threw half-way.
      await Promise.all([rm(entry.socketPath, { force: true }), rm(`${entry.socketPath}.token`, { force: true })]);
    }
  };

  const close = async (launchId: string): Promise<void> => {
    parked.delete(launchId);
    const entry = entries.get(launchId);
    if (!entry) return;
    entries.delete(launchId);
    try {
      await stopServer(entry);
    } finally {
      await dropManifest(launchId).catch(() => undefined);
    }
  };

  /** The 60 s timer: stop the server, but keep enough to start it again on the same path. */
  const park = async (launchId: string): Promise<void> => {
    const entry = entries.get(launchId);
    if (!entry || entry.sessionId !== undefined) return;
    entries.delete(launchId);
    const stopped = stopServer(entry).catch(() => undefined);
    parked.set(launchId, { socketPath: entry.socketPath, cwd: entry.cwd, agent: entry.agent, stopped });
    // A Map keeps insertion order, so the first keys are the oldest parked.
    for (const id of parked.keys()) {
      if (parked.size <= parkedMax) break;
      parked.delete(id);
    }
    await stopped;
  };

  const socketPathFor = (launchId: string): string => {
    const preferred = join(seams.runsDir(), `p-${launchId}.sock`);
    return isSocketPathTooLong(preferred) ? join(tmpdir(), `mstudio-p-${launchId}.sock`) : preferred;
  };

  /** Starts the server for a launch on `socketPath` and records it (unbound unless `sessionId` is given). */
  const start = async (launchId: string, socketPath: string, cwd: string, agent: LaunchSnapshot, sessionId?: string): Promise<Entry> => {
    const allow = agent.mcpTools === null ? null : new Set(agent.mcpTools);
    const currentSession = (): string | undefined => entries.get(launchId)?.sessionId;
    const gate = allow
      ? (tool: string): McpDispatchResult | null => {
          if (allow.has(tool)) return null;
          // Refused either way; only a real tool id is worth an audit row (any string can arrive here).
          if (!isMcpToolId(tool)) return profileAllowlistRefusal(tool, agent.name);
          const session = currentSession();
          seams.recordAudit({
            kind: 'policy-decision',
            tool,
            decision: 'deny',
            rule: 'profile-allowlist',
            repoPath: cwd,
            ...(session ? { sessionId: session } : {}),
          });
          return profileAllowlistRefusal(tool, agent.name);
        }
      : undefined;

    const started = await seams.startServer({ socketPath, gate, sessionId: currentSession });
    if (!started.ok) throw new Error(`Could not start the agent's MCP socket: ${started.message}`);
    const entry: Entry = { socketPath: started.handle.socketPath, close: started.handle.close, sessionId, timer: undefined, cwd, agent };
    if (sessionId === undefined) {
      entry.timer = setTimeout(() => void park(launchId).catch(() => undefined), bindTimeoutMs);
      entry.timer.unref?.();
    }
    entries.set(launchId, entry);
    return entry;
  };

  const bind = (launchId: string, sessionId: string): boolean => {
    const entry = entries.get(launchId);
    if (!entry || entry.sessionId !== undefined) return false;
    entry.sessionId = sessionId;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
    // Best effort: a missing manifest only costs the restore after a restart, never this session's tools.
    void writeManifest({ launchId, sessionId, socketPath: entry.socketPath, cwd: entry.cwd, agent: entry.agent }).catch(() => undefined);
    return true;
  };

  return {
    async prepare(profile, cwd) {
      const launchId = newLaunchId();
      if (!enforcementFor(profile.baseAgentId).tools) return { launchId, mcpArgs: [], launch: null, otherMcpServers: [] };

      // Read before a socket starts. Every name is turned off, a dotted one included (#1713).
      let otherMcpServers: string[] = [];
      if (profile.baseAgentId === 'codex' && profile.mcpTools !== null && seams.codexServers) {
        otherMcpServers = (await seams.codexServers(cwd)).names;
      }

      const agent: LaunchSnapshot = { name: profile.name, baseAgentId: profile.baseAgentId, mcpTools: profile.mcpTools === null ? null : [...profile.mcpTools] };
      const entry = await start(launchId, socketPathFor(launchId), cwd, agent);
      const toolArgs = agent.mcpTools ? ['--tools', agent.mcpTools.join(',')] : [];
      const launch = seams.shimLaunch(entry.socketPath, toolArgs);
      const mcpArgs = profileMcpArgs(profile.baseAgentId, launch, { restricted: agent.mcpTools !== null, quote: true, otherMcpServers });
      return { launchId, mcpArgs, launch, otherMcpServers };
    },

    bind,

    async ensureBound(launchId, sessionId) {
      if (bind(launchId, sessionId)) return true;
      const held = parked.get(launchId);
      if (!held || entries.has(launchId)) return false;
      parked.delete(launchId);
      // The old server's cleanup unlinks the path; starting before it settles would lose the new socket.
      await held.stopped;
      if (entries.has(launchId)) return bind(launchId, sessionId);
      await start(launchId, held.socketPath, held.cwd, held.agent);
      return bind(launchId, sessionId);
    },

    async closeForSession(sessionId) {
      const ids = [...entries].filter(([, entry]) => entry.sessionId === sessionId).map(([id]) => id);
      await Promise.all(ids.map((id) => close(id)));
    },

    close,

    async closeAll() {
      parked.clear();
      await Promise.all([...entries.keys()].map((id) => close(id)));
    },

    async suspendAll() {
      parked.clear();
      const all = [...entries];
      entries.clear();
      await Promise.all(all.map(async ([launchId, entry]) => {
        await stopServer(entry).catch(() => undefined);
        // An unbound launch has no session to come back to.
        if (entry.sessionId === undefined) await dropManifest(launchId).catch(() => undefined);
      }));
    },

    async restore(isLive) {
      let names: string[];
      try {
        names = await readdir(seams.runsDir());
      } catch {
        return [];
      }
      const restored: string[] = [];
      for (const name of names) {
        const launchId = MANIFEST.exec(name)?.[1];
        if (!launchId || entries.has(launchId)) continue;
        const manifest = await readManifest(manifestPath(launchId));
        // Only ever a path this module would have chosen: a manifest is never a way to unlink anything else.
        if (!manifest || manifest.launchId !== launchId || manifest.socketPath !== socketPathFor(launchId) || !isLive(manifest.sessionId)) {
          await dropManifest(launchId).catch(() => undefined);
          continue;
        }
        // A dead server's file is still on the path after a crash; the server needs the path free.
        await Promise.all([rm(manifest.socketPath, { force: true }), rm(`${manifest.socketPath}.token`, { force: true })]);
        try {
          await start(launchId, manifest.socketPath, manifest.cwd, manifest.agent, manifest.sessionId);
          restored.push(manifest.sessionId);
        } catch {
          // Left on disk: the next restore (a detached-session recovery) tries again.
        }
      }
      return restored;
    },
  };
}

async function readManifest(path: string): Promise<Manifest | null> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Partial<Manifest> & { agent?: Partial<LaunchSnapshot> };
    const agent = raw.agent;
    const tools = agent?.mcpTools;
    if (
      typeof raw.launchId !== 'string' ||
      typeof raw.sessionId !== 'string' ||
      typeof raw.socketPath !== 'string' ||
      typeof raw.cwd !== 'string' ||
      typeof agent?.name !== 'string' ||
      typeof agent.baseAgentId !== 'string' ||
      !(tools === null || (Array.isArray(tools) && tools.every((t) => typeof t === 'string')))
    ) {
      return null;
    }
    return {
      launchId: raw.launchId,
      sessionId: raw.sessionId,
      socketPath: raw.socketPath,
      cwd: raw.cwd,
      agent: { name: agent.name, baseAgentId: agent.baseAgentId, mcpTools: tools },
    };
  } catch {
    return null;
  }
}
