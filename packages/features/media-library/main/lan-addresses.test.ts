// @vitest-environment node
// vitest: the "LAN only" rule is logic over fake interfaces — no real interface is read or bound.
import type { NetworkInterfaceInfo } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  checkBindAddress,
  isPrivateLanAddress,
  listLanInterfaces,
  type NetworkInterfaces,
} from './lan-addresses';

const v4 = (address: string, internal = false): NetworkInterfaceInfo => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal,
  cidr: `${address}/24`,
});
const v6 = (address: string): NetworkInterfaceInfo => ({
  address,
  netmask: 'ffff:ffff:ffff:ffff::',
  family: 'IPv6',
  mac: '00:00:00:00:00:00',
  internal: false,
  cidr: `${address}/64`,
  scopeid: 0,
});

const FAKE: NetworkInterfaces = {
  lo0: [v4('127.0.0.1', true), v6('::1')],
  en0: [v4('192.168.1.20'), v6('fe80::1')],
  en1: [v4('10.0.0.5')],
  utun3: [v4('100.64.1.2')],
  en5: [v4('203.0.113.7')],
  bridge0: [v4('172.20.0.1'), v4('172.32.0.1')],
  awdl0: [v4('169.254.10.10')],
};

describe('isPrivateLanAddress', () => {
  it('accepts RFC 1918 and link-local IPv4 only', () => {
    for (const ok of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.0.10', '169.254.1.1'])
      expect(isPrivateLanAddress(ok), ok).toBe(true);
    for (const no of [
      '0.0.0.0',
      '127.0.0.1',
      '8.8.8.8',
      '172.15.0.1',
      '172.32.0.1',
      '100.64.1.2',
      '255.255.255.255',
      '::',
      '::1',
      'fe80::1',
      '::ffff:192.168.1.2',
      '192.168.1',
      '192.168.1.256',
      '192.168.01.2',
      ' 192.168.1.2',
      'localhost',
      '',
    ])
      expect(isPrivateLanAddress(no), no).toBe(false);
  });
});

describe('listLanInterfaces', () => {
  it('offers only private, non-internal IPv4 addresses', () => {
    expect(listLanInterfaces(FAKE)).toEqual([
      { name: 'awdl0', address: '169.254.10.10' },
      { name: 'bridge0', address: '172.20.0.1' },
      { name: 'en0', address: '192.168.1.20' },
      { name: 'en1', address: '10.0.0.5' },
    ]);
  });

  it('reads the numeric family older Node reported', () => {
    const old = { ...v4('192.168.5.5'), family: 4 } as unknown as NetworkInterfaceInfo;
    expect(listLanInterfaces({ en0: [old] })).toEqual([{ name: 'en0', address: '192.168.5.5' }]);
  });
});

describe('checkBindAddress', () => {
  it('binds a private address one of the interfaces holds', () => {
    expect(checkBindAddress('192.168.1.20', FAKE)).toEqual({ ok: true, address: '192.168.1.20' });
  });

  it('refuses every-interface, loopback, public and absent addresses', () => {
    for (const address of ['0.0.0.0', '127.0.0.1', '203.0.113.7', '8.8.8.8', '::', '192.168.9.9'])
      expect(checkBindAddress(address, FAKE).ok, address).toBe(false);
  });
});
