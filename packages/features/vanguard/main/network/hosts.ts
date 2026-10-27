/**
 * Address predicates for the network sensor (Phase 120 Theme E). Pure. lsof runs with `-n`, so every
 * remote end is an address; these decide which ones can have left the machine at all.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIpv4(host: string): boolean {
  const m = IPV4.exec(host);
  return m !== null && m.slice(1).every((part) => Number(part) <= 255);
}

export function isIpv6(host: string): boolean {
  return host.includes(':') && /^[0-9a-fA-F:.]+$/.test(host);
}

export function isIpLiteral(host: string): boolean {
  return isIpv4(host) || isIpv6(host);
}

/** `::ffff:1.2.3.4` is the IPv4 address `1.2.3.4`; anything else comes back unchanged. */
export function unmapIpv4(host: string): string {
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
  return m ? m[1]! : host;
}

/** Traffic that stays on this machine or this link: loopback, unspecified, link-local, multicast. */
export function isLocalOnly(rawHost: string): boolean {
  const host = unmapIpv4(rawHost.toLowerCase());
  if (isIpv4(host)) {
    const [a = 0, b = 0] = host.split('.').map(Number);
    return a === 127 || a === 0 || (a === 169 && b === 254) || a >= 224;
  }
  if (isIpv6(host)) {
    return host === '::1' || host === '::' || /^fe[89ab]/.test(host) || host.startsWith('ff');
  }
  return false;
}

/** RFC 1918 and the IPv6 unique-local range: on the LAN, not on the internet. */
export function isPrivateLan(rawHost: string): boolean {
  const host = unmapIpv4(rawHost.toLowerCase());
  if (isIpv4(host)) {
    const [a = 0, b = 0] = host.split('.').map(Number);
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return isIpv6(host) && /^f[cd]/.test(host);
}

/** The key a destination is remembered under. */
export const destinationKey = (host: string, port: number): string => `${unmapIpv4(host.toLowerCase())}:${port}`;
