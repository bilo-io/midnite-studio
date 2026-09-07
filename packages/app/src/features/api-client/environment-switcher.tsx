import { useEffect, useState } from 'react';

import { LuCheck, LuChevronsUpDown, LuPencil, LuPlus } from 'react-icons/lu';

import { Popover } from '../../components/popover';
import { useApiClientStore } from '../../store/api-client-store';
import { useUiStore } from '../../store/ui-store';
import { EnvironmentEditor } from './environment-editor';

/**
 * The API Client view's own environment quick-switcher (Phase 70 Theme A) —
 * a `<select>`-shaped popover listing every environment plus "No environment",
 * defaulting to none. Lives in the view's own toolbar, not the global status
 * bar (Phase 66's Decision 4): the environment concept means nothing outside
 * this view.
 *
 * Owns its own fetch, exactly as `collection-tree.tsx` owns
 * `loadCollections`: `loadEnvironments(repoId)` runs whenever `repoId`
 * changes, and this component is the one place in the view that renders the
 * `EnvironmentEditor` modal — "New environment" and the pencil beside each
 * row both open it, over this same popover.
 */
export function EnvironmentSwitcher({ repoId }: { repoId: string }) {
  const environments = useApiClientStore((s) => s.environments);
  const status = useApiClientStore((s) => s.environmentsStatus);
  const loadEnvironments = useApiClientStore((s) => s.loadEnvironments);
  const activeId = useUiStore((s) => s.activeEnvironmentByRepo[repoId] ?? null);
  const setActiveEnvironment = useUiStore((s) => s.setActiveEnvironment);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ environmentId: string | null } | null>(null);

  useEffect(() => {
    void loadEnvironments(repoId);
  }, [repoId, loadEnvironments]);

  const activeName =
    activeId === null
      ? 'No environment'
      : (environments.find((summary) => summary.id === activeId)?.environment.name ?? 'No environment');

  return (
    <>
      <Popover
        label="Select environment"
        open={open}
        onOpenChange={setOpen}
        side="bottom"
        align="end"
        triggerClassName="flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        panelClassName="w-56 p-1"
        trigger={
          <>
            <span className="max-w-32 truncate">{activeName}</span>
            <LuChevronsUpDown className="h-3 w-3 shrink-0" aria-hidden />
          </>
        }
      >
        <div className="flex max-h-72 flex-col gap-0.5 overflow-auto">
          <button
            type="button"
            onClick={() => {
              setActiveEnvironment(repoId, null);
              setOpen(false);
            }}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-accent"
          >
            <LuCheck
              className={`h-3 w-3 shrink-0 ${activeId === null ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">No environment</span>
          </button>

          {status === 'loading' && environments.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>
          ) : null}

          {environments.map((summary) => (
            <div key={summary.id} className="group flex items-center gap-0.5 rounded hover:bg-accent">
              <button
                type="button"
                onClick={() => {
                  setActiveEnvironment(repoId, summary.id);
                  setOpen(false);
                }}
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-xs"
              >
                <LuCheck
                  className={`h-3 w-3 shrink-0 ${activeId === summary.id ? 'opacity-100' : 'opacity-0'}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{summary.environment.name}</span>
              </button>
              <button
                type="button"
                aria-label={`Edit ${summary.environment.name}`}
                onClick={() => {
                  setEditing({ environmentId: summary.id });
                  setOpen(false);
                }}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              >
                <LuPencil className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ))}

          <div className="my-1 border-t border-border" />

          <button
            type="button"
            onClick={() => {
              setEditing({ environmentId: null });
              setOpen(false);
            }}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LuPlus className="h-3 w-3 shrink-0" aria-hidden />
            New environment…
          </button>
        </div>
      </Popover>

      {editing ? (
        <EnvironmentEditor
          repoId={repoId}
          environmentId={editing.environmentId}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
