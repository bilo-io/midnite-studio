import { useMemo, useState } from 'react';

import { CHAT_DATE_BUCKETS, CHAT_DATE_BUCKET_LABEL, type ChatSummary } from '@midnite/studio-shared';
import { LuBot, LuCalendar, LuFileDiff, LuFolderGit2, LuMessageSquarePlus, LuPencil, LuPin, LuPinOff, LuTrash2 } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { ExplorerGroup, ExplorerNotice, ExplorerSearch } from '../../components/explorer';
import { IconButton } from '../../components/icon-button';
import { MultiSelectMenu, type MultiSelectOption } from '../../components/multi-select-menu';
import { PageDetachMark } from '../../components/page-detach-mark';
import { StateDot } from '../../components/state-dot';
import { Tooltip } from '../../components/tooltip';
import { relativeAge } from '../sessions/session-order';
import {
  EMPTY_FILTERS,
  NO_REPO,
  filterChats,
  groupChats,
  hasActiveFilters,
  type ChatFilters,
  type PinnedFacet,
} from './chats-filter';
import { useLoopingTypewriter } from './use-looping-typewriter';
import type { ChatEngine } from './use-chat-engines';

/**
 * The left explorer — the Sessions page's list, for chats: the same kinds of
 * filters (engine ≈ provider, repository, date, pinned), the same search box,
 * the same repo-grouped, collapsible, sticky-headed list, built from the same
 * `ExplorerSearch`/`ExplorerGroup`/`MultiSelectMenu` pieces. Pinned chats sit in
 * their own group on top. A row's hover actions are pin, rename and delete.
 */

const PINNED_OPTIONS: MultiSelectOption[] = [
  { value: 'pinned', label: 'Pinned' },
  { value: 'unpinned', label: 'Not pinned' },
];

const DATE_OPTIONS: MultiSelectOption[] = CHAT_DATE_BUCKETS.map((b) => ({ value: b, label: CHAT_DATE_BUCKET_LABEL[b] }));

const ROW_HEIGHT = 'h-8';

export function ChatsExplorer({
  chats,
  status,
  engines,
  selectedId,
  filters,
  onFiltersChange,
  onSelect,
  onNew,
  onRename,
  onPin,
  onDelete,
}: {
  chats: readonly ChatSummary[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  engines: readonly ChatEngine[];
  selectedId: string | null;
  filters: ChatFilters;
  onFiltersChange: (next: ChatFilters) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (chat: ChatSummary, title: string) => void;
  onPin: (chat: ChatSummary, pinned: boolean) => void;
  onDelete: (chat: ChatSummary) => void;
}) {
  const dialogs = useDialogs();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const now = Date.now();
  const loadingText = useLoopingTypewriter('Loading chats…');

  const visible = useMemo(() => filterChats(chats, filters, now), [chats, filters, now]);
  const groups = useMemo(() => groupChats(visible), [visible]);

  const engineMeta = (id: string) => engines.find((e) => e.id === id);

  const engineOptions = useMemo<MultiSelectOption[]>(() => {
    const counts = new Map<string, number>();
    for (const c of chats) counts.set(c.engine, (counts.get(c.engine) ?? 0) + 1);
    return [...counts.keys()]
      .sort((a, b) => (engineMeta(a)?.label ?? a).localeCompare(engineMeta(b)?.label ?? b))
      .map((id) => {
        const meta = engineMeta(id);
        const Icon = meta?.icon ?? LuBot;
        return {
          value: id,
          label: meta?.label ?? id,
          icon: <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" {...(meta?.accent ? { style: { color: meta.accent } } : {})} />,
          meta: <span className="tabular-nums text-[10px] text-muted-foreground">{counts.get(id)}</span>,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, engines]);

  const repoOptions = useMemo<MultiSelectOption[]>(() => {
    const repos = new Map<string, { label: string; count: number }>();
    for (const c of chats) {
      const key = c.repoId ?? NO_REPO;
      const entry = repos.get(key) ?? { label: c.repoName ?? 'No repository', count: 0 };
      entry.count += 1;
      repos.set(key, entry);
    }
    return [...repos.entries()]
      .sort(([, a], [, b]) => a.label.localeCompare(b.label))
      .map(([value, { label, count }]) => ({
        value,
        label,
        icon: <LuFolderGit2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
        meta: <span className="tabular-nums text-[10px] text-muted-foreground">{count}</span>,
      }));
  }, [chats]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const rename = (chat: ChatSummary) =>
    dialogs.prompt({
      title: 'Rename chat',
      label: 'Title',
      initialValue: chat.title,
      confirmLabel: 'Rename',
      onConfirm: (title) => onRename(chat, title),
    });

  const remove = (chat: ChatSummary) =>
    dialogs.confirm({
      title: `Delete "${chat.title}"?`,
      confirmLabel: 'Delete',
      danger: true,
      blastRadius: null,
      warnings: [
        'The conversation is deleted from disk. This cannot be undone.',
        ...(chat.worktree
          ? [
              `Its worktree ${chat.worktree.path} is removed, with any edits there you have not accepted or committed.`,
              `Its branch ${chat.worktree.branch} is deleted only if it has no commits of its own — otherwise it is kept.`,
            ]
          : chat.pendingChanges
            ? ['Changes from this chat that you have not accepted will be lost.']
            : []),
        ...(chat.running ? ['It is still answering — that will be stopped.'] : []),
      ],
      onConfirm: () => onDelete(chat),
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="chats-explorer">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-1.5 py-1">
        <PageDetachMark role="chats" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chats</h2>
        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70" data-testid="chats-count">
          {visible.length}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton icon={LuMessageSquarePlus} label="New chat" size="sm" onClick={onNew} />
        </div>
      </div>

      {chats.length > 0 ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-1.5 py-1">
            <MultiSelectMenu
              options={engineOptions}
              selected={filters.engines}
              onChange={(engines) => onFiltersChange({ ...filters, engines })}
              icon={<LuBot aria-hidden className="h-3.5 w-3.5 shrink-0" />}
              allLabel="All engines"
              searchPlaceholder="Filter engines…"
              emptyLabel="No engine matches."
              label="Filter chats by engine"
              summarise={(n) => `${n} engines`}
            />
            <MultiSelectMenu
              options={repoOptions}
              selected={filters.repos}
              onChange={(repos) => onFiltersChange({ ...filters, repos })}
              icon={<LuFolderGit2 aria-hidden className="h-3.5 w-3.5 shrink-0" />}
              allLabel="All repos"
              searchPlaceholder="Filter repositories…"
              emptyLabel="No repository matches."
              label="Filter chats by repository"
              summarise={(n) => `${n} repos`}
            />
            <MultiSelectMenu
              options={DATE_OPTIONS}
              selected={filters.dates}
              onChange={(dates) => onFiltersChange({ ...filters, dates: dates as ChatFilters['dates'] })}
              icon={<LuCalendar aria-hidden className="h-3.5 w-3.5 shrink-0" />}
              allLabel="Any time"
              searchPlaceholder="Filter dates…"
              emptyLabel="No date matches."
              label="Filter chats by date"
              summarise={(n) => `${n} periods`}
            />
            <MultiSelectMenu
              options={PINNED_OPTIONS}
              selected={filters.pinned}
              onChange={(pinned) => onFiltersChange({ ...filters, pinned: pinned as PinnedFacet[] })}
              icon={<LuPin aria-hidden className="h-3.5 w-3.5 shrink-0" />}
              allLabel="All chats"
              searchPlaceholder="Filter…"
              emptyLabel="No match."
              label="Filter chats by pinned"
              summarise={(n) => `${n} kinds`}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
            <ExplorerSearch
              value={filters.query}
              onChange={(query) => onFiltersChange({ ...filters, query })}
              placeholder="Search chats…"
              ariaLabel="Search chats by title, last message or repository"
              clearLabel="Clear the chat search"
            />
          </div>
        </>
      ) : null}

      {status === 'error' ? (
        <ExplorerNotice tone="destructive">The chats could not be loaded.</ExplorerNotice>
      ) : status === 'idle' || status === 'loading' ? (
        <div className="p-3 text-xs text-muted-foreground" data-testid="chats-loading">
          {loadingText}
        </div>
      ) : chats.length === 0 ? (
        <EmptyState icon={LuMessageSquarePlus} title="No chats yet" body="Start one — it is saved here, and you can come back to it any time." />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground" data-testid="chats-no-match">
          <p>No chat matches these filters.</p>
          {hasActiveFilters(filters) ? (
            <button type="button" onClick={() => onFiltersChange(EMPTY_FILTERS)} className="rounded-md px-2 py-1 text-xs text-primary hover:bg-accent">
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div role="list" aria-label="Chats" className="hide-scrollbar min-h-0 flex-1 overflow-auto">
          {groups.map((group) => (
            <ExplorerGroup
              key={group.key}
              title={group.label}
              count={group.chats.length}
              open={!collapsed.has(group.key)}
              onToggle={() => toggle(group.key)}
              bodyId={`chats-group-${group.key}`}
              leading={
                group.kind === 'pinned' ? (
                  <LuPin aria-hidden className="h-3 w-3 shrink-0" />
                ) : group.kind === 'repo' ? (
                  <LuFolderGit2 aria-hidden className="h-3 w-3 shrink-0" />
                ) : undefined
              }
            >
              {group.chats.map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  engine={engineMeta(chat.engine)}
                  selected={chat.id === selectedId}
                  now={now}
                  onSelect={() => onSelect(chat.id)}
                  onRename={() => rename(chat)}
                  onPin={() => onPin(chat, !chat.pinned)}
                  onDelete={() => remove(chat)}
                />
              ))}
            </ExplorerGroup>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatRow({
  chat,
  engine,
  selected,
  now,
  onSelect,
  onRename,
  onPin,
  onDelete,
}: {
  chat: ChatSummary;
  engine: ChatEngine | undefined;
  selected: boolean;
  now: number;
  onSelect: () => void;
  onRename: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const Icon = engine?.icon ?? LuBot;
  return (
    <div
      role="listitem"
      data-testid="chat-row"
      data-chat-id={chat.id}
      data-selected={selected || undefined}
      className={`group flex ${ROW_HEIGHT} items-center gap-2 border-l-2 px-2 text-left text-xs transition-colors ${
        selected ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/60'
      }`}
    >
      <button type="button" onClick={onSelect} aria-current={selected ? 'true' : undefined} title={chat.preview || chat.title} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <Icon aria-hidden className={`h-3.5 w-3.5 shrink-0 ${engine?.accent ? '' : 'text-muted-foreground'}`} {...(engine?.accent ? { style: { color: engine.accent } } : {})} />
        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
        {chat.running ? (
          <Tooltip label="Answering…">
            <span tabIndex={0} aria-label="Answering" className="shrink-0 rounded-full outline-none">
              <StateDot state="open" />
            </span>
          </Tooltip>
        ) : null}
        {chat.pendingChanges ? (
          <Tooltip label="Changes waiting for your review">
            <span tabIndex={0} aria-label="Changes waiting for review" data-testid="chat-row-pending" className="shrink-0 rounded outline-none">
              <LuFileDiff aria-hidden className="h-3 w-3 text-amber-500" />
            </span>
          </Tooltip>
        ) : null}
        <span className="shrink-0 text-[11px] text-muted-foreground">{relativeAge(chat.updatedAt, now)}</span>
      </button>
      <IconButton
        icon={chat.pinned ? LuPinOff : LuPin}
        label={chat.pinned ? 'Unpin chat' : 'Pin chat'}
        size="sm"
        className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={onPin}
      />
      <IconButton icon={LuPencil} label="Rename chat" size="sm" className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" onClick={onRename} />
      <IconButton icon={LuTrash2} label="Delete chat" size="sm" className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" onClick={onDelete} />
    </div>
  );
}
