import { lookup as dnsLookup } from 'node:dns/promises';

import { unmapIpv4 } from './hosts';

/**
 * The one name lookup the network sensor makes (Phase 120 Theme E), because `lsof -n` prints addresses and
 * the registry and the threat list are names: a name to the addresses it answers on, through the system
 * resolver. It is only ever asked about the app's own fixed lists (`EGRESS_HOSTS`, `NETWORK_THREAT_HOSTS`),
 * so no observed destination is sent to a resolver. There is deliberately no reverse lookup: that would
 * hand every address an agent reached to a DNS server. Best effort: a lookup that fails or runs past the
 * deadline is an empty answer, never an error.
 */
export interface NetworkResolver {
  lookup(host: string): Promise<string[]>;
}

export interface DnsResolverOptions {
  lookup?: (host: string) => Promise<Array<{ address: string }>>;
  timeoutMs?: number;
}

async function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
    (timer as { unref?: () => void }).unref?.();
  });
  try {
    return await Promise.race([work.catch(() => fallback), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export function createDnsResolver(options: DnsResolverOptions = {}): NetworkResolver {
  const timeoutMs = options.timeoutMs ?? 2000;
  const lookup = options.lookup ?? ((host) => dnsLookup(host, { all: true }));
  return {
    lookup: async (host) =>
      (await within(lookup(host), timeoutMs, [])).map((entry) => unmapIpv4(entry.address.toLowerCase())),
  };
}
