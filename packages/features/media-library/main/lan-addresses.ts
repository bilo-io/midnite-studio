import type { NetworkInterfaceInfo } from 'node:os';

import type { LibraryLanInterface } from '@midnite/studio-shared';

/**
 * Which addresses the LAN stream server may bind (Phase 113 Theme R slice 2). Only a **private IPv4 address**
 * — RFC 1918 (`10/8`, `172.16/12`, `192.168/16`) or link-local (`169.254/16`) — that one of this computer's own
 * interfaces holds right now. Never `0.0.0.0` (every interface, including a public one), never loopback (other
 * devices cannot reach it, so it is not "sharing"), never a public or IPv6 address.
 */

/** The machine's interfaces, in `os.networkInterfaces()`'s shape — injected, so tests pass fake ones. */
export type NetworkInterfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

/** The four octets of a strict dotted-quad, or null. `010.1.1.1`, `1.2.3`, `1.2.3.256` are all null. */
function octets(address: string): [number, number, number, number] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    out.push(value);
  }
  return out as [number, number, number, number];
}

/** Whether `address` is a private (RFC 1918) or link-local IPv4 address. */
export function isPrivateLanAddress(address: string): boolean {
  const o = octets(address);
  if (!o) return false;
  const [a, b] = o;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

const isIPv4 = (info: NetworkInterfaceInfo): boolean =>
  // Node 18.0–18.3 reported `family` as a number.
  info.family === 'IPv4' || (info.family as unknown) === 4;

/** The private IPv4 addresses this computer's interfaces hold — what the picker offers. */
export function listLanInterfaces(interfaces: NetworkInterfaces): LibraryLanInterface[] {
  const out: LibraryLanInterface[] = [];
  const seen = new Set<string>();
  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (info.internal || !isIPv4(info) || !isPrivateLanAddress(info.address)) continue;
      if (seen.has(info.address)) continue;
      seen.add(info.address);
      out.push({ name, address: info.address });
    }
  }
  return out.sort((x, y) => x.name.localeCompare(y.name) || x.address.localeCompare(y.address));
}

/**
 * The address to bind, or why not: it must be private *and* held by one of the interfaces now. A saved address
 * from another network (the laptop moved) is refused rather than bound.
 */
export function checkBindAddress(
  address: string,
  interfaces: NetworkInterfaces,
): { ok: true; address: string } | { ok: false; message: string } {
  if (!isPrivateLanAddress(address))
    return {
      ok: false,
      message:
        'Only a private local-network address (10.x, 172.16–31.x, 192.168.x or 169.254.x) can be shared on.',
    };
  if (!listLanInterfaces(interfaces).some((candidate) => candidate.address === address))
    return {
      ok: false,
      message: 'That address is not on any of this computer’s network connections now.',
    };
  return { ok: true, address };
}
