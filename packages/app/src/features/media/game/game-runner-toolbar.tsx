import { useState } from 'react';
import {
  LuBug,
  LuGauge,
  LuPause,
  LuPlay,
  LuRotateCcw,
  LuSquare,
  LuVolume2,
  LuVolumeX,
} from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { SelectField } from '../../../components/form/select-field';
import { bridge } from '../../../services/bridge';
import { useToastStore } from '../../../store/toast-store';
import { isLive, useGameRunStore } from './game-run-store';
import type { GameResolution } from './game-runner-host';
import { useRunGame, useStopGame } from './use-games';

const RESOLUTIONS: readonly { value: GameResolution; label: string }[] = [
  { value: 'fit', label: 'Fit' },
  { value: '1280x720', label: '1280×720' },
  { value: '1920x1080', label: '1920×1080' },
];

/**
 * The runner's controls (Phase 107 Theme B): play/pause (the kit's
 * `__midnite` hook), restart, stop, a resolution preset, mute, the fps overlay
 * and DevTools. Pop out is not here yet — it needs a `game` window role, which
 * lands with the later themes that touch the detach plumbing.
 */
export function GameRunnerToolbar({
  gameId,
  resolution,
  onResolution,
}: {
  gameId: string | null;
  resolution: GameResolution;
  onResolution: (next: GameResolution) => void;
}) {
  const info = useGameRunStore((s) => (gameId ? s.runs[gameId] : undefined));
  const run = useRunGame();
  const stop = useStopGame();
  const [muted, setMuted] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const live = isLive(info?.state);
  const paused = info?.state === 'paused';

  const toolbar = async (action: 'pause' | 'resume' | 'mute' | 'unmute' | 'devtools' | 'overlay', value?: boolean) => {
    if (!gameId) return false;
    const result = await bridge()?.games.toolbar({ gameId, action, ...(value === undefined ? {} : { value }) });
    if (result && !result.ok && result.kind === 'error') {
      useToastStore.getState().addToast({ message: result.message, status: 'error' });
      return false;
    }
    return true;
  };

  return (
    <div role="toolbar" aria-label="Game controls" className="flex items-center gap-1">
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
    </div>
  );
}
