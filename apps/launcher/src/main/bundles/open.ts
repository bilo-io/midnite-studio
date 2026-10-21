import { checkLockstep, type LockstepRefusal } from '../../common/lockstep';
import { findInstalled } from './state';

/**
 * The open-side half of lockstep. `router.ts`'s `installedBundleFinder` trusts `installed.json`;
 * this one also asks whether the recorded bundle still matches the running runtime. An app a
 * runtime update left behind is not handed to the OS to launch — `onRefused` reports it (the
 * launcher updates it, or shows the reason) and the router falls through as for a missing bundle.
 */
export function lockstepBundleFinder(
  installRoot: string,
  runtimeVersion: string,
  onRefused?: (app: string, refusal: LockstepRefusal) => void,
): (app: string) => Promise<string | null> {
  return async (app) => {
    const record = await findInstalled(installRoot, app);
    if (record === null) return null;
    const verdict = checkLockstep({ runtimeVersion, bundleVersion: record.version, label: `${app} ${record.version}` });
    if (verdict.ok) return record.stubPath;
    onRefused?.(app, verdict);
    return null;
  };
}
