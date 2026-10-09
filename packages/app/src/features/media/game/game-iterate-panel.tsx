import {
  agentIteratesModel,
  GAME_PASSES_MAX,
  GAMES_OLLAMA_WARNING,
  type GameAgentEngine,
  type GameSummary,
} from '@midnite/studio-shared';
import { useMemo, useState, type ReactNode } from 'react';
import { LuSquare, LuTriangleAlert, LuX } from 'react-icons/lu';
import { SiOllama } from 'react-icons/si';

import { AiComposer, ProviderModelPicker, type PickerModel, type PickerProvider } from '../../../components/ai-thread';
import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { useAgents } from '../../terminal/use-agents';
import { agentPickerProviders } from '../agent-model-picker';
import { textModels } from '../model/model-utils';
import { useModelProviders } from '../model/use-model';
import { MediaPanelBody, MediaPanelFooter, MediaPanelLayout } from '../media-panel-layout';
import { MEDIA_PROMPT_BOX } from '../prompt-input';
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
  pickerProviders: PickerProvider[];
  currentProvider: string;
  pickerModels: PickerModel[];
  currentModel: string;
  isOllama: boolean;
  dismissed: boolean;
  dismiss: () => void;
  passes: number;
  setPasses: (passes: number) => void;
  installedText: Array<{ id: string; label: string }>;
} {
  const { agents } = useAgents();
  const providers = useModelProviders();
  const primaryAgent = useUiStore((s) => s.primaryAgent);
  const picked = useGameAgentStore((s) => s.engine);
  const setChoice = useGameAgentStore((s) => s.setEngine);
  const passes = useGameAgentStore((s) => s.passes);
  const setPasses = useGameAgentStore((s) => s.setPasses);
  const dismissed = useGameAgentStore((s) => s.ollamaWarningDismissed);
  const dismiss = useGameAgentStore((s) => s.dismissOllamaWarning);
  const ollama = providers.data?.ollama;

  const iterativeAgents = useMemo(() => agents.filter((a) => agentIteratesModel(a.id)), [agents]);
  const installedText = useMemo(() => (ollama?.available ? textModels(ollama.models) : []), [ollama]);

  const options = useMemo<GameEngineOption[]>(
    () => [
      ...iterativeAgents.map((a) => ({ value: `agent:${a.id}`, label: a.label, group: 'Agents' as const })),
      ...installedText.map((m) => ({
        value: `ollama:${m.id}`,
        label: m.label,
        group: 'Ollama' as const,
      })),
    ],
    [iterativeAgents, installedText],
  );

  const pickerProviders = useMemo<PickerProvider[]>(() => [
    ...agentPickerProviders(iterativeAgents, primaryAgent),
    ...(ollama?.available
      ? [{ id: 'ollama', label: 'Ollama (local)', icon: SiOllama, color: '#F5F5F5' }]
      : []),
  ], [iterativeAgents, primaryAgent, ollama?.available]);

  const fallback = useMemo(() => {
    if (iterativeAgents.some((a) => a.id === primaryAgent)) return `agent:${primaryAgent}`;
    if (iterativeAgents[0]) return `agent:${iterativeAgents[0].id}`;
    if (ollama?.available && installedText[0]) return `ollama:${installedText[0].id}`;
    return null;
  }, [iterativeAgents, primaryAgent, ollama?.available, installedText]);

  const choice = picked && (
    (picked.startsWith('agent:') && iterativeAgents.some((a) => `agent:${a.id}` === picked)) ||
    (picked.startsWith('ollama:') && ollama?.available && installedText.some((m) => `ollama:${m.id}` === picked))
  ) ? picked : fallback;

  const currentProvider = choice?.startsWith('ollama:')
    ? 'ollama'
    : (choice?.startsWith('agent:') ? choice.slice(6) : '');

  const currentModel = choice?.startsWith('ollama:') ? choice.slice(7) : '';

  const pickerModels = useMemo<PickerModel[]>(() => {
    if (currentProvider === 'ollama') {
      return installedText.map((m, i) => ({ id: m.id, label: m.label, ...(i === 0 ? { recommended: true } : {}) }));
    }
    return [];
  }, [currentProvider, installedText]);

  const isOllama = choice?.startsWith('ollama:') ?? false;

  return {
    options,
    choice,
    setChoice,
    pickerProviders,
    currentProvider,
    pickerModels,
    currentModel,
    isOllama,
    dismissed,
    dismiss,
    passes,
    setPasses,
    installedText,
  };
}

/** Engine picker, Ollama warning and the passes slider — shared by the create form and the iterate panel. */
export function GameEngineFields({ disabled = false }: { disabled?: boolean }) {
  const {
    setChoice,
    pickerProviders,
    currentProvider,
    pickerModels,
    currentModel,
    isOllama,
    dismissed,
    dismiss,
    passes,
    setPasses,
    installedText,
  } = useGameEngines();

  return (
    <div className="flex flex-col gap-2">
      {pickerProviders.length > 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Engine</span>
          <ProviderModelPicker
            testId="game-engine-picker"
            providers={pickerProviders}
            provider={currentProvider}
            onProviderChange={(id) => {
              if (id === 'ollama') {
                const first = installedText[0]?.id ?? '';
                setChoice(`ollama:${first}`);
              } else {
                setChoice(`agent:${id}`);
              }
            }}
            models={pickerModels}
            model={currentModel}
            onModelChange={(modelId) => {
              if (currentProvider === 'ollama') {
                setChoice(`ollama:${modelId}`);
              }
            }}
          />
        </div>
      ) : null}
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
  const {
    choice,
    setChoice,
    pickerProviders,
    currentProvider,
    pickerModels,
    currentModel,
    isOllama,
    dismissed,
    dismiss,
    passes,
    setPasses,
    installedText,
  } = useGameEngines();
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
      <MediaPanelFooter className="flex flex-col gap-2 border-t border-border/50 p-3">
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
            disabled={busy}
            onChange={(event) => setPasses(Number(event.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
          />
          <span className="w-6 text-right tabular-nums text-foreground">{passes}</span>
        </label>

        <div className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
          Prompt
          <AiComposer
            ariaLabel="Prompt"
            value={prompt}
            onChange={setPrompt}
            onSend={() => void onRun()}
            canSend={canRun}
            enterToSend={false}
            sendTooltip={
              !canRun
                ? (busy ? 'Agent is running' : prompt.trim().length === 0 ? 'Describe changes first' : 'Select an engine')
                : 'Run agent (Cmd/Ctrl+Enter)'
            }
            sendAriaLabel="Run agent"
            rows={3}
            dimmed={busy}
            placeholder="Add a double jump, and make the coins spin"
            boxClassName={MEDIA_PROMPT_BOX}
            testIdPrefix="game-prompt"
            leading={
              <ProviderModelPicker
                testId="game-engine-picker"
                providers={pickerProviders}
                provider={currentProvider}
                onProviderChange={(id) => {
                  if (id === 'ollama') {
                    const first = installedText[0]?.id ?? '';
                    setChoice(`ollama:${first}`);
                  } else {
                    setChoice(`agent:${id}`);
                  }
                }}
                models={pickerModels}
                model={currentModel}
                onModelChange={(modelId) => {
                  if (currentProvider === 'ollama') {
                    setChoice(`ollama:${modelId}`);
                  }
                }}
              />
            }
          />
        </div>

        {busy ? (
          <button
            type="button"
            onClick={() => void onCancel()}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs text-foreground hover:bg-accent"
          >
            <LuSquare aria-hidden className="h-3.5 w-3.5" />
            Cancel
          </button>
        ) : null}
      </MediaPanelFooter>
    </MediaPanelLayout>
  );
}

const EMPTY: never[] = [];
