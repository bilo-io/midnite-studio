import { docThreadPath, isDocFile, type MediaFileEntry } from '@midnite/studio-shared';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { LuFileText, LuFolderOpen, LuPencil, LuPlus, LuSearch, LuTrash2 } from 'react-icons/lu';

import { Accordion } from '../../../components/accordion/accordion';
import { useDialogs } from '../../../components/dialog-host';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { bridge } from '../../../services/bridge';
import type { MediaSelection } from '../media-projects-accordion';
import { MEDIA_KEYS, revealMedia, useMediaMutations, useMediaProjects } from '../use-media';

/**
 * Docs' left pane (Phase 99 Theme B): one `Accordion` section per project
 * under `.midnite/media/doc/`, each listing its `.md` docs, with a filter box
 * over both project and doc names. Projects and docs can be created, renamed
 * and deleted; a doc's `.thread.json` sidecar follows it on rename and delete.
 */
const nameError = (value: string): string | null =>
  value.trim().length === 0
    ? 'Enter a name.'
    : /[/\\]/.test(value) || value.trim().startsWith('.')
      ? 'Use a single name, no slashes.'
      : null;

export const toDocPath = (name: string): string => {
  const trimmed = name.trim();
  return isDocFile(trimmed) ? trimmed : `${trimmed}.md`;
};

export function filterDocs(
  projects: readonly { name: string; docs: readonly string[] }[],
  query: string,
): { name: string; docs: string[] }[] {
  const q = query.trim().toLowerCase();
  return projects.flatMap((project) => {
    if (!q || project.name.toLowerCase().includes(q)) return [{ name: project.name, docs: [...project.docs] }];
    const docs = project.docs.filter((d) => d.toLowerCase().includes(q));
    return docs.length > 0 ? [{ name: project.name, docs }] : [];
  });
}

export function DocsExplorer({
  repoId,
  selection,
  onSelect,
}: {
  repoId: string;
  selection: MediaSelection | null;
  onSelect: (selection: MediaSelection | null) => void;
}) {
  const projects = useMediaProjects(repoId, 'doc');
  const mutations = useMediaMutations(repoId, 'doc');
  const dialogs = useDialogs();
  const [query, setQuery] = useState('');
  const all = projects.data ?? [];

  const files = useQueries({
    queries: all.map((project) => ({
      queryKey: MEDIA_KEYS.files(repoId, 'doc', project.name),
      queryFn: async (): Promise<MediaFileEntry[]> => {
        const result = await bridge()?.media.file.list({ repoId, tab: 'doc', project: project.name });
        return result?.ok ? result.value : [];
      },
    })),
  });
  const withDocs = all.map((project, i) => ({
    name: project.name,
    docs: (files[i]?.data ?? []).map((f) => f.path).filter(isDocFile).sort(),
  }));
  const shown = filterDocs(withDocs, query);

  // Sidecar ops are best-effort: most docs have no thread yet.
  const sidecar = {
    rename: (project: string, from: string, to: string) =>
      void bridge()?.media.file.rename({ repoId, tab: 'doc', project, path: docThreadPath(from), to: docThreadPath(to) }),
    remove: (project: string, path: string) =>
      void bridge()?.media.file.remove({ repoId, tab: 'doc', project, path: docThreadPath(path) }),
  };

  const createProject = () =>
    dialogs.prompt({
      title: 'New docs project',
      label: 'Name',
      confirmLabel: 'Create',
      placeholder: 'handbook',
      validate: nameError,
      onConfirm: (name) =>
        mutations.createProject.mutate(name.trim(), {
          onSuccess: (r) => r.ok && onSelect({ project: name.trim(), path: null }),
        }),
    });

  const renameProject = (project: string) =>
    dialogs.prompt({
      title: `Rename "${project}"`,
      label: 'Name',
      initialValue: project,
      confirmLabel: 'Rename',
      validate: nameError,
      onConfirm: (to) =>
        mutations.renameProject.mutate(
          { project, to: to.trim() },
          {
            onSuccess: (r) => {
              if (r.ok && selection?.project === project) onSelect({ ...selection, project: to.trim() });
            },
          },
        ),
    });

  const removeProject = (project: string, fileCount: number) =>
    dialogs.confirm({
      title: `Delete "${project}"?`,
      body: `Moves .midnite/media/doc/${project}/ to the Trash.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: fileCount, sample: [] },
      blastRadiusKind: 'files',
      onConfirm: () => {
        mutations.removeProject.mutate(project);
        if (selection?.project === project) onSelect(null);
      },
    });

  const createDoc = (project: string) =>
    dialogs.prompt({
      title: `New doc in ${project}`,
      label: 'Name',
      confirmLabel: 'Create',
      placeholder: 'overview',
      validate: nameError,
      onConfirm: (name) => {
        const path = toDocPath(name);
        const title = path.replace(/\.md$/i, '');
        mutations.writeFile.mutate(
          { project, path, content: `# ${title}\n` },
          { onSuccess: (r) => r.ok && onSelect({ project, path }) },
        );
      },
    });

  const renameDoc = (project: string, path: string) =>
    dialogs.prompt({
      title: `Rename "${path}"`,
      label: 'Name',
      initialValue: path.replace(/\.md$/i, ''),
      confirmLabel: 'Rename',
      validate: nameError,
      onConfirm: (name) => {
        const to = toDocPath(name);
        if (to === path) return;
        mutations.renameFile.mutate(
          { project, path, to },
          {
            onSuccess: (r) => {
              if (!r.ok) return;
              sidecar.rename(project, path, to);
              if (selection?.project === project && selection.path === path) onSelect({ project, path: to });
            },
          },
        );
      },
    });

  const removeDoc = (project: string, path: string) =>
    dialogs.confirm({
      title: `Delete "${path}"?`,
      body: 'Moves the doc and its AI thread to the Trash.',
      confirmLabel: 'Move to Trash',
      danger: true,
      onConfirm: () => {
        mutations.removeFile.mutate({ project, path }, { onSuccess: (r) => r.ok && sidecar.remove(project, path) });
        if (selection?.project === project && selection.path === path) onSelect({ project, path: null });
      },
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Projects</h2>
        <span className="tabular-nums text-[11px] text-muted-foreground/70">{all.length}</span>
        <IconButton icon={LuPlus} label="New project" size="sm" className="ml-auto" onClick={createProject} />
      </div>
      <label className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1">
        <LuSearch aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="search"
          aria-label="Filter docs"
          placeholder="Filter"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="hide-scrollbar min-h-0 flex-1 overflow-auto">
        {projects.isError ? (
          <EmptyState title="Could not read the docs folder" body={String(projects.error)} />
        ) : all.length === 0 && !projects.isPending ? (
          <EmptyState
            icon={LuFileText}
            title="No projects yet"
            body="Docs live in .midnite/media/doc/ as plain markdown, tracked by git."
          />
        ) : shown.length === 0 && query ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No docs match “{query}”.</p>
        ) : (
          <Accordion
            id="media-doc-projects"
            sections={shown.map((project) => ({
              id: project.name,
              title: project.name,
              count: project.docs.length,
              actions: (
                <span className="flex items-center">
                  <IconButton icon={LuPlus} label={`New doc in ${project.name}`} size="sm" onClick={() => createDoc(project.name)} />
                  <IconButton icon={LuPencil} label={`Rename ${project.name}`} size="sm" onClick={() => renameProject(project.name)} />
                  <IconButton
                    icon={LuFolderOpen}
                    label="Reveal in Finder"
                    size="sm"
                    onClick={() => revealMedia(repoId, 'doc', project.name)}
                  />
                  <IconButton
                    icon={LuTrash2}
                    label={`Delete ${project.name}`}
                    size="sm"
                    onClick={() => removeProject(project.name, all.find((p) => p.name === project.name)?.fileCount ?? 0)}
                  />
                </span>
              ),
              children:
                project.docs.length === 0 ? (
                  <p className="px-6 py-1 text-[11px] text-muted-foreground">No docs</p>
                ) : (
                  <ul className="flex flex-col pb-1">
                    {project.docs.map((path) => {
                      const active = selection?.project === project.name && selection.path === path;
                      return (
                        <li key={path} className="group relative">
                          <button
                            type="button"
                            aria-current={active || undefined}
                            onClick={() => onSelect({ project: project.name, path })}
                            className={`flex w-full items-center gap-1.5 truncate py-1 pl-6 pr-14 text-left text-xs ${
                              active
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                            }`}
                          >
                            <LuFileText aria-hidden className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{path.replace(/\.md$/i, '')}</span>
                          </button>
                          <span className="absolute right-1 top-0 hidden h-full items-center group-focus-within:flex group-hover:flex">
                            <IconButton icon={LuPencil} label={`Rename ${path}`} size="sm" onClick={() => renameDoc(project.name, path)} />
                            <IconButton icon={LuTrash2} label={`Delete ${path}`} size="sm" onClick={() => removeDoc(project.name, path)} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ),
            }))}
          />
        )}
      </div>
    </div>
  );
}
