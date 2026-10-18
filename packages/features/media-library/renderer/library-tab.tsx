import {
  LIBRARY_KIND_LABELS,
  LIBRARY_KINDS,
  libraryFileUrl,
  libraryResumeAt,
  type LibraryItem,
  type LibraryKind,
  type LibraryPlaylist,
  type LibraryRoot,
} from '@midnite/studio-shared';
import { useMemo, useState, type ReactNode } from 'react';
import {
  LuFilm,
  LuFolderOpen,
  LuFolderPlus,
  LuImage,
  LuLibrary,
  LuListPlus,
  LuMusic,
  LuRefreshCw,
  LuSettings2,
  LuTrash2,
  LuTv,
  LuWifi,
} from 'react-icons/lu';

import {
  EmptyState,
  EmptyStateButton,
  FilterInput,
  SwitchRow,
  useFrameChrome,
  useMediaKit,
  type IconComponent,
} from '@midnite/studio-frame';

import { useLibraryHost } from './host';
import {
  continueWatching,
  countByKind,
  episodeCode,
  formatClock,
  groupAlbums,
  groupShows,
  isPlayable,
  itemSubtitle,
  matchesQuery,
  watchedFraction,
  type AlbumGroup,
  type ShowGroup,
} from './library-model';
import { LibraryPlayer } from './library-player';
import { AddToPlaylist, PlaylistContent, PlaylistList, useCreatePlaylist } from './playlists';
import { SharePanel } from './share-panel';
import {
  createProgressSaver,
  useLibraryEvents,
  useLibraryItems,
  useLibraryMutations,
  useLibraryPlaylists,
  useLibraryRoots,
  useLibrarySettings,
  writeProgress,
} from './use-library';

export const KIND_ICONS: Record<LibraryKind, IconComponent> = {
  film: LuFilm,
  show: LuTv,
  music: LuMusic,
  photo: LuImage,
};

/** What the centre shows: a kind's grid, or one show's episodes / one album's tracks. */
type Focus = { kind: LibraryKind; group: string | null };

/** A playlist playing in sequence: its item ids, and where it is. */
type Queue = { ids: readonly string[]; index: number };

/**
 * Media ▸ Library (Phase 113 Theme R): the folders the user added, scanned into films, shows, music and
 * photos.
 *
 * - **Explorer**: the four kinds with counts, the folders (add, rescan, remove), the playlists, the
 *   online-metadata switch — off unless the user turns it on; with it off nothing leaves the machine — and
 *   Share on your network (slice 2), off until the user starts it.
 * - **Content**: a continue-watching row over a grid per kind (shows and albums open into their
 *   episodes and tracks), or one playlist's items in order.
 * - **Detail**: the selected item — its art and details, and the player, which resumes where the user
 *   stopped and saves progress as it plays. A playlist's Play all plays its items one after another.
 *
 * Not repo-scoped: a library is the user's, not a repository's.
 */
export function LibraryTab() {
  const { MediaLayout } = useMediaKit();
  const roots = useLibraryRoots();
  const items = useLibraryItems();
  const scan = useLibraryEvents();
  const mutations = useLibraryMutations();
  const playlists = useLibraryPlaylists();
  const [focus, setFocus] = useState<Focus>({ kind: 'film', group: null });
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [queue, setQueue] = useState<Queue | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  // Bumped by every Play all, so pressing it on the item already open still starts it.
  const [playRun, setPlayRun] = useState(0);

  const all = useMemo(() => items.data ?? [], [items.data]);
  const selected = all.find((item) => item.id === selectedId) ?? null;
  const scanning = scan !== null || mutations.scan.isPending;
  const openPlaylist = playlistId
    ? ((playlists.data ?? []).find((playlist) => playlist.id === playlistId) ?? null)
    : null;

  /** The user's own pick: plays nothing by itself, and leaves a queue it is not part of. */
  const select = (item: LibraryItem) => {
    setSelectedId(item.id);
    setAutoPlay(false);
    setQueue((current) => {
      const index = current ? current.ids.indexOf(item.id) : -1;
      return current && index >= 0 ? { ...current, index } : null;
    });
  };

  const playQueue = (ids: readonly string[], index = 0) => {
    const id = ids[index];
    if (id === undefined) return;
    setQueue({ ids, index });
    setSelectedId(id);
    setAutoPlay(true);
    setPlayRun((run) => run + 1);
  };

  const ended = () => {
    if (queue && queue.index + 1 < queue.ids.length) playQueue(queue.ids, queue.index + 1);
    else setQueue(null);
  };

  const upNext =
    queue && queue.index + 1 < queue.ids.length
      ? (all.find((item) => item.id === queue.ids[queue.index + 1]) ?? null)
      : null;

  const hasRoots = (roots.data?.length ?? 0) > 0;

  return (
    <MediaLayout
      tab="library"
      explorerName="library"
      detailName="details"
      explorerLabel="Resize library explorer"
      detailLabel="Resize details"
      toolbar={
        <LibraryToolbar
          query={query}
          onQuery={setQuery}
          scanning={scanning}
          scanned={scan?.scanned ?? null}
          canScan={hasRoots}
          onScan={() => mutations.scan.mutate(undefined)}
        />
      }
      explorer={
        <LibraryExplorer
          roots={roots.data ?? []}
          counts={countByKind(all)}
          focus={playlistId ? null : focus}
          onFocus={(kind) => {
            setPlaylistId(null);
            setFocus({ kind, group: null });
          }}
          scanning={scanning}
          playlists={playlists.data ?? []}
          openPlaylistId={playlistId}
          onOpenPlaylist={setPlaylistId}
        />
      }
      content={
        !roots.isLoading && !hasRoots ? (
          <EmptyState
            icon={LuLibrary}
            title="Your library is empty"
            body="Add a folder of films, shows, music or photos. It is scanned on this computer — nothing is uploaded."
            action={
              <EmptyStateButton
                icon={LuFolderPlus}
                label="Add a folder…"
                onClick={() => mutations.addRoot.mutate()}
              />
            }
          />
        ) : openPlaylist ? (
          <PlaylistContent
            playlist={openPlaylist}
            items={all}
            selectedId={selectedId}
            onSelect={select}
            onPlayAll={(ids) => playQueue(ids)}
          />
        ) : (
          <LibraryContent
            items={all}
            focus={focus}
            onFocus={setFocus}
            query={query}
            selectedId={selectedId}
            onSelect={select}
          />
        )
      }
      detail={
        <LibraryDetail
          key={`${selected?.id ?? ''}:${autoPlay ? playRun : 0}`}
          item={selected}
          autoPlay={autoPlay}
          onEnded={ended}
          upNext={upNext}
        />
      }
    />
  );
}

function LibraryToolbar({
  query,
  onQuery,
  scanning,
  scanned,
  canScan,
  onScan,
}: {
  query: string;
  onQuery: (value: string) => void;
  scanning: boolean;
  scanned: number | null;
  canScan: boolean;
  onScan: () => void;
}) {
  const { IconButton } = useFrameChrome();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="w-64 min-w-0">
        <FilterInput value={query} onChange={onQuery} placeholder="Search the library" />
      </div>
      <span className="flex-1" />
      {scanning ? (
        <span role="status" className="text-[11px] text-muted-foreground">
          Scanning{scanned !== null && scanned > 0 ? ` · ${scanned} files` : '…'}
        </span>
      ) : null}
      <IconButton
        icon={LuRefreshCw}
        label="Rescan all folders"
        busy={scanning}
        disabled={!canScan}
        disabledReason="Add a folder first"
        onClick={onScan}
      />
    </div>
  );
}

function LibraryExplorer({
  roots,
  counts,
  focus,
  onFocus,
  scanning,
  playlists,
  openPlaylistId,
  onOpenPlaylist,
}: {
  roots: readonly LibraryRoot[];
  counts: Record<LibraryKind, number>;
  /** Null while a playlist is open. */
  focus: Focus | null;
  onFocus: (kind: LibraryKind) => void;
  scanning: boolean;
  playlists: readonly LibraryPlaylist[];
  openPlaylistId: string | null;
  onOpenPlaylist: (playlistId: string | null) => void;
}) {
  const { Accordion } = useMediaKit();
  const { IconButton, useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const mutations = useLibraryMutations();
  const createPlaylist = useCreatePlaylist();

  const removeRoot = (root: LibraryRoot) =>
    dialogs.confirm({
      title: `Remove “${root.label}” from the library?`,
      body: `Its ${root.itemCount} items and their watch progress leave the library. The folder and its files are not touched.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: () => mutations.removeRoot.mutate(root.id),
    });

  return (
    <Accordion
      id="media-library"
      tone="primary"
      sections={[
        {
          id: 'kinds',
          title: 'Library',
          children: (
            <ul className="py-1">
              {LIBRARY_KINDS.map((kind) => {
                const Icon = KIND_ICONS[kind];
                const active = focus?.kind === kind;
                return (
                  <li key={kind}>
                    <button
                      type="button"
                      aria-current={active || undefined}
                      onClick={() => onFocus(kind)}
                      className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs transition-colors hover:bg-primary/10 ${
                        active ? 'bg-accent text-foreground' : 'text-foreground/90'
                      }`}
                    >
                      <Icon aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1">{LIBRARY_KIND_LABELS[kind]}</span>
                      <span className="text-[10px] text-muted-foreground">{counts[kind]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ),
        },
        {
          id: 'folders',
          title: 'Folders',
          count: roots.length,
          actions: (
            <IconButton
              icon={LuFolderPlus}
              label="Add a folder"
              size="sm"
              onClick={() => mutations.addRoot.mutate()}
            />
          ),
          children:
            roots.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">No folders yet.</p>
            ) : (
              <ul className="py-1">
                {roots.map((root) => (
                  <li
                    key={root.id}
                    className="group flex items-center gap-1.5 px-3 py-1 text-xs"
                    title={root.path}
                  >
                    <LuFolderOpen
                      aria-hidden
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate">{root.label}</span>
                    <span className="text-[10px] text-muted-foreground">{root.itemCount}</span>
                    <IconButton
                      icon={LuRefreshCw}
                      label={`Rescan ${root.label}`}
                      size="sm"
                      disabled={scanning}
                      disabledReason="A scan is running"
                      onClick={() => mutations.scan.mutate(root.id)}
                    />
                    <IconButton
                      icon={LuTrash2}
                      label={`Remove ${root.label}`}
                      size="sm"
                      tone="danger"
                      onClick={() => removeRoot(root)}
                    />
                  </li>
                ))}
              </ul>
            ),
        },
        {
          id: 'playlists',
          title: 'Playlists',
          count: playlists.length,
          actions: (
            <IconButton
              icon={LuListPlus}
              label="New playlist"
              size="sm"
              onClick={() => createPlaylist()}
            />
          ),
          children: (
            <PlaylistList playlists={playlists} openId={openPlaylistId} onOpen={onOpenPlaylist} />
          ),
        },
        {
          id: 'share',
          title: 'Share on your network',
          icon: <LuWifi aria-hidden className="h-3.5 w-3.5" />,
          children: <SharePanel />,
        },
        {
          id: 'settings',
          title: 'Metadata',
          icon: <LuSettings2 aria-hidden className="h-3.5 w-3.5" />,
          children: <OnlineMetadataSettings />,
        },
      ]}
    />
  );
}

function OnlineMetadataSettings() {
  const settings = useLibrarySettings();
  const { setSettings } = useLibraryMutations();
  const host = useLibraryHost();
  const on = settings.data?.settings.onlineMetadata ?? false;
  const keyAvailable = settings.data?.onlineKeyAvailable ?? false;
  const KeyField = host.OnlineKeyField;
  return (
    <div className="space-y-2 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">
        Artwork and details come from the folders first — embedded covers, <code>poster.jpg</code>,{' '}
        <code>.nfo</code> files.
      </p>
      <SwitchRow
        id="library-online"
        label="Fill gaps from TMDB"
        title="Looks up films and shows without local artwork or a plot on themoviedb.org"
        on={on}
        onToggle={(_, next) => setSettings.mutate({ onlineMetadata: next })}
      />
      <p className="text-[11px] text-muted-foreground">
        {on
          ? keyAvailable
            ? 'On: titles of films and shows missing details are sent to TMDB on the next scan.'
            : 'On, but no TMDB key is available — nothing is sent until one is.'
          : 'Off: nothing leaves this computer.'}
      </p>
      {KeyField ? (
        <KeyField />
      ) : host.onlineKeyHint ? (
        <p className="text-[11px] text-muted-foreground">{host.onlineKeyHint}</p>
      ) : null}
    </div>
  );
}

function LibraryContent({
  items,
  focus,
  onFocus,
  query,
  selectedId,
  onSelect,
}: {
  items: readonly LibraryItem[];
  focus: Focus;
  onFocus: (focus: Focus) => void;
  query: string;
  selectedId: string | null;
  onSelect: (item: LibraryItem) => void;
}) {
  const ofKind = useMemo(
    () => items.filter((item) => item.kind === focus.kind && matchesQuery(item, query)),
    [items, focus.kind, query],
  );
  const resume = useMemo(
    () => (focus.kind === 'film' || focus.kind === 'show' ? continueWatching(items) : []),
    [items, focus.kind],
  );

  let body: ReactNode;
  if (focus.kind === 'show') {
    const shows = groupShows(ofKind);
    const open = focus.group ? shows.find((show) => show.key === focus.group) : undefined;
    body = open ? (
      <EpisodeList
        show={open}
        selectedId={selectedId}
        onSelect={onSelect}
        onBack={() => onFocus({ kind: 'show', group: null })}
      />
    ) : (
      <Grid empty={ofKind.length === 0} kind="show">
        {shows.map((show) => (
          <Card
            key={show.key}
            title={show.title}
            subtitle={`${show.episodes.length} episode${show.episodes.length === 1 ? '' : 's'}`}
            art={show.art}
            icon={LuTv}
            onClick={() => onFocus({ kind: 'show', group: show.key })}
          />
        ))}
      </Grid>
    );
  } else if (focus.kind === 'music') {
    const albums = groupAlbums(ofKind);
    const open = focus.group ? albums.find((album) => album.key === focus.group) : undefined;
    body = open ? (
      <TrackList
        album={open}
        selectedId={selectedId}
        onSelect={onSelect}
        onBack={() => onFocus({ kind: 'music', group: null })}
      />
    ) : (
      <Grid empty={ofKind.length === 0} kind="music">
        {albums.map((album) => (
          <Card
            key={album.key}
            title={album.title}
            subtitle={[album.artist, album.year].filter(Boolean).join(' · ')}
            art={album.art}
            icon={LuMusic}
            square
            onClick={() => onFocus({ kind: 'music', group: album.key })}
          />
        ))}
      </Grid>
    );
  } else {
    body = (
      <Grid empty={ofKind.length === 0} kind={focus.kind}>
        {ofKind.map((item) => (
          <Card
            key={item.id}
            title={item.title}
            subtitle={itemSubtitle(item)}
            art={item.art}
            icon={KIND_ICONS[item.kind]}
            square={item.kind === 'photo'}
            progress={watchedFraction(item)}
            selected={item.id === selectedId}
            onClick={() => onSelect(item)}
          />
        ))}
      </Grid>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      {resume.length > 0 && focus.group === null && query.trim() === '' ? (
        <section aria-label="Continue watching" className="mb-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Continue watching
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {resume.map((item) => (
              <div key={item.id} className="w-32 shrink-0">
                <Card
                  title={item.kind === 'show' ? (item.showTitle ?? item.title) : item.title}
                  subtitle={
                    item.kind === 'show'
                      ? (episodeCode(item) ?? '')
                      : `${formatClock(item.progress?.positionS ?? 0)} in`
                  }
                  art={item.art}
                  icon={KIND_ICONS[item.kind]}
                  progress={watchedFraction(item)}
                  selected={item.id === selectedId}
                  onClick={() => onSelect(item)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {body}
    </div>
  );
}

function Grid({
  empty,
  kind,
  children,
}: {
  empty: boolean;
  kind: LibraryKind;
  children: ReactNode;
}) {
  if (empty) {
    return (
      <EmptyState
        icon={KIND_ICONS[kind]}
        title={`No ${LIBRARY_KIND_LABELS[kind].toLowerCase()}`}
        body="Nothing of this kind in your folders (or matching your search)."
      />
    );
  }
  return (
    <div role="list" className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4">
      {children}
    </div>
  );
}

function Card({
  title,
  subtitle,
  art,
  icon: Icon,
  square,
  progress,
  selected,
  onClick,
}: {
  title: string;
  subtitle: string;
  art: LibraryItem['art'];
  icon: IconComponent;
  square?: boolean;
  progress?: number;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <div role="listitem">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected || undefined}
        className={`group flex w-full flex-col gap-1.5 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          selected ? 'ring-2 ring-primary' : ''
        }`}
      >
        <span
          className={`relative block w-full overflow-hidden rounded-md border border-border bg-muted ${
            square ? 'aspect-square' : 'aspect-[2/3]'
          }`}
        >
          {art ? (
            <img
              src={libraryFileUrl(art)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Icon aria-hidden className="h-8 w-8 text-muted-foreground/50" />
            </span>
          )}
          {progress !== undefined && progress > 0 && progress < 1 ? (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
              <span
                className="block h-full bg-primary"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
          ) : null}
        </span>
        <span className="min-w-0 px-0.5">
          <span className="block truncate text-xs font-medium">{title}</span>
          {subtitle ? (
            <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
          ) : null}
        </span>
      </button>
    </div>
  );
}

function BackHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← All
      </button>
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
    </div>
  );
}

function EpisodeList({
  show,
  selectedId,
  onSelect,
  onBack,
}: {
  show: ShowGroup;
  selectedId: string | null;
  onSelect: (item: LibraryItem) => void;
  onBack: () => void;
}) {
  return (
    <div>
      <BackHeader
        title={show.title}
        subtitle={`${show.episodes.length} episodes`}
        onBack={onBack}
      />
      <ul
        aria-label={`${show.title} episodes`}
        className="divide-y divide-border rounded-md border border-border"
      >
        {show.episodes.map((episode) => (
          <ItemRow
            key={episode.id}
            item={episode}
            lead={episodeCode(episode) ?? '—'}
            selected={episode.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </div>
  );
}

function TrackList({
  album,
  selectedId,
  onSelect,
  onBack,
}: {
  album: AlbumGroup;
  selectedId: string | null;
  onSelect: (item: LibraryItem) => void;
  onBack: () => void;
}) {
  return (
    <div>
      <BackHeader title={album.title} subtitle={album.artist ?? undefined} onBack={onBack} />
      <ul
        aria-label={`${album.title} tracks`}
        className="divide-y divide-border rounded-md border border-border"
      >
        {album.tracks.map((track) => (
          <ItemRow
            key={track.id}
            item={track}
            lead={track.track !== null ? String(track.track) : '—'}
            selected={track.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </div>
  );
}

function ItemRow({
  item,
  lead,
  selected,
  onSelect,
}: {
  item: LibraryItem;
  lead: string;
  selected: boolean;
  onSelect: (item: LibraryItem) => void;
}) {
  const fraction = watchedFraction(item);
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected || undefined}
        onClick={() => onSelect(item)}
        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-primary/10 ${selected ? 'bg-accent' : ''}`}
      >
        <span className="w-14 shrink-0 font-mono text-[11px] text-muted-foreground">{lead}</span>
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        {item.progress?.finished ? (
          <span className="text-[10px] text-muted-foreground">Watched</span>
        ) : fraction > 0 ? (
          <span className="text-[10px] text-muted-foreground">{Math.round(fraction * 100)}%</span>
        ) : null}
      </button>
    </li>
  );
}

/**
 * The right pane: art, details and — for anything playable — the player. `autoPlay` starts the player as
 * soon as the item opens (a playlist's next item); `onEnded` is how the tab moves on to it.
 */
export function LibraryDetail({
  item,
  autoPlay = false,
  onEnded,
  upNext = null,
}: {
  item: LibraryItem | null;
  autoPlay?: boolean;
  onEnded?: () => void;
  upNext?: LibraryItem | null;
}) {
  const host = useLibraryHost();
  const { clearProgress } = useLibraryMutations();
  const Player = host.Player ?? LibraryPlayer;
  // The tab keys this pane by item (and by each Play all), so a new item starts from `autoPlay`.
  const [playing, setPlaying] = useState(autoPlay);

  const itemId = item?.id ?? null;
  const saver = useMemo(
    () => (itemId ? createProgressSaver(itemId, writeProgress) : null),
    [itemId],
  );

  if (!item) {
    return (
      <EmptyState
        icon={LuLibrary}
        title="Nothing selected"
        body="Pick a film, an episode, a track or a photo."
      />
    );
  }

  const resumeAt = libraryResumeAt(item.progress);
  const src = libraryFileUrl({ rootId: item.rootId, path: item.path });

  return (
    <div
      className="flex h-full flex-col gap-3 overflow-auto p-3"
      aria-label={`${item.title} details`}
    >
      {item.kind === 'photo' ? (
        <img
          src={src}
          alt={item.title}
          className="w-full rounded-md border border-border object-contain"
        />
      ) : playing ? (
        <Player
          item={item}
          src={src}
          resumeAt={resumeAt}
          autoPlay={autoPlay}
          onProgress={(positionS, durationS, state) => {
            saver?.(positionS, durationS, state === 'ended', state !== 'playing');
            if (state === 'ended') onEnded?.();
          }}
        />
      ) : item.art ? (
        <img
          src={libraryFileUrl(item.art)}
          alt=""
          className="w-full rounded-md border border-border object-cover"
        />
      ) : null}

      <div>
        <h3 className="text-sm font-semibold">{item.title}</h3>
        {itemSubtitle(item) ? (
          <p className="text-xs text-muted-foreground">{itemSubtitle(item)}</p>
        ) : null}
      </div>

      {isPlayable(item) && !playing ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="rounded-md border border-primary/60 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
          >
            {resumeAt > 0 ? `Resume from ${formatClock(resumeAt)}` : 'Play'}
          </button>
          {item.progress ? (
            <button
              type="button"
              onClick={() => clearProgress.mutate(item.id)}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              {item.progress.finished ? 'Mark unwatched' : 'Start over'}
            </button>
          ) : null}
        </div>
      ) : null}

      {upNext ? (
        <p className="text-[11px] text-muted-foreground">
          Up next: <span className="text-foreground">{upNext.title}</span>
        </p>
      ) : null}

      {isPlayable(item) ? <AddToPlaylist item={item} /> : null}

      {item.plot ? <p className="text-xs leading-relaxed text-foreground/90">{item.plot}</p> : null}

      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted-foreground">File</dt>
        <dd className="min-w-0 break-all">{item.path}</dd>
        <dt className="text-muted-foreground">Details</dt>
        <dd>{item.source === 'online' ? 'From the folder, and TMDB' : 'From the folder'}</dd>
      </dl>
    </div>
  );
}
