import type { RemediationAction, SecurityFinding } from '@midnite/studio-shared';
import type { ThreatFeed } from '@midnite/studio-shared';

import { createGuardFinding, type GuardCheck } from '../check';
import type { LockedPackage } from '../lockfiles/types';

/** The `threatFeed` input: a verified feed, or the reason there is none (a skipped input, never an empty "clean"). */
export type ThreatFeedInput = ThreatFeed | undefined;

const asFeed = (raw: unknown): ThreatFeed | null =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as ThreatFeed).poisonedPackages) ? (raw as ThreatFeed) : null;
const asPackages = (raw: unknown): LockedPackage[] => (Array.isArray(raw) ? (raw as LockedPackage[]) : []);

export const POISONED_PACKAGES_CHECK_ID = 'poisoned-packages';

/** A lockfile or installed package at a version the feed names as poisoned: always `critical`. */
export const poisonedPackagesCheck: GuardCheck = {
  id: POISONED_PACKAGES_CHECK_ID,
  title: 'Poisoned package versions',
  category: 'malware',
  needs: ['lockfiles', 'installedPackages', 'threatFeed'],
  run(inputs): SecurityFinding[] {
    const feed = asFeed(inputs.threatFeed);
    if (!feed) return [];
    const out: SecurityFinding[] = [];
    const seen = new Set<string>();
    for (const pkg of [...asPackages(inputs.lockfiles), ...asPackages(inputs.installedPackages)]) {
      for (const bad of feed.poisonedPackages) {
        if (bad.ecosystem !== pkg.ecosystem || bad.name !== pkg.name || !bad.versions.includes(pkg.version)) continue;
        const subject = `${pkg.ecosystem}:${pkg.name}@${pkg.version}:${pkg.path}`;
        if (seen.has(subject)) continue;
        seen.add(subject);
        out.push(
          createGuardFinding({
            check: poisonedPackagesCheck,
            subject,
            severity: 'critical',
            title: `${pkg.name}@${pkg.version} is a known-poisoned release`,
            detail: `Named in the ${bad.campaign} campaign (${bad.ref}). Remove it, reinstall from a clean lockfile, and rotate any credential the install could read.`,
            evidence: [{ kind: 'path', path: pkg.path }],
            remediation: [{ id: 'remove-package', name: pkg.name, version: pkg.version }],
          }),
        );
      }
    }
    return out;
  },
};

export const MCP_SERVERS_CHECK_ID = 'mcp-servers';

/** One discovered MCP server as the check needs it: `command` is the command line or URL, `configHash` from Phase 121 C. */
export interface GuardMcpServer {
  serverName: string;
  command: string;
  configHash?: string;
  toolsHash?: string;
}

/** An installed MCP server whose command, URL or fingerprint the feed names: `critical`, with revoke as the action. */
export const mcpServersCheck: GuardCheck = {
  id: MCP_SERVERS_CHECK_ID,
  title: 'Malicious MCP servers',
  category: 'agent',
  needs: ['mcpServers', 'threatFeed'],
  run(inputs): SecurityFinding[] {
    const feed = asFeed(inputs.threatFeed);
    const servers = Array.isArray(inputs.mcpServers) ? (inputs.mcpServers as GuardMcpServer[]) : [];
    if (!feed) return [];
    const out: SecurityFinding[] = [];
    for (const server of servers) {
      const hit = feed.mcpServers.find(
        (e) =>
          (e.configHash !== undefined && e.configHash === server.configHash) ||
          (e.toolsHash !== undefined && e.toolsHash === server.toolsHash) ||
          (e.configHash === undefined && e.toolsHash === undefined && (e.nameOrUrl === server.serverName || e.nameOrUrl === server.command)),
      );
      if (!hit) continue;
      const remediation: RemediationAction[] = [{ id: 'revoke-mcp-server', serverName: server.serverName }];
      out.push(
        createGuardFinding({
          check: mcpServersCheck,
          subject: server.serverName,
          severity: 'critical',
          title: `MCP server "${server.serverName}" matches a known-malicious fingerprint`,
          detail: `Named in the ${hit.campaign} campaign (${hit.ref}). Revoke it and review what it was allowed to call.`,
          remediation,
        }),
      );
    }
    return out;
  },
};

export const SLOPSQUAT_CHECK_ID = 'slopsquat';

/** Popular npm names a one-letter slip is worth flagging against. Deliberately short: the feed carries the real list. */
export const POPULAR_NPM_NAMES: readonly string[] = ['react', 'lodash', 'express', 'axios', 'typescript', 'webpack', 'moment', 'chalk', 'commander', 'eslint', 'prettier', 'vue', 'jquery', 'request'];

/** Levenshtein distance, early-out above 1 since only a single edit matters here. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length < b.length ? a.slice(i) === b.slice(i + 1) : a.slice(i + 1) === b.slice(i);
}

/** Names the feed lists as slopsquats are `high`; an npm name one edit from a popular package is `medium`. */
export const slopsquatCheck: GuardCheck = {
  id: SLOPSQUAT_CHECK_ID,
  title: 'Slopsquatted and typosquatted package names',
  category: 'malware',
  needs: ['lockfiles', 'threatFeed'],
  run(inputs): SecurityFinding[] {
    const feed = asFeed(inputs.threatFeed);
    if (!feed) return [];
    const out: SecurityFinding[] = [];
    const seen = new Set<string>();
    for (const pkg of asPackages(inputs.lockfiles)) {
      const key = `${pkg.ecosystem}:${pkg.name}:${pkg.path}`;
      if (seen.has(key)) continue;
      const listed = feed.slopsquatNames.find((s) => s.ecosystem === pkg.ecosystem && s.name === pkg.name);
      const near = pkg.ecosystem === 'npm' && !POPULAR_NPM_NAMES.includes(pkg.name) ? POPULAR_NPM_NAMES.find((p) => p.length >= 5 && withinOneEdit(pkg.name, p)) : undefined;
      if (!listed && !near) continue;
      seen.add(key);
      out.push(
        createGuardFinding({
          check: slopsquatCheck,
          subject: key,
          severity: listed ? 'high' : 'medium',
          title: listed ? `${pkg.name} is a known slopsquat name` : `${pkg.name} is one edit from ${near}`,
          detail: listed ? `Listed in the threat feed (${listed.ref}). Check that you meant this package.` : `Check that you meant ${pkg.name} and not ${near}.`,
          evidence: [{ kind: 'path', path: pkg.path }],
          remediation: [{ id: 'remove-package', name: pkg.name, version: pkg.version }],
        }),
      );
    }
    return out;
  },
};
