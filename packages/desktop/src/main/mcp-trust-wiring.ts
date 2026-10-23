import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';

import type { McpTrustPort } from '@midnite/studio-feature-mcp-tools/main';
import { INJECTION_THRESHOLD, createMcpTrust, createMcpTrustStore, mcpTrustFile, scoreInjection, type McpTrust } from '@midnite/studio-runtime';
import { failure, type NewSecurityFinding } from '@midnite/studio-shared';

import { defaultLogger } from './log';
import { getRepo } from './repo-registry';

/**
 * Studio's one MCP allowlist (Phase 121 Theme C): the runtime's `createMcpTrust` over
 * `<userData>/security/mcp-trust.json`, the real filesystem for read-only discovery and the findings ledger.
 *
 * `scoreText` is Theme A's injection detector (`scoreInjection`, at its own threshold), so a tool description that
 * instructs the model is scored the same way an attachment is. One seam is deliberately left at its default and
 * tracked in `outstanding.md`:
 * - `allowConfigRead`: Phase 115 Theme F's switch for reading agent config; until it exists discovery is on.
 * Nothing in the app starts a third-party MCP server yet, so nothing calls `observeTools`; every server shows
 * `new`/`config-changed` from its config hash alone, and tools are pinned the first time a caller observes them.
 */
let trust: Promise<McpTrust> | null = null;

/** `raiseFinding` is the findings ledger's `record`, passed in so this file does not import the Vanguard handlers (which import it). */
export function configureMcpTrust(userData: string, raiseFinding: (finding: NewSecurityFinding) => unknown): void {
  trust = createMcpTrustStore({ file: mcpTrustFile(userData), onError: (error) => defaultLogger.warn(`mcp trust: ${String(error)}`) }).then((store) =>
    createMcpTrust({
      store,
      discovery: { home: homedir(), readFile: (path) => readFile(path, 'utf8').catch(() => null) },
      raiseFinding,
      scoreText: scoreInjection,
      scoreThreshold: INJECTION_THRESHOLD,
      onError: (error) => defaultLogger.warn(`mcp trust: ${String(error)}`),
    }),
  );
}

const repoOf = (repoId: string): { id: string; path: string } | null => {
  const entry = getRepo(repoId);
  return entry ? { id: entry.id, path: entry.path } : null;
};

export const studioMcpTrustPort: McpTrustPort = {
  async list(repoId) {
    const repo = repoOf(repoId);
    if (!trust || !repo) return { ok: true, value: { servers: [] } };
    return { ok: true, value: { servers: await (await trust).status(repo) } };
  },
  async approve(request) {
    const repo = repoOf(request.repoId);
    if (!trust || !repo) return failure('That repository is no longer open.');
    const result = await (await trust).approve(repo, request.serverName, request.configHash);
    return result.ok ? { ok: true, value: {} } : failure(result.message);
  },
};

/** Vanguard's `revoke-mcp-server`: clears the entry; a no-op (0) before the allowlist is configured. */
export async function revokeMcpServer(serverName: string, repoId?: string): Promise<number> {
  return trust ? (await trust).revoke(serverName, repoId) : 0;
}

/**
 * The servers a Chats or Councils run in this repo must not proceed past (see `McpTrust.heldForRun`). Empty
 * for no repo, an unknown repo, or before the allowlist is configured; and total — a discovery failure never
 * blocks a run.
 */
export async function mcpServersHeldForRun(repoId: string | null | undefined): Promise<string[]> {
  if (!repoId || !trust) return [];
  const repo = repoOf(repoId);
  if (!repo) return [];
  try {
    return await (await trust).heldForRun(repo);
  } catch (error) {
    defaultLogger.warn(`mcp trust gate: ${String(error)}`);
    return [];
  }
}
