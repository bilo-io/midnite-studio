import { isAudioPath, type MediaFileEntry } from '@midnite/studio-shared';
import { useQueries } from '@tanstack/react-query';
import { LuFileAudio, LuFolderOpen, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';

import { Accordion } from '../../../components/accordion/accordion';
import { useDialogs } from '../../../components/dialog-host';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { bridge } from '../../../services/bridge';
import { MEDIA_KEYS, revealMedia, useMediaMutations, useMediaProjects } from '../use-media';

const validName = (value: string) =>
  value.trim().length === 0
    ? 'Enter a name.'
    : /[/\\]/.test(value) || value.trim().startsWith('.')
      ? 'Use a single folder name.'
      : null;

/**
 * Media ▸ Audio's explorer (Phase 99 Theme E): an `Accordion` of the repo's
 * audio projects, each headed by its **variant** count (audio files only — not
 * sidecars or `project.json`) and listing its variants. New / Rename / Reveal
 * / Delete; delete goes to the Trash behind a confirm naming the file count.
 */
export function AudioProjects({
  repoId,
  activeProject,
  selectedPath,
  onSelectProject,
  onSelectVariant,
}: {
  repoId: string;
  activeProject: string | null;
  selectedPath: string | null;
  onSelectProject: (project: string) => void;
  onSelectVariant: (project: string, path: string) => void;
}) {
  const projects = useMediaProjects(repoId, 'audio');
  const mutations = useMediaMutations(repoId, 'audio');
  const dialogs = useDialogs();
  const all = projects.data ?? [];
  const listings = useQueries({
    queries: all.map((p) => ({
      queryKey: MEDIA_KEYS.files(repoId, 'audio', p.name),
      queryFn: async (): Promise<MediaFileEntry[]> => {
        const result = await bridge()?.media.file.list({ repoId, tab: 'audio', project: p.name });
        return result?.ok ? result.value : [];
      },
    })),
  });

  const create = () =>
    dialogs.prompt({
      title: 'New audio project',
      label: 'Name',
      confirmLabel: 'Create',
      placeholder: 'night-drive',
      validate: validName,
      onConfirm: (name) => {
        const project = name.trim();
        mutations.createProject.mutate(project, {
          onSuccess: (result) => {
            if (result.ok) onSelectProject(project);
          },
        });
      },
    });

  const rename = (project: string) =>
    dialogs.prompt({
      title: `Rename "${project}"`,
      label: 'Name',
      confirmLabel: 'Rename',
      initialValue: project,
      validate: validName,
      onConfirm: (name) => {
        const to = name.trim();
        if (to === project) return;
        mutations.renameProject.mutate(
          { project, to },
          { onSuccess: (result) => result.ok && activeProject === project && onSelectProject(to) },
        );
      },
    });

  const remove = (project: string, fileCount: number) =>
    dialogs.confirm({
      title: `Delete "${project}"?`,
      body: `Moves .midnite/media/audio/${project}/ to the Trash.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: fileCount, sample: [] },
      blastRadiusKind: 'files',
      onConfirm: () => mutations.removeProject.mutate(project),
    });

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
            icon={LuFileAudio}
            title="No projects yet"
            body="Projects live in .midnite/media/audio/ and are tracked by git. Importing creates one."
          />
        ) : (
          <Accordion
            id="media-audio-projects"
            sections={all.map((project, i) => {
              const variants = (listings[i]?.data ?? []).filter((f) => isAudioPath(f.path));
              const active = project.name === activeProject;
              return {
                id: project.name,
                title: project.name,
                count: variants.length,
                actions: (
                  <span className="flex items-center">
                    <IconButton icon={LuPencil} label={`Rename ${project.name}`} size="sm" onClick={() => rename(project.name)} />
                    <IconButton
                      icon={LuFolderOpen}
                      label="Reveal in Finder"
                      size="sm"
                      onClick={() => revealMedia(repoId, 'audio', project.name)}
                    />
                    <IconButton
                      icon={LuTrash2}
                      label={`Delete ${project.name}`}
                      size="sm"
                      tone="danger"
                      onClick={() => remove(project.name, project.fileCount)}
                    />
                  </span>
                ),
                children: (
                  <ul className="flex flex-col pb-1">
                    <li>
                      <button
                        type="button"
                        aria-current={(active && selectedPath === null) || undefined}
                        onClick={() => onSelectProject(project.name)}
                        className={`w-full truncate py-1 pl-6 pr-2 text-left text-[11px] ${
                          active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Session
                      </button>
                    </li>
                    {variants.map((file) => {
                      const current = active && selectedPath === file.path;
                      return (
                        <li key={file.path}>
                          <button
                            type="button"
                            aria-current={current || undefined}
                            onClick={() => onSelectVariant(project.name, file.path)}
                            className={`flex w-full items-center gap-1.5 truncate py-1 pl-6 pr-2 text-left text-xs ${
                              current ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                            }`}
                          >
                            <LuFileAudio aria-hidden className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{file.path}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ),
              };
            })}
          />
        )}
      </div>
    </div>
  );
}
