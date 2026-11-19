import { selectBranch, usePrefs, type RepoPref } from '../state/prefs';

/** The repo and branch the app is looking at (null until the user picks one). Branch defaults to the repo's default. */
export function useCurrentRepo(): { repo: RepoPref | null; branch: string | null } {
  const repo = usePrefs((s) => s.currentRepo);
  const branch = usePrefs(selectBranch);
  return { repo, branch };
}
