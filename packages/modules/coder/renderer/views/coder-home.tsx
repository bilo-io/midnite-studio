import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, type ComponentType } from 'react';
import { LuCode, LuFolderPlus, LuX } from 'react-icons/lu';

import { apiClientViews } from '@midnite/studio-feature-api-client/renderer';
import { databaseViews } from '@midnite/studio-feature-database/renderer';
import { forgeViews } from '@midnite/studio-feature-forge/renderer';
import { sessionsViews } from '@midnite/studio-feature-sessions/renderer';
import { tasksViews } from '@midnite/studio-feature-tasks/renderer';
import { testsViews } from '@midnite/studio-feature-tests/renderer';
import { bridge, RingSpinner } from '@midnite/studio-frame';
import type { RepoDescriptor } from '@midnite/studio-shared';

import { coderManifest, CODER_VIEWS, type CoderViewId } from '../../manifest';
import { useCoderStore } from '../coder-store';

const LABEL: Record<CoderViewId, string> = {
  reviews: 'Reviews',
  actions: 'Actions',
  tasks: 'Tasks',
  tests: 'Tests',
  graph: 'Graph',
  apiClient: 'API',
  database: 'Database',
  sessions: 'Sessions',
};

/** Each view as a lazy chunk, loaded the way Studio's registry loads it. */
const VIEWS: Record<CoderViewId, ComponentType> = {
  reviews: lazy(() => forgeViews.reviews().then((Component) => ({ default: Component }))),
  actions: lazy(() => forgeViews.actions().then((Component) => ({ default: Component }))),
  // The forge's issues and boards, over Coder's forge channels and its own Tasks memory (`compose/tasks-host.tsx`).
  tasks: lazy(() => tasksViews.tasks().then((Component) => ({ default: Component }))),
  tests: lazy(() => testsViews.tests().then((Component) => ({ default: Component }))),
  // The frame's git graph, over Coder's read-only git host (`compose/git-host.tsx`).
  graph: lazy(() => import('@midnite/studio-frame/graph').then((m) => ({ default: m.GraphView }))),
  apiClient: lazy(() => apiClientViews.apiClient().then((Component) => ({ default: Component }))),
  database: lazy(() => databaseViews.database().then((Component) => ({ default: Component }))),
  // The runtime host's terminal sessions, attached as a broker guest (`compose/coder-hosts.ts`).
  sessions: lazy(() => sessionsViews.sessions().then((Component) => ({ default: Component }))),
};

const REPOS_KEY = ['repos'] as const;

function useCoderRepos() {
  return useQuery<RepoDescriptor[]>({ queryKey: REPOS_KEY, queryFn: async () => (await bridge()?.repos.list()) ?? [] });
}

/**
 * Coder's repository list: the folders main holds, an Add button (main's folder dialog — the renderer
 * only ever passes back a path main just handed it) and a Remove per row. The selection drives every view.
 */
function RepoList() {
  const client = useQueryClient();
  const repos = useCoderRepos();
  const selected = useCoderStore((s) => s.selectedRepoId);
  const selectRepo = useCoderStore((s) => s.selectRepo);
  const add = useMutation({
    mutationFn: async (): Promise<string | null> => {
      const api = bridge();
      const path = api ? await api.repos.pickDirectory() : null;
      if (!api || path === null) return null;
      const result = await api.repos.open({ path });
      if (!result.ok) return result.message;
      selectRepo(result.repo.id);
      return null;
    },
    onSettled: () => client.invalidateQueries({ queryKey: REPOS_KEY }),
  });
  const remove = useMutation({
    mutationFn: async (repoId: string) => bridge()?.repos.close({ repoId }),
    onSettled: () => client.invalidateQueries({ queryKey: REPOS_KEY }),
  });

  // Keep a selection while there is something to select: the first repository, or none.
  const list = repos.data;
  useEffect(() => {
    if (!list) return;
    if (selected !== null && list.some((r) => r.id === selected)) return;
    selectRepo(list[0]?.id ?? null);
  }, [list, selected, selectRepo]);

  return (
    <aside aria-label="Repositories" className="flex w-56 shrink-0 flex-col border-r border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Repositories</h2>
        <button
          type="button"
          aria-label="Add repository"
          title="Add repository"
          data-testid="coder-add-repo"
          onClick={() => add.mutate()}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LuFolderPlus aria-hidden className="h-4 w-4" />
        </button>
      </div>
      {add.data ? <p className="px-3 pb-2 text-[11px] text-destructive">{add.data}</p> : null}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {(list ?? []).map((repo) => (
          <li key={repo.id} className="group flex items-center">
            <button
              type="button"
              aria-current={repo.id === selected ? 'true' : undefined}
              title={repo.path}
              onClick={() => selectRepo(repo.id)}
              className={`min-w-0 flex-1 truncate px-3 py-1.5 text-left text-xs ${repo.id === selected ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              {repo.name}
              {repo.headRef ? <span className="ml-1.5 text-muted-foreground/70">{repo.headRef}</span> : null}
            </button>
            <button
              type="button"
              aria-label={`Remove ${repo.name}`}
              onClick={() => remove.mutate(repo.id)}
              className="invisible mr-1 rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:visible"
            >
              <LuX aria-hidden className="h-3 w-3" />
            </button>
          </li>
        ))}
        {list && list.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">Add a repository to see its pull requests, runs, tests and history.</li>
        ) : null}
      </ul>
    </aside>
  );
}

/**
 * What Coder shows on open — Reviews, with Actions and Tests beside it as tabs: the accent mark and
 * name, the view tabs and the review-actions switch, the repository list, then the active view.
 * With `embeddedView` (a host's rail row, Phase 124 Theme E.3) the view is the rail's, so the header keeps
 * only the review-actions switch.
 */
export function CoderHome({ embeddedView }: { embeddedView?: CoderViewId } = {}) {
  const storedView = useCoderStore((s) => s.view);
  const view = embeddedView ?? storedView;
  const setView = useCoderStore((s) => s.setView);
  const writesEnabled = useCoderStore((s) => s.writesEnabled);
  const setWritesEnabled = useCoderStore((s) => s.setWritesEnabled);
  const selected = useCoderStore((s) => s.selectedRepoId);
  const Active = useMemo(() => VIEWS[view], [view]);
  return (
    <div className="flex h-full flex-col">
      {embeddedView !== undefined ? (
        <header className="flex items-center justify-end border-b border-border px-4 py-1.5">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={writesEnabled} onChange={(e) => setWritesEnabled(e.target.checked)} />
            Review actions
          </label>
        </header>
      ) : (
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: coderManifest.accent }}>
          <LuCode className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">Midnite Coder</p>
        <nav aria-label="Coder views" className="ml-4 flex items-center gap-1">
          {CODER_VIEWS.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={view === id ? 'page' : undefined}
              data-testid={`coder-tab-${id}`}
              onClick={() => setView(id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${view === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
            >
              {LABEL[id]}
            </button>
          ))}
        </nav>
        <label className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={writesEnabled} onChange={(e) => setWritesEnabled(e.target.checked)} />
          Review actions
        </label>
      </header>
      )}
      <div className="flex min-h-0 flex-1">
        <RepoList />
        <main className="min-w-0 flex-1" aria-label={LABEL[view]}>
          {/* The Database tool and Sessions are global, as in Studio: neither belongs to one repository. */}
          {selected === null && view !== 'database' && view !== 'sessions' ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No repository selected.</div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <RingSpinner label="Loading" size="md" />
                </div>
              }
            >
              <Active />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
