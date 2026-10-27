import { describe, expect, it } from 'vitest';

import { matchThreatHost, NETWORK_THREAT_HOSTS, VanguardConnectionsResponse } from './vanguard-network';

describe('matchThreatHost', () => {
  it('matches an exact name, and a wildcard on the name itself and any subdomain', () => {
    expect(matchThreatHost('webhook.site')?.kind).toBe('exfiltration');
    expect(matchThreatHost('abc.trycloudflare.com')?.kind).toBe('tunnel');
    expect(matchThreatHost('trycloudflare.com')?.kind).toBe('tunnel');
    expect(matchThreatHost('a.b.loca.lt')?.kind).toBe('tunnel');
    expect(matchThreatHost('x.burpcollaborator.net')?.kind).toBe('exfiltration');
    expect(matchThreatHost('pastebin.com')?.kind).toBe('paste-site');
  });

  it('is case and trailing-dot insensitive', () => {
    expect(matchThreatHost('WEBHOOK.SITE.')?.kind).toBe('exfiltration');
  });

  it('does not match a lookalike suffix or an unrelated host', () => {
    expect(matchThreatHost('notwebhook.site')).toBeUndefined();
    expect(matchThreatHost('evil-trycloudflare.com')).toBeUndefined();
    expect(matchThreatHost('github.com')).toBeUndefined();
    expect(matchThreatHost('')).toBeUndefined();
  });

  it('takes the feed extra entries', () => {
    const extra = [{ pattern: '*.bad.example', kind: 'exfiltration' as const, note: 'feed' }];
    expect(matchThreatHost('x.bad.example')).toBeUndefined();
    expect(matchThreatHost('x.bad.example', extra)?.note).toBe('feed');
  });

  it('names every service the phase doc lists', () => {
    const patterns = NETWORK_THREAT_HOSTS.map((e) => e.pattern);
    for (const wanted of ['*.ngrok.io', '*.trycloudflare.com', '*.loca.lt', 'webhook.site', '*.requestbin.com', '*.burpcollaborator.net']) {
      expect(patterns).toContain(wanted);
    }
  });
});

describe('VanguardConnectionsResponse', () => {
  it('parses a snapshot', () => {
    const parsed = VanguardConnectionsResponse.parse({
      at: 5,
      active: true,
      connections: [{ pid: 1, command: 'x', role: 'suite', protocol: 'TCP', remoteHost: '1.1.1.1', remotePort: 443, allowedBy: 'a.b' }],
    });
    expect(parsed.connections[0]!.role).toBe('suite');
  });
});
