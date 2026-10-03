import { libraryParent, type ModelLibraryGroup, type ModelLibraryModel, type ModelLibraryNode } from '@midnite/studio-shared';
import { useRef, useState, type DragEvent, type MouseEvent } from 'react';
import {
  LuBox,
  LuChevronRight,
  LuClipboardCopy,
  LuCopy,
  LuFileJson,
  LuFileQuestion,
  LuFolderInput,
  LuFolderOpen,
  LuFolderPlus,
  LuImage,
  LuPencil,
  LuPlug,
  LuTrash2,
} from 'react-icons/lu';
import { SiGooglegemini, SiOllama } from 'react-icons/si';

import { accordionKey } from '../../../components/accordion/accordion';
import { useDialogs } from '../../../components/dialog-host';
import { EmptyState } from '../../../components/empty-state';
import { IconButton, type IconComponent } from '../../../components/icon-button';
import { resolveAgentIcon } from '../../../components/icons';
import type { MenuItem } from '../../../components/context-menu';
import { Tooltip } from '../../../components/tooltip';
import { TreeSection } from '../../../components/tree-section';
import { useUiStore } from '../../../store/ui-store';
import { revealMedia, useMediaMutations } from '../use-media';
import {
  agentTooltip,
  canDrop,
  collectGroups,
  countFiles,
  countModels,
  fileExt,
  is3dFile,
  isImageFile,
  joinLibraryPath,
  modelFilePath,
  splitProjectPath,
  visibleFiles,
  type ModelSelection,
} from './library-tree';
import { useModelLibrary, useModelLibraryActions } from './use-model-library';

export const MODEL_TREE_ID = 'media-model-tree';

/** The provider mark for a folder, from `model.json`'s agent — the same marks the agent roster wears. */
export function providerIcon(provider: string | undefined): IconComponent {
  if (!provider) return LuBox;
  if (provider === 'ollama') return SiOllama;
  if (provider === 'gemini') return SiGooglegemini;
  if (provider === 'mcp') return LuPlug;
  return resolveAgentIcon({ id: provider });
}

const fileIcon = (name: string): IconComponent =>
  fileExt(name) === 'json' ? LuFileJson : is3dFile(name) ? LuBox : isImageFile(name) ? LuImage : LuFileQuestion;

const INDENT_PX = 12;

type Drag = { path: string; kind: 'model' | 'group' };

/**
 * The Models explorer: **groups** (folders of folders, drawn as accordion sections with a translucent
 * primary-colour header), each holding **model folders** — one per generation — which expand to their
 * `.obj`/`.fbx`/`.glb` and `model.json`. A model row wears its provider's mark, taken from `model.json`,
 * and its tooltip names the specific model.
 *
 * Models and groups drag onto a group (or the empty area, for groups) to move; every row, header and
 * the empty area has a context menu. All of it is a request to main — this component never touches files.
 */
export function ModelExplorer({
  repoId,
  selection,
  onSelect,
}: {
  repoId: string;
  selection: ModelSelection | null;
  onSelect: (selection: ModelSelection) => void;
}) {
  const library = useModelLibrary(repoId);
  const actions = useModelLibraryActions(repoId);
  const mediaMutations = useMediaMutations(repoId, 'model');
  const dialogs = useDialogs();
  const collapsed = useUiStore((s) => s.collapsedAccordionSections);
  const toggleSection = useUiStore((s) => s.toggleAccordionSection);

  const tree = library.data ?? [];
  const groups = collectGroups(tree);
  const [expandedModels, setExpandedModels] = useState<ReadonlySet<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);

  const toggleModel = (path: string) =>
    setExpandedModels((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  /** A selection that pointed inside `from` follows it to `to`. */
  const follow = (from: string, to: string) => {
    if (selection && (selection.path === from || selection.path.startsWith(`${from}/`))) {
      onSelect({ ...selection, path: to + selection.path.slice(from.length) });
    }
  };

  // --- operations ----------------------------------------------------------------------------

  const validateName = (value: string): string | null =>
    /[/\\]/.test(value) ? 'Use a single folder name.' : value.trim().startsWith('.') ? 'A name cannot start with a dot.' : null;

  const newGroup = (parent: string) =>
    dialogs.prompt({
      title: parent ? `New group in "${parent.split('/').pop()}"` : 'New group',
      label: 'Name',
      confirmLabel: 'Create',
      placeholder: 'robots',
      validate: validateName,
      onConfirm: (name) =>
        actions.newGroup.mutate({ parent, name }, { onSuccess: (result) => result.ok && onSelect({ kind: 'group', path: result.value.path }) }),
    });

  const rename = (node: ModelLibraryNode) =>
    dialogs.prompt({
      title: `Rename ${node.kind === 'group' ? 'group' : 'model'}`,
      label: 'Name',
      initialValue: node.name,
      confirmLabel: 'Rename',
      validate: validateName,
      onConfirm: (to) =>
        actions.rename.mutate({ path: node.path, to }, { onSuccess: (result) => result.ok && follow(node.path, result.value.path) }),
    });

  const duplicate = (node: ModelLibraryNode) => actions.duplicate.mutate({ path: node.path });

  const move = (path: string, toGroup: string) =>
    actions.move.mutate({ path, toGroup }, { onSuccess: (result) => result.ok && follow(path, result.value.path) });

  const confirmDelete = (node: ModelLibraryNode) => {
    const models = node.kind === 'group' ? countModels([node]) : 1;
    const files = countFiles(node);
    const names = node.kind === 'group' ? collectModelNames(node) : [node.name];
    dialogs.confirm({
      title: `Delete ${node.kind === 'group' ? `group "${node.name}"` : `"${node.name}"`}?`,
      body:
        node.kind === 'group'
          ? `Moves the group and everything in it to the Trash: ${plural(models, 'model')} and ${plural(files, 'file')}.`
          : `Moves the model folder and its ${plural(files, 'file')} (exports, design and model.json) to the Trash.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: files, sample: [] },
      blastRadiusKind: 'files',
      warnings: [`${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''} will be removed.`],
      onConfirm: () =>
        actions.remove.mutate(
          { path: node.path },
          { onSuccess: (result) => result.ok && selection && (selection.path === node.path || selection.path.startsWith(`${node.path}/`)) && onSelect({ kind: 'group', path: libraryParent(node.path) }) },
        ),
    });
  };

  const confirmDeleteFile = (model: ModelLibraryModel, fileName: string) => {
    const { project, rest } = splitProjectPath(joinLibraryPath(model.path, fileName));
    dialogs.confirm({
      title: `Delete "${fileName}"?`,
      body: `Moves ${fileName} from "${model.name}" to the Trash.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: 1, sample: [] },
      blastRadiusKind: 'files',
      onConfirm: () => mediaMutations.removeFile.mutate({ project, path: rest }),
    });
  };

  const renameFile = (model: ModelLibraryModel, fileName: string) => {
    const { project, rest } = splitProjectPath(joinLibraryPath(model.path, fileName));
    dialogs.prompt({
      title: 'Rename file',
      label: 'Name',
      initialValue: fileName,
      confirmLabel: 'Rename',
      validate: validateName,
      onConfirm: (to) => mediaMutations.renameFile.mutate({ project, path: rest, to: joinLibraryPath(libraryParent(rest), to) }),
    });
  };

  const reveal = (path: string) => {
    const { project, rest } = splitProjectPath(path);
    revealMedia(repoId, 'model', project, rest || undefined);
  };

  const copyPath = (path: string) => {
    void navigator.clipboard?.writeText(`.midnite/media/model/${path}`).catch(() => undefined);
  };

  // --- menus ---------------------------------------------------------------------------------

  const moveTargets = (node: ModelLibraryNode): MenuItem[] =>
    groups
      .filter((g) => canDrop({ path: node.path, kind: node.kind === 'group' ? 'group' : 'model' }, { path: g.path, kind: 'group' }).ok)
      .map((g) => ({ label: g.path.split('/').join(' / '), icon: LuFolderInput, onSelect: () => move(node.path, g.path) }));

  const moveItem = (node: ModelLibraryNode): MenuItem => {
    const targets = moveTargets(node);
    const rootOk = node.kind === 'group' && canDrop({ path: node.path, kind: 'group' }, { path: '', kind: 'root' }).ok;
    const submenu: MenuItem[] = [...(rootOk ? [{ label: 'Top level', icon: LuFolderInput, onSelect: () => move(node.path, '') } as MenuItem] : []), ...targets];
    return submenu.length > 0
      ? { label: 'Move to', icon: LuFolderInput, submenu }
      : { label: 'Move to', icon: LuFolderInput, disabled: true, disabledReason: 'There is no other group to move it to.', onSelect: () => undefined };
  };

  const openMenu = (event: MouseEvent, items: MenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    dialogs.openMenu(event, items);
  };

  const groupMenu = (group: ModelLibraryGroup): MenuItem[] => [
    { label: 'New group inside', icon: LuFolderPlus, onSelect: () => newGroup(group.path) },
    { type: 'separator' },
    { label: 'Rename…', icon: LuPencil, onSelect: () => rename(group) },
    { label: 'Duplicate', icon: LuCopy, onSelect: () => duplicate(group) },
    moveItem(group),
    { label: 'Reveal in Finder', icon: LuFolderOpen, onSelect: () => reveal(group.path) },
    { label: 'Copy path', icon: LuClipboardCopy, onSelect: () => copyPath(group.path) },
    { type: 'separator' },
    { label: 'Delete…', icon: LuTrash2, danger: true, onSelect: () => confirmDelete(group) },
  ];

  const modelMenu = (model: ModelLibraryModel): MenuItem[] => {
    const file = modelFilePath(model);
    return [
      { label: 'Open', icon: LuBox, onSelect: () => onSelect({ kind: 'model', path: model.path }) },
      { type: 'separator' },
      { label: 'Rename…', icon: LuPencil, onSelect: () => rename(model) },
      { label: 'Duplicate', icon: LuCopy, onSelect: () => duplicate(model) },
      moveItem(model),
      { label: 'Reveal in Finder', icon: LuFolderOpen, onSelect: () => reveal(model.legacy && file ? joinLibraryPath(file.project, file.path) : model.path) },
      { label: 'Copy path', icon: LuClipboardCopy, onSelect: () => copyPath(model.path) },
      { type: 'separator' },
      { label: 'Delete…', icon: LuTrash2, danger: true, onSelect: () => confirmDelete(model) },
    ];
  };

  const fileMenu = (model: ModelLibraryModel, fileName: string): MenuItem[] => [
    { label: 'Open', icon: fileIcon(fileName), onSelect: () => onSelect({ kind: 'file', path: joinLibraryPath(model.legacy ? libraryParent(model.path) : model.path, fileName) }) },
    { type: 'separator' },
    { label: 'Rename…', icon: LuPencil, onSelect: () => renameFile(model, fileName) },
    { label: 'Reveal in Finder', icon: LuFolderOpen, onSelect: () => reveal(joinLibraryPath(model.legacy ? libraryParent(model.path) : model.path, fileName)) },
    { label: 'Copy path', icon: LuClipboardCopy, onSelect: () => copyPath(joinLibraryPath(model.legacy ? libraryParent(model.path) : model.path, fileName)) },
    { type: 'separator' },
    { label: 'Delete…', icon: LuTrash2, danger: true, onSelect: () => confirmDeleteFile(model, fileName) },
  ];

  const rootMenu = (): MenuItem[] => [{ label: 'New group', icon: LuFolderPlus, onSelect: () => newGroup('') }];

  // --- drag and drop -------------------------------------------------------------------------

  const startDrag = (event: DragEvent, dragged: Drag) => {
    event.stopPropagation();
    drag.current = dragged;
    event.dataTransfer?.setData('text/plain', dragged.path);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  };
  const endDrag = () => {
    drag.current = null;
    setDropTarget(null);
  };
  const overTarget = (event: DragEvent, targetPath: string, kind: 'group' | 'root') => {
    const dragged = drag.current;
    if (!dragged || !canDrop(dragged, { path: targetPath, kind }).ok) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setDropTarget(targetPath);
  };
  const dropOn = (event: DragEvent, targetPath: string, kind: 'group' | 'root') => {
    const dragged = drag.current;
    endDrag();
    if (!dragged || !canDrop(dragged, { path: targetPath, kind }).ok) return;
    event.preventDefault();
    event.stopPropagation();
    move(dragged.path, targetPath);
  };

  // --- rendering -----------------------------------------------------------------------------

  const renderModel = (model: ModelLibraryModel, depth: number) => {
    const Mark = providerIcon(model.manifest?.agent.provider);
    const files = visibleFiles(model);
    const selected = selection?.kind === 'model' && selection.path === model.path;
    const inside = selection?.path.startsWith(`${model.path}/`) === true;
    const open = expandedModels.has(model.path) || inside;
    const filePrefix = model.legacy ? libraryParent(model.path) : model.path;
    return (
      <li key={model.path} role="none">
        <div
          role="treeitem"
          aria-selected={selected}
          aria-expanded={open}
          data-testid="model-row"
          data-path={model.path}
          draggable
          onDragStart={(event) => startDrag(event, { path: model.path, kind: 'model' })}
          onDragEnd={endDrag}
          onContextMenu={(event) => openMenu(event, modelMenu(model))}
          style={{ paddingLeft: depth * INDENT_PX + 4 }}
          className={`group/row flex items-center gap-1 pr-2 text-xs ${selected ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground'}`}
        >
          <button
            type="button"
            aria-label={`${open ? 'Collapse' : 'Expand'} ${model.name}`}
            onClick={() => toggleModel(model.path)}
            className="flex h-6 w-4 shrink-0 items-center justify-center"
          >
            <LuChevronRight aria-hidden className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
          <Tooltip label={agentTooltip(model)} side="right">
            <button
              type="button"
              onClick={() => {
                setExpandedModels((current) => new Set(current).add(model.path));
                onSelect({ kind: 'model', path: model.path });
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
            >
              <span className="inline-flex shrink-0" data-testid="provider-icon" data-provider={model.manifest?.agent.provider ?? 'unknown'}>
                <Mark aria-hidden className="h-3.5 w-3.5" />
              </span>
              <span className="truncate">{model.name}</span>
            </button>
          </Tooltip>
        </div>
        {open ? (
          <ul role="group" className="pb-0.5">
            {files.map((file) => {
              const path = joinLibraryPath(filePrefix, file.name);
              const active = selection?.kind === 'file' && selection.path === path;
              const Icon = fileIcon(file.name);
              return (
                <li key={file.name} role="none">
                  <button
                    type="button"
                    role="treeitem"
                    aria-selected={active}
                    data-testid="model-file-row"
                    onClick={() => onSelect({ kind: 'file', path })}
                    onContextMenu={(event) => openMenu(event, fileMenu(model, file.name))}
                    style={{ paddingLeft: (depth + 1) * INDENT_PX + 20 }}
                    className={`flex w-full items-center gap-1.5 truncate py-0.5 pr-2 text-left text-[11px] ${active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground'}`}
                  >
                    <Icon aria-hidden className="h-3 w-3 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </li>
    );
  };

  const renderGroup = (group: ModelLibraryGroup, depth: number) => {
    const key = accordionKey(MODEL_TREE_ID, group.path);
    const selected = selection?.kind === 'group' && selection.path === group.path;
    const targeted = dropTarget === group.path;
    return (
      <div
        key={group.path}
        data-testid="model-group"
        data-path={group.path}
        draggable
        onDragStart={(event) => startDrag(event, { path: group.path, kind: 'group' })}
        onDragEnd={endDrag}
        onDragOver={(event) => overTarget(event, group.path, 'group')}
        onDrop={(event) => dropOn(event, group.path, 'group')}
        onContextMenu={(event) => openMenu(event, groupMenu(group))}
        className={`${targeted ? 'ring-1 ring-inset ring-primary' : ''} ${selected ? 'bg-accent/30' : ''}`}
      >
        <TreeSection
          title={group.name}
          count={countModels([group])}
          collapsible
          open={!collapsed.includes(key)}
          onToggle={() => {
            toggleSection(key);
            onSelect({ kind: 'group', path: group.path });
          }}
          hideWhenEmpty={false}
          depth={Math.min(depth, 3) as 0 | 1 | 2 | 3}
          tone="primary"
          tinted
        >
          {group.children.length === 0 ? (
            <p className="py-1 text-[11px] text-muted-foreground" style={{ paddingLeft: (depth + 1) * INDENT_PX + 16 }}>
              Empty
            </p>
          ) : (
            <ul role="tree" aria-label={group.name} className="pb-1">
              {group.children.map((child) =>
                child.kind === 'group' ? (
                  <li key={child.path} role="none">
                    {renderGroup(child, depth + 1)}
                  </li>
                ) : (
                  renderModel(child, depth + 1)
                ),
              )}
            </ul>
          )}
        </TreeSection>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="model-explorer">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2" onContextMenu={(event) => openMenu(event, rootMenu())}>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Models</h2>
        <span className="tabular-nums text-[11px] text-muted-foreground/70">{countModels(tree)}</span>
        <IconButton icon={LuFolderPlus} label="New group" size="sm" className="ml-auto" onClick={() => newGroup('')} />
      </div>
      <div
        className={`hide-scrollbar min-h-0 flex-1 overflow-auto ${dropTarget === '' ? 'ring-1 ring-inset ring-primary' : ''}`}
        onContextMenu={(event) => openMenu(event, rootMenu())}
        onDragOver={(event) => overTarget(event, '', 'root')}
        onDrop={(event) => dropOn(event, '', 'root')}
      >
        {library.isError ? (
          <EmptyState title="Could not read the models folder" body={String(library.error)} />
        ) : tree.length === 0 && !library.isPending ? (
          <EmptyState icon={LuBox} title="No groups yet" body="Models live in .midnite/media/model/ — one folder per generation, tracked by git. Generate one, or create a group first." />
        ) : (
          tree.map((node) => (node.kind === 'group' ? renderGroup(node, 0) : null))
        )}
      </div>
    </div>
  );
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

function collectModelNames(node: ModelLibraryNode): string[] {
  return node.kind === 'model' ? [node.name] : node.children.flatMap(collectModelNames);
}
