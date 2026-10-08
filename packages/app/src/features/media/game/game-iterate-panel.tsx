import {
  agentIteratesModel,
  GAME_PASSES_MAX,
  GAME_PROMPT_MAX,
  GAMES_OLLAMA_WARNING,
  type GameAgentEngine,
  type GameSummary,
} from '@midnite/studio-shared';
import { useMemo, useState, type ReactNode } from 'react';
import { LuPlay, LuSquare, LuTriangleAlert, LuX } from 'react-icons/lu';

import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { useAgents } from '../../terminal/use-agents';
import { textModels } from '../model/model-utils';
import { useModelProviders } from '../model/use-model';
import { MediaPanelBody, MediaPanelFooter, MediaPanelLayout } from '../media-panel-layout';
import { PromptTextarea } from '../prompt-input';
import { useGameAgentStore, type GameEngineChoice } from './game-agent-store';
import { GameEditThread } from './game-edit-thread';

export type GameEngineOption = {
  value: GameEngineChoice;
  label: string;
  group: 'Agents' | 'Ollama';
};

/** `agent:<id>` / `ollama:<model>` → the wire engine. */
export function parseEngineChoice(value: GameEngineChoice): GameAgentEngine | null {
  const at = value.indexOf(':');
  const kind = value.slice(0, at);
  const id = value.slice(at + 1);
  if (!id) return null;
  if (kind === 'agent') return { kind: 'agent', agentId: id };
  if (kind === 'ollama') return { kind: 'ollama', model: id };
  return null;
}

/**
 * The engines a game run can use: roster agents that speak MCP (only those can
 * be confined to file tools and this game's tools), then installed Ollama
 * text models. The picked one, else the primary agent, else the first.
 */
export function useGameEngines(): {
  options: GameEngineOption[];
  choice: GameEngineChoice | null;
  setChoice: (value: GameEngineChoice) => void;
} {
  const { agents } = useAgents();
  const providers = useModelProviders();
  const primaryAgent = useUiStore((s) => s.primaryAgent);
  const picked = useGameAgentStore((s) => s.engine);
  const setChoice = useGameAgentStore((s) => s.setEngine);
  const ollama = providers.data?.ollama;
  const options = useMemo<GameEngineOption[]>(
    () => [
      ...agents
        .filter((a) => agentIteratesModel(a.id))
        .map((a) => ({ value: `agent:${a.id}`, label: a.label, group: 'Agents' as const })),
      ...(ollama?.available ? textModels(ollama.models) : []).map((m) => ({
        value: `ollama:${m.id}`,
        label: m.label,
        group: 'Ollama' as const,
      })),
    ],
    [agents, ollama],
  );
  const fallback =
    options.find((o) => o.value === `agent:${primaryAgent}`)?.value ?? options[0]?.value ?? null;
  const choice = picked && options.some((o) => o.value === picked) ? picked : fallback;
  return { options, choice, setChoice };
}

/** Engine picker, Ollama warning and the passes slider — shared by the create form and the iterate panel. */
export function GameEngineFields({ disabled = false }: { disabled?: boolean }) {
  const { options, choice, setChoice } = useGameEngines();
  const passes = useGameAgentStore((s) => s.passes);
  const setPasses = useGameAgentStore((s) => s.setPasses);
  const dismissed = useGameAgentStore((s) => s.ollamaWarningDismissed);
  const dismiss = useGameAgentStore((s) => s.dismissOllamaWarning);
  const isOllama = choice?.startsWith('ollama:') ?? false;

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium">
        Engine
        <select
          aria-label="Engine"
          value={choice ?? ''}
          disabled={disabled || options.length === 0}
          onChange={(event) => setChoice(event.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs font-normal outline-none focus:ring-1 focus:ring-ring"
        >
          {options.length === 0 ? (
            <option value="">No agent or Ollama model available</option>
          ) : null}
          {(['Agents', 'Ollama'] as const).map((group) =>
            options.some((o) => o.group === group) ? (
              <optgroup
                key={group}
                label={group === 'Agents' ? 'Agents (recommended)' : 'Ollama (local)'}
              >
                {options
                  .filter((o) => o.group === group)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </optgroup>
            ) : null,
          )}
        </select>
      </label>
      {isOllama && !dismissed ? (
        <div
          role="status"
          data-testid="games-ollama-banner"
          className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300"
        >
          <LuTriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{GAMES_OLLAMA_WARNING}</span>
          <button
            type="button"
            aria-label="Dismiss warning"
            onClick={dismiss}
            className="shrink-0 rounded p-0.5 hover:bg-amber-500/20"
          >
            <LuX aria-hidden className="h-3 w-3" />
          </button>
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        Passes
        <input
          type="range"
          aria-label="Refinement passes"
          min={1}
          max={GAME_PASSES_MAX}
          step={1}
          value={passes}
          disabled={disabled}
          onChange={(event) => setPasses(Number(event.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
        />
        <span className="w-6 text-right tabular-nums text-foreground">{passes}</span>
      </label>
    </div>
  );
}

/** Starts a run for a game and records it in the thread; answers whether it started. */
export async function startGameAgentRun(
  gameId: string,
  prompt: string,
  choice: GameEngineChoice | null,
  passes: number,
): Promise<boolean> {
  const store = useGameAgentStore.getState();
  const engine = choice ? parseEngineChoice(choice) : null;
  if (!engine) {
    store.failedToStart(gameId, prompt, 'Pick an engine first.');
    return false;
  }
  const api = bridge();
  if (!api) {
    store.failedToStart(gameId, prompt, 'The app bridge is not available.');
    return false;
  }
  const result = await api.games.agent.run({ gameId, prompt, engine, passes });
  if (!result.ok) {
    store.failedToStart(
      gameId,
      prompt,
      result.kind === 'error' ? result.message : 'The run could not start.',
    );
    return false;
  }
  store.started(gameId, prompt, result.value.runId, passes);
  return true;
}

/**
 * Create and iterate (Phase 107 Theme M): a prompt, an engine (roster agents,
 * then Ollama models), a passes budget, Run/Cancel, and the edit thread. Every
 * pass that changes files is one commit in the game's repo.
 */
/** `children` render above the thread inside the scrolling body (the detail panel passes the game summary). */
export function GameIteratePanel({ game, children }: { game: GameSummary; children?: ReactNode }) {
  const [prompt, setPrompt] = useState('');
  const [undoing, setUndoing] = useState(false);
  const { choice } = useGameEngines();
  const passes = useGameAgentStore((s) => s.passes);
  const entries = useGameAgentStore((s) => s.threads[game.gameId]) ?? EMPTY;
  const run = useGameAgentStore((s) => s.runs[game.gameId]) ?? null;
  const [starting, setStarting] = useState(false);
  const busy = run !== null || starting;
  const canRun = !busy && prompt.trim().length > 0 && choice !== null && game.valid;

  const onRun = async () => {
    if (!canRun) return;
    setStarting(true);
    const text = prompt.trim();
    const started = await startGameAgentRun(game.gameId, text, choice, passes);
    setStarting(false);
    if (started) setPrompt('');
  };

  const onCancel = async () => {
    await bridge()?.games.agent.cancel({ gameId: game.gameId });
  };

  const onUndo = async (sha: string) => {
    const api = bridge();
    if (!api) return;
    setUndoing(true);
    const result = await api.games.agent.undo({ gameId: game.gameId, sha });
    setUndoing(false);
    const store = useGameAgentStore.getState();
    if (result.ok) store.undone(game.gameId, sha);
    else if (result.kind === 'conflict') {
      store.note(
        game.gameId,
        'error',
        `Undo stopped on conflicts in ${result.files.join(', ')}. Resolve or abort the revert from the Timeline.`,
      );
    } else store.note(game.gameId, 'error', result.message);
  };

  return (
    <MediaPanelLayout as="section" aria-label="Create and iterate" data-testid="game-iterate-panel">
      <MediaPanelBody className="flex flex-col">
        {children ? <div className="shrink-0">{children}</div> : null}
        <GameEditThread
          entries={entries}
          running={run}
          onUndo={(sha) => void onUndo(sha)}
          undoing={undoing}
        />
      </MediaPanelBody>
      <MediaPanelFooter className="border-t border-border/50">
      <form
        className="flex flex-col gap-2 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onRun();
        }}
      >
        <GameEngineFields disabled={busy} />
        <PromptTextarea
          aria-label="Prompt"
          rows={3}
          maxLength={GAME_PROMPT_MAX}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void onRun();
            }
          }}
          placeholder="Add a double jump, and make the coins spin"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => void onCancel()}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs text-foreground hover:bg-accent"
          >
            <LuSquare aria-hidden className="h-3.5 w-3.5" />
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canRun}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <LuPlay aria-hidden className="h-3.5 w-3.5" />
            Run agent
          </button>
        )}
      </form>
      </MediaPanelFooter>
    </MediaPanelLayout>
  );
}

const EMPTY: never[] = [];
