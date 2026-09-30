import { LuPause, LuPlay, LuRepeat, LuRepeat1, LuShuffle, LuSkipBack, LuSkipForward, LuVolume2, LuVolumeX } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { currentTrack, usePlayer, type LoopMode } from './player-store';
import { formatDuration } from './waveform';

const LOOP_LABEL: Record<LoopMode, string> = { off: 'Loop: off', all: 'Loop: all', one: 'Loop: one' };

/**
 * The Audio tab's bottom player (Phase 99 Theme E) — docks once anything has
 * played. Drives the single `HTMLAudioElement` in `usePlayer`, so it is only a
 * view: unmounting it (another Media tab) leaves playback running.
 */
export function BottomPlayer() {
  const player = usePlayer();
  const track = currentTrack(player);
  if (!track) return null;

  return (
    <div
      role="region"
      aria-label="Audio player"
      className="flex h-14 shrink-0 items-center gap-3 border-t border-border bg-card/60 px-3"
    >
      <div className="flex items-center gap-0.5">
        <IconButton icon={LuSkipBack} label="Previous" size="sm" onClick={player.prev} />
        <IconButton
          icon={player.playing ? LuPause : LuPlay}
          label={player.playing ? 'Pause' : 'Play'}
          onClick={player.toggle}
        />
        <IconButton icon={LuSkipForward} label="Next" size="sm" onClick={player.next} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-xs font-medium text-foreground" title={`${track.project}/${track.path}`}>
          {track.title}
          {player.error ? <span className="ml-2 text-destructive">{player.error}</span> : null}
        </p>
        <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
          <span>{formatDuration(player.currentTime)}</span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={player.duration || 0}
            step={0.1}
            value={Math.min(player.currentTime, player.duration || 0)}
            onChange={(event) => player.seek(Number(event.target.value))}
            className="h-1 min-w-0 flex-1 accent-primary"
          />
          <span>{formatDuration(player.duration || null)}</span>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <IconButton
          icon={LuShuffle}
          label={player.shuffle ? 'Shuffle: on' : 'Shuffle: off'}
          size="sm"
          aria-pressed={player.shuffle}
          tone={player.shuffle ? 'brand' : 'ghost'}
          onClick={player.toggleShuffle}
        />
        <IconButton
          icon={player.loop === 'one' ? LuRepeat1 : LuRepeat}
          label={LOOP_LABEL[player.loop]}
          size="sm"
          aria-pressed={player.loop !== 'off'}
          tone={player.loop !== 'off' ? 'brand' : 'ghost'}
          onClick={player.cycleLoop}
        />
        <IconButton
          icon={player.volume === 0 ? LuVolumeX : LuVolume2}
          label={player.volume === 0 ? 'Unmute' : 'Mute'}
          size="sm"
          onClick={() => player.setVolume(player.volume === 0 ? 0.8 : 0)}
        />
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={player.volume}
          onChange={(event) => player.setVolume(Number(event.target.value))}
          className="h-1 w-20 accent-primary"
        />
      </div>
    </div>
  );
}
