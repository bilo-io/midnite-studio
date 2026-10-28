import type { GuardCheck } from './check';
import { createLockfileCvesCheck } from './checks/lockfile-cves';
import { createInstalledSoftwareCheck } from './checks/installed-software';
import { mcpServersCheck, poisonedPackagesCheck, slopsquatCheck } from './checks/threat-feed-checks';

/**
 * Every check the scheduled sweep runs (Phase 122 Themes B and C). One list, so a check that exists but is
 * not here is visible in review rather than silently inert; Themes D to F append theirs.
 */
export function defaultGuardChecks(now: () => number = () => Date.now()): GuardCheck[] {
  return [createLockfileCvesCheck(now), createInstalledSoftwareCheck(now), poisonedPackagesCheck, mcpServersCheck, slopsquatCheck];
}
