import type { GuardCheck } from './check';
import { createLockfileCvesCheck } from './checks/lockfile-cves';
import { createInstalledSoftwareCheck } from './checks/installed-software';
import { electronFreshnessCheck } from './checks/electron-freshness';
import { behaviourCheck } from './checks/behaviour';
import { macConfigCheck } from './checks/mac-config';
import { macPortsCheck } from './checks/mac-ports';
import { secretsOutsideVaultCheck } from './checks/secrets-outside-vault';
import { sshKeysCheck } from './checks/ssh-keys';
import { mcpServersCheck, poisonedPackagesCheck, slopsquatCheck } from './checks/threat-feed-checks';

/**
 * Every check the scheduled sweep runs (Phase 122 Themes B and C). One list, so a check that exists but is
 * not here is visible in review rather than silently inert; Themes D (the Mac) to F append theirs.
 */
export function defaultGuardChecks(now: () => number = () => Date.now()): GuardCheck[] {
  return [createLockfileCvesCheck(now), createInstalledSoftwareCheck(now), poisonedPackagesCheck, mcpServersCheck, slopsquatCheck, electronFreshnessCheck, macPortsCheck, macConfigCheck, sshKeysCheck, secretsOutsideVaultCheck, behaviourCheck];
}
