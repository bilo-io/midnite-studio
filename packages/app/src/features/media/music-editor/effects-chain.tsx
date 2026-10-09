import type { Song, SongEffect, SongEffectType, SongTrack } from '@midnite/studio-shared';
import { LuChevronLeft, LuChevronRight, LuPower, LuTrash2 } from 'react-icons/lu';

import { EFFECTS, EFFECT_TYPES, effectParam } from './model/effects';
import {
  addEffect,
  moveEffect,
  removeEffect,
  setEffectBypass,
  setEffectParam,
} from './model/mixer-edit';

type Props = {
  song: Song;
  track: SongTrack;
  onCommit: (next: Song, key?: string | null) => void;
};

/** The active track's effects chain (Phase 101 Theme F): add, remove, reorder, bypass and tweak. */
export function EffectsChain({ song, track, onCommit }: Props) {
  return (
    <section
      data-testid="effects-chain"
      aria-label={`Effects for ${track.name || 'track'}`}
      className="flex min-w-0 flex-1 flex-col gap-2 p-2"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">Effects · {track.name || 'Track'}</span>
        <select
          aria-label="Add effect"
          value=""
          onChange={(e) => {
            const added = addEffect(song, track.id, e.target.value as SongEffectType);
            if (added) onCommit(added.song);
          }}
          className="h-6 rounded border border-border bg-background px-1 text-xs"
        >
          <option value="">Add effect…</option>
          {EFFECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EFFECTS[t].label}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground">Signal runs left to right into the strip.</span>
      </div>
      {track.effects.length === 0 ? (
        <p className="text-xs text-muted-foreground">No effects on this track.</p>
      ) : (
        <ol className="flex min-h-0 gap-2 overflow-x-auto pb-1">
          {track.effects.map((fx, i) => (
            <EffectCard
              key={fx.id}
              fx={fx}
              index={i}
              count={track.effects.length}
              trackId={track.id}
              song={song}
              onCommit={onCommit}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function EffectCard({
  fx,
  index,
  count,
  trackId,
  song,
  onCommit,
}: {
  fx: SongEffect;
  index: number;
  count: number;
  trackId: string;
  song: Song;
  onCommit: Props['onCommit'];
}) {
  const spec = EFFECTS[fx.type];
  const icon =
    'rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30';
  return (
    <li
      data-testid="effect-card"
      data-bypassed={fx.bypass}
      className={`w-44 shrink-0 rounded-md border border-border p-2 ${fx.bypass ? 'opacity-50' : ''}`}
    >
      <div className="mb-1 flex items-center gap-0.5 text-xs font-medium">
        <span className="mr-auto truncate">{spec.label}</span>
        <button
          type="button"
          aria-label={`Move ${spec.label} earlier`}
          disabled={index === 0}
          onClick={() => onCommit(moveEffect(song, trackId, fx.id, index - 1))}
          className={icon}
        >
          <LuChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Move ${spec.label} later`}
          disabled={index === count - 1}
          onClick={() => onCommit(moveEffect(song, trackId, fx.id, index + 1))}
          className={icon}
        >
          <LuChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={fx.bypass ? `Enable ${spec.label}` : `Bypass ${spec.label}`}
          aria-pressed={fx.bypass}
          onClick={() => onCommit(setEffectBypass(song, trackId, fx.id, !fx.bypass))}
          className={icon}
        >
          <LuPower className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Remove ${spec.label}`}
          onClick={() => onCommit(removeEffect(song, trackId, fx.id))}
          className={`${icon} hover:text-destructive`}
        >
          <LuTrash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {spec.params.map((p) => (
          <label key={p.key} className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="w-14 shrink-0">{p.label}</span>
            <input
              type="range"
              aria-label={`${spec.label} ${p.label}`}
              min={p.min}
              max={p.max}
              step={p.step}
              value={effectParam(fx, p.key)}
              onChange={(e) =>
                onCommit(
                  setEffectParam(song, trackId, fx.id, p.key, Number(e.target.value)),
                  `fx:${fx.id}:${p.key}`,
                )
              }
              className="min-w-0 flex-1"
            />
          </label>
        ))}
      </div>
    </li>
  );
}
