import {
  LIBRARY_PLAYLIST_ITEMS_MAX,
  LIBRARY_PLAYLIST_NAME_MAX,
  type LibraryItem,
  type LibraryPlaylist,
} from '@midnite/studio-shared';
import { useMemo } from 'react';
import {
  LuArrowDown,
  LuArrowUp,
  LuListMusic,
  LuPencil,
  LuPlay,
  LuTrash2,
  LuX,
} from 'react-icons/lu';

import { EmptyState, useFrameChrome } from '@midnite/studio-frame';

import { itemSubtitle, moveEntry, nextPlaylistName, playlistItems } from './library-model';
import { useLibraryPlaylists, usePlaylistMutations } from './use-library';

const validateName = (value: string): string | null => {
  const name = value.trim();
  if (name === '') return 'Give the playlist a name.';
  if (name.length > LIBRARY_PLAYLIST_NAME_MAX)
    return `At most ${LIBRARY_PLAYLIST_NAME_MAX} characters.`;
  return null;
};

/** "New playlist": a name prompt where the app has one, else a free default name (renamable after). */
export function useCreatePlaylist() {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const playlists = useLibraryPlaylists();
  const { create } = usePlaylistMutations();
  return (itemIds?: string[]) => {
    const name = nextPlaylistName(playlists.data ?? []);
    const make = (value: string) =>
      create.mutate({ name: value.trim(), ...(itemIds ? { itemIds } : {}) });
    if (dialogs.prompt) {
      dialogs.prompt({
        title: 'New playlist',
        label: 'Name',
        initialValue: name,
        confirmLabel: 'Create',
        validate: validateName,
        onConfirm: make,
      });
    } else make(name);
  };
}

/** The explorer's Playlists list: open, rename, delete. */
export function PlaylistList({
  playlists,
  openId,
  onOpen,
}: {
  playlists: readonly LibraryPlaylist[];
  openId: string | null;
  onOpen: (playlistId: string | null) => void;
}) {
  const { IconButton, useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const { rename, remove } = usePlaylistMutations();

  const del = (playlist: LibraryPlaylist) =>
    dialogs.confirm({
      title: `Delete “${playlist.name}”?`,
      body: `The playlist goes; its ${playlist.itemIds.length} item${playlist.itemIds.length === 1 ? '' : 's'} stay in the library.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        if (openId === playlist.id) onOpen(null);
        remove.mutate(playlist.id);
      },
    });

  if (playlists.length === 0)
    return <p className="px-3 py-2 text-[11px] text-muted-foreground">No playlists yet.</p>;

  return (
    <ul className="py-1">
      {playlists.map((playlist) => (
        <li key={playlist.id} className="group flex items-center gap-1.5 px-3 py-0.5 text-xs">
          <button
            type="button"
            aria-current={openId === playlist.id || undefined}
            onClick={() => onOpen(playlist.id)}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-primary/10 ${
              openId === playlist.id ? 'bg-accent' : ''
            }`}
          >
            <LuListMusic aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
            <span className="text-[10px] text-muted-foreground">{playlist.itemIds.length}</span>
          </button>
          {dialogs.prompt ? (
            <IconButton
              icon={LuPencil}
              label={`Rename ${playlist.name}`}
              size="sm"
              onClick={() =>
                dialogs.prompt?.({
                  title: 'Rename playlist',
                  label: 'Name',
                  initialValue: playlist.name,
                  confirmLabel: 'Rename',
                  validate: validateName,
                  onConfirm: (name) =>
                    rename.mutate({ playlistId: playlist.id, name: name.trim() }),
                })
              }
            />
          ) : null}
          <IconButton
            icon={LuTrash2}
            label={`Delete ${playlist.name}`}
            size="sm"
            tone="danger"
            onClick={() => del(playlist)}
          />
        </li>
      ))}
    </ul>
  );
}

/** The centre pane for one playlist: its items in order, reorder/remove, and Play all. */
export function PlaylistContent({
  playlist,
  items,
  selectedId,
  onSelect,
  onPlayAll,
}: {
  playlist: LibraryPlaylist;
  items: readonly LibraryItem[];
  selectedId: string | null;
  onSelect: (item: LibraryItem) => void;
  onPlayAll: (queue: string[]) => void;
}) {
  const { IconButton } = useFrameChrome();
  const { setItems } = usePlaylistMutations();
  const entries = useMemo(() => playlistItems(playlist.itemIds, items), [playlist.itemIds, items]);
  const ids = entries.map((item) => item.id);
  const write = (itemIds: string[]) => setItems.mutate({ playlistId: playlist.id, itemIds });

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold">{playlist.name}</h2>
        <span className="text-xs text-muted-foreground">
          {entries.length} item{entries.length === 1 ? '' : 's'}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          disabled={entries.length === 0}
          onClick={() => onPlayAll(ids)}
          className="inline-flex items-center gap-1 rounded-md border border-primary/60 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          <LuPlay aria-hidden className="h-3 w-3" />
          Play all
        </button>
      </div>
      {entries.length === 0 ? (
        <EmptyState
          icon={LuListMusic}
          title="This playlist is empty"
          body="Open a film, an episode or a track and add it from its details."
        />
      ) : (
        <ol
          aria-label={`${playlist.name} items`}
          className="divide-y divide-border rounded-md border border-border"
        >
          {entries.map((item, index) => (
            <li
              key={item.id}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs ${item.id === selectedId ? 'bg-accent' : ''}`}
            >
              <span className="w-6 shrink-0 font-mono text-[11px] text-muted-foreground">
                {index + 1}
              </span>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="min-w-0 flex-1 truncate text-left hover:underline"
              >
                {item.title}
                {itemSubtitle(item) ? (
                  <span className="ml-2 text-muted-foreground">{itemSubtitle(item)}</span>
                ) : null}
              </button>
              <IconButton
                icon={LuArrowUp}
                label={`Move ${item.title} up`}
                size="sm"
                disabled={index === 0}
                onClick={() => write(moveEntry(ids, index, -1))}
              />
              <IconButton
                icon={LuArrowDown}
                label={`Move ${item.title} down`}
                size="sm"
                disabled={index === entries.length - 1}
                onClick={() => write(moveEntry(ids, index, 1))}
              />
              <IconButton
                icon={LuX}
                label={`Remove ${item.title} from the playlist`}
                size="sm"
                onClick={() => write(ids.filter((id) => id !== item.id))}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The detail pane's "Add to playlist": an existing playlist, or a new one holding this item. */
export function AddToPlaylist({ item }: { item: LibraryItem }) {
  const playlists = useLibraryPlaylists();
  const { setItems } = usePlaylistMutations();
  const createPlaylist = useCreatePlaylist();
  const options = (playlists.data ?? []).filter(
    (playlist) =>
      !playlist.itemIds.includes(item.id) && playlist.itemIds.length < LIBRARY_PLAYLIST_ITEMS_MAX,
  );
  return (
    <select
      aria-label="Add to playlist"
      value=""
      onChange={(event) => {
        const value = event.target.value;
        if (value === '__new') createPlaylist([item.id]);
        else {
          const playlist = options.find((p) => p.id === value);
          if (playlist)
            setItems.mutate({ playlistId: playlist.id, itemIds: [...playlist.itemIds, item.id] });
        }
      }}
      className="rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="" disabled>
        Add to playlist…
      </option>
      {options.map((playlist) => (
        <option key={playlist.id} value={playlist.id}>
          {playlist.name}
        </option>
      ))}
      <option value="__new">New playlist…</option>
    </select>
  );
}
