import { type NetworkThreatHost } from '@midnite/studio-shared';

import { isPrivateLan } from './hosts';

/**
 * How bad a new destination from an agent session is (Phase 120 Theme E). Pure: the sensor gathers the
 * facts (a reverse lookup, a `codesign` result, a threat-list hit) and this reads them.
 *
 * The phase doc's rule: a destination not seen in that repo's last 30 days is `medium`, and `high` when
 * the process is unsigned, the host is a raw IP, a paste site, a tunnel service or a known exfiltration
 * shape. lsof runs with `-n`, so "raw IP" is read as "an address no name maps back to": a public address
 * with no reverse-DNS entry. A LAN address is never raw: nothing names those.
 */
export interface DestinationFacts {
  /** The address lsof printed. */
  address: string;
  /** What the reverse lookup said, when it said anything. */
  hostname?: string;
  /** The process behind it has no valid code signature. */
  unsigned?: boolean;
  /** The threat-list entry the hostname or the address matched. */
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
  if (facts.hostname === undefined && !isPrivateLan(facts.address)) {
    reasons.push('No hostname maps to the address, so it was reached as a raw IP.');
  }
  return { severity: reasons.length > 0 ? 'high' : 'medium', reasons };
}
