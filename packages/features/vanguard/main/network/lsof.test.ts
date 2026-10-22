import { describe, expect, it } from 'vitest';

import { LSOF_ARGS, parseEndpoint, parseLsof, parseName } from './lsof';

// `lsof -i -nP -F pcnPT`, trimmed from a real run: an established IPv4 socket, an IPv6 one, a listener
// (no `->`), an unconnected UDP socket, a connecting socket and a process whose command holds a space.
const FIXTURE = [
  'p501',
  'cMidnite Studio',
  'PTCP',
  'n192.168.1.20:50123->140.82.112.3:443',
  'TST=ESTABLISHED',
  'TQR=0',
  'TQS=0',
  'PTCP',
  'n[2a01:4c8:1234::5]:50124->[2606:4700:4700::1111]:443',
  'TST=ESTABLISHED',
  'p777',
  'cnode',
  'PTCP',
  'n*:3000',
  'TST=LISTEN',
  'PUDP',
  'n*:*',
  'PUDP',
  'n127.0.0.1:5353',
  'PTCP',
  'n10.0.0.5:61000->203.0.113.9:8443',
  'TST=SYN_SENT',
  'p778',
  'cGoogle Chrome H',
  'PTCP',
  'n[::1]:9229->[::1]:60001',
  'TST=ESTABLISHED',
  '',
].join('\n');

describe('parseEndpoint', () => {
  it('reads IPv4, bracketed IPv6 and the wildcards', () => {
    expect(parseEndpoint('1.2.3.4:443')).toEqual({ host: '1.2.3.4', port: 443 });
    expect(parseEndpoint('[2606:4700::1111]:443')).toEqual({ host: '2606:4700::1111', port: 443 });
    expect(parseEndpoint('[::ffff:1.2.3.4]:80')).toEqual({ host: '::ffff:1.2.3.4', port: 80 });
    expect(parseEndpoint('*:8080')).toBeNull();
    expect(parseEndpoint('*:*')).toBeNull();
    expect(parseEndpoint('garbage')).toBeNull();
  });
});

describe('parseName', () => {
  it('splits the -> form and leaves a lone endpoint local', () => {
    expect(parseName('1.2.3.4:5->6.7.8.9:10')).toEqual({
      local: { host: '1.2.3.4', port: 5 },
      remote: { host: '6.7.8.9', port: 10 },
    });
    expect(parseName('127.0.0.1:5353')).toEqual({ local: { host: '127.0.0.1', port: 5353 }, remote: null });
  });
});

describe('parseLsof', () => {
  const connections = parseLsof(FIXTURE);

  it('parses every network file under its process', () => {
    expect(connections).toHaveLength(7);
    expect(connections[0]).toEqual({
      pid: 501,
      command: 'Midnite Studio',
      protocol: 'TCP',
      local: { host: '192.168.1.20', port: 50123 },
      remote: { host: '140.82.112.3', port: 443 },
      state: 'ESTABLISHED',
    });
  });

  it('handles the IPv6 -> form', () => {
    expect(connections[1]).toMatchObject({
      pid: 501,
      remote: { host: '2606:4700:4700::1111', port: 443 },
      local: { host: '2a01:4c8:1234::5', port: 50124 },
    });
  });

  it('reports a listener, and an unconnected UDP socket, with no remote end', () => {
    expect(connections[2]).toMatchObject({ pid: 777, state: 'LISTEN', remote: null });
    expect(connections[3]).toMatchObject({ pid: 777, protocol: 'UDP', local: null, remote: null });
    expect(connections[4]).toMatchObject({ protocol: 'UDP', local: { host: '127.0.0.1', port: 5353 }, remote: null });
  });

  it('keeps a state that is not ESTABLISHED, and a command with spaces', () => {
    expect(connections[5]).toMatchObject({ pid: 777, state: 'SYN_SENT', remote: { host: '203.0.113.9', port: 8443 } });
    expect(connections[6]).toMatchObject({ pid: 778, command: 'Google Chrome H' });
  });

  it('is order-agnostic: a file set may lead with n instead of P', () => {
    const swapped = ['p1', 'cx', 'n1.1.1.1:1->2.2.2.2:2', 'PTCP', 'TST=ESTABLISHED', 'n3.3.3.3:3->4.4.4.4:4', 'PTCP'].join('\n');
    expect(parseLsof(swapped).map((c) => c.remote?.host)).toEqual(['2.2.2.2', '4.4.4.4']);
  });

  it('skips what it cannot read and survives empty input', () => {
    expect(parseLsof('')).toEqual([]);
    expect(parseLsof('pnope\nPTCP\nn1.1.1.1:1->2.2.2.2:2\n')).toEqual([]);
    expect(parseLsof('p1\ncx\nPTCP\nnnot-an-address\n')).toMatchObject([{ pid: 1, local: null, remote: null }]);
  });

  it('pins the argument vector', () => {
    expect([...LSOF_ARGS]).toEqual(['-i', '-nP', '-F', 'pcnPT']);
  });
});
