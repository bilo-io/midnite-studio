import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { THREAT_FEED_PUBLIC_KEY_PEM } from '@midnite/studio-shared';

import { discoverMcpServers } from '../security/mcp-discovery';
import { canonicalizeMcpConfig } from '../security/mcp-trust';
import { parseSuppressions, type AuditSuppression } from './checks/lockfile-cves';
import type { GuardMcpServer } from './checks/threat-feed-checks';
import { createOsvClient, type FeedFetch } from './feeds/osv';
import { loadKev } from './feeds/kev';
import { loadThreatFeed } from './feeds/threat-feed';
import type { GuardInputResolverContext } from './inputs';
import { resolveInstalledSoftware, type ExecFile } from './software';
import { resolveLockfiles } from './lockfiles/discover';
import { resolveInstalledNodeModules } from './lockfiles/node-modules';

/** Where the signed feed will be published (the publishing workflow is still open in Theme C); `<url>.sig` sits beside it. Nothing is trusted until a key is built in. */
export const THREAT_FEED_URL = 'https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-studio/threat-feed/threat-feed.json';

export interface GuardResolverOptions {
  userData: string;
  home: string;
  /** The repos open in the app right now. */
  repos: () => readonly string[] | Promise<readonly string[]>;
  /** The Phase 115 A seam for network calls; the sweep never reaches for a global `fetch`. */
  fetch: FeedFetch;
  /** Phase 115 F's switch for reading agent config (MCP discovery). */
  allowConfigRead?: () => boolean;
  /** Runs a binary for the installed-software inventory; without it that input has no resolver and is skipped. */
  exec?: ExecFile;
  threatFeedUrl?: string;
  publicKeyPem?: string;
}

type Resolver = NonNullable<GuardInputResolverContext['resolvers']>[string];

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** The raw command line (or URL) of an MCP entry: what the threat feed's `command` patterns are written against. */
function rawCommand(config: Record<string, unknown>): string {
  if (typeof config['url'] === 'string') return config['url'];
  const args = Array.isArray(config['args']) ? config['args'].map(String) : [];
  return [typeof config['command'] === 'string' ? config['command'] : '', ...args].filter((p) => p !== '').join(' ');
}

/**
 * The input resolvers for one sweep (build a fresh set per sweep: `lockfiles` and `installedPackages` are read
 * once and shared by the checks and by the OSV query). Every resolver either returns real data or throws, which the
 * runner records as a skipped input; none returns an empty stand-in.
 */
export function createGuardResolvers(options: GuardResolverOptions): Record<string, Resolver> {
  const repos = async (): Promise<readonly string[]> => options.repos();
  let lockfiles: ReturnType<typeof resolveLockfiles> | null = null;
  const lockedPackages = (): ReturnType<typeof resolveLockfiles> => (lockfiles ??= repos().then((list) => {
      // No open repo means nothing was looked at, which must not read as a clean sweep that resolves old findings.
      if (list.length === 0) throw new Error('no repository is open');
      return resolveLockfiles(list);
    }));

  const exec = options.exec;
  return {
    ...(exec ? { installedSoftware: () => resolveInstalledSoftware(exec) } : {}),
    lockfiles: () => lockedPackages(),
    installedPackages: async () => resolveInstalledNodeModules(await repos()),
    osv: async () => {
      const packages = await lockedPackages();
      return createOsvClient({ fetch: options.fetch, cacheDir: join(options.userData, 'security', 'feeds', 'osv') }).query(packages);
    },
    kev: () => loadKev({ fetch: options.fetch, cacheDir: join(options.userData, 'security', 'feeds', 'kev') }),
    suppressions: async (): Promise<AuditSuppression[]> => {
      const out: AuditSuppression[] = [];
      for (const repo of await repos()) {
        const text = await readText(join(repo, 'scripts', 'audit-suppressions.json'));
        if (text === null) continue;
        try {
          out.push(...parseSuppressions(JSON.parse(text)));
        } catch {
          // a malformed file suppresses nothing
        }
      }
      return out;
    },
    threatFeed: async () => {
      const publicKeyPem = options.publicKeyPem ?? THREAT_FEED_PUBLIC_KEY_PEM;
      if (publicKeyPem === '') throw new Error('no trusted threat-feed key is built in yet');
      const result = await loadThreatFeed({
        fetch: options.fetch,
        cacheDir: join(options.userData, 'security', 'feeds', 'threat'),
        url: options.threatFeedUrl ?? THREAT_FEED_URL,
        publicKeyPem,
      });
      if (!result.ok) throw new Error(result.reason);
      return result.feed;
    },
    mcpServers: async (): Promise<GuardMcpServer[]> => {
      if (options.allowConfigRead && !options.allowConfigRead()) throw new Error('reading agent config is switched off');
      const seen = new Set<string>();
      const out: GuardMcpServer[] = [];
      for (const repoPath of await repos()) {
        for (const server of await discoverMcpServers({ repoPath, home: options.home, readFile: readText })) {
          const key = `${server.sourcePath}\0${server.serverName}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ serverName: server.serverName, command: rawCommand(server.config), configHash: canonicalizeMcpConfig(server.config).hash });
        }
      }
      return out;
    },
  };
}
