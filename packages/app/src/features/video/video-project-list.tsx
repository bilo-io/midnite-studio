import { LuClapperboard, LuPlus, LuTrash2 } from 'react-icons/lu';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { LoadingRegion, Skeleton } from '../../components/skeleton';
import { useCreateVideoProject, useRemoveVideoProject, useVideoProjects } from './use-video';
import { slugifyProjectTitle } from './video-slug';

/**
 * The left pane (Phase 44 Theme D) — one row per discovered project, modelled
 * on `workflow-list.tsx`: same header shape, same empty state, delete on the
 * row's context menu rather than a hover toolbar. An invalid project (Theme
 * B's own `valid: false` state — a `project.json` that failed to parse) is
 * listed and greyed rather than hidden, so its folder is never silently gone
 * from view.
 *
 * Checked in the house order — error → empty → skeleton → content
 * (`components/skeleton.tsx`). The scan reads a directory the user chooses in
 * Settings, so "that path is gone" is a real and recoverable failure, and
 * before Phase 60 Theme C it rendered as "No projects yet" — an answer this
 * pane did not have.
 */
export function VideoProjectList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const projects = useVideoProjects();
  const create = useCreateVideoProject();
  const remove = useRemoveVideoProject();
  const dialogs = useDialogs();
  const all = projects.data ?? [];

  const createProject = () => {
    dialogs.prompt({
      title: 'New video project',
      label: 'Title',
      confirmLabel: 'Create',
      placeholder: 'COP31 showreel',
      validate: (value) => (slugifyProjectTitle(value).length === 0 ? 'Enter a title.' : null),
      onConfirm: (title) => {
        const id = slugifyProjectTitle(title);
        create.mutate(
          { id, title },
          { onSuccess: (result) => { if (result.ok) onSelect(id); } },
        );
      },
    });
  };

  const deleteProject = (id: string, title: string) => {
    dialogs.confirm({
      title: `Delete "${title}"?`,
      body: 'This removes the project folder — its brief, script, inputs and every render. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      blastRadius: null,
      onConfirm: () => remove.mutate(id),
    });
  };

  const menuFor = (id: string, title: string): MenuItem[] => [
    { label: 'Delete', icon: LuTrash2, danger: true, onSelect: () => deleteProject(id, title) },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Video</h2>
        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">{all.length}</span>
        <IconButton icon={LuPlus} label="New project" size="sm" className="ml-auto" onClick={createProject} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {projects.isError ? (
          <EmptyState
            icon={LuClapperboard}
            title="Could not read the video root"
            body={
              projects.error instanceof Error ? projects.error.message : String(projects.error)
            }
          />
        ) : projects.isPending ? (
          <LoadingRegion label="Looking for video projects…" className="flex flex-col gap-2 p-2">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex flex-col gap-1">
                <Skeleton className="h-3" style={{ width: row % 2 === 0 ? '62%' : '48%' }} />
                <Skeleton className="h-2.5 w-24" />
              </div>
            ))}
          </LoadingRegion>
        ) : all.length === 0 ? (
          <EmptyState
            icon={LuClapperboard}
            title="No projects yet"
            body="Create one, or check Settings ▸ Video Studio if you haven't set a video root."
          />
        ) : (
          all.map((project) => {
            const title = project.valid ? project.title : project.id;
            return (
              <button
                key={project.id}
                type="button"
                disabled={!project.valid}
                onClick={() => onSelect(project.id)}
                onContextMenu={(event) => {
                  if (!project.valid) return;
                  event.preventDefault();
                  dialogs.openMenu(event, menuFor(project.id, title));
                }}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-2 py-2 text-left transition-colors hover:bg-accent ${
                  selectedId === project.id ? 'bg-accent' : ''
                } ${project.valid ? '' : 'opacity-50'}`}
              >
                <span className="truncate text-xs font-medium text-foreground">{title}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {project.valid ? project.composition : project.error}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
