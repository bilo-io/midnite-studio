import type { Song, SongMixerChannel } from '@midnite/studio-shared';

import { EffectsChain } from './effects-chain';
import type { MusicEngine } from './engine/engine';
import { LevelMeter } from './level-meter';
import { PAN_RANGE, VOLUME_RANGE, setChannel } from './model/mixer-edit';

type Props = {
  song: Song;
  activeTrack: string | null;
  onActiveTrack: (id: string) => void;
  onCommit: (next: Song, key?: string | null) => void;
  engine: MusicEngine | null;
};

/** Gain as a percentage of unity, for the readout. */
const percent = (volume: number): string => `${Math.round(volume * 100)}%`;
const panText = (pan: number): string =>
  Math.abs(pan) < 0.005 ? 'C' : `${pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(pan) * 100)}`;

/**
 * The mixer (Phase 101 Theme F): one strip per track and a master — fader, pan, mute, solo, a meter —
 * beside the active track's effects chain. A fader drag is one undo step (key-coalesced).
 */
export function MixerPanel({ song, activeTrack, onActiveTrack, onCommit, engine }: Props) {
  const track = song.tracks.find((t) => t.id === activeTrack) ?? null;
  return (
    <div data-testid="mixer" className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-r border-border p-2">
        {song.tracks.map((t) => (
          <Strip
            key={t.id}
            id={t.id}
            name={t.name || 'Track'}
            color={t.color}
            channel={t.mixer}
            active={t.id === activeTrack}
            engine={engine}
            onSelect={() => onActiveTrack(t.id)}
            onChange={(patch, key) =>
              onCommit(setChannel(song, t.id, patch), key ? `${key}:${t.id}` : null)
            }
          />
        ))}
        <Strip
          id="master"
          name="Master"
          channel={song.mixer.master}
          engine={engine}
          master
          onChange={(patch, key) =>
            onCommit(setChannel(song, 'master', patch), key ? `${key}:master` : null)
          }
        />
      </div>
      {track ? (
        <EffectsChain song={song} track={track} onCommit={onCommit} />
      ) : (
        <p className="p-3 text-xs text-muted-foreground">Add a track to mix it.</p>
      )}
    </div>
  );
}

function Strip({
  id,
  name,
  color,
  channel,
  active = false,
  master = false,
  engine,
  onSelect,
  onChange,
}: {
  id: string;
  name: string;
  color?: string;
  channel: SongMixerChannel;
  active?: boolean;
  master?: boolean;
  engine: MusicEngine | null;
  onSelect?: () => void;
  onChange: (patch: Partial<SongMixerChannel>, coalesceKey?: string) => void;
}) {
  const pill = (on: boolean, tone: string) =>
    `h-5 w-5 rounded text-[10px] font-semibold ${on ? tone : 'bg-muted text-muted-foreground hover:bg-accent'}`;
  return (
    <div
      data-testid={master ? 'mixer-master' : 'mixer-strip'}
      data-active={active}
      onPointerDown={onSelect}
      style={color ? { borderTopColor: color } : undefined}
      className={`flex w-[72px] shrink-0 flex-col items-center gap-1.5 rounded-md border border-t-4 border-border px-1.5 py-1.5 ${active ? 'bg-accent/60' : ''} ${master ? 'ml-2 border-t-foreground/40' : ''}`}
    >
      <span title={name} className="w-full truncate text-center text-[10px] font-medium">
        {name}
      </span>
      <input
        type="range"
        aria-label={`${name} pan`}
        min={PAN_RANGE.min}
        max={PAN_RANGE.max}
        step={0.01}
        value={channel.pan}
        onChange={(e) => onChange({ pan: Number(e.target.value) }, 'pan')}
        onDoubleClick={() => onChange({ pan: 0 })}
        className="w-full"
      />
      <span className="text-[10px] text-muted-foreground">{panText(channel.pan)}</span>
      <div className="flex h-24 items-stretch gap-1.5">
        <input
          type="range"
          aria-label={`${name} volume`}
          min={VOLUME_RANGE.min}
          max={VOLUME_RANGE.max}
          step={0.01}
          value={channel.volume}
          onChange={(e) => onChange({ volume: Number(e.target.value) }, 'vol')}
          onDoubleClick={() => onChange({ volume: VOLUME_RANGE.default })}
          style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 16 }}
        />
        <LevelMeter engine={engine} trackId={id as string | 'master'} label={`${name} level`} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {percent(channel.volume)}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label={`${channel.mute ? 'Unmute' : 'Mute'} ${name}`}
          aria-pressed={channel.mute}
          onClick={() => onChange({ mute: !channel.mute })}
          className={pill(channel.mute, 'bg-amber-500 text-black')}
        >
          M
        </button>
        {!master && (
          <button
            type="button"
            aria-label={`${channel.solo ? 'Unsolo' : 'Solo'} ${name}`}
            aria-pressed={channel.solo}
            onClick={() => onChange({ solo: !channel.solo })}
            className={pill(channel.solo, 'bg-primary text-primary-foreground')}
          >
            S
          </button>
        )}
      </div>
    </div>
  );
}
