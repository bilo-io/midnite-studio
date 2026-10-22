import { lookup as dnsLookup, reverse as dnsReverse } from 'node:dns/promises';

import { unmapIpv4 } from './hosts';

/**
 * The two name lookups the network sensor needs (Phase 120 Theme E), because `lsof -n` prints addresses
 * and the registry and the threat list are names. Forward: a registry host to the addresses it answers
 * on. Reverse: an address to the names that point back at it. Both are best effort: a lookup that fails
 * or runs past the deadline is an empty answer, never an error.
 */
export interface NetworkResolver {
  lookup(host: string): Promise<string[]>;
  reverse(address: string): Promise<string[]>;
}

export interface DnsResolverOptions {
  lookup?: (host: string) => Promise<Array<{ address: string }>>;
  reverse?: (address: string) => Promise<string[]>;
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
  const reverse = options.reverse ?? dnsReverse;
  return {
    lookup: async (host) =>
      (await within(lookup(host), timeoutMs, [])).map((entry) => unmapIpv4(entry.address.toLowerCase())),
    reverse: (address) => within(reverse(address), timeoutMs, []),
  };
}
