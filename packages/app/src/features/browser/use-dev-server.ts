import { useQuery } from '@tanstack/react-query';

import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';

import { detectDevServer, type DevServerHint } from './dev-server';

/**
 * The active repository's dev server, if one can be found (Phase 71 Theme C).
 *
 * A react-query hook rather than a hook-shaped `useEffect`, for one reason
 * that matters: two surfaces ask this question — the new-tab page's tile and
 * the `browser.openDevServer` palette row — and without a shared cache each
 * would run its own probe sweep. Under one key they run at most one between
 * them.
 *
 * Refreshed on mount and on window focus rather than on a timer. The failure
 * this guards against is a stale tile pointing at a server the user has since
 * stopped, and both of those are moments the user is about to look at it —
 * whereas a background interval would probe five loopback ports forever, for a
 * pane that is closed most of the time.
 *
 * Nothing here navigates. Detection is a hint; see `dev-server.ts`.
 */
export function useDevServer(): DevServerHint | null {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const worktreePath = useUiStore((s) => s.selectedWorktreePath);

  const { data } = useQuery<DevServerHint | null>({
    queryKey: ['repos', repoId ?? '', 'dev-server', worktreePath ?? ''],
    enabled: repoId !== null,
    // A dev server that is up stays up for hours; ten seconds is short enough
    // that a remount after starting one picks it up, and long enough that
    // moving between views does not re-probe.
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return null;

      const scope = {
        scope: 'repo' as const,
        repoId,
        ...(worktreePath ? { worktreePath } : {}),
      };

      // The same read path `repo-lifecycle.ts` uses for the same file — jailed,
      // read-only, and total: an unreadable or unparseable `package.json`
      // degrades to a probe rather than throwing.
      let pkgJson: unknown = null;
      const pkg = await api.fs.readFile({ ...scope, relPath: 'package.json' });
      if (pkg.kind === 'text') {
        try {
          pkgJson = JSON.parse(pkg.content);
        } catch {
          pkgJson = null;
        }
      }

      return detectDevServer(pkgJson, async (port) => {
        const answer = await api.browser.devServerProbe({ port });
        return answer.listening;
      });
    },
  });

  return data ?? null;
}
