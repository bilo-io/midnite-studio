import {
  ANIMATION_LICENCE_LABELS,
  SKETCHFAB_LICENCES,
  SKETCHFAB_TOKEN_URL,
  type AnimationClip,
  type SketchfabLicence,
  type SketchfabResult,
} from '@midnite/studio-shared';
import { useMemo, useState, type FormEvent } from 'react';
import { LuCircleAlert, LuDownload, LuExternalLink, LuKey, LuLoader, LuLock, LuSearch, LuX } from 'react-icons/lu';

import { bridge, EmptyState } from '@midnite/studio-frame';

import { canSetSketchfabToken, useSetSketchfabToken, useSketchfabDownload, useSketchfabSearch, useSketchfabStatus } from './use-sketchfab';

/** Opens Sketchfab's token page in the system browser (the guarded `shell.openExternal`). */
const openTokenPage = () => void bridge()?.shell.openExternal({ url: SKETCHFAB_TOKEN_URL });
const openModel = (url: string) => void bridge()?.shell.openExternal({ url });

/** The uid a clip's `originalUrl` ends with, when it came from Sketchfab. */
const uidOf = (clip: AnimationClip): string | null => (clip.source === 'sketchfab' ? (/[a-f0-9]{32}$/.exec(clip.originalUrl ?? '')?.[0] ?? null) : null);

/**
 * Phase 125 Theme E: search Sketchfab's official API for animated, downloadable models and add one to the
 * library. BYOK — every user pastes their own Sketchfab API token; until one is set this shows how to get it.
 * The token goes to main's vault and is never read back here.
 */
export function SketchfabPanel({ clips }: { clips: readonly AnimationClip[] }) {
  const status = useSketchfabStatus();
  if (status.isLoading) return <p className="p-4 text-xs text-muted-foreground">Checking for your Sketchfab token…</p>;
  if (!status.data?.hasToken) return <TokenPrompt />;
  return <SketchfabSearch clips={clips} />;
}

/** The state shown when no token is set: what it is, where to get one, and a write-only field. */
export function TokenPrompt() {
  const set = useSetSketchfabToken();
  const [value, setValue] = useState('');
  const canSet = canSetSketchfabToken();
  const save = () => {
    const trimmed = value.trim();
    if (trimmed) set.mutate(trimmed, { onSuccess: () => setValue('') });
  };
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-6 text-xs" data-testid="sketchfab-token-prompt">
      <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
        <LuKey aria-hidden className="size-4" /> Add your Sketchfab token
      </h3>
      <p className="text-muted-foreground">
        Searching and downloading uses Sketchfab&apos;s official API with your own API token. It is free from your Sketchfab account settings. The token is kept in the app&apos;s encrypted vault and is only ever sent to
        api.sketchfab.com.
      </p>
      <button type="button" onClick={openTokenPage} className="inline-flex w-fit items-center gap-1 text-primary hover:underline">
        Get a token on Sketchfab <LuExternalLink aria-hidden className="size-3" />
      </button>
      {canSet ? (
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-1.5">
          <LuLock aria-hidden className="size-3.5 text-muted-foreground" />
          <input
            type="password"
            aria-label="Sketchfab API token"
            value={value}
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
            }}
            placeholder="Paste a Sketchfab API token"
            className="h-5 flex-1 bg-transparent placeholder:text-muted-foreground/70 focus-visible:outline-none"
          />
          <button type="button" onClick={save} disabled={value.trim().length === 0 || set.isPending} className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent disabled:opacity-50">
            Save
          </button>
        </div>
      ) : (
        <p className="text-muted-foreground">Add the token in Midnite Studio (Settings ▸ Media ▸ Animations) or in Vault, then grant it to this app.</p>
      )}
    </div>
  );
}

function SketchfabSearch({ clips }: { clips: readonly AnimationClip[] }) {
  const [text, setText] = useState('');
  const [licences, setLicences] = useState<readonly SketchfabLicence[]>(['cc0', 'cc-by', 'cc-by-sa']);
  const [submitted, setSubmitted] = useState<{ q: string; licences: readonly SketchfabLicence[] } | null>(null);
  const search = useSketchfabSearch(submitted);
  const { download, cancel, busy } = useSketchfabDownload();
  const results = useMemo(() => search.data?.pages.flatMap((page) => page.results) ?? [], [search.data]);
  const owned = useMemo(() => new Set(clips.flatMap((clip) => uidOf(clip) ?? [])), [clips]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (licences.length > 0) setSubmitted({ q: text.trim(), licences });
  };
  const toggle = (id: SketchfabLicence) => setLicences((current) => (current.includes(id) ? current.filter((l) => l !== id) : [...current, id]));

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="sketchfab-panel">
      <form onSubmit={submit} className="flex flex-col gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="search"
            aria-label="Search Sketchfab"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search animated models — walk, sword, dance…"
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
          <button type="submit" disabled={licences.length === 0} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-accent disabled:opacity-50">
            <LuSearch aria-hidden className="size-3.5" /> Search
          </button>
        </div>
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <legend className="sr-only">Licences to include</legend>
          <span>Licences</span>
          {SKETCHFAB_LICENCES.map((id) => (
            <label key={id} className="inline-flex items-center gap-1">
              <input type="checkbox" checked={licences.includes(id)} onChange={() => toggle(id)} />
              {ANIMATION_LICENCE_LABELS[id]}
            </label>
          ))}
        </fieldset>
        {licences.includes('cc-by-nc') ? <p className="text-[11px] text-muted-foreground">CC BY-NC clips cannot be used in a commercial game.</p> : null}
      </form>

      {submitted === null ? (
        <EmptyState icon={LuSearch} title="Search Sketchfab" body="Finds animated models that allow download, in the licences you tick. Each one lands in your library with its author and licence." bodySize="xs" />
      ) : search.isPending ? (
        <p className="p-4 text-xs text-muted-foreground" role="status">
          Searching Sketchfab…
        </p>
      ) : search.isError ? (
        <EmptyState icon={LuCircleAlert} title="Sketchfab search failed" body={search.error instanceof Error ? search.error.message : undefined} bodySize="xs" />
      ) : results.length === 0 ? (
        <EmptyState title="No models found" body="Try other words, or tick more licences." bodySize="xs" />
      ) : (
        <ul aria-label="Sketchfab results" className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
          {results.map((result) => (
            <ResultRow key={result.uid} result={result} owned={owned.has(result.uid)} busy={busy.has(result.uid)} onDownload={() => download(result.uid)} onCancel={() => cancel(result.uid)} />
          ))}
          {search.hasNextPage ? (
            <li className="p-2 text-center">
              <button type="button" onClick={() => void search.fetchNextPage()} disabled={search.isFetchingNextPage} className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50">
                {search.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function ResultRow({ result, owned, busy, onDownload, onCancel }: { result: SketchfabResult; owned: boolean; busy: boolean; onDownload: () => void; onCancel: () => void }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      {result.thumbnailUrl ? (
        <img src={result.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-20 shrink-0 rounded object-cover" />
      ) : (
        <span aria-hidden className="h-12 w-20 shrink-0 rounded bg-muted" />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-xs font-medium">{result.name}</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {result.author || 'Unknown author'} · {ANIMATION_LICENCE_LABELS[result.licence]}
          {result.animationCount !== undefined ? ` · ${result.animationCount} animation${result.animationCount === 1 ? '' : 's'}` : ''}
          {result.faceCount !== undefined ? ` · ${result.faceCount.toLocaleString()} faces` : ''}
        </span>
      </span>
      <button type="button" aria-label={`Open ${result.name} on Sketchfab`} onClick={() => openModel(result.viewUrl)} className="rounded p-1 text-muted-foreground hover:text-foreground">
        <LuExternalLink aria-hidden className="size-3.5" />
      </button>
      {owned ? (
        <span className="w-24 text-right text-[11px] text-muted-foreground">In library</span>
      ) : busy ? (
        <button type="button" onClick={onCancel} aria-label={`Cancel download of ${result.name}`} className="inline-flex w-24 items-center justify-end gap-1 text-[11px] text-muted-foreground hover:text-destructive">
          <LuLoader aria-hidden className="size-3.5 animate-spin" /> Cancel <LuX aria-hidden className="size-3" />
        </button>
      ) : (
        <button type="button" onClick={onDownload} aria-label={`Download ${result.name}`} className="inline-flex w-24 items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent">
          <LuDownload aria-hidden className="size-3.5" /> Download
        </button>
      )}
    </li>
  );
}
