import type { SecurityFinding, SecurityFindingSeverity } from '@midnite/studio-shared';

import { createGuardFinding, type GuardCheck } from '../check';
import type { KevEntry } from '../feeds/kev';

export const INSTALLED_SOFTWARE_CHECK_ID = 'installed-software';

/** One thing installed on the Mac, as the `installedSoftware` resolver reports it. */
export interface InstalledSoftware {
  source: 'brew' | 'app' | 'macos';
  name: string;
  version: string;
  /** The newest version known (brew's `current_version`); absent when nothing says there is one. */
  latest?: string;
  /** Whether the source reports it behind. Apps and macOS carry no such signal, so only brew formulae set it. */
  outdated?: boolean;
}

export interface InstalledSoftwareInputs {
  installedSoftware: InstalledSoftware[];
  kev?: Record<string, KevEntry>;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * KEV entries whose vendor/product names this item. Whole-name match after normalising ("Google Chrome" vs
 * product "Chrome" matches; "node" must equal a product, never a substring, so `node` does not hit "Node.js Foo").
 * KEV carries no version ranges, so a hit only *raises* an item that is already behind; it never flags a current one.
 */
export function kevMatches(item: InstalledSoftware, kev: Record<string, KevEntry>): KevEntry[] {
  const name = norm(item.name);
  if (name.length < 3) return [];
  return Object.values(kev).filter((e) => {
    const product = norm(e.product ?? '');
    const vendorProduct = norm(`${e.vendorProject ?? ''}${e.product ?? ''}`);
    return product !== '' && (name === product || name === vendorProduct);
  });
}

/**
 * Theme B, installed software: an outdated item with no known exploited CVE is `low`, one KEV names `high`
 * (`critical` when it is ransomware-linked or past its CISA due date). Nothing here runs a command: the fix is
 * text the user copies (Phase 122 decision 6: no check uses sudo).
 */
export function createInstalledSoftwareCheck(now: () => number = () => Date.now()): GuardCheck {
  const check: GuardCheck = {
    id: INSTALLED_SOFTWARE_CHECK_ID,
    title: 'Outdated software on this Mac',
    category: 'vulnerability',
    needs: ['installedSoftware', 'kev'],
    run(raw): SecurityFinding[] {
      const inputs = raw as Partial<InstalledSoftwareInputs>;
      const items = Array.isArray(inputs.installedSoftware) ? inputs.installedSoftware : [];
      const kev = inputs.kev && !Array.isArray(inputs.kev) ? inputs.kev : {};
      const findings: SecurityFinding[] = [];
      for (const item of items) {
        if (!item.outdated) continue;
        const hits = kevMatches(item, kev);
        let severity: SecurityFindingSeverity = 'low';
        if (hits.length > 0) {
          const overdue = hits.some((h) => h.dueDate !== undefined && Date.parse(h.dueDate) < now());
          const ransom = hits.some((h) => h.knownRansomwareCampaignUse === 'Known');
          severity = overdue || ransom ? 'critical' : 'high';
        }
        const fix = item.source === 'brew' ? ` Run: brew upgrade ${item.name}` : '';
        const cves = hits.map((h) => h.cveID);
        findings.push(
          createGuardFinding({
            check,
            subject: `${item.source}:${item.name}`,
            severity,
            title: `${item.name} ${item.version} is out of date`,
            detail:
              `${item.name} ${item.version} is behind${item.latest ? ` ${item.latest}` : ''}.` +
              (cves.length > 0 ? ` CISA's KEV lists ${item.name}: ${cves.slice(0, 5).join(', ')}.` : '') +
              fix,
            evidence: item.source === 'brew' ? [{ kind: 'command', command: 'brew', args: ['upgrade', item.name] }] : [],
          }),
        );
      }
      return findings;
    },
  };
  return check;
}
