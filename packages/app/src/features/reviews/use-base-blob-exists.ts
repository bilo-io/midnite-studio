import { useQuery } from '@tanstack/react-query';

import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';

/**
 * Whether a pull request's base blob is already in the local object database.
 *
 * The gate on Theme H's "Fetch to compare" affordance (Phase 26): a fork PR's
 * base commit is not necessarily fetched, and `mstudio-file://` resolves
 * nothing for a blob git has never seen — which today degrades silently to
 * the plain binary treatment.
 *
 * Checked eagerly, not behind a click: this is a fast, local `cat-file -e`,
 * not the network fetch itself. *That* one stays behind the button — the rule
 * the forge integration has held since Phase 17 is "nothing fetches before
 * the click", not "nothing reads before the click".
 *
 * `rev`/`path` of `null` disables the query outright (an added file has no
 * "before" side to check at all), so a caller only pays for this when there
 * is a real question to answer.
 */
export function useBaseBlobExists({
  repoId,
  worktreePath,
  rev,
  path,
}: {
  repoId: string | undefined;
  worktreePath?: string;
  rev: string | null;
  path: string | null;
}): boolean | undefined {
  const enabled = Boolean(repoId && rev && path);

  const { data } = useQuery({
    queryKey: keys.blobExists(repoId ?? '', worktreePath, rev ?? '', path ?? ''),
    queryFn: async () => {
      if (!repoId || !rev || !path) return undefined;
      return bridge()?.status.blobExists({
        repoId,
        rev,
        path,
        ...(worktreePath ? { worktreePath } : {}),
      });
    },
    enabled,
  });

  return data?.exists;
}
