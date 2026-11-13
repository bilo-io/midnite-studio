import type { SecurityFinding } from '@midnite/studio-shared';

import { createGuardFinding, type GuardCheck } from '../check';

export const MAC_PORTS_CHECK_ID = 'mac-ports';

/** One TCP listener, as the `ports` resolver reports it. */
export interface ListeningPort {
  pid: number;
  /** The process name (lsof's `c` field). */
  command: string;
  /** The bound address: `127.0.0.1`, `*`, `0.0.0.0`, `::` ... */
  address: string;
  port: number;
  /** `apple` = anchored in Apple's root, `signed` = any other valid signature, `unsigned`, or `unknown` when it could not be read. */
  signer: 'apple' | 'signed' | 'unsigned' | 'unknown';
}

/** Dev servers and the suite's own processes that legitimately listen on every interface (or are not worth a finding). */
export const KNOWN_LISTENERS: readonly RegExp[] = [
  /^(node|vite|next-server|next|storybook|webpack|esbuild|bun|deno|python3?|ruby|php)$/i,
  /^(midnite|Midnite|Electron|Electron Helper.*|midnite-broker)/,
  /^(ollama|postgres|redis-server|mongod|mysqld)$/i,
];

export function isWildcardAddress(address: string): boolean {
  return address === '*' || address === '0.0.0.0' || address === '::' || address === '[::]';
}

/**
 * Parses `lsof -iTCP -sTCP:LISTEN -nP -F pcn` (field output: `p<pid>`, `c<command>`, `n<addr>:<port>` lines, one
 * `n` per socket). Malformed lines are skipped; `signer` is filled in by the resolver afterwards.
 */
export function parseLsofListeners(stdout: string): Omit<ListeningPort, 'signer'>[] {
  const out: Omit<ListeningPort, 'signer'>[] = [];
  let pid = -1;
  let command = '';
  for (const line of stdout.split('\n')) {
    const tag = line[0];
    const rest = line.slice(1);
    if (tag === 'p') {
      pid = Number.parseInt(rest, 10);
      command = '';
    } else if (tag === 'c') {
      command = rest;
    } else if (tag === 'n' && Number.isInteger(pid) && pid > 0) {
      const at = rest.lastIndexOf(':');
      if (at < 0) continue;
      const port = Number.parseInt(rest.slice(at + 1), 10);
      if (!Number.isInteger(port)) continue;
      out.push({ pid, command, address: rest.slice(0, at), port });
    }
  }
  return out;
}

/**
 * Theme D, ports: a listener reachable from the network (bound to a wildcard address) by a process that is neither
 * Apple-signed nor a known dev server or suite process. `medium`, `high` when the binary is unsigned. Loopback
 * listeners are never reported. The action is `kill-process-group`; the signer is in the evidence.
 */
export const macPortsCheck: GuardCheck = {
  id: MAC_PORTS_CHECK_ID,
  title: 'Listening ports reachable from the network',
  category: 'network',
  needs: ['ports'],
  run(raw): SecurityFinding[] {
    const ports = Array.isArray((raw as { ports?: unknown }).ports) ? ((raw as { ports: ListeningPort[] }).ports) : [];
    const findings: SecurityFinding[] = [];
    const seen = new Set<string>();
    for (const p of ports) {
      if (!isWildcardAddress(p.address) || p.signer === 'apple') continue;
      if (KNOWN_LISTENERS.some((re) => re.test(p.command))) continue;
      const subject = `${p.command}:${p.port}`;
      if (seen.has(subject)) continue;
      seen.add(subject);
      findings.push(
        createGuardFinding({
          check: macPortsCheck,
          subject,
          severity: p.signer === 'unsigned' ? 'high' : 'medium',
          title: `${p.command} listens on all interfaces (port ${p.port})`,
          detail: `${p.command} (pid ${p.pid}, ${p.signer} binary) accepts connections on ${p.address}:${p.port}, so anything on the network can reach it. Bind it to 127.0.0.1 or stop it.`,
          evidence: [
            { kind: 'pid', pid: p.pid, command: p.command },
            { kind: 'host', host: p.address, port: p.port, protocol: 'tcp' },
          ],
          remediation: [{ id: 'kill-process-group', pid: p.pid, description: `Stop ${p.command}` }],
        }),
      );
    }
    return findings;
  },
};
