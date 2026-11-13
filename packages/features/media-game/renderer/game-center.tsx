import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { LuGamepad2, LuPencilRuler } from 'react-icons/lu';

import { EmptyState } from '@midnite/studio-frame';

import { GameConsoleDrawer } from './game-console-drawer';
import { isLive, useGameRunStore } from './game-run-store';
import { GameRunnerHost, type GameResolution } from './game-runner-host';
import type { GameMode } from './use-game-mode';

const TABS: readonly { mode: GameMode; label: string; icon: typeof LuGamepad2 }[] = [
  { mode: 'editor', label: 'Level editor', icon: LuPencilRuler },
  { mode: 'play', label: 'Play mode', icon: LuGamepad2 },
];

/**
 * The Games centre panel (Phase 132 Theme B): a **Level editor** tab and a **Play mode** tab over one game.
 * Both panels stay mounted — the inactive one is `hidden` — so a run keeps its console and the native game view
 * keeps its stage; `GameRunnerHost`'s `active` flag is what hides that view while the editor shows.
 * `sceneSlot` sits right of the tabs (Theme D's scene picker).
 */
export function GameCenter({
  game,
  mode,
  onMode,
  resolution,
  sceneSlot,
}: {
  game: { gameId: string } | null;
  mode: GameMode;
  onMode: (next: GameMode) => void;
  resolution: GameResolution;
  sceneSlot?: ReactNode;
}) {
  const gameId = game?.gameId ?? null;
  const live = useGameRunStore((s) => isLive(gameId ? s.runs[gameId]?.state : undefined));
  const tabRefs = useRef<Partial<Record<GameMode, HTMLButtonElement | null>>>({});

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length]!;
    onMode(next.mode);
    tabRefs.current[next.mode]?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2">
        <div role="tablist" aria-label="Game view" className="flex items-center gap-1">
          {TABS.map(({ mode: tab, label, icon: Icon }, index) => {
            const selected = mode === tab;
            return (
              <button
                key={tab}
                ref={(el) => {
                  tabRefs.current[tab] = el;
                }}
                id={`game-tab-${tab}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`game-panel-${tab}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onMode(tab)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={`flex h-8 items-center gap-1.5 border-b-2 px-2.5 text-xs font-medium ${
                  selected
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon aria-hidden className="h-3.5 w-3.5" />
                {label}
                {tab === 'play' && live && mode !== 'play' ? (
                  <span
                    role="img"
                    aria-label="Running"
                    className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        {sceneSlot ? <div className="ml-auto flex items-center">{sceneSlot}</div> : null}
      </div>
      <div
        role="tabpanel"
        id="game-panel-editor"
        aria-labelledby="game-tab-editor"
        hidden={mode !== 'editor'}
        className="min-h-0 flex-1"
      >
        <EmptyState icon={LuPencilRuler} title="Level editing is not available for this game yet." body="Press Run to play it." />
      </div>
      <div
        role="tabpanel"
        id="game-panel-play"
        aria-labelledby="game-tab-play"
        hidden={mode !== 'play'}
        className={`min-h-0 flex-1 flex-col ${mode === 'play' ? 'flex' : 'hidden'}`}
      >
        <div className="min-h-0 flex-1">
          <GameRunnerHost gameId={gameId} resolution={resolution} active={mode === 'play'} />
        </div>
        <GameConsoleDrawer gameId={gameId} />
      </div>
    </div>
  );
}
