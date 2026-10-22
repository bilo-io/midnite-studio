import { matchThreatHost } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { classifyAgentDestination } from './classify';

describe('classifyAgentDestination', () => {
  it('is medium for a named, signed destination', () => {
    expect(classifyAgentDestination({ address: '140.82.112.3', hostname: 'lb-140-82-112-3-iad.github.com' })).toEqual({
      severity: 'medium',
      reasons: [],
    });
  });

  it('is high when the process is unsigned', () => {
    const verdict = classifyAgentDestination({ address: '1.2.3.4', hostname: 'a.example.com', unsigned: true });
    expect(verdict.severity).toBe('high');
    expect(verdict.reasons[0]).toMatch(/no valid code signature/);
  });

  it('is high for a public address nothing names, and never for a LAN one', () => {
    expect(classifyAgentDestination({ address: '203.0.113.9' }).severity).toBe('high');
    expect(classifyAgentDestination({ address: '192.168.1.40' }).severity).toBe('medium');
  });

  it('is high for a paste site, a tunnel and an exfiltration shape', () => {
    for (const host of ['pastebin.com', 'abc123.ngrok.io', 'x.trycloudflare.com', 'a.loca.lt', 'webhook.site', 'x.burpcollaborator.net', 'requestbin.com']) {
      const threat = matchThreatHost(host)!;
      expect(threat, host).toBeDefined();
      expect(classifyAgentDestination({ address: '1.2.3.4', hostname: host, threat }).severity, host).toBe('high');
    }
  });
});
