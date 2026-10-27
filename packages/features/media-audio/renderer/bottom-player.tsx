import { useState } from 'react';
import {
  LuMaximize2,
  LuMinimize2,
  LuMusic,
  LuPause,
  LuPlay,
  LuRepeat,
  LuRepeat1,
  LuShuffle,
  LuSkipBack,
  LuSkipForward,
  LuSparkles,
  LuVolume2,
  LuVolumeX,
} from 'react-icons/lu';

import { EpicAudioVisualizerCanvas, SHAPE_NAMES, useFrameChrome } from '@midnite/studio-frame';

import { currentTrack, usePlayer, type LoopMode } from './player-store';
import { formatDuration } from './waveform';

const LOOP_LABEL: Record<LoopMode, string> = { off: 'Loop: off', all: 'Loop: all', one: 'Loop: one' };

/**
 * The Audio tab's bottom player (Phase 99 Theme E) — docks once anything has
 * played, upgraded with the 5-layer 3D visualizer stage, 3-tier beat-reactive
 * border glow, and floating Spotify-style control dock. Drives the single
 * `HTMLAudioElement` in `usePlayer`, so unmounting it (another Media tab)
 * leaves playback running.
 */
export function BottomPlayer() {
  const { IconButton } = useFrameChrome();
  const player = usePlayer();
  const track = currentTrack(player);
  const [shapeIdx, setShapeIdx] = useState(0);
  const [glowTier, setGlowTier] = useState<1 | 2 | 3>(1);
  const [expanded, setExpanded] = useState(true);

  if (!track) return null;

  return (
    <div
      role="region"
      aria-label="Audio player"
      data-testid="epic-audio-player-container"
      data-glow-tier={glowTier}
      className={`relative flex shrink-0 flex-col overflow-hidden border-t border-border bg-neutral-950 transition-all duration-300 select-none ${
        expanded ? 'h-64' : 'h-24'
      } ${
        glowTier === 3
          ? 'shadow-[0_-12px_45px_rgba(217,70,239,0.45),inset_0_0_30px_rgba(6,182,212,0.28)] ring-2 ring-fuchsia-400'
          : glowTier === 2
            ? 'shadow-[0_-8px_28px_rgba(168,85,247,0.3),inset_0_0_18px_rgba(6,182,212,0.16)] ring-1 ring-cyan-400'
            : 'shadow-[0_-4px_15px_rgba(147,51,234,0.12)] ring-1 ring-white/10'
      }`}
    >
      {/* Dynamic 3-Tier Beat Gradient Border Glow */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          glowTier === 3 ? 'opacity-100' : glowTier === 2 ? 'opacity-70' : 'opacity-30'
        }`}
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(217, 70, 239, 0.25), transparent 70%), radial-gradient(circle at 50% 100%, rgba(6, 182, 212, 0.2), transparent 70%)',
        }}
      />

      {/* 5-Layer 3D Visualizer Canvas Stage */}
      <EpicAudioVisualizerCanvas
        isPlaying={player.playing}
        audioElement={player.getAudioElement()}
        shapeIndex={shapeIdx}
        onShapeChange={setShapeIdx}
        onGlowTierChange={setGlowTier}
        centerYOffset={expanded ? -22 : 0}
      />

      {/* Top 3D Visualizer HUD Overlay when expanded */}
      {expanded ? (
        <div className="relative z-10 flex items-center justify-between px-3 pt-2.5">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 backdrop-blur-md">
            <LuMusic className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[10px] font-semibold tracking-wider text-cyan-300 uppercase">
              3D Stage
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShapeIdx((s) => (s + 1) % SHAPE_NAMES.length)}
              title="Click to cycle morph shape"
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] font-medium text-white/85 backdrop-blur-md transition-colors hover:border-cyan-400/50 hover:text-white"
            >
              <LuSparkles className="h-3 w-3 text-fuchsia-400" />
              <span>{SHAPE_NAMES[shapeIdx]}</span>
            </button>

            <div
              title={`Beat Intensity Level ${glowTier}`}
              className="flex items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2 py-1 backdrop-blur-md"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  glowTier >= 1 ? 'bg-cyan-400 shadow-[0_0_6px_#06b6d4]' : 'bg-white/20'
                }`}
              />
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  glowTier >= 2 ? 'bg-fuchsia-400 shadow-[0_0_8px_#d946ef]' : 'bg-white/20'
                }`}
              />
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  glowTier >= 3 ? 'bg-rose-400 scale-125 shadow-[0_0_10px_#f43f5e]' : 'bg-white/20'
                }`}
              />
            </div>

            <button
              type="button"
              onClick={() => setExpanded(false)}
              title="Compact visualizer"
              aria-label="Compact visualizer"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/75 backdrop-blur-md hover:text-white"
            >
              <LuMinimize2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex-1" />

      {/* Floating Spotify-Style Bottom Control Bar */}
      <div className="relative z-20 mx-3 mb-2.5 flex h-14 items-center gap-3 rounded-2xl border border-white/10 bg-black/65 px-3.5 shadow-2xl backdrop-blur-2xl">
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
          <p className="truncate text-xs font-medium text-white" title={`${track.project}/${track.path}`}>
            {track.title}
            {player.error ? <span className="ml-2 text-destructive">{player.error}</span> : null}
          </p>
          <div className="flex items-center gap-2 text-[10px] tabular-nums text-white/70">
            <span>{formatDuration(player.currentTime)}</span>
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={player.duration || 0}
              step={0.1}
              value={Math.min(player.currentTime, player.duration || 0)}
              onChange={(event) => player.seek(Number(event.target.value))}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-cyan-400"
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
            className="h-1.5 w-20 cursor-pointer accent-cyan-400"
          />
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="Expand 3D visualizer"
              aria-label="Expand 3D visualizer"
              className="ml-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/75 hover:text-white"
            >
              <LuMaximize2 className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
