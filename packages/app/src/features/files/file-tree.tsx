import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LuChevronRight,
  LuCopy,
  LuEllipsisVertical,
  LuExternalLink,
  LuFilePlus,
  LuFolderPlus,
  LuPencil,
  LuTrash2,
} from 'react-icons/lu';

import type { FsEntry } from '@midnite/git-shared';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { bridge, hasBridge } from '../../services/bridge';
import { keys, type FsScopeInput } from '../../services/queries';
import { useRepoStatus } from '../../services/use-status';
import { StatusMark } from '../status/status-mark';
import { FileIcon, FolderIcon } from './file-icons';
import { resolveFileStatusIndex, type FileStatusIndex } from './file-status';
import { useFileActions, validateEntryName, type FileActions } from './use-file-actions';

/**
 * A listing request minus its relPath — the tree threads this through every
 * level. Two callers own it: the Files view (repo scope) and the Agent
 * settings page (claude-home scope), which is why expansion/selection arrive
 * as props rather than being read from the files store here. Re-exported
 * from `services/queries.ts`, which also holds `keys.fs` — the scope shape
 * lives there so every fs query key stays beside `keys.status`/`keys.refs`.
 */
export type { FsScopeInput };

export type FileTreeProps = {
  scope: FsScopeInput;
  expanded: Record<string, true>;
  selectedPath: string | null;
  onToggleDir: (relPath: string) => void;
  onSelectFile: (relPath: string) => void;
  /**
   * Enables the context menu, inline create/rename and delete. Defaults
   * false, so `agent-page.tsx`'s `claude-home` tree keeps exactly the
   * affordances it has today without knowing write channels now exist at
   * all — `useFileActions` still runs underneath it, but nothing ever calls
   * into it.
   */
  writable?: boolean;
};

/**
 * The lazy tree: each directory queries its own listing on first expand and
 * never before, so `node_modules` costs nothing until opened on purpose.
 * Read-only unless `writable`: New File/Folder, inline rename, delete (with a
 * blast-radius confirm) and the two free entries — Reveal in Finder, Copy
 * Relative Path — all live behind that one prop (Phase 24 Theme C).
 */
export function FileTree(props: FileTreeProps) {
  const statusIndex = useFileStatusIndex(props.scope);
  const actions = useFileActions(props.scope, statusIndex);
  const writable = props.writable ?? false;
  const dialogs = useDialogs();

  return (
    <div
      role="tree"
      aria-label="Files"
      className="h-full py-1 text-xs"
      onContextMenu={
        writable
          ? (event) => {
              event.preventDefault();
              dialogs.openMenu(event, rootMenuItems(actions));
            }
          : undefined
      }
    >
      <DirectoryChildren
        {...props}
        writable={writable}
        actions={writable ? actions : undefined}
        statusIndex={statusIndex}
        relPath=""
        depth={0}
      />
    </div>
  );
}

/**
 * Repo scope only — `claude-home` has no `repoId`, so `useRepoStatus` stays
 * permanently disabled for it and `isPlaceholderData` never clears, which is
 * exactly the "no index" result `agent-page.tsx`'s tree needs without either
 * side having to know the other exists.
 */
function useFileStatusIndex(scope: FsScopeInput): FileStatusIndex | undefined {
  const target = scope.scope === 'repo' ? { repoId: scope.repoId, worktreePath: scope.worktreePath } : { repoId: null };
  const { data, isPlaceholderData } = useRepoStatus(target);
  return useMemo(() => resolveFileStatusIndex(data, isPlaceholderData), [data, isPlaceholderData]);
}

const rootMenuItems = (actions: FileActions): MenuItem[] => [
  { label: 'New File', icon: LuFilePlus, onSelect: () => actions.startCreate('', 'file') },
  { label: 'New Folder', icon: LuFolderPlus, onSelect: () => actions.startCreate('', 'directory') },
];

const freeMenuItems = (relPath: string, actions: FileActions): MenuItem[] => [
  { type: 'separator' },
  { label: 'Reveal in Finder', icon: LuExternalLink, onSelect: () => actions.reveal(relPath) },
  { label: 'Copy Relative Path', icon: LuCopy, onSelect: () => actions.copyRelativePath(relPath) },
];

const dirMenuItems = (entry: FsEntry, relPath: string, actions: FileActions): MenuItem[] => [
  { label: 'New File', icon: LuFilePlus, onSelect: () => actions.startCreate(relPath, 'file') },
  { label: 'New Folder', icon: LuFolderPlus, onSelect: () => actions.startCreate(relPath, 'directory') },
  { type: 'separator' },
  { label: 'Rename', icon: LuPencil, onSelect: () => actions.startRename(entry, relPath) },
  { label: 'Delete', icon: LuTrash2, danger: true, onSelect: () => actions.requestDelete(entry, relPath) },
  ...freeMenuItems(relPath, actions),
];

const fileMenuItems = (entry: FsEntry, relPath: string, actions: FileActions): MenuItem[] => [
  { label: 'Rename', icon: LuPencil, onSelect: () => actions.startRename(entry, relPath) },
  { label: 'Delete', icon: LuTrash2, danger: true, onSelect: () => actions.requestDelete(entry, relPath) },
  ...freeMenuItems(relPath, actions),
];

function DirectoryChildren({
  scope,
  relPath,
  depth,
  expanded,
  selectedPath,
  onToggleDir,
  onSelectFile,
  statusIndex,
  writable,
  actions,
}: FileTreeProps & {
  relPath: string;
  depth: number;
  statusIndex: FileStatusIndex | undefined;
  actions: FileActions | undefined;
}) {
  const { data } = useQuery({
    queryKey: [...keys.fs(scope), 'dir', relPath],
    queryFn: async () => bridge()!.fs.listDir({ ...scope, relPath }),
    enabled: hasBridge(),
  });

  const creatingHere = actions?.editing?.kind === 'create' && actions.editing.parentPath === relPath;

  if (!data) {
    return (
      <p className="px-3 py-1 text-muted-foreground" style={indent(depth)}>
        Loading…
      </p>
    );
  }
  if (!data.ok) {
    return (
      <p className="px-3 py-1 text-muted-foreground" style={indent(depth)}>
        {data.message}
      </p>
    );
  }
  if (data.entries.length === 0 && !creatingHere) {
    return (
      <p className="px-3 py-1 italic text-muted-foreground" style={indent(depth)}>
        empty
      </p>
    );
  }

  const siblingNames = data.entries.map((entry) => entry.name);

  return (
    <>
      {data.entries.map((entry) => (
        <TreeRow
          key={entry.name}
          entry={entry}
          relPath={relPath.length > 0 ? `${relPath}/${entry.name}` : entry.name}
          depth={depth}
          scope={scope}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
          statusIndex={statusIndex}
          writable={writable}
          actions={actions}
          siblingNames={siblingNames}
        />
      ))}
      {creatingHere && actions?.editing?.kind === 'create' ? (
        <CreateRow
          depth={depth + 1}
          entryKind={actions.editing.entryKind}
          initialName={actions.editing.initialName}
          siblingNames={siblingNames}
          onCommit={(name) => actions.commitEdit(name)}
          onCancel={() => actions.cancelEdit()}
        />
      ) : null}
    </>
  );
}

function TreeRow({
  entry,
  relPath,
  depth,
  statusIndex,
  writable,
  actions,
  siblingNames,
  ...tree
}: FileTreeProps & {
  entry: FsEntry;
  relPath: string;
  depth: number;
  statusIndex: FileStatusIndex | undefined;
  actions: FileActions | undefined;
  siblingNames: readonly string[];
}) {
  const dialogs = useDialogs();
  const isDir = entry.kind === 'dir';
  const isOpen = isDir && tree.expanded[relPath] === true;
  const isSelected = tree.selectedPath === relPath;
  const renaming = actions?.editing?.kind === 'rename' && actions.editing.relPath === relPath;
  // A dimmed, gitignored row already says "not part of the repo" — a status
  // badge on top would double-signal the same fact, and in practice never
  // fires anyway: an ignored path has no `StatusEntry` to match.
  const badge = entry.isIgnored
    ? undefined
    : isDir
      ? statusIndex?.dirRollup.get(relPath)
      : statusIndex?.byPath.get(relPath);

  const activate = () => (isDir ? tree.onToggleDir(relPath) : tree.onSelectFile(relPath));

  const openMenu = (at: { clientX: number; clientY: number }) => {
    if (!actions) return;
    dialogs.openMenu(at, isDir ? dirMenuItems(entry, relPath, actions) : fileMenuItems(entry, relPath, actions));
  };

  return (
    <>
      <div
        role="treeitem"
        tabIndex={renaming ? -1 : 0}
        aria-expanded={isDir ? isOpen : undefined}
        aria-selected={isSelected}
        // Pinned rather than left to content: the writable row's hover
        // ellipsis is a real (not aria-hidden) descendant button whose own
        // "Actions for X" label would otherwise fold into this row's
        // accessible name too, and every existing query for this tree
        // matches on the bare entry name.
        aria-label={renaming ? undefined : entry.name}
        onClick={renaming ? undefined : activate}
        onKeyDown={
          renaming
            ? undefined
            : (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  activate();
                }
              }
        }
        onContextMenu={
          writable
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                openMenu(event);
              }
            : undefined
        }
        className={`group flex w-full items-center gap-1.5 px-3 py-[3px] text-left transition-colors hover:bg-accent ${
          renaming ? 'cursor-default' : 'cursor-pointer'
        } ${isSelected ? 'bg-primary/10 text-foreground' : ''} ${entry.isIgnored ? 'opacity-45' : ''}`}
        style={indent(depth)}
        title={renaming ? undefined : entry.isIgnored ? `${entry.name} — gitignored` : entry.name}
      >
        {isDir ? (
          <LuChevronRight
            aria-hidden
            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isDir ? <FolderIcon open={isOpen} /> : <FileIcon name={entry.name} />}
        {badge ? <StatusMark code={badge.code} conflicted={badge.conflicted} /> : null}
        {renaming ? (
          <InlineNameInput
            initialName={entry.name}
            siblingNames={siblingNames.filter((name) => name !== entry.name)}
            onCommit={(name) => actions?.commitEdit(name)}
            onCancel={() => actions?.cancelEdit()}
          />
        ) : (
          <span className="truncate">{entry.name}</span>
        )}
        {!renaming && entry.kind === 'symlink' ? (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">link</span>
        ) : null}
        {!renaming && writable ? (
          <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <IconButton
              icon={LuEllipsisVertical}
              label={`Actions for ${entry.name}`}
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                openMenu({ clientX: event.clientX || rect.left, clientY: event.clientY || rect.bottom });
              }}
            />
          </span>
        ) : null}
      </div>
      {isOpen ? (
        <DirectoryChildren
          {...tree}
          statusIndex={statusIndex}
          writable={writable}
          actions={actions}
          relPath={relPath}
          depth={depth + 1}
        />
      ) : null}
    </>
  );
}

/** The virtual row a New File/New Folder starts as — same indent and icon slot as a real row, an input where the name goes. */
function CreateRow({
  depth,
  entryKind,
  initialName,
  siblingNames,
  onCommit,
  onCancel,
}: {
  depth: number;
  entryKind: 'file' | 'directory';
  initialName: string;
  siblingNames: readonly string[];
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex w-full items-center gap-1.5 px-3 py-[3px]" style={indent(depth)}>
      <span className="w-3 shrink-0" />
      {entryKind === 'directory' ? <FolderIcon open={false} /> : <FileIcon name={initialName} />}
      <InlineNameInput
        initialName={initialName}
        siblingNames={siblingNames}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
  );
}

/** Shared by rename and create — an autofocused, pre-selected `<input>` validated against `validateEntryName` before Enter or blur is allowed to commit. */
function InlineNameInput({
  initialName,
  siblingNames,
  onCommit,
  onCancel,
}: {
  initialName: string;
  siblingNames: readonly string[];
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against a duplicate commit/cancel firing again on the blur that
  // follows Enter/Escape unmounting this input.
  const settledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const error = validateEntryName(value, siblingNames);

  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (error) onCancel();
    else onCommit(value);
  };
  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
        aria-invalid={error !== null}
        data-testid="inline-name-input"
        className="min-w-0 flex-1 rounded border border-primary/60 bg-background px-1 py-0 text-xs text-foreground outline-none"
      />
      {error ? <span className="shrink-0 text-[10px] text-destructive">{error}</span> : null}
    </span>
  );
}

const indent = (depth: number) => ({ paddingLeft: `${12 + depth * 14}px` });
