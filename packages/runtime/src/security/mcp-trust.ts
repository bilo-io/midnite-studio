import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  MCP_REPO_SCOPED_SOURCES,
  redactPaths,
  type McpPoisonFinding,
  type McpServerStatus,
  type McpTrustDiff,
  type McpTrustVerdict,
  type NewSecurityFinding,
} from '@midnite/studio-shared';
import { z } from 'zod';

import { discoverMcpServers, type DiscoveredMcpServer, type DiscoverOptions } from './mcp-discovery';
import { checkMcpTools, type InjectionScorer, type KnownMcpServer, type McpToolDescriptor } from './mcp-poison';

/**
 * The MCP allowlist — Phase 121 Theme C.
 *
 * `<userData>/security/mcp-trust.json` (0600, its directory 0700) records, per `(repoId, serverName)`, what the
 * user approved: the command or URL, a SHA-256 of the *canonicalised* config entry and, once the app's own
 * tooling has started the server, a SHA-256 of its `tools/list` response. A server is `approved` only while
 * both still match; an edit to the entry after approval is MCPoison (`config-changed`), a different tools list
 * is a rug-pull (`tools-changed`), and a description that instructs the model, shadows another server or takes
 * a trusted server's tool name holds the server (`held`) with a `supply-chain` finding.
 *
 * Secrets never reach the file: env and header values are stored as short hashes, so the diff shows *that* a
 * value changed without showing it, and every command-line string goes through `redactPaths`.
 */

const TRUST_FILE = join('security', 'mcp-trust.json');
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export function mcpTrustFile(userData: string): string {
  return join(userData, TRUST_FILE);
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const short = (text: string): string => sha256(text).slice(0, 8);

/** JSON with every object's keys sorted, so two spellings of one config hash alike. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
}

export type CanonicalMcpConfig = {
  transport: 'stdio' | 'http';
  /** The command line, or the URL. */
  command: string;
  /** SHA-256 of the canonical JSON of the whole entry, secrets included. */
  hash: string;
  /** Human-readable canonical JSON, one key per line, with env/header values replaced by short hashes. */
  display: string;
};

const SECRET_MAPS = ['env', 'headers', 'http_headers', 'env_http_headers', 'bearer_token_env_var'] as const;

export function canonicalizeMcpConfig(config: Record<string, unknown>): CanonicalMcpConfig {
  const url = typeof config['url'] === 'string' ? config['url'] : null;
  const type = typeof config['type'] === 'string' ? config['type'] : null;
  const transport = url !== null || type === 'http' || type === 'sse' ? 'http' : 'stdio';
  const args = Array.isArray(config['args']) ? config['args'].map(String) : [];
  const command =
    transport === 'http' ? (url ?? '') : [typeof config['command'] === 'string' ? config['command'] : '', ...args].filter((p) => p !== '').join(' ');

  const shown: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if ((SECRET_MAPS as readonly string[]).includes(key) && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      shown[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, `‹sha256:${short(stableStringify(v))}›`]));
    } else if (typeof value === 'string') {
      shown[key] = redactPaths(value);
    } else if (Array.isArray(value)) {
      shown[key] = value.map((v) => (typeof v === 'string' ? redactPaths(v) : v));
    } else shown[key] = value;
  }
  const lines = JSON.stringify(JSON.parse(stableStringify(shown)) as unknown, null, 2);
  return { transport, command: redactPaths(command), hash: sha256(stableStringify(config)), display: lines };
}

/** SHA-256 of a `tools/list` response, independent of the order the server lists its tools in. */
export function hashMcpTools(tools: readonly McpToolDescriptor[]): string {
  return sha256(stableStringify([...tools].sort((a, b) => a.name.localeCompare(b.name))));
}

/** `name -> short hash` of each tool, for a one-line-per-tool diff. */
function toolSnapshot(tools: readonly McpToolDescriptor[]): Record<string, string> {
  return Object.fromEntries(tools.map((tool) => [tool.name, short(stableStringify(tool))]));
}

function diffTools(before: Record<string, string> | null, after: Record<string, string> | null): string[] {
  if (!after) return [];
  const lines: string[] = [];
  const was = before ?? {};
  for (const name of Object.keys(after).sort()) {
    if (!(name in was)) lines.push(`+ ${name}`);
    else if (was[name] !== after[name]) lines.push(`~ ${name}`);
  }
  for (const name of Object.keys(was).sort()) if (!(name in after)) lines.push(`- ${name}`);
  return lines;
}

// --- the persisted allowlist -------------------------------------------------------------------------

const TrustEntrySchema = z.object({
  repoId: z.string(),
  serverName: z.string(),
  command: z.string(),
  configHash: z.string(),
  configDisplay: z.string(),
  toolsHash: z.string().nullable(),
  tools: z.record(z.string(), z.string()).nullable(),
  approvedAt: z.number().int().nonnegative(),
});
export type McpTrustEntry = z.infer<typeof TrustEntrySchema>;
const TrustFileSchema = z.object({ version: z.literal(1), entries: z.array(TrustEntrySchema) });

export interface McpTrustStore {
  get(repoId: string, serverName: string): McpTrustEntry | null;
  /** Entries of one repo (every approved server, for the collision check). */
  forRepo(repoId: string): McpTrustEntry[];
  put(entry: McpTrustEntry): Promise<void>;
  /** Removes the entries for a server name, in one repo or in every repo. Returns how many were cleared. */
  revoke(serverName: string, repoId?: string): Promise<number>;
}

/** Loads the file once (a missing or corrupt file is an empty allowlist: nothing is trusted). */
export async function createMcpTrustStore(options: { file: string; onError?: (error: unknown) => void }): Promise<McpTrustStore> {
  let entries: McpTrustEntry[] = [];
  try {
    const parsed = TrustFileSchema.safeParse(JSON.parse(await readFile(options.file, 'utf8')));
    if (parsed.success) entries = parsed.data.entries;
    else options.onError?.(new Error('mcp-trust.json did not match its schema; treating the allowlist as empty'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') options.onError?.(error);
  }

  let chain: Promise<void> = Promise.resolve();
  const persist = (): Promise<void> => {
    const snapshot = JSON.stringify({ version: 1, entries }, null, 2);
    const next = chain.then(async () => {
      await mkdir(dirname(options.file), { recursive: true, mode: DIR_MODE });
      const tmp = `${options.file}.${process.pid}.tmp`;
      await writeFile(tmp, `${snapshot}\n`, { mode: FILE_MODE });
      await chmod(tmp, FILE_MODE);
      await rename(tmp, options.file);
    });
    chain = next.catch((error: unknown) => options.onError?.(error));
    return next;
  };

  const key = (repoId: string, serverName: string): string => `${repoId}\u0000${serverName}`;
  return {
    get: (repoId, serverName) => entries.find((e) => key(e.repoId, e.serverName) === key(repoId, serverName)) ?? null,
    forRepo: (repoId) => entries.filter((e) => e.repoId === repoId),
    async put(entry) {
      entries = [...entries.filter((e) => key(e.repoId, e.serverName) !== key(entry.repoId, entry.serverName)), entry];
      await persist();
    },
    async revoke(serverName, repoId) {
      const before = entries.length;
      entries = entries.filter((e) => !(e.serverName === serverName && (repoId === undefined || e.repoId === repoId)));
      const cleared = before - entries.length;
      if (cleared > 0) await persist();
      return cleared;
    },
  };
}

// --- the service -------------------------------------------------------------------------------------

export type McpTrustRepo = { id: string; path: string };

export type McpTrustOptions = {
  store: McpTrustStore;
  /** Read-only discovery seams; the composer fills `home`, `readFile` and Phase 115 F's switch. */
  discovery: Omit<DiscoverOptions, 'repoPath'>;
  /**
   * Theme A's injection detector, injected: `scoreInjection` and `INJECTION_THRESHOLD` once that theme is in.
   * Absent, the pattern checks alone run.
   */
  scoreText?: InjectionScorer | undefined;
  scoreThreshold?: number | undefined;
  /** Raises a `supply-chain` finding in the shared ledger. Fire-and-forget; a throw is swallowed. */
  raiseFinding?: ((finding: NewSecurityFinding) => unknown) | undefined;
  now?: () => number;
  onError?: (error: unknown) => void;
};

export type McpTrustResult<T = Record<string, never>> = { ok: true; value: T } | { ok: false; message: string };

export interface McpTrust {
  /** Every discovered server with its verdict and diff. */
  status(repo: McpTrustRepo): Promise<McpServerStatus[]>;
  /** Approves the server's current config (and its observed tools) if it matches `configHash` and is not held. */
  approve(repo: McpTrustRepo, serverName: string, configHash: string): Promise<McpTrustResult>;
  /** Clears the allowlist entry (Vanguard's `revoke-mcp-server`). Every repo when `repoId` is omitted. */
  revoke(serverName: string, repoId?: string): Promise<number>;
  /**
   * Records a `tools/list` the app's own tooling read from a started server. The first list after an approval
   * becomes the pinned baseline (unless it is poisoned); any later difference is a rug-pull.
   */
  observeTools(repo: McpTrustRepo, serverName: string, tools: readonly McpToolDescriptor[]): Promise<McpServerStatus | null>;
  /**
   * The names a Chats or Councils run must not proceed past: a server a cloned repo controls with no approval,
   * and any server (wherever it is configured) whose config or tools changed since approval or that is held.
   */
  heldForRun(repo: McpTrustRepo): Promise<string[]>;
}

export function createMcpTrust(options: McpTrustOptions): McpTrust {
  const { store } = options;
  const now = options.now ?? Date.now;
  const observed = new Map<string, { tools: McpToolDescriptor[]; hash: string }>();
  const raised = new Set<string>();
  const obsKey = (repoId: string, name: string): string => `${repoId}\u0000${name}`;

  function evaluate(repo: McpTrustRepo, server: DiscoveredMcpServer, all: DiscoveredMcpServer[]): McpServerStatus {
    const canon = canonicalizeMcpConfig(server.config);
    const entry = store.get(repo.id, server.serverName);
    const seen = observed.get(obsKey(repo.id, server.serverName)) ?? null;

    const trusted: KnownMcpServer[] = store
      .forRepo(repo.id)
      .filter((e) => e.serverName !== server.serverName && e.tools !== null && e.configHash === canonOf(all, e.serverName))
      .map((e) => ({ serverName: e.serverName, toolNames: Object.keys(e.tools ?? {}) }));
    const others: KnownMcpServer[] = [
      ...trusted,
      ...all
        .filter((o) => o.serverName !== server.serverName && !trusted.some((t) => t.serverName === o.serverName))
        .map((o) => ({ serverName: o.serverName, toolNames: (observed.get(obsKey(repo.id, o.serverName))?.tools ?? []).map((t) => t.name) })),
    ];
    const findings: McpPoisonFinding[] = seen
      ? checkMcpTools({ serverName: server.serverName, tools: seen.tools, others, trusted, scoreText: options.scoreText, scoreThreshold: options.scoreThreshold })
      : [];

    let verdict: McpTrustVerdict;
    if (findings.length > 0) verdict = 'held';
    else if (!entry) verdict = 'new';
    else if (entry.configHash !== canon.hash) verdict = 'config-changed';
    else if (seen && entry.toolsHash !== null && entry.toolsHash !== seen.hash) verdict = 'tools-changed';
    else verdict = 'approved';

    const diff: McpTrustDiff = {
      config: entry && entry.configHash === canon.hash ? null : { before: entry?.configDisplay ?? null, after: canon.display },
      tools: diffTools(entry?.tools ?? null, seen ? toolSnapshot(seen.tools) : null).filter(() => verdict !== 'approved'),
    };
    return {
      repoId: repo.id,
      serverName: server.serverName,
      source: server.source,
      sourcePath: server.sourcePath,
      transport: canon.transport,
      command: canon.command,
      configHash: canon.hash,
      toolsHash: seen?.hash ?? entry?.toolsHash ?? null,
      verdict,
      findings,
      diff,
      approvedAt: entry && verdict === 'approved' ? entry.approvedAt : null,
    };
  }

  const canonOf = (all: DiscoveredMcpServer[], name: string): string | null => {
    const found = all.find((s) => s.serverName === name);
    return found ? canonicalizeMcpConfig(found.config).hash : null;
  };

  const discover = (repo: McpTrustRepo): Promise<DiscoveredMcpServer[]> => discoverMcpServers({ ...options.discovery, repoPath: repo.path });

  function report(repo: McpTrustRepo, status: McpServerStatus): void {
    if (!options.raiseFinding) return;
    for (const finding of status.findings) {
      const fingerprint = `agents:mcp-poison:${repo.id}:${status.serverName}:${finding.kind}:${finding.tool}:${finding.field}`;
      if (raised.has(fingerprint)) continue;
      raised.add(fingerprint);
      try {
        const result = options.raiseFinding({
          source: 'agents',
          severity: 'high',
          category: 'supply-chain',
          fingerprint,
          title: `MCP server "${status.serverName}" is held: ${finding.kind.replace('-', ' ')} in a tool description`,
          detail: `${finding.message} The server stays unapproved until the description is fixed; no Chats or Councils run will use it.`,
          evidence: [{ kind: 'command', command: status.command }],
          remediation: [{ id: 'revoke-mcp-server', serverName: status.serverName, description: 'Clear this server from the MCP allowlist' }],
          repoId: repo.id,
        });
        if (result && typeof (result as Promise<unknown>).catch === 'function') void (result as Promise<unknown>).catch((e: unknown) => options.onError?.(e));
      } catch (error) {
        options.onError?.(error);
      }
    }
  }

  return {
    async status(repo) {
      const all = await discover(repo);
      const out = all.map((server) => evaluate(repo, server, all));
      for (const status of out) report(repo, status);
      return out;
    },

    async approve(repo, serverName, configHash) {
      const all = await discover(repo);
      const server = all.find((s) => s.serverName === serverName);
      if (!server) return { ok: false, message: `"${serverName}" is no longer configured for this repo.` };
      const status = evaluate(repo, server, all);
      if (status.configHash !== configHash) {
        return { ok: false, message: `"${serverName}" changed since you reviewed it. Review the new version and approve again.` };
      }
      if (status.verdict === 'held') {
        return { ok: false, message: `"${serverName}" is held: ${status.findings[0]?.message ?? 'a tool description looks poisoned'}` };
      }
      const canon = canonicalizeMcpConfig(server.config);
      const seen = observed.get(obsKey(repo.id, serverName)) ?? null;
      const prior = store.get(repo.id, serverName);
      const keepPriorTools = prior !== null && prior.configHash === canon.hash && seen === null;
      await store.put({
        repoId: repo.id,
        serverName,
        command: canon.command,
        configHash: canon.hash,
        configDisplay: canon.display,
        toolsHash: seen ? seen.hash : keepPriorTools ? prior.toolsHash : null,
        tools: seen ? toolSnapshot(seen.tools) : keepPriorTools ? prior.tools : null,
        approvedAt: now(),
      });
      return { ok: true, value: {} };
    },

    async revoke(serverName, repoId) {
      for (const k of [...observed.keys()]) {
        const [rid, name] = k.split('\u0000');
        if (name === serverName && (repoId === undefined || rid === repoId)) observed.delete(k);
      }
      return store.revoke(serverName, repoId);
    },

    async observeTools(repo, serverName, tools) {
      const all = await discover(repo);
      const server = all.find((s) => s.serverName === serverName);
      if (!server) return null;
      observed.set(obsKey(repo.id, serverName), { tools: [...tools], hash: hashMcpTools(tools) });
      const status = evaluate(repo, server, all);
      report(repo, status);
      const entry = store.get(repo.id, serverName);
      // The first list after an approval is the baseline; a poisoned one is never pinned.
      if (entry && entry.configHash === status.configHash && entry.toolsHash === null && status.verdict === 'approved') {
        await store.put({ ...entry, toolsHash: hashMcpTools(tools), tools: toolSnapshot(tools) });
      }
      return status;
    },

    async heldForRun(repo) {
      const statuses = await this.status(repo);
      return statuses
        .filter((s) => s.verdict !== 'approved' && (s.verdict !== 'new' || MCP_REPO_SCOPED_SOURCES.has(s.source)))
        .map((s) => s.serverName);
    },
  };
}
