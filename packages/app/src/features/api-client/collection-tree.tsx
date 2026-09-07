import { useEffect, useState } from 'react';

import type { ApiCollectionSummary, PostmanItem } from '@midnite/studio-shared';
import { LuDownload, LuFolderPlus, LuPlay, LuPlus } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { LoadingRegion, Skeleton } from '../../components/skeleton';
import { VIEW_ICON } from '../../components/nav-icons';
import { TREE_INDENT } from '../../components/tree-indent';
import { TreeSection } from '../../components/tree-section';
import { bridge } from '../../services/bridge';
import { useApiClientStore } from '../../store/api-client-store';
import { MethodBadge } from './method-badge';

/**
 * The API Client's collection tree (Phase 66 Theme C): one `<TreeSection>`
 * per collection at `depth={0}`, one per folder at `depth={1..3}`, recursing
 * through a local `renderItems(items, depth)` and clamping `depth` at 3 (the
 * prop's own ceiling) — the same way `features/database/connection-tree.tsx`
 * nests schema levels.
 *
 * Owns its own fetch: `loadCollections(repoId)` runs whenever `repoId`
 * changes, and this component renders all four states itself (loading,
 * error, empty, populated) rather than pushing that onto its caller.
 */
export function CollectionTree({ repoId }: { repoId: string }) {
  const collections = useApiClientStore((s) => s.collections);
  const status = useApiClientStore((s) => s.collectionsStatus);
  const error = useApiClientStore((s) => s.collectionsError);
  const collectionsRepoId = useApiClientStore((s) => s.collectionsRepoId);
  const loadCollections = useApiClientStore((s) => s.loadCollections);

  useEffect(() => {
    void loadCollections(repoId);
  }, [repoId, loadCollections]);

  const loadingThisRepo = status === 'loading' && collectionsRepoId !== repoId;
  const staleForThisRepo = collectionsRepoId !== null && collectionsRepoId !== repoId;

  if (loadingThisRepo || (status === 'idle' && collectionsRepoId !== repoId)) {
    return (
      <LoadingRegion label="Loading collections" className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-5/6" />
      </LoadingRegion>
    );
  }

  if (status === 'error' && !staleForThisRepo) {
    return <EmptyState title="Couldn't load collections" body={error ?? undefined} bodySize="xs" />;
  }

  if (collections.length === 0 || staleForThisRepo) {
    return <EmptyCollections />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {collections.map((summary) => (
        <CollectionSection key={summary.id} repoId={repoId} summary={summary} />
      ))}
    </div>
  );
}

function EmptyCollections() {
  const Icon = VIEW_ICON.apiClient;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Icon aria-hidden className="h-10 w-10 text-muted-foreground/60" />
      <p className="text-sm font-medium">No collections yet</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Import a <code>.postman_collection.json</code> file to get started. Collections are
        stored in <code>.midnite/api/</code> in this repository, so they travel with it.
      </p>
      <button
        type="button"
        disabled
        title="Import lands in Theme G"
        className="mt-1 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground opacity-50 shadow-xs"
      >
        Import collection…
      </button>
    </div>
  );
}

function CollectionSection({ repoId, summary }: { repoId: string; summary: ApiCollectionSummary }) {
  const [open, setOpen] = useState(true);
  const dialogs = useDialogs();
  const addRequest = useApiClientStore((s) => s.addRequest);
  const addFolder = useApiClientStore((s) => s.addFolder);
  const removeCollection = useApiClientStore((s) => s.removeCollection);
  const renameCollection = useApiClientStore((s) => s.renameCollection);
  const openRunner = useApiClientStore((s) => s.openRunner);

  const promptNewFolder = () =>
    dialogs.prompt({
      title: 'New folder',
      label: 'Name',
      confirmLabel: 'Create',
      initialValue: 'New Folder',
      onConfirm: (name) => addFolder(summary.id, [], name),
    });

  const promptRename = () =>
    dialogs.prompt({
      title: 'Rename collection',
      label: 'Name',
      confirmLabel: 'Rename',
      initialValue: summary.collection.info.name,
      onConfirm: (name) => void renameCollection(summary.id, name),
    });

  return (
    <TreeSection
      title={summary.collection.info.name}
      icon={<VIEW_ICON.apiClient aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((value) => !value)}
      hideWhenEmpty={false}
      action={{ label: 'New request', onClick: () => addRequest(summary.id, [], 'New Request'), icon: LuPlus }}
    >
      {!open ? null : (
        <div
          onContextMenu={(event) => {
            event.preventDefault();
            dialogs.openMenu(event, [
              { label: 'New request', icon: LuPlus, onSelect: () => addRequest(summary.id, [], 'New Request') },
              { label: 'New folder', icon: LuFolderPlus, onSelect: promptNewFolder },
              { type: 'separator' },
              // Phase 70 Theme C — opens `<CollectionRunner>` in place of the
              // request tab strip, `api-client-view.tsx`'s own toggle.
              { label: 'Run collection…', icon: LuPlay, onSelect: () => openRunner(summary.id) },
              { type: 'separator' },
              // Renames `info.name` and persists immediately via
              // `apiClient.saveCollection` (PR #227) — unlike a folder/
              // request rename, which only marks the collection dirty for
              // an explicit Save, a collection's own name is metadata about
              // the file rather than tree content.
              { label: 'Rename', onSelect: promptRename },
              {
                label: 'Export…',
                icon: LuDownload,
                onSelect: () => {
                  void bridge()
                    ?.apiClient.exportCollection({ repoId, collectionId: summary.id })
                    .then((result) => {
                      if (!result.ok) dialogs.notify({ title: 'Could not export collection', body: result.message });
                    });
                },
              },
              {
                label: 'Remove from repo',
                danger: true,
                onSelect: () =>
                  dialogs.confirm({
                    title: `Remove "${summary.collection.info.name}" from this repo?`,
                    confirmLabel: 'Remove',
                    danger: true,
                    blastRadius: null,
                    onConfirm: () => void removeCollection(summary.id),
                  }),
              },
            ]);
          }}
        >
          {renderItems({ repoId, collectionId: summary.id, items: summary.collection.item, path: [], depth: 1 })}
        </div>
      )}
    </TreeSection>
  );
}

/**
 * Recurses through a collection's item tree, rendering a nested
 * `<TreeSection>` per folder and a leaf row per request. `depth` is clamped
 * at 3 — `TreeSection`'s own ceiling — so a collection nested deeper than
 * that stops gaining indent rather than overflowing `TREE_INDENT`.
 */
function renderItems({
  repoId,
  collectionId,
  items,
  path,
  depth,
}: {
  repoId: string;
  collectionId: string;
  items: PostmanItem[];
  path: string[];
  depth: number;
}) {
  const clamped = Math.min(depth, 3) as 1 | 2 | 3;
  return items.map((item) =>
    item.request ? (
      <RequestRow
        key={item.name}
        repoId={repoId}
        collectionId={collectionId}
        item={item}
        itemPath={[...path, item.name]}
        depth={clamped}
      />
    ) : (
      <FolderSection
        key={item.name}
        repoId={repoId}
        collectionId={collectionId}
        item={item}
        itemPath={[...path, item.name]}
        depth={clamped}
      />
    ),
  );
}

function FolderSection({
  repoId,
  collectionId,
  item,
  itemPath,
  depth,
}: {
  repoId: string;
  collectionId: string;
  item: PostmanItem;
  itemPath: string[];
  depth: 1 | 2 | 3;
}) {
  const [open, setOpen] = useState(true);
  const dialogs = useDialogs();
  const addRequest = useApiClientStore((s) => s.addRequest);
  const addFolder = useApiClientStore((s) => s.addFolder);
  const renameItem = useApiClientStore((s) => s.renameItem);
  const duplicateItem = useApiClientStore((s) => s.duplicateItem);
  const deleteItem = useApiClientStore((s) => s.deleteItem);

  const promptRename = () =>
    dialogs.prompt({
      title: 'Rename folder',
      label: 'Name',
      confirmLabel: 'Rename',
      initialValue: item.name,
      onConfirm: (name) => renameItem(collectionId, itemPath, name),
    });

  const promptNewFolder = () =>
    dialogs.prompt({
      title: 'New folder',
      label: 'Name',
      confirmLabel: 'Create',
      initialValue: 'New Folder',
      onConfirm: (name) => addFolder(collectionId, itemPath, name),
    });

  const confirmDelete = () =>
    dialogs.confirm({
      title: `Delete "${item.name}"?`,
      confirmLabel: 'Delete',
      danger: true,
      blastRadius: null,
      onConfirm: () => deleteItem(collectionId, itemPath),
    });

  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        dialogs.openMenu(event, [
          { label: 'New request', icon: LuPlus, onSelect: () => addRequest(collectionId, itemPath, 'New Request') },
          { label: 'New folder', icon: LuFolderPlus, onSelect: promptNewFolder },
          { type: 'separator' },
          { label: 'Rename', onSelect: promptRename },
          { label: 'Duplicate', onSelect: () => duplicateItem(collectionId, itemPath) },
          { label: 'Delete', danger: true, onSelect: confirmDelete },
        ]);
      }}
    >
      <TreeSection
        title={item.name}
        collapsible
        open={open}
        onToggle={() => setOpen((value) => !value)}
        depth={depth}
        hideWhenEmpty={false}
      >
        {!open
          ? null
          : renderItems({
              repoId,
              collectionId,
              items: item.item ?? [],
              path: itemPath,
              depth: depth + 1,
            })}
      </TreeSection>
    </div>
  );
}

function RequestRow({
  repoId,
  collectionId,
  item,
  itemPath,
  depth,
}: {
  repoId: string;
  collectionId: string;
  item: PostmanItem;
  itemPath: string[];
  depth: 1 | 2 | 3;
}) {
  const dialogs = useDialogs();
  const openTab = useApiClientStore((s) => s.openTab);
  const renameItem = useApiClientStore((s) => s.renameItem);
  const duplicateItem = useApiClientStore((s) => s.duplicateItem);
  const deleteItem = useApiClientStore((s) => s.deleteItem);

  const open = () => openTab({ repoId, collectionId, itemPath, item });

  const promptRename = () =>
    dialogs.prompt({
      title: 'Rename request',
      label: 'Name',
      confirmLabel: 'Rename',
      initialValue: item.name,
      onConfirm: (name) => renameItem(collectionId, itemPath, name),
    });

  const confirmDelete = () =>
    dialogs.confirm({
      title: `Delete "${item.name}"?`,
      confirmLabel: 'Delete',
      danger: true,
      blastRadius: null,
      onConfirm: () => deleteItem(collectionId, itemPath),
    });

  return (
    <div
      className={`flex h-6 items-center gap-1.5 pr-2 ${TREE_INDENT[Math.min(depth + 1, 4) as 1 | 2 | 3 | 4]}`}
      onContextMenu={(event) => {
        event.preventDefault();
        dialogs.openMenu(event, [
          { label: 'Rename', onSelect: promptRename },
          { label: 'Duplicate', onSelect: () => duplicateItem(collectionId, itemPath) },
          { label: 'Delete', danger: true, onSelect: confirmDelete },
        ]);
      }}
    >
      <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs">
        <MethodBadge method={item.request?.method ?? 'GET'} />
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
      </button>
    </div>
  );
}
