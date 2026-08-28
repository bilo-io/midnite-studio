import { useQueryClient } from '@tanstack/react-query';

import type { FsEntry, GitOpResult } from '@midnite/git-shared';

import { useDialogs } from '../../components/dialog-host';
import { bridge } from '../../services/bridge';
import { copyText } from '../../services/queries';
import { formatBytes } from '../monitor/format-bytes';
import { fsScopeKey, type FsScopeInput } from './fs-scope-key';
import { type FileStatusIndex } from './file-status';
import { useFilesStore, type EditingEntry } from './files-store';

/** Repo-scope base a write/reveal request extends with its own `relPath`. */
type RepoBase = { scope: 'repo'; repoId: string; worktreePath?: string };

const repoBaseOf = (scope: FsScopeInput): RepoBase | null =>
  scope.scope === 'repo'
    ? { scope: 'repo', repoId: scope.repoId, ...(scope.worktreePath ? { worktreePath: scope.worktreePath } : {}) }
    : null;

export const joinRelPath = (parent: string, name: string): string =>
  parent.length > 0 ? `${parent}/${name}` : name;

export const parentOf = (relPath: string): string => {
  const index = relPath.lastIndexOf('/');
  return index === -1 ? '' : relPath.slice(0, index);
};

const RESERVED_NAMES = new Set(['.', '..', '.git']);

/**
 * `GitOpResult`'s failure arm covers a git conflict too, which carries no
 * `message` — real for a merge/rebase op, unreachable for an fs write (every
 * `fs-write-handlers.ts` failure is `failure(...)`, `kind: 'error'`), but the
 * type is shared, so the notify dialogs read through this rather than
 * assuming `.message` exists.
 */
function describeOpFailure(result: Extract<GitOpResult, { ok: false }>): string | undefined {
  return result.kind === 'error' ? result.message : undefined;
}

/**
 * The same rules `fs-scope-write.ts` enforces server-side, checked here first
 * so a bad name never round-trips: empty, a path separator, a reserved
 * segment, or a collision with a sibling already in the directory the tree
 * has loaded. A server-side race (another process creates the same name a
 * moment later) still surfaces through the write's own failure message.
 */
export function validateEntryName(name: string, siblingNames: readonly string[]): string | null {
  if (name.length === 0) return 'Name cannot be empty';
  if (name.includes('/')) return 'Name cannot contain "/"';
  if (RESERVED_NAMES.has(name)) return `"${name}" is a reserved name`;
  if (siblingNames.includes(name)) return 'Already exists here';
  return null;
}

/**
 * Every mutation a writable `FileTree` offers: create, rename, delete, plus
 * the two free (non-write) entries, Reveal in Finder and Copy Relative Path.
 * Takes the same `statusIndex` `file-tree.tsx` already builds for badges —
 * the delete confirm's "N with unsaved changes" line is a filter over the
 * same map, not a second status fetch.
 */
export function useFileActions(scope: FsScopeInput, statusIndex: FileStatusIndex | undefined) {
  const queryClient = useQueryClient();
  const dialogs = useDialogs();
  const editing = useFilesStore((s) => s.editing);
  const selectedPath = useFilesStore((s) => s.selectedPath);
  const startRenameInStore = useFilesStore((s) => s.startRename);
  const startCreateInStore = useFilesStore((s) => s.startCreate);
  const cancelEdit = useFilesStore((s) => s.cancelEdit);
  const selectFile = useFilesStore((s) => s.selectFile);

  const repoBase = repoBaseOf(scope);

  const invalidateDir = (parentPath: string) =>
    queryClient.invalidateQueries({ queryKey: [...fsScopeKey(scope), 'dir', parentPath] });

  const startRename = (entry: FsEntry, relPath: string) => startRenameInStore(relPath, entry.name);
  const startCreate = (parentPath: string, entryKind: 'file' | 'directory') =>
    startCreateInStore(parentPath, entryKind, entryKind === 'file' ? 'Untitled' : 'New Folder');

  async function commitCreate(edit: Extract<EditingEntry, { kind: 'create' }>, name: string) {
    if (!repoBase) return;
    const relPath = joinRelPath(edit.parentPath, name);
    const res = await bridge()!.fs.create({ ...repoBase, relPath, kind: edit.entryKind });
    cancelEdit();
    if (!res.ok) {
      dialogs.notify({ title: `Could not create "${name}"`, body: describeOpFailure(res) });
      return;
    }
    await invalidateDir(edit.parentPath);
    if (edit.entryKind === 'file') selectFile(relPath);
  }

  async function commitRename(edit: Extract<EditingEntry, { kind: 'rename' }>, name: string) {
    if (!repoBase) return;
    const parent = parentOf(edit.relPath);
    const toRelPath = joinRelPath(parent, name);
    cancelEdit();
    if (toRelPath === edit.relPath) return;
    const res = await bridge()!.fs.rename({ ...repoBase, fromRelPath: edit.relPath, toRelPath });
    if (!res.ok) {
      dialogs.notify({ title: `Could not rename to "${name}"`, body: describeOpFailure(res) });
      return;
    }
    await invalidateDir(parent);
    if (selectedPath === edit.relPath) selectFile(toRelPath);
  }

  /** Dispatches on the current `editing` kind — the row calls this from one Enter handler. */
  function commitEdit(name: string) {
    if (!editing) return;
    if (editing.kind === 'create') void commitCreate(editing, name);
    else void commitRename(editing, name);
  }

  function reveal(relPath: string) {
    if (!repoBase) return;
    void bridge()!.shell.showItemInFolder({ ...repoBase, relPath });
  }

  function copyRelativePath(relPath: string) {
    void copyText(relPath);
  }

  function requestDelete(entry: FsEntry, relPath: string) {
    if (!repoBase) return;
    const parent = parentOf(relPath);
    const isDir = entry.kind === 'dir';
    const underPath = (path: string) => path === relPath || path.startsWith(`${relPath}/`);
    const uncommittedCount = statusIndex
      ? [...statusIndex.byPath.keys()].filter(isDir ? underPath : (p) => p === relPath).length
      : 0;

    const runDelete = async () => {
      const res = await bridge()!.fs.delete({ ...repoBase, relPath });
      if (!res.ok) {
        dialogs.notify({ title: `Could not delete "${entry.name}"`, body: describeOpFailure(res) });
        return;
      }
      await invalidateDir(parent);
      if (selectedPath !== null && (selectedPath === relPath || (isDir && underPath(selectedPath)))) {
        selectFile(null);
      }
    };

    const openConfirm = (warnings: string[]) =>
      dialogs.confirm({
        title: `Delete "${entry.name}"?`,
        confirmLabel: 'Delete',
        danger: true,
        warnings,
        // Explicitly null, not absent: `undefined` reads to ConfirmDialog as
        // "still being counted" and renders "Checking what this affects…"
        // forever, since nothing here ever calls `setBlastRadius` — this
        // confirm's blast radius is the `warnings` line, not the commit-shaped
        // `blastRadius` field.
        blastRadius: null,
        onConfirm: () => void runDelete(),
      });

    if (!isDir) {
      openConfirm(uncommittedCount > 0 ? ['This file has unsaved changes to Git.'] : []);
      return;
    }

    void (async () => {
      const stats = await bridge()!.fs.dirStats({ ...repoBase, relPath });
      const warnings: string[] = [];
      if (stats.ok) {
        const count = stats.truncated ? `${stats.fileCount}+` : String(stats.fileCount);
        warnings.push(
          `${count} file${stats.fileCount === 1 ? '' : 's'}, ${formatBytes(stats.totalBytes)}`,
        );
      } else {
        warnings.push('Could not count the folder’s contents.');
      }
      if (uncommittedCount > 0) {
        warnings.push(`${uncommittedCount} with unsaved changes to Git`);
      }
      openConfirm(warnings);
    })();
  }

  return {
    editing,
    startRename,
    startCreate,
    cancelEdit,
    commitEdit,
    requestDelete,
    reveal,
    copyRelativePath,
  };
}

export type FileActions = ReturnType<typeof useFileActions>;
