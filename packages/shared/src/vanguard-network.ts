import { z } from 'zod';

import { SecurityFindingSeveritySchema } from './security-findings';

/**
 * Vanguard's network sensor contract (Phase 120 Theme E): the destination shapes that make a new
 * connection from an agent session `high`, and the live-connections snapshot the Network tab reads.
 * zod only; the matcher is pure.
 */

export const NetworkThreatKindSchema = z.enum(['paste-site', 'tunnel', 'exfiltration']);
export type NetworkThreatKind = z.infer<typeof NetworkThreatKindSchema>;

export interface NetworkThreatHost {
  /** An exact hostname, or `*.example.com` for the name itself and any subdomain of it. */
  pattern: string;
  kind: NetworkThreatKind;
  note: string;
}

/**
 * The destinations an agent has no business reaching: anonymous paste sites, tunnel services that put a
 * local port on the internet, and the endpoints a stolen secret is posted to. A `shared` constant so Phase
 * 122 C's threat feed can extend it: {@link matchThreatHost} takes the extra entries as a second argument.
 */
export const NETWORK_THREAT_HOSTS: readonly NetworkThreatHost[] = [
  { pattern: 'pastebin.com', kind: 'paste-site', note: 'anonymous paste site' },
  { pattern: 'paste.ee', kind: 'paste-site', note: 'anonymous paste site' },
  { pattern: 'hastebin.com', kind: 'paste-site', note: 'anonymous paste site' },
  { pattern: 'ghostbin.com', kind: 'paste-site', note: 'anonymous paste site' },
  { pattern: 'dpaste.com', kind: 'paste-site', note: 'anonymous paste site' },
  { pattern: 'rentry.co', kind: 'paste-site', note: 'anonymous paste site' },
  { pattern: 'termbin.com', kind: 'paste-site', note: 'paste over a raw socket' },
  { pattern: '0x0.st', kind: 'paste-site', note: 'anonymous file drop' },
  { pattern: 'transfer.sh', kind: 'paste-site', note: 'anonymous file drop' },
  { pattern: '*.ngrok.io', kind: 'tunnel', note: 'ngrok tunnel' },
  { pattern: '*.ngrok.com', kind: 'tunnel', note: 'ngrok tunnel' },
  { pattern: '*.ngrok.app', kind: 'tunnel', note: 'ngrok tunnel' },
  { pattern: '*.ngrok-free.app', kind: 'tunnel', note: 'ngrok tunnel' },
  { pattern: '*.trycloudflare.com', kind: 'tunnel', note: 'Cloudflare quick tunnel' },
  { pattern: '*.loca.lt', kind: 'tunnel', note: 'localtunnel' },
  { pattern: 'localtunnel.me', kind: 'tunnel', note: 'localtunnel' },
  { pattern: 'serveo.net', kind: 'tunnel', note: 'serveo tunnel' },
  { pattern: '*.lhr.life', kind: 'tunnel', note: 'localhost.run tunnel' },
  { pattern: 'localhost.run', kind: 'tunnel', note: 'localhost.run tunnel' },
  { pattern: 'pinggy.io', kind: 'tunnel', note: 'pinggy tunnel' },
  { pattern: 'webhook.site', kind: 'exfiltration', note: 'request catcher' },
  { pattern: '*.requestbin.com', kind: 'exfiltration', note: 'request catcher' },
  { pattern: '*.requestbin.net', kind: 'exfiltration', note: 'request catcher' },
  { pattern: '*.pipedream.net', kind: 'exfiltration', note: 'request catcher' },
  { pattern: '*.burpcollaborator.net', kind: 'exfiltration', note: 'out-of-band interaction server' },
  { pattern: '*.oast.pro', kind: 'exfiltration', note: 'out-of-band interaction server' },
  { pattern: '*.oast.live', kind: 'exfiltration', note: 'out-of-band interaction server' },
  { pattern: '*.oast.site', kind: 'exfiltration', note: 'out-of-band interaction server' },
  { pattern: '*.oast.fun', kind: 'exfiltration', note: 'out-of-band interaction server' },
  { pattern: '*.oast.me', kind: 'exfiltration', note: 'out-of-band interaction server' },
  { pattern: '*.interact.sh', kind: 'exfiltration', note: 'out-of-band interaction server' },
];

const normalizeHost = (host: string): string => host.trim().toLowerCase().replace(/\.$/, '');

/** The entry a hostname matches, or `undefined`. A `*.x` pattern matches `x` and every subdomain of it. */
export function matchThreatHost(
  host: string,
  extra: readonly NetworkThreatHost[] = [],
): NetworkThreatHost | undefined {
  const name = normalizeHost(host);
  if (name === '') return undefined;
  for (const entry of [...NETWORK_THREAT_HOSTS, ...extra]) {
    const pattern = normalizeHost(entry.pattern);
    if (pattern.startsWith('*.')) {
      const base = pattern.slice(2);
      if (name === base || name.endsWith(`.${base}`)) return entry;
    } else if (name === pattern) {
      return entry;
    }
  }
  return undefined;
}

/** Who owns the connection: the suite's own process, a process under an agent session, or anything else. */
export const NetworkProcessRoleSchema = z.enum(['suite', 'agent', 'other']);
export type NetworkProcessRole = z.infer<typeof NetworkProcessRoleSchema>;

/** One outbound connection in the last snapshot. */
export const NetworkConnectionSchema = z.object({
  pid: z.number().int(),
  command: z.string(),
  role: NetworkProcessRoleSchema,
  /** For a suite process: what it is (`app`, `broker`). */
  label: z.string().optional(),
  protocol: z.string(),
  state: z.string().optional(),
  /** The remote end as lsof prints it (an address, since lookups are off). */
  remoteHost: z.string(),
  remotePort: z.number().int(),
  /** The reverse-DNS name, when it was looked up. */
  hostname: z.string().optional(),
  sessionId: z.string().optional(),
  repoId: z.string().optional(),
  /** The Phase 115 registry host that allows this connection (suite processes). */
  allowedBy: z.string().optional(),
  /** The finding that flags it, by severity and reason. */
  flagged: z.object({ severity: SecurityFindingSeveritySchema, reason: z.string() }).optional(),
});
export type NetworkConnection = z.infer<typeof NetworkConnectionSchema>;

export const VanguardConnectionsResponse = z.object({
  /** Epoch ms of the last snapshot; null before the first. */
  at: z.number().int().nonnegative().nullable(),
  /** False while the sensor has not run (switched off, view not opened) or reads nothing. */
  active: z.boolean(),
  connections: z.array(NetworkConnectionSchema),
  /** Why the snapshot is old or empty, as a sentence: gated while the window is blurred, `lsof` failing. */
  note: z.string().optional(),
});
export type VanguardConnectionsResponse = z.infer<typeof VanguardConnectionsResponse>;
