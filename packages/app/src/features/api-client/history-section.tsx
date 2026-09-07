import { useEffect, useState } from 'react';

import { toCurl, toDraft, toFetch, type ApiHistoryEntry, type PostmanItem } from '@midnite/studio-shared';
import { LuCopy, LuTrash2 } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { TreeSection } from '../../components/tree-section';
import { TREE_INDENT } from '../../components/tree-indent';
import { bridge } from '../../services/bridge';
import { useApiClientStore } from '../../store/api-client-store';
import { MethodBadge } from './method-badge';

/**
 * The persisted request history section (Phase 70 Theme D), rendered below
 * `CollectionTree` in the same tree column.
 *
 * Every row is metadata only — `main/api-client/history.ts` never writes a
 * header or a body to disk — so a row has nothing of its own to resend or
 * generate a snippet from. Both "open as a tab" and "Copy as curl/fetch"
 * therefore re-derive from the **collection item the row names**
 * (`collectionId` + `itemPath`), exactly as re-opening a row is specified to:
 * "the row has no body, and re-sending a stale body would be a lie about
 * what it does." A row whose item has since been renamed, moved, or deleted
 * degrades to a notice rather than a silent no-op.
 */
export function HistorySection({ repoId }: { repoId: string }) {
  const dialogs = useDialogs();
  const history = useApiClientStore((s) => s.history);
  const status = useApiClientStore((s) => s.historyStatus);
  const error = useApiClientStore((s) => s.historyError);
  const historyRepoId = useApiClientStore((s) => s.historyRepoId);
  const loadHistory = useApiClientStore((s) => s.loadHistory);
  const clearHistoryAction = useApiClientStore((s) => s.clearHistory);
  const collections = useApiClientStore((s) => s.collections);
  const openTab = useApiClientStore((s) => s.openTab);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void loadHistory(repoId);
  }, [repoId, loadHistory]);

  const rows = historyRepoId === repoId ? history : [];

  const findItem = (entry: ApiHistoryEntry): PostmanItem | null => {
    if (!entry.collectionId || !entry.itemPath || entry.itemPath.length === 0) return null;
    const summary = collections.find((c) => c.id === entry.collectionId);
    if (!summary) return null;
    let items = summary.collection.item;
    let found: PostmanItem | undefined;
    for (const segment of entry.itemPath) {
      found = items.find((it) => it.name === segment);
      if (!found) return null;
      items = found.item ?? [];
    }
    return found ?? null;
  };

  const missingItemNotice = () =>
    dialogs.notify({
      title: 'That request no longer exists',
      body: 'The collection item this history row named has been renamed, moved, or deleted.',
    });

  const openEntry = (entry: ApiHistoryEntry) => {
    const item = findItem(entry);
    if (!item || !entry.collectionId) {
      missingItemNotice();
      return;
    }
    openTab({ repoId, collectionId: entry.collectionId, itemPath: entry.itemPath ?? [], item });
  };

  const copyAs = async (entry: ApiHistoryEntry, generator: 'curl' | 'fetch') => {
    const item = findItem(entry);
    if (!item) {
      missingItemNotice();
      return;
    }
    const draft = toDraft(item);
    const text = generator === 'curl' ? toCurl(draft) : toFetch(draft);
    await bridge()?.clipboard.writeText({ text });
  };

  const confirmClear = () =>
    dialogs.confirm({
      title: `Clear ${rows.length} history ${rows.length === 1 ? 'entry' : 'entries'}?`,
      confirmLabel: 'Clear',
      danger: true,
      blastRadius: null,
      onConfirm: () => void clearHistoryAction(repoId),
    });

  return (
    <TreeSection
      title="History"
      count={rows.length}
      collapsible
      open={open}
      onToggle={() => setOpen((value) => !value)}
      hideWhenEmpty={false}
      action={
        rows.length > 0
          ? { label: 'Clear history', icon: LuTrash2, onClick: confirmClear }
          : undefined
      }
    >
      {!open ? null : status === 'error' && rows.length === 0 ? (
        <EmptyState title="Couldn't load history" body={error ?? undefined} bodySize="xs" />
      ) : rows.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">No requests sent yet.</p>
      ) : (
        rows.map((entry) => (
          <HistoryRow
            key={entry.id}
            entry={entry}
            onOpen={() => openEntry(entry)}
            onCopy={(generator) => void copyAs(entry, generator)}
          />
        ))
      )}
    </TreeSection>
  );
}

function HistoryRow({
  entry,
  onOpen,
  onCopy,
}: {
  entry: ApiHistoryEntry;
  onOpen: () => void;
  onCopy: (generator: 'curl' | 'fetch') => void;
}) {
  const dialogs = useDialogs();
  return (
    <div
      className={`flex h-6 items-center gap-1.5 pr-2 ${TREE_INDENT[2]}`}
      onContextMenu={(event) => {
        event.preventDefault();
        dialogs.openMenu(event, [
          { label: 'Copy as curl', icon: LuCopy, onSelect: () => onCopy('curl') },
          { label: 'Copy as fetch', icon: LuCopy, onSelect: () => onCopy('fetch') },
        ]);
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        title={entry.url}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs"
      >
        <MethodBadge method={entry.method} />
        <span className="min-w-0 flex-1 truncate">{entry.url}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{entry.status}</span>
      </button>
    </div>
  );
}
