import { parseIterations, type VideoProject } from '@midnite/studio-shared';
import { useState, type ReactNode } from 'react';
import {
  LuChevronDown,
  LuChevronRight,
  LuClapperboard,
  LuFilm,
  LuFolderInput,
  LuNotebookPen,
  LuPlus,
  LuTrash2,
} from 'react-icons/lu';

import { Accordion } from '../../../components/accordion/accordion';
import type { MenuItem } from '../../../components/context-menu';
import { useDialogs } from '../../../components/dialog-host';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { LoadingRegion, Skeleton } from '../../../components/skeleton';
import { FileIcon, FolderIcon } from '../../files/file-icons';
import { useCreateVideoProject, useRemoveVideoProject, useVideoFiles, useVideoProjects } from './use-video';
import {
  buildFileTree,
  buildProjectTree,
  sameSelection,
  type FileTreeNode,
  type ProjectTreeNode,
  type VideoSelection,
} from './video-selection';
import { slugifyProjectTitle } from './video-slug';

/** Assets carry no project; the files channel still wants a non-empty id. */
const ASSETS_PROJECT = '-';

const indent = (depth: number) => ({ paddingLeft: 8 + depth * 12 });

function Row({
  depth,
  selected,
  disabled,
  onClick,
  onContextMenu,
  icon,
  label,
  meta,
  chevron,
  title,
}: {
  depth: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  icon: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  chevron?: 'open' | 'closed' | null;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-selected={selected || undefined}
      style={indent(depth)}
      className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors hover:bg-accent disabled:opacity-50 ${
        selected ? 'bg-accent text-foreground' : 'text-foreground/90'
      }`}
    >
      <span className="flex w-3 shrink-0 justify-center text-muted-foreground">
        {chevron === 'open' ? (
          <LuChevronDown aria-hidden className="h-3 w-3" />
        ) : chevron === 'closed' ? (
          <LuChevronRight aria-hidden className="h-3 w-3" />
        ) : null}
      </span>
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? <span className="shrink-0 text-[10px] text-muted-foreground">{meta}</span> : null}
    </button>
  );
}

function useExpanded(initial: string[] = []) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(initial));
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return { isOpen: (key: string) => open.has(key), toggle };
}

// --- Assets ------------------------------------------------------------------

function AssetNodes({
  nodes,
  depth,
  selection,
  onSelect,
  expanded,
}: {
  nodes: FileTreeNode[];
  depth: number;
  selection: VideoSelection | null;
  onSelect: (selection: VideoSelection) => void;
  expanded: ReturnType<typeof useExpanded>;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.isDir) {
          const open = expanded.isOpen(node.path);
          return (
            <div key={node.path}>
              <Row
                depth={depth}
                chevron={open ? 'open' : 'closed'}
                icon={<FolderIcon name={node.name} open={open} />}
                label={node.name}
                meta={node.children.length || undefined}
                onClick={() => expanded.toggle(node.path)}
              />
              {open ? (
                <AssetNodes
                  nodes={node.children}
                  depth={depth + 1}
                  selection={selection}
                  onSelect={onSelect}
                  expanded={expanded}
                />
              ) : null}
            </div>
          );
        }
        const item: VideoSelection = { kind: 'asset', path: node.path, size: node.size };
        return (
          <Row
            key={node.path}
            depth={depth}
            selected={sameSelection(selection, item)}
            icon={<FileIcon name={node.name} />}
            label={node.name}
            onClick={() => onSelect(item)}
          />
        );
      })}
    </>
  );
}

function AssetsTree({
  selection,
  onSelect,
}: {
  selection: VideoSelection | null;
  onSelect: (selection: VideoSelection) => void;
}) {
  const files = useVideoFiles(ASSETS_PROJECT, 'assets', { recursive: true });
  const expanded = useExpanded();
  const tree = buildFileTree(files.data);
  if (tree.length === 0) {
    return <p className="px-3 py-2 text-[11px] text-muted-foreground">No shared assets yet.</p>;
  }
  return <AssetNodes nodes={tree} depth={0} selection={selection} onSelect={onSelect} expanded={expanded} />;
}

// --- Projects ----------------------------------------------------------------

function ProjectContents({
  projectId,
  depth,
  selection,
  onSelect,
}: {
  projectId: string;
  depth: number;
  selection: VideoSelection | null;
  onSelect: (selection: VideoSelection) => void;
}) {
  const output = useVideoFiles(projectId, 'output');
  const input = useVideoFiles(projectId, 'input');
  const notes = useVideoFiles(projectId, 'notes');
  const iterations = parseIterations(output.data.filter((f) => !f.isDir).map((f) => f.name));

  return (
    <div role="group">
      {iterations.length === 0 ? (
        <p style={indent(depth + 1)} className="py-1 text-[11px] text-muted-foreground">
          No iterations yet.
        </p>
      ) : (
        iterations.map((it) => {
          const item: VideoSelection = { kind: 'iteration', projectId, filename: it.filename };
          return (
            <Row
              key={it.filename}
              depth={depth}
              selected={sameSelection(selection, item)}
              icon={<LuFilm aria-hidden className="h-3.5 w-3.5 text-primary" />}
              label={it.filename}
              meta={it.sharesVersion ? `v${it.version} variant` : undefined}
              onClick={() => onSelect(item)}
            />
          );
        })
      )}
      {(['input', 'notes'] as const).map((area) => {
        const entries = (area === 'input' ? input : notes).data.filter((f) => !f.isDir);
        if (entries.length === 0) return null;
        return entries.map((entry) => {
          const item: VideoSelection = { kind: 'file', projectId, area, name: entry.name, size: entry.size };
          return (
            <Row
              key={`${area}/${entry.name}`}
              depth={depth}
              selected={sameSelection(selection, item)}
              icon={
                area === 'input' ? (
                  <LuFolderInput aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <LuNotebookPen aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                )
              }
              label={`${area}/${entry.name}`}
              onClick={() => onSelect(item)}
            />
          );
        });
      })}
    </div>
  );
}

function ProjectNodes({
  nodes,
  depth,
  projects,
  selection,
  onSelect,
  onMenu,
  expanded,
}: {
  nodes: ProjectTreeNode[];
  depth: number;
  projects: Map<string, VideoProject>;
  selection: VideoSelection | null;
  onSelect: (selection: VideoSelection) => void;
  onMenu: (event: React.MouseEvent, id: string, title: string) => void;
  expanded: ReturnType<typeof useExpanded>;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === 'folder') {
          const open = !expanded.isOpen(`folder:${node.path}`); // folders start open
          return (
            <div key={node.path}>
              <Row
                depth={depth}
                chevron={open ? 'open' : 'closed'}
                icon={<FolderIcon name={node.name} open={open} />}
                label={node.name}
                onClick={() => expanded.toggle(`folder:${node.path}`)}
              />
              {open ? (
                <ProjectNodes
                  nodes={node.children}
                  depth={depth + 1}
                  projects={projects}
                  selection={selection}
                  onSelect={onSelect}
                  onMenu={onMenu}
                  expanded={expanded}
                />
              ) : null}
            </div>
          );
        }
        const project = projects.get(node.id);
        const valid = project?.valid ? project : null;
        const title = valid ? valid.title : node.name;
        const open = expanded.isOpen(node.id);
        const item: VideoSelection = { kind: 'project', projectId: node.id };
        return (
          <div key={node.id}>
            <Row
              depth={depth}
              chevron={valid ? (open ? 'open' : 'closed') : null}
              disabled={!valid}
              selected={sameSelection(selection, item)}
              title={project && !project.valid ? project.error : node.id}
              icon={<LuClapperboard aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />}
              label={title}
              meta={valid?.composition}
              onClick={() => {
                onSelect(item);
                if (!open) expanded.toggle(node.id);
              }}
              onContextMenu={(event) => {
                if (!valid) return;
                event.preventDefault();
                onMenu(event, node.id, title);
              }}
            />
            {valid && open ? (
              <ProjectContents projectId={node.id} depth={depth + 1} selection={selection} onSelect={onSelect} />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/**
 * The Video tab's explorer (Phase 99 Theme D): two accordions over the
 * resolved root — **Assets** (a tree of `assets/`, type icons) and
 * **Projects** (`<brand>/<category>/<NNN-name>`, each expanding to its
 * iterations newest first, then its `input/` and `notes/` files).
 *
 * Phase 44's error → skeleton → empty → content ladder is kept for the
 * project scan, which reads a directory that can vanish.
 */
export function VideoExplorer({
  selection,
  onSelect,
}: {
  selection: VideoSelection | null;
  onSelect: (selection: VideoSelection | null) => void;
}) {
  const projects = useVideoProjects();
  const create = useCreateVideoProject();
  const remove = useRemoveVideoProject();
  const dialogs = useDialogs();
  const expanded = useExpanded();
  const all = projects.data ?? [];
  const byId = new Map(all.map((project) => [project.id, project]));

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
          {
            onSuccess: (result) => {
              if (result.ok) onSelect({ kind: 'project', projectId: id });
            },
          },
        );
      },
    });
  };

  const menuFor = (id: string, title: string): MenuItem[] => [
    {
      label: 'Delete',
      icon: LuTrash2,
      danger: true,
      onSelect: () =>
        dialogs.confirm({
          title: `Delete "${title}"?`,
          body: 'This removes the project folder — its brief, script, inputs and every render. This cannot be undone.',
          confirmLabel: 'Delete',
          danger: true,
          blastRadius: null,
          onConfirm: () => {
            remove.mutate(id);
            if (selection && selection.kind !== 'asset' && selection.projectId === id) onSelect(null);
          },
        }),
    },
  ];

  const projectsBody = projects.isError ? (
    <EmptyState
      icon={LuClapperboard}
      title="Could not read the video root"
      body={projects.error instanceof Error ? projects.error.message : String(projects.error)}
    />
  ) : projects.isPending ? (
    <LoadingRegion label="Looking for video projects…" className="flex flex-col gap-2 p-2">
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-3" style={{ width: row % 2 === 0 ? '62%' : '48%' }} />
      ))}
    </LoadingRegion>
  ) : all.length === 0 ? (
    <EmptyState icon={LuClapperboard} title="No projects yet" body="Create one with the + above." />
  ) : (
    <ProjectNodes
      nodes={buildProjectTree(all.map((p) => p.id))}
      depth={0}
      projects={byId}
      selection={selection}
      onSelect={onSelect}
      onMenu={(event, id, title) => dialogs.openMenu(event, menuFor(id, title))}
      expanded={expanded}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Video</h2>
        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">{all.length}</span>
        <IconButton icon={LuPlus} label="New project" size="sm" className="ml-auto" onClick={createProject} />
      </div>
      <div className="hide-scrollbar min-h-0 flex-1 overflow-auto">
        <Accordion
          id="media-video"
          sections={[
            {
              id: 'assets',
              title: 'Assets',
              children: <AssetsTree selection={selection} onSelect={onSelect} />,
            },
            {
              id: 'projects',
              title: 'Projects',
              count: all.length,
              children: projectsBody,
            },
          ]}
        />
      </div>
    </div>
  );
}
