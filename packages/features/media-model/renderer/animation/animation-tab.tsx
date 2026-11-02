import {
  ANIMATION_LICENCES,
  ANIMATION_LICENCE_LABELS,
  ANIMATION_SOURCES,
  ANIMATION_SOURCE_LABELS,
  formatAnimationDuration,
  type AnimationClip,
  type AnimationImportResult,
  type AnimationLicence,
  type AnimationProgressEvent,
  type AnimationSource,
} from '@midnite/studio-shared';
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { LuCircleAlert, LuFileInput, LuFolderInput, LuFootprints, LuTrash2, LuX } from 'react-icons/lu';

import { EmptyState, EmptyStateButton, FilterInput, SelectField, useFrameChrome, useMediaKit } from '@midnite/studio-frame';

import {
  CLIP_SORT_LABELS,
  CLIP_SORTS,
  DEFAULT_CLIP_FILTER,
  filterClips,
  formatBytes,
  importSummaryLine,
  sourceCounts,
  tagCounts,
  withTag,
  type ClipFilter,
  type ClipSort,
} from './animation-model';
import { useAnimationClips, useAnimationEvents, useAnimationMutations } from './use-animations';

/**
 * Media ▸ Animations (Phase 125 Themes A–C): the library of animation clips, global to the machine.
 *
 * - **Explorer**: the sources and tags of what is in the library, with counts — click to filter.
 * - **Content**: the clips as a searchable, sortable list; a drop zone for FBX / GLB / glTF / BVH files and
 *   folders, with an import summary under the toolbar.
 * - **Detail**: the selected clip's name, tags and provenance (source, licence, author, original URL, hash).
 *
 * Not repo-scoped: the library lives under the app's data directory, shared by every repo.
 */
export function AnimationTab() {
  const { MediaLayout } = useMediaKit();
  const clips = useAnimationClips();
  const progress = useAnimationEvents();
  const mutations = useAnimationMutations();
  const [filter, setFilter] = useState<ClipFilter>(DEFAULT_CLIP_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const all = useMemo(() => clips.data ?? [], [clips.data]);
  const visible = useMemo(() => filterClips(all, filter), [all, filter]);
  const selected = all.find((clip) => clip.id === selectedId) ?? null;
  const hasClips = all.length > 0;

  const patch = (next: Partial<ClipFilter>) => setFilter((current) => ({ ...current, ...next }));
  const toggleTag = (tag: string) => patch({ tags: filter.tags.includes(tag) ? filter.tags.filter((t) => t !== tag) : [...filter.tags, tag] });

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void mutations.drop(event.dataTransfer);
  };

  return (
    <MediaLayout
      tab="animation"
      explorerName="filters"
      detailName="details"
      explorerLabel="Resize filters"
      detailLabel="Resize details"
      toolbar={
        <AnimationToolbar
          filter={filter}
          onFilter={patch}
          importing={mutations.importing}
          onImportFiles={() => mutations.importFiles.mutate()}
          onImportFolder={() => mutations.importFolder.mutate()}
        />
      }
      explorer={<AnimationExplorer clips={all} filter={filter} onSource={(source) => patch({ source })} onToggleTag={toggleTag} onClearTags={() => patch({ tags: [] })} />}
      content={
        <div
          className={`relative flex h-full min-h-0 flex-col ${dragging ? 'ring-2 ring-inset ring-primary/60' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={onDrop}
          data-testid="animation-dropzone"
        >
          <ImportStatus progress={progress} summary={mutations.summary} onDismiss={mutations.clearSummary} />
          {clips.isError ? (
            <EmptyState icon={LuCircleAlert} title="The animation library could not be read" body={clips.error instanceof Error ? clips.error.message : undefined} />
          ) : !clips.isLoading && !hasClips ? (
            <EmptyState
              icon={LuFootprints}
              title="Your animation library is empty"
              body="Import a folder of Mixamo FBX files (with or without skin), or GLB, glTF and BVH clips. They are copied into one library shared by every project. Or drop files here."
              action={
                <div className="flex gap-2">
                  <EmptyStateButton icon={LuFolderInput} label="Import a folder…" onClick={() => mutations.importFolder.mutate()} disabled={mutations.importing} />
                  <EmptyStateButton icon={LuFileInput} label="Import files…" onClick={() => mutations.importFiles.mutate()} disabled={mutations.importing} />
                </div>
              }
            />
          ) : (
            <ClipList clips={visible} total={all.length} selectedId={selectedId} onSelect={setSelectedId} loading={clips.isLoading} />
          )}
          {dragging ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-medium" aria-hidden>
              Drop animation files or folders to import
            </div>
          ) : null}
        </div>
      }
      detail={
        selected ? (
          <ClipDetail key={selected.id} clip={selected} onUpdate={(patchValue) => mutations.update.mutate({ id: selected.id, patch: patchValue })} onRemove={() => mutations.remove.mutate(selected.id, { onSuccess: () => setSelectedId(null) })} />
        ) : (
          <EmptyState icon={LuFootprints} title="Select a clip" body="Its tags, source, licence and original link show here." />
        )
      }
    />
  );
}

function AnimationToolbar({
  filter,
  onFilter,
  importing,
  onImportFiles,
  onImportFolder,
}: {
  filter: ClipFilter;
  onFilter: (next: Partial<ClipFilter>) => void;
  importing: boolean;
  onImportFiles: () => void;
  onImportFolder: () => void;
}) {
  const { IconButton } = useFrameChrome();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="w-64 min-w-0">
        <FilterInput value={filter.query} onChange={(query) => onFilter({ query })} placeholder="Search name, tag, author…" />
      </div>
      <div className="w-36">
        <SelectField<ClipSort>
          label="Sort clips"
          value={filter.sort}
          onChange={(sort) => onFilter({ sort })}
          options={CLIP_SORTS.map((sort) => ({ value: sort, label: CLIP_SORT_LABELS[sort] }))}
        />
      </div>
      <span className="flex-1" />
      <IconButton icon={LuFolderInput} label="Import a folder of clips" busy={importing} onClick={onImportFolder} />
      <IconButton icon={LuFileInput} label="Import clip files" busy={importing} onClick={onImportFiles} />
    </div>
  );
}

function AnimationExplorer({
  clips,
  filter,
  onSource,
  onToggleTag,
  onClearTags,
}: {
  clips: readonly AnimationClip[];
  filter: ClipFilter;
  onSource: (source: AnimationSource | 'all') => void;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}) {
  const { Accordion } = useMediaKit();
  const sources = useMemo(() => sourceCounts(clips), [clips]);
  const tags = useMemo(() => tagCounts(clips), [clips]);
  const row = (active: boolean) => `flex w-full items-center gap-2 px-3 py-1 text-left text-xs transition-colors hover:bg-primary/10 ${active ? 'bg-accent text-foreground' : 'text-foreground/90'}`;

  return (
    <Accordion
      id="media-animation"
      tone="primary"
      sections={[
        {
          id: 'sources',
          title: 'Source',
          count: sources.length,
          children: (
            <ul className="py-1" aria-label="Filter by source">
              <li>
                <button type="button" aria-pressed={filter.source === 'all'} onClick={() => onSource('all')} className={row(filter.source === 'all')}>
                  <span className="flex-1">All sources</span>
                  <span className="text-[10px] text-muted-foreground">{clips.length}</span>
                </button>
              </li>
              {sources.map(({ source, count }) => (
                <li key={source}>
                  <button type="button" aria-pressed={filter.source === source} onClick={() => onSource(source)} className={row(filter.source === source)}>
                    <span className="flex-1">{ANIMATION_SOURCE_LABELS[source]}</span>
                    <span className="text-[10px] text-muted-foreground">{count}</span>
                  </button>
                </li>
              ))}
            </ul>
          ),
        },
        {
          id: 'tags',
          title: 'Tags',
          count: tags.length,
          actions:
            filter.tags.length > 0 ? (
              <button type="button" onClick={onClearTags} className="px-1 text-[10px] text-muted-foreground hover:text-foreground">
                Clear
              </button>
            ) : undefined,
          children:
            tags.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">No tags yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-1 px-3 py-2" aria-label="Filter by tag">
                {tags.map(({ tag, count }) => {
                  const active = filter.tags.includes(tag);
                  return (
                    <li key={tag}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => onToggleTag(tag)}
                        className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${active ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:bg-primary/10'}`}
                      >
                        {tag} <span className="opacity-70">{count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ),
        },
      ]}
    />
  );
}

function ImportStatus({ progress, summary, onDismiss }: { progress: AnimationProgressEvent | null; summary: AnimationImportResult | null; onDismiss: () => void }) {
  if (progress) {
    return (
      <p role="status" className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        Importing {progress.done + 1} of {progress.total}
        {progress.current ? ` — ${progress.current}` : '…'}
      </p>
    );
  }
  if (!summary) return null;
  const problems = summary.failed.length + summary.warnings.length;
  return (
    <div role="status" className="border-b border-border px-3 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="flex-1">{importSummaryLine(summary)}</span>
        <button type="button" aria-label="Dismiss import summary" onClick={onDismiss} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
          <LuX aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
      {problems > 0 ? (
        <details className="mt-1 text-muted-foreground">
          <summary className="cursor-pointer">{problems} to look at</summary>
          <ul className="mt-1 space-y-0.5">
            {summary.failed.map((f, i) => (
              <li key={`f${i}`}>
                <span className="font-medium text-foreground">{f.name}</span> — {f.reason}
              </li>
            ))}
            {summary.warnings.map((w, i) => (
              <li key={`w${i}`}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ClipList({ clips, total, selectedId, onSelect, loading }: { clips: readonly AnimationClip[]; total: number; selectedId: string | null; onSelect: (id: string) => void; loading: boolean }) {
  const listRef = useRef<HTMLUListElement>(null);

  // Arrow keys move the selection through the visible rows; the row takes focus so the move is announced.
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const at = clips.findIndex((clip) => clip.id === selectedId);
    const next = clips[Math.min(clips.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    onSelect(next.id);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-clip-id="${next.id}"]`)?.focus());
  };

  if (loading) return <p className="p-4 text-xs text-muted-foreground">Loading the library…</p>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="px-3 py-1 text-[11px] text-muted-foreground" aria-live="polite">
        {clips.length} of {total} clip{total === 1 ? '' : 's'}
      </p>
      {clips.length === 0 ? (
        <EmptyState title="No clips match" body="Clear the search or a filter to see more." bodySize="xs" />
      ) : (
        <ul ref={listRef} aria-label="Animation clips" onKeyDown={onKeyDown} className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
          {clips.map((clip) => {
            const active = clip.id === selectedId;
            return (
              <li key={clip.id}>
                <button
                  type="button"
                  data-clip-id={clip.id}
                  aria-current={active || undefined}
                  onClick={() => onSelect(clip.id)}
                  className={`flex w-full flex-col gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-primary/10 ${active ? 'bg-accent' : ''}`}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{clip.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{formatAnimationDuration(clip.durationSec)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="rounded bg-muted px-1 py-px">{ANIMATION_SOURCE_LABELS[clip.source]}</span>
                    <span className="uppercase">{clip.format}</span>
                    {clip.hasSkin ? <span>skin</span> : null}
                    {clip.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-border px-1.5">
                        {tag}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ClipDetail({ clip, onUpdate, onRemove }: { clip: AnimationClip; onUpdate: (patch: { name?: string; tags?: string[]; licence?: AnimationLicence; author?: string; source?: AnimationSource }) => void; onRemove: () => void }) {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const [name, setName] = useState(clip.name);
  const [author, setAuthor] = useState(clip.author);
  const [newTag, setNewTag] = useState('');
  useEffect(() => {
    setName(clip.name);
    setAuthor(clip.author);
  }, [clip.name, clip.author]);

  const commitName = () => {
    const next = name.trim();
    if (next === '') setName(clip.name);
    else if (next !== clip.name) onUpdate({ name: next });
  };
  const addTag = () => {
    const tags = withTag(clip.tags, newTag);
    setNewTag('');
    if (tags.length !== clip.tags.length) onUpdate({ tags });
  };
  const remove = () =>
    dialogs.confirm({
      title: `Remove “${clip.name}” from the library?`,
      body: 'The clip and its file in the animation library are deleted. Games that already imported it keep their own copy.',
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: onRemove,
    });

  const stats: [string, string][] = [
    ['Duration', formatAnimationDuration(clip.durationSec)],
    ['Frames', clip.frameCount !== undefined ? String(clip.frameCount) : '—'],
    ['Frame rate', clip.fps !== undefined ? `${clip.fps} fps` : '—'],
    ['Bones', clip.boneCount !== undefined ? String(clip.boneCount) : '—'],
    ['Skin', clip.hasSkin ? 'With mesh and skin' : 'Motion only'],
    ['Format', clip.format.toUpperCase()],
    ['Size', formatBytes(clip.sizeBytes)],
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 text-xs" aria-label={`Details for ${clip.name}`}>
      <input
        aria-label="Clip name"
        value={name}
        maxLength={120}
        onChange={(event) => setName(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setName(clip.name);
        }}
        className="rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold hover:border-border focus:border-border focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <section aria-label="Tags" className="space-y-1.5">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tags</h3>
        <ul className="flex flex-wrap gap-1">
          {clip.tags.map((tag) => (
            <li key={tag} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
              {tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onUpdate({ tags: clip.tags.filter((t) => t !== tag) })} className="text-muted-foreground hover:text-foreground">
                <LuX aria-hidden className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
        <input
          aria-label="Add a tag"
          value={newTag}
          placeholder="Add a tag, press Enter"
          onChange={(event) => setNewTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addTag();
            }
          }}
          className="w-full rounded border border-input bg-background px-1.5 py-1 outline-none focus:ring-1 focus:ring-ring"
        />
      </section>

      <section aria-label="Clip data">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {stats.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Provenance" className="space-y-1.5">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Provenance</h3>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Source</span>
          <SelectField<AnimationSource> label="Source" value={clip.source} onChange={(source) => onUpdate({ source })} options={ANIMATION_SOURCES.map((s) => ({ value: s, label: ANIMATION_SOURCE_LABELS[s] }))} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Licence</span>
          <SelectField<AnimationLicence> label="Licence" value={clip.licence} onChange={(licence) => onUpdate({ licence })} options={ANIMATION_LICENCES.map((l) => ({ value: l, label: ANIMATION_LICENCE_LABELS[l] }))} />
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Author</span>
          <input
            aria-label="Author"
            value={author}
            maxLength={120}
            onChange={(event) => setAuthor(event.target.value)}
            onBlur={() => author !== clip.author && onUpdate({ author })}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            className="rounded border border-input bg-background px-1.5 py-1 outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        {clip.site ? (
          <p>
            <span className="text-muted-foreground">Site </span>
            {clip.site}
          </p>
        ) : null}
        {clip.originalUrl ? (
          <p className="break-all">
            <span className="text-muted-foreground">Original </span>
            <a href={clip.originalUrl} target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-2 hover:underline">
              {clip.originalUrl}
            </a>
          </p>
        ) : null}
        <p className="break-all font-mono text-[10px] text-muted-foreground" title={clip.sha256}>
          sha256 {clip.sha256}
        </p>
        <p className="break-all font-mono text-[10px] text-muted-foreground">{clip.file}</p>
      </section>

      <button type="button" onClick={remove} className="mt-auto flex items-center justify-center gap-1.5 rounded border border-destructive/40 px-2 py-1.5 text-destructive hover:bg-destructive/10">
        <LuTrash2 aria-hidden className="h-3.5 w-3.5" />
        Remove from library
      </button>
    </div>
  );
}
