import { type NetworkThreatHost } from '@midnite/studio-shared';

/**
 * How bad a new destination from an agent session is (Phase 120 Theme E). Pure: the sensor gathers the
 * facts (a `codesign` result, a threat-list hit) and this reads them.
 *
 * A destination not seen in that repo's last 30 days is `medium`, and `high` when the process is unsigned
 * or the address is one a threat-list name (paste site, tunnel service, exfiltration shape) resolves to.
 * There is no "raw IP" rung: deciding it needs a reverse lookup, which would send every observed
 * destination to a resolver, and "no reverse name" flags CDN addresses besides. It is deferred to
 * Phase 122's threat feed (`outstanding.md`).
 */
export interface DestinationFacts {
  /** The process behind it has no valid code signature. */
  unsigned?: boolean;
  /** The threat-list entry whose forward-resolved addresses include the destination. */
  threat?: NetworkThreatHost;
}

export interface DestinationVerdict {
  severity: 'medium' | 'high';
  /** One sentence per reason it is `high`; empty for `medium`. */
  reasons: string[];
}

const THREAT_WORDS: Record<NetworkThreatHost['kind'], string> = {
  'paste-site': 'a paste or file-drop site',
  tunnel: 'a tunnel service',
  exfiltration: 'a request-catcher or interaction server, the shape stolen data is posted to',
};

export function classifyAgentDestination(facts: DestinationFacts): DestinationVerdict {
  const reasons: string[] = [];
  if (facts.threat) reasons.push(`The destination is ${THREAT_WORDS[facts.threat.kind]} (${facts.threat.note}).`);
  if (facts.unsigned) reasons.push('The process that connected has no valid code signature.');
  return { severity: reasons.length > 0 ? 'high' : 'medium', reasons };
}
