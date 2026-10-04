import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LuGamepad2, LuPlay, LuRotateCcw, LuTriangleAlert } from 'react-icons/lu';

import { EmptyState } from '../../../components/empty-state';
import { Spinner } from '../../../components/skeleton';
import { usePageVisible } from '../../../lib/use-page-visible';
import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { boundsFromRect } from '../../browser/use-browser-bounds';
import { isLive, useGameRunStore } from './game-run-store';
import { useRunGame } from './use-games';

export type GameResolution = 'fit' | '1280x720' | '1920x1080';

const FIXED: Record<Exclude<GameResolution, 'fit'>, { width: number; height: number }> = {
  '1280x720': { width: 1280, height: 720 },
  '1920x1080': { width: 1920, height: 1080 },
};

/** The largest `size`-shaped box that fits in `box` — a fixed resolution letterboxes, never crops. */
export function letterbox(
  box: { width: number; height: number },
  resolution: GameResolution,
): { width: number; height: number } {
  if (resolution === 'fit') return box;
  const { width, height } = FIXED[resolution];
  const scale = Math.min(box.width / width, box.height / height, 1);
  return { width: Math.floor(width * scale), height: Math.floor(height * scale) };
}

/**
 * Keeps one game's native `WebContentsView` laid over the stage div, hidden
 * while a dialog or menu is open (the occluder counter — the same rule the
 * embedded browser follows) and while the Games tab is not on screen.
 */
function useGameBounds(gameId: string | null, live: boolean, resolution: GameResolution) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const occluders = useUiStore((s) => s.occluders);
  const pageVisible = usePageVisible();
  const visible = live && pageVisible && occluders === 0;
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null);

  const measure = useCallback(() => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return;
    setStage(letterbox({ width: box.width, height: box.height }, resolution));
  }, [resolution]);

  useLayoutEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const push = useCallback(() => {
    if (!gameId) return;
    bridge()?.games.setVisible({ gameId, visible });
    if (!visible) return;
    const el = stageRef.current;
    if (!el) return;
    const bounds = boundsFromRect(el.getBoundingClientRect());
    if (bounds) bridge()?.games.setBounds({ gameId, bounds });
  }, [gameId, visible]);

  useLayoutEffect(() => {
    push();
    window.addEventListener('resize', push);
    return () => window.removeEventListener('resize', push);
  }, [push, stage]);

  // Leaving the tab hides the view; it keeps running, throttled.
  useEffect(
    () => () => {
      if (gameId) bridge()?.games.setVisible({ gameId, visible: false });
    },
    [gameId],
  );

  return { containerRef, stageRef, stage };
}

/**
 * The centre column: the placeholder a game's `WebContentsView` floats over,
 * and the empty / starting / crashed states around it.
 */
export function GameRunnerHost({
  gameId,
  resolution,
}: {
  gameId: string | null;
  resolution: GameResolution;
}) {
  const info = useGameRunStore((s) => (gameId ? s.runs[gameId] : undefined));
  const run = useRunGame();
  const live = isLive(info?.state);
  const { containerRef, stageRef, stage } = useGameBounds(gameId, live, resolution);

  if (!gameId) {
    return <EmptyState icon={LuGamepad2} title="Pick a game, or create one." />;
  }

  const crashed = info?.state === 'crashed';
  return (
    <div ref={containerRef} data-testid="game-runner-host" className="relative flex h-full w-full items-center justify-center bg-black/40">
      {live ? (
        <div
          ref={stageRef}
          data-testid="game-stage"
          style={stage ? { width: stage.width, height: stage.height } : undefined}
          className="shrink-0"
        />
      ) : null}
      {info?.state === 'starting' ? (
        <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Spinner className="h-4 w-4" />
          Starting…
        </div>
      ) : null}
      {!live && !crashed ? (
        <button
          type="button"
          disabled={run.isPending}
          onClick={() => run.mutate(gameId)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <LuPlay aria-hidden className="h-4 w-4" />
          Run
        </button>
      ) : null}
      {crashed ? (
        <div role="alert" className="flex flex-col items-center gap-3 p-6 text-center">
          <LuTriangleAlert aria-hidden className="h-8 w-8 text-destructive" />
          <p className="max-w-sm text-sm">
            The game crashed ({info?.reason ?? 'unknown'}). See the console.
          </p>
          <button
            type="button"
            onClick={() => run.mutate(gameId)}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
          >
            <LuRotateCcw aria-hidden className="h-3.5 w-3.5" />
            Restart
          </button>
        </div>
      ) : null}
    </div>
  );
}
