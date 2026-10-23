import { matchThreatHost } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { classifyAgentDestination } from './classify';

describe('classifyAgentDestination', () => {
  it('is medium for a signed process and no threat-list hit', () => {
    expect(classifyAgentDestination({})).toEqual({ severity: 'medium', reasons: [] });
  });

  it('is high when the process is unsigned', () => {
    const verdict = classifyAgentDestination({ unsigned: true });
    expect(verdict.severity).toBe('high');
    expect(verdict.reasons[0]).toMatch(/no valid code signature/);
  });

  it('has no raw-IP rung: an address alone, named or not, never raises the severity', () => {
    // Deferred to Phase 122: deciding it needs a reverse lookup, which this app does not make.
    expect(classifyAgentDestination({ address: '203.0.113.9' } as never).severity).toBe('medium');
  });

  it('is high for a paste site, a tunnel and an exfiltration shape', () => {
    for (const host of ['pastebin.com', 'abc123.ngrok.io', 'x.trycloudflare.com', 'a.loca.lt', 'webhook.site', 'x.burpcollaborator.net', 'requestbin.com']) {
      const threat = matchThreatHost(host)!;
      expect(threat, host).toBeDefined();
      expect(classifyAgentDestination({ threat }).severity, host).toBe('high');
    }
  });
});
