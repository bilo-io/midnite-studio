import { describe, expect, it } from 'vitest';

import { destinationKey, isIpLiteral, isLocalOnly, isPrivateLan, unmapIpv4 } from './hosts';

describe('hosts', () => {
  it('knows an address from a name', () => {
    expect(isIpLiteral('1.2.3.4')).toBe(true);
    expect(isIpLiteral('2606:4700::1111')).toBe(true);
    expect(isIpLiteral('example.com')).toBe(false);
    expect(isIpLiteral('999.1.1.1')).toBe(false);
  });

  it('unmaps an IPv4-mapped IPv6 address', () => {
    expect(unmapIpv4('::ffff:10.0.0.1')).toBe('10.0.0.1');
    expect(unmapIpv4('2606::1')).toBe('2606::1');
  });

  it('treats loopback, unspecified, link-local and multicast as never leaving the machine', () => {
    for (const host of ['127.0.0.1', '0.0.0.0', '169.254.1.1', '224.0.0.251', '::1', '::', 'fe80::1', 'ff02::fb', '::ffff:127.0.0.1']) {
      expect(isLocalOnly(host), host).toBe(true);
    }
    for (const host of ['8.8.8.8', '10.0.0.1', '2606:4700::1111']) expect(isLocalOnly(host), host).toBe(false);
  });

  it('knows the LAN ranges', () => {
    for (const host of ['10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.0.9', '100.64.0.1', 'fd12::1']) {
      expect(isPrivateLan(host), host).toBe(true);
    }
    for (const host of ['172.32.0.1', '8.8.8.8', '2606:4700::1111']) expect(isPrivateLan(host), host).toBe(false);
  });

  it('keys a destination without the IPv4-mapped prefix', () => {
    expect(destinationKey('::ffff:1.2.3.4', 443)).toBe('1.2.3.4:443');
    expect(destinationKey('2606:4700::1111', 443)).toBe('2606:4700::1111:443');
  });
});
