import type { MediaTab } from '@midnite/studio-shared';
import { LuFile, LuFolderOpen, LuPlus, LuTrash2 } from 'react-icons/lu';

import { Accordion } from '../../components/accordion/accordion';
import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { revealMedia, useMediaFiles, useMediaMutations, useMediaProjects } from './use-media';
import { MEDIA_TAB_META } from './media-tabs';

export type MediaSelection = { project: string; path: string | null };

/**
 * The repo-scoped explorer every storage-backed tab starts from (Phase 99
 * Theme A): one `Accordion` section per project under
 * `.midnite/media/<tab>/`, each listing its files. New / Reveal / Delete live
 * in the section header; Delete goes to the Trash behind a confirm naming the
 * file count. `fileFilter` narrows what a tab lists (Images: images only).
 */
export function MediaProjectsAccordion({
  repoId,
  tab,
  selection,
  onSelect,
  fileFilter,
  fileLabel,
  onFileContextMenu,
}: {
  repoId: string;
  tab: MediaTab;
  selection: MediaSelection | null;
  onSelect: (selection: MediaSelection) => void;
  fileFilter?: (path: string) => boolean;
  /** What a row shows instead of its path (Terrain: the folder's name, not `<folder>/terrain.json`). */
  fileLabel?: (path: string) => string;
  /** A right-click on a file row. */
  onFileContextMenu?: (event: React.MouseEvent, project: string, path: string) => void;
}) {
  const projects = useMediaProjects(repoId, tab);
  const mutations = useMediaMutations(repoId, tab);
  const dialogs = useDialogs();
  const label = MEDIA_TAB_META[tab].label;

  const create = () =>
    dialogs.prompt({
      title: `New ${label.toLowerCase()} project`,
      label: 'Name',
      confirmLabel: 'Create',
      placeholder: 'launch-campaign',
      validate: (value) =>
        value.trim().length === 0
          ? 'Enter a name.'
          : /[/\\]/.test(value) || value.trim().startsWith('.')
            ? 'Use a single folder name.'
            : null,
      onConfirm: (name) => {
        const project = name.trim();
        mutations.createProject.mutate(project, {
          onSuccess: (result) => {
            if (result.ok) onSelect({ project, path: null });
          },
        });
      },
    });

  const remove = (project: string, fileCount: number) =>
    dialogs.confirm({
      title: `Delete "${project}"?`,
      body: `Moves .midnite/media/${tab}/${project}/ to the Trash.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: fileCount, sample: [] },
      blastRadiusKind: 'files',
      onConfirm: () => mutations.removeProject.mutate(project),
    });

  const all = projects.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Projects</h2>
        <span className="tabular-nums text-[11px] text-muted-foreground/70">{all.length}</span>
        <IconButton icon={LuPlus} label="New project" size="sm" className="ml-auto" onClick={create} />
      </div>
      <div className="hide-scrollbar min-h-0 flex-1 overflow-auto">
        {projects.isError ? (
          <EmptyState title="Could not read the media folder" body={String(projects.error)} />
        ) : all.length === 0 && !projects.isPending ? (
          <EmptyState
            icon={MEDIA_TAB_META[tab].icon}
            title="No projects yet"
            body={`Projects live in .midnite/media/${tab}/ and are tracked by git.`}
          />
        ) : (
          <Accordion
            tone="primary"
            id={`media-${tab}-projects`}
            sections={all.map((project) => ({
              id: project.name,
              title: project.name,
              count: project.fileCount,
              actions: (
                <span className="flex items-center">
                  <IconButton
                    icon={LuFolderOpen}
                    label="Reveal in Finder"
                    size="sm"
                    onClick={() => revealMedia(repoId, tab, project.name)}
                  />
                  <IconButton
                    icon={LuTrash2}
                    label={`Delete ${project.name}`}
                    size="sm"
                    onClick={() => remove(project.name, project.fileCount)}
                  />
                </span>
              ),
              children: (
                <ProjectFiles
                  repoId={repoId}
                  tab={tab}
                  project={project.name}
                  selection={selection}
                  onSelect={onSelect}
                  {...(fileFilter ? { fileFilter } : {})}
                  {...(fileLabel ? { fileLabel } : {})}
                  {...(onFileContextMenu ? { onFileContextMenu } : {})}
                />
              ),
            }))}
          />
        )}
      </div>
    </div>
  );
}

function ProjectFiles({
  repoId,
  tab,
  project,
  selection,
  onSelect,
  fileFilter,
  fileLabel,
  onFileContextMenu,
}: {
  repoId: string;
  tab: MediaTab;
  project: string;
  selection: MediaSelection | null;
  onSelect: (selection: MediaSelection) => void;
  fileFilter?: (path: string) => boolean;
  fileLabel?: (path: string) => string;
  onFileContextMenu?: (event: React.MouseEvent, project: string, path: string) => void;
}) {
  const files = useMediaFiles(repoId, tab, project);
  const shown = (files.data ?? []).filter((f) => !fileFilter || fileFilter(f.path));
  if (shown.length === 0) {
    return <p className="px-6 py-1 text-[11px] text-muted-foreground">{files.isPending ? 'Loading…' : 'Empty'}</p>;
  }
  return (
    <ul className="flex flex-col pb-1">
      {shown.map((file) => {
        const active = selection?.project === project && selection.path === file.path;
        return (
          <li key={file.path}>
            <button
              type="button"
              aria-current={active || undefined}
              onClick={() => onSelect({ project, path: file.path })}
              onContextMenu={onFileContextMenu ? (event) => onFileContextMenu(event, project, file.path) : undefined}
              className={`flex w-full items-center gap-1.5 truncate py-1 pl-6 pr-2 text-left text-xs ${
                active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground'
              }`}
            >
              <LuFile aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{fileLabel ? fileLabel(file.path) : file.path}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
