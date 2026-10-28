import { undoableCommit, useGameAgentEvents, useGameAgentStore, type GameAgentUi, type GameThreadEntry } from '@midnite/studio-feature-media-game/renderer';
import { bridge, MediaPanelBody, MediaPanelFooter, MediaPanelLayout, BrandSlider } from '@midnite/studio-frame';
import { GAME_PASSES_MAX, type GameAgentRunRequest, type GameSummary } from '@midnite/studio-shared';
import { useCallback, useState, type ReactNode } from 'react';

/**
 * Create and iterate in Gamer (Phase 113 Theme S slice 3): the engines a game agent run can be confined to —
 * Claude Code and Codex, the two `runGameAgent` builds argv for — a passes budget, Run/Cancel, the run's
 * thread and Undo turn. Main runs it on a private MCP server per run (`main/agent-host.ts`). The thread
 * store is the feature's, the one Studio's panel reads; this panel is plainer than Studio's (no roster, no
 * AI composer).
 */
const ENGINES = [
  { choice: 'agent:claude', label: 'Claude Code', engine: { kind: 'agent', agentId: 'claude' } },
  { choice: 'agent:codex', label: 'Codex', engine: { kind: 'agent', agentId: 'codex' } },
] as const satisfies readonly { choice: string; label: string; engine: GameAgentRunRequest['engine'] }[];
const pick = (choice: string | null) => ENGINES.find((e) => e.choice === choice) ?? ENGINES[0];
const EMPTY: GameThreadEntry[] = [];
const field = 'rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-50';

async function startRun(gameId: string, prompt: string): Promise<boolean> {
  const store = useGameAgentStore.getState();
  const api = bridge();
  if (!api) {
    store.failedToStart(gameId, prompt, 'The app bridge is not available.');
    return false;
  }
  const result = await api.games.agent.run({ gameId, prompt, engine: pick(store.engine).engine, passes: store.passes });
  if (!result.ok) {
    store.failedToStart(gameId, prompt, result.kind === 'error' ? result.message : 'The run could not start.');
    return false;
  }
  store.started(gameId, prompt, result.value.runId, store.passes);
  return true;
}

function EngineFields({ disabled }: { disabled?: boolean }) {
  const engine = useGameAgentStore((s) => pick(s.engine).choice);
  const passes = useGameAgentStore((s) => s.passes);
  const { setEngine, setPasses } = useGameAgentStore.getState();
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <select aria-label="Agent" className={field} value={engine} disabled={disabled} onChange={(e) => setEngine(e.target.value)}>
        {ENGINES.map((e) => (
          <option key={e.choice} value={e.choice}>
            {e.label}
          </option>
        ))}
      </select>
      <label className="flex flex-1 items-center gap-2">
        Passes
        <BrandSlider aria-label="Refinement passes" min={1} max={GAME_PASSES_MAX} value={passes} disabled={disabled}
          onValueChange={setPasses} className="flex-1" />
        <span className="w-6 text-right tabular-nums text-foreground">{passes}</span>
      </label>
    </div>
  );
}

const entryText = (e: GameThreadEntry): string =>
  e.kind === 'commit' ? `Pass ${e.pass}/${e.of}: ${e.commit.sha.slice(0, 7)} · ${e.commit.files.join(', ')}${e.undone ? ' (undone)' : ''}` : e.text;

function IteratePanel({ game, children }: { game: GameSummary; children?: ReactNode }) {
  const [prompt, setPrompt] = useState('');
  const [starting, setStarting] = useState(false);
  const entries = useGameAgentStore((s) => s.threads[game.gameId]) ?? EMPTY;
  const run = useGameAgentStore((s) => s.runs[game.gameId]) ?? null;
  const busy = run !== null || starting;
  const undoable = undoableCommit(entries);
  const onRun = async () => {
    setStarting(true);
    if (await startRun(game.gameId, prompt.trim())) setPrompt('');
    setStarting(false);
  };
  const onUndo = async (sha: string) => {
    const result = await bridge()?.games.agent.undo({ gameId: game.gameId, sha });
    const store = useGameAgentStore.getState();
    if (result?.ok) store.undone(game.gameId, sha);
    else if (result) store.note(game.gameId, 'error', result.kind === 'error' ? result.message : 'Undo stopped on conflicts.');
  };
  return (
    <MediaPanelLayout as="section" aria-label="Create and iterate" data-testid="game-iterate-panel">
      <MediaPanelBody className="flex flex-col gap-2">
        {children}
        <ol aria-label="Agent thread" className="flex flex-col gap-1 text-xs">
          {entries.map((e) => (
            <li key={e.id} data-kind={e.kind} className={e.kind === 'error' ? 'text-red-600 dark:text-red-400' : e.kind === 'user' ? 'font-medium' : 'text-muted-foreground'}>
              {entryText(e)}
            </li>
          ))}
          {run ? <li className="text-muted-foreground">Working… pass {Math.max(1, run.pass)} of {run.of}</li> : null}
        </ol>
        {undoable && undoable.kind === 'commit' && !busy ? (
          <button type="button" className={`${field} self-start`} onClick={() => void onUndo(undoable.commit.sha)}>
            Undo turn
          </button>
        ) : null}
      </MediaPanelBody>
      <MediaPanelFooter className="flex flex-col gap-2 border-t border-border/50 p-3">
        <EngineFields disabled={busy} />
        <textarea aria-label="Describe a change" rows={3} className={field} value={prompt} disabled={busy} onChange={(e) => setPrompt(e.target.value)} />
        {run ? (
          <button type="button" className={field} onClick={() => void bridge()?.games.agent.cancel({ gameId: game.gameId })}>
            Cancel
          </button>
        ) : (
          <button type="button" className={field} disabled={busy || !prompt.trim() || !game.valid} onClick={() => void onRun()}>
            Run
          </button>
        )}
      </MediaPanelFooter>
    </MediaPanelLayout>
  );
}

export const GAMER_GAME_AGENT_UI: GameAgentUi = {
  useEvents: useGameAgentEvents,
  EngineFields,
  useStartRun: () => useCallback((gameId: string, prompt: string) => startRun(gameId, prompt), []),
  IteratePanel,
};
