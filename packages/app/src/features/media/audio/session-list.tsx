import { useState } from 'react';
import { LuAudioLines, LuChevronDown, LuPause, LuPlay } from 'react-icons/lu';

import { EmptyState } from '../../../components/empty-state';
import { currentTrack, usePlayer, type PlayerTrack } from './player-store';
import { useWaveform, type AudioSessionView, type AudioVariant } from './use-audio';
import { formatDuration, playedBarCount } from './waveform';

export function variantTitle(variant: AudioVariant): string {
  return variant.sidecar?.title || variant.path.replace(/\.[^.]+$/, '');
}

export function toTrack(variant: AudioVariant): PlayerTrack {
  return { key: variant.key, title: variantTitle(variant), url: variant.url, project: variant.project, path: variant.path };
}

/**
 * Media ▸ Audio's centre (Phase 99 Theme E): the project's prompt history, one
 * card per create or import, newest first. Each card lists its variants with
 * a waveform thumbnail and a play button; the queue a play starts is every
 * variant in the project, in the order shown.
 */
export function SessionList({
  repoId,
  sessions,
  loading,
  selectedKey,
  onSelect,
}: {
  repoId: string;
  sessions: readonly AudioSessionView[];
  loading: boolean;
  selectedKey: string | null;
  onSelect: (variant: AudioVariant) => void;
}) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={LuAudioLines}
        title={loading ? 'Loading…' : 'No audio yet'}
        body={loading ? '' : 'Fill in the prompt on the right, then Import audio… to attach files as variants.'}
      />
    );
  }
  const queue = sessions.flatMap((s) => s.variants.map(toTrack));

  return (
    <div className="hide-scrollbar flex h-full min-h-0 flex-col gap-3 overflow-auto p-3" aria-label="Audio sessions">
      {sessions.map((view) => (
        <section key={view.id} aria-label={sessionHeading(view)} className="rounded-lg border border-border bg-card/40">
          <header className="border-b border-border/60 px-3 py-2">
            <h3 className="truncate text-xs font-semibold text-foreground">{sessionHeading(view)}</h3>
          </header>
          <ul className="flex flex-col">
            {view.variants.map((variant) => (
              <VariantRow
                key={variant.key}
                repoId={repoId}
                view={view}
                variant={variant}
                selected={variant.key === selectedKey}
                onSelect={() => onSelect(variant)}
                queue={queue}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function sessionHeading(view: AudioSessionView): string {
  if (!view.session) return 'Unsorted';
  return view.session.prompt.title || (view.kind === 'import' ? 'Imported audio' : 'Untitled');
}

function VariantRow({
  repoId,
  view,
  variant,
  selected,
  onSelect,
  queue,
}: {
  repoId: string;
  view: AudioSessionView;
  variant: AudioVariant;
  selected: boolean;
  onSelect: () => void;
  queue: PlayerTrack[];
}) {
  const waveform = useWaveform(repoId, variant);
  const isCurrent = usePlayer((s) => currentTrack(s)?.key === variant.key);
  const playing = usePlayer((s) => s.playing) && isCurrent;
  const progress = usePlayer((s) => (isCurrent && s.duration > 0 ? s.currentTime / s.duration : 0));
  const title = variantTitle(variant);
  const [open, setOpen] = useState(false);
  const detailsId = `variant-details-${variant.key}`;

  const onPlay = () => {
    onSelect();
    const player = usePlayer.getState();
    if (isCurrent) player.toggle();
    else player.playQueue(queue, variant.key);
  };

  return (
    <li className={selected ? 'bg-accent' : 'hover:bg-accent/50'} aria-current={selected || undefined}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          onClick={onPlay}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-accent"
        >
          {playing ? <LuPause aria-hidden className="h-3.5 w-3.5" /> : <LuPlay aria-hidden className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="w-36 truncate text-xs text-foreground" title={variant.path}>
            {title}
          </span>
          <WaveformThumb peaks={waveform?.peaks ?? null} progress={progress} />
          <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
            {formatDuration(waveform?.durationS ?? variant.sidecar?.durationS)}
          </span>
        </button>
        <button
          type="button"
          aria-label={open ? `Hide details for ${title}` : `Show details for ${title}`}
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((o) => !o)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LuChevronDown
            aria-hidden
            className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {open ? <VariantDetails id={detailsId} view={view} /> : null}
    </li>
  );
}

/** Source, style, lyrics and timestamp — shown only once the row is expanded. */
function VariantDetails({ id, view }: { id: string; view: AudioSessionView }) {
  const session = view.session;
  return (
    <dl id={id} className="flex flex-col gap-1 px-12 pb-2.5 text-[11px] text-muted-foreground">
      <div className="flex gap-2">
        <dt className="w-14 shrink-0">Source</dt>
        <dd className="uppercase tracking-wide">{view.kind}</dd>
      </div>
      {session ? (
        <div className="flex gap-2">
          <dt className="w-14 shrink-0">Date</dt>
          <dd>
            <time dateTime={session.createdAt}>{new Date(session.createdAt).toLocaleString()}</time>
          </dd>
        </div>
      ) : null}
      {session && session.prompt.style.length > 0 ? (
        <div className="flex gap-2">
          <dt className="w-14 shrink-0">Prompt</dt>
          <dd>{session.prompt.style.join(' · ')}</dd>
        </div>
      ) : null}
      {session && session.prompt.lyrics ? (
        <div className="flex gap-2">
          <dt className="w-14 shrink-0">Lyrics</dt>
          <dd className="line-clamp-3 whitespace-pre-line">{session.prompt.lyrics}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Static bars; the played fraction is tinted when this variant is the one playing. */
export function WaveformThumb({ peaks, progress = 0 }: { peaks: readonly number[] | null; progress?: number }) {
  if (!peaks || peaks.length === 0) {
    return <span aria-hidden className="h-6 min-w-0 flex-1 animate-pulse rounded bg-muted/40 motion-reduce:animate-none" />;
  }
  const width = peaks.length * 2;
  const played = playedBarCount(progress, peaks.length);
  return (
    <svg
      aria-hidden
      data-testid="waveform"
      viewBox={`0 0 ${width} 24`}
      preserveAspectRatio="none"
      className="h-6 min-w-0 flex-1"
    >
      {peaks.map((peak, i) => {
        const h = Math.max(1, peak * 22);
        return (
          <rect
            key={i}
            x={i * 2}
            y={12 - h / 2}
            width={1.2}
            height={h}
            className={i < played ? undefined : 'fill-muted-foreground/60'}
            style={i < played ? { fill: 'hsl(var(--primary))' } : undefined}
            data-played={i < played ? 'true' : undefined}
          />
        );
      })}
    </svg>
  );
}
