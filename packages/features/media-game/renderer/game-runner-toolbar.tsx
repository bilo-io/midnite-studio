import { useState } from 'react';
import {
  LuBug,
  LuExternalLink,
  LuGauge,
  LuPause,
  LuPlay,
  LuRotateCcw,
  LuSquare,
  LuVolume2,
  LuVolumeX,
} from 'react-icons/lu';

import { IconButton } from './chrome';
import { SelectField } from '@midnite/studio-frame';
import { bridge } from '@midnite/studio-frame';
import { useToastStore } from '@midnite/studio-frame';
import { isLive, useGameRunStore } from './game-run-store';
import type { GameResolution } from './game-runner-host';
import { GameJuiceMenu, useApplyStoredJuice } from './game-juice-menu';
import { PlaytestsMenu } from './playtests-menu';
import { usePopOutGame, useRunGame, useStopGame } from './use-games';

const RESOLUTIONS: readonly { value: GameResolution; label: string }[] = [
  { value: 'fit', label: 'Fit' },
  { value: '1280x720', label: '1280×720' },
  { value: '1920x1080', label: '1920×1080' },
];

/**
 * The runner's controls (Phase 107 Theme B): play/pause (the kit's
 * `__midnite` hook), restart, stop, a resolution preset, mute, the fps overlay,
 * DevTools, the Juice settings popover, the Playtests menu (Theme O) and Pop out. The popout window renders the same bar without Pop out —
 * its frame's own Re-dock button is the way back.
 */
export function GameRunnerToolbar({
  gameId,
  resolution,
  onResolution,
  inPopout = false,
  onPlay,
}: {
  gameId: string | null;
  resolution: GameResolution;
  onResolution: (next: GameResolution) => void;
  inPopout?: boolean;
  /**
   * The Play button's hook (Phase 132 Theme B): called after the click to show Play mode. `started` resolves to the
   * run id when the click itself started a run. Absent in the popout, where the button only runs.
   */
  onPlay?: (started?: Promise<string | null>) => void;
}) {
  const info = useGameRunStore((s) => (gameId ? s.runs[gameId] : undefined));
  const popped = useGameRunStore((s) => s.popped);
  const run = useRunGame();
  const stop = useStopGame();
  const popOut = usePopOutGame();
  const [muted, setMuted] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const live = isLive(info?.state);
  const paused = info?.state === 'paused';
  useApplyStoredJuice(gameId, info?.runId, info?.state === 'running');

  const toolbar = async (action: 'pause' | 'resume' | 'mute' | 'unmute' | 'devtools' | 'overlay', value?: boolean) => {
    if (!gameId) return false;
    const result = await bridge()?.games.toolbar({ gameId, action, ...(value === undefined ? {} : { value }) });
    if (result && !result.ok && result.kind === 'error') {
      useToastStore.getState().addToast({ message: result.message, status: 'error' });
      return false;
    }
    return true;
  };

  const playClick = () => {
    if (!gameId) return;
    if (live) {
      onPlay?.();
      return;
    }
    const started = run
      .mutateAsync(gameId)
      .then((result) => (result.ok ? result.value.runId : null))
      .catch(() => null);
    onPlay?.(started);
  };

  return (
    <div role="toolbar" aria-label="Game controls" className="flex items-center gap-1">
      <button
        type="button"
        aria-label={live ? 'Show the running game' : 'Run'}
        disabled={!gameId}
        onClick={playClick}
        className="gradient-border gradient-border--always gradient-border--hover mr-1 flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold hover:shadow-[0_0_0_1px_rgba(139,92,246,0.28),0_0_12px_-2px_rgba(59,130,246,0.35),0_0_22px_-6px_rgba(236,72,153,0.3)] motion-safe:transition-shadow disabled:opacity-50"
      >
        <LuPlay aria-hidden className="h-3.5 w-3.5" />
        {live ? 'Play' : 'Run'}
      </button>
      <IconButton
        icon={paused ? LuPlay : LuPause}
        label={paused ? 'Resume' : 'Pause'}
        size="sm"
        disabled={!live}
        onClick={() => void toolbar(paused ? 'resume' : 'pause')}
      />
      <IconButton
        icon={LuRotateCcw}
        label="Restart"
        size="sm"
        disabled={!gameId}
        onClick={() => gameId && run.mutate(gameId)}
      />
      <IconButton
        icon={LuSquare}
        label="Stop"
        size="sm"
        disabled={!live}
        onClick={() => gameId && stop.mutate(gameId)}
      />
      <span className="w-28">
        <SelectField<GameResolution>
          label="Resolution"
          value={resolution}
          onChange={onResolution}
          options={RESOLUTIONS}
        />
      </span>
      <IconButton
        icon={muted ? LuVolumeX : LuVolume2}
        label={muted ? 'Unmute' : 'Mute'}
        size="sm"
        disabled={!live}
        aria-pressed={muted}
        onClick={() => {
          void toolbar(muted ? 'unmute' : 'mute').then((done) => done && setMuted(!muted));
        }}
      />
      <IconButton
        icon={LuGauge}
        label="Frame-rate overlay"
        size="sm"
        disabled={!live}
        aria-pressed={overlay}
        onClick={() => {
          void toolbar('overlay', !overlay).then((done) => done && setOverlay(!overlay));
        }}
      />
      <IconButton icon={LuBug} label="DevTools" size="sm" disabled={!live} onClick={() => void toolbar('devtools')} />
      <GameJuiceMenu gameId={gameId} live={live} />
      <PlaytestsMenu gameId={gameId} />
      {inPopout ? null : (
        <IconButton
          icon={LuExternalLink}
          label={gameId !== null && popped === gameId ? 'Show game window' : 'Pop out'}
          size="sm"
          disabled={!gameId || popOut.isPending}
          onClick={() => gameId && popOut.mutate(gameId)}
        />
      )}
    </div>
  );
}
