import type { SecurityFinding } from '@midnite/studio-shared';

import { createGuardFinding, type GuardCheck } from '../check';

export const ELECTRON_FRESHNESS_CHECK_ID = 'electron-freshness';

/** One `electron` dependency pinned in a package.json of an open repo. */
export interface ElectronPin {
  /** Repo-relative path of the package.json, e.g. `packages/desktop/package.json`. */
  file: string;
  repo: string;
  /** The range as written (`^41.2.0`). */
  range: string;
  major: number;
}

/** The major of a semver range as `scripts/electron-freshness.mjs` reads it: the first `N.` in it. */
export function pinnedMajor(range: string | undefined): number | null {
  const m = /(\d+)\./.exec(range ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * Theme B, Electron freshness (Phase 91 I's rule, now a check): a pinned Electron major outside the three Electron
 * supports gets no Chromium security backports, so it is a `high` finding per pin. Nothing is judged against an
 * empty window: without the release index the input is skipped and the check does not run.
 */
export const electronFreshnessCheck: GuardCheck = {
  id: ELECTRON_FRESHNESS_CHECK_ID,
  title: 'Electron out of support',
  category: 'vulnerability',
  needs: ['electronPins', 'electronMajors'],
  run(raw): SecurityFinding[] {
    const pins = Array.isArray(raw['electronPins']) ? (raw['electronPins'] as ElectronPin[]) : [];
    const supported = Array.isArray(raw['electronMajors']) ? (raw['electronMajors'] as number[]) : [];
    if (supported.length === 0) return [];
    const newest = Math.max(...supported);
    const findings: SecurityFinding[] = [];
    for (const pin of pins) {
      if (supported.includes(pin.major)) continue;
      findings.push(
        createGuardFinding({
          check: electronFreshnessCheck,
          subject: `${pin.repo}:${pin.file}`,
          severity: 'high',
          title: `Electron ${pin.major} is out of support`,
          detail:
            `${pin.file} pins electron ${pin.range}; Electron supports majors ${supported.join(', ')} and backports no security fixes to ${pin.major}.` +
            ` Update to ${newest}.x.`,
          evidence: [{ kind: 'path', path: `${pin.repo}/${pin.file}` }],
          remediation: [{ id: 'update-package', name: 'electron', from: pin.range, to: `${newest}` }],
        }),
      );
    }
    return findings;
  },
};
