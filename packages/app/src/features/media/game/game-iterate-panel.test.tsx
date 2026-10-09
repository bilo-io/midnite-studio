import { GAME_PASSES_DEFAULT, GAMES_OLLAMA_WARNING, type GameSummary } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { undoableCommit, useGameAgentEvents, useGameAgentStore } from './game-agent-store';
import { GameIteratePanel, parseEngineChoice } from './game-iterate-panel';

/**
 * Create and iterate (Phase 107 Theme M) through the mock bridge. Plain jsdom:
 * a select, a range input, a thread fed by pushed progress events.
 */

const GAME: GameSummary = {
  gameId: 'g000000000001',
  name: 'Moon Rover',
  path: '/Midnite Games/moon-rover',
  engine: 'phaser',
  dimension: '2d',
  starter: 'top-down',
  dirty: false,
  valid: true,
  issue: null,
};

type MockGames = { calls: Array<Record<string, unknown>>; agentProgress: (event: unknown) => void };
const mockGames = (): MockGames => (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames;

function Harness() {
  useGameAgentEvents();
  return <GameIteratePanel game={GAME} />;
}

afterEach(() => {
  cleanup();
  useGameAgentStore.setState({ threads: {}, runs: {}, engine: null, passes: GAME_PASSES_DEFAULT, ollamaWarningDismissed: false });
});

describe('GameIteratePanel', () => {
  it('offers MCP agents first, then Ollama models, and warns only for Ollama', async () => {
    renderView(<Harness />, { fixtures });
    const picker = await screen.findByTestId('game-engine-picker');
    expect(picker).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Provider:/ }));
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0));
    const optionLabels = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(optionLabels.some((l) => l.includes('Claude'))).toBe(true);
    expect(optionLabels.some((l) => l.includes('Ollama'))).toBe(true);

    expect(screen.queryByTestId('games-ollama-banner')).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: /Ollama/ }));
    const banner = await screen.findByTestId('games-ollama-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain(GAMES_OLLAMA_WARNING);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss warning' }));
    expect(screen.queryByTestId('games-ollama-banner')).toBeNull();
  });

  it('runs with the prompt, engine and passes, then streams commits with Undo turn on the newest', async () => {
    renderView(<Harness />, { fixtures });
    await screen.findByTestId('game-engine-picker');
    fireEvent.change(screen.getByRole('slider', { name: 'Refinement passes' }), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Prompt' }), { target: { value: 'Add a double jump' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run agent' }));

    await waitFor(() => expect(mockGames().calls.some((c) => c.call === 'agentRun')).toBe(true));
    const call = mockGames().calls.find((c) => c.call === 'agentRun')!;
    expect(call).toMatchObject({ gameId: GAME.gameId, prompt: 'Add a double jump', passes: 2, engine: { kind: 'agent', agentId: 'claude' } });
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeTruthy();

    const runId = useGameAgentStore.getState().runs[GAME.gameId]!.runId;
    const push = (event: Record<string, unknown>) => act(() => mockGames().agentProgress({ gameId: GAME.gameId, runId, of: 2, ...event }));
    push({ pass: 1, action: 'Ran the game' });
    push({ pass: 1, commit: { sha: 'aaaaaaa1111', files: ['src/player.js'] } });
    push({ pass: 2, commit: { sha: 'bbbbbbb2222', files: ['src/player.js', 'src/hud.js'] } });
    // No Undo while the run is live.
    expect(screen.queryByRole('button', { name: 'Undo turn' })).toBeNull();
    push({
      pass: 2,
      finished: { outcome: 'done', message: '2 commits — Added a double jump.', commits: [{ sha: 'aaaaaaa1111', files: [] }, { sha: 'bbbbbbb2222', files: [] }] },
    });

    expect(screen.getByText('Ran the game')).toBeTruthy();
    expect(screen.getAllByTestId('game-thread-commit')).toHaveLength(2);
    const undo = screen.getAllByRole('button', { name: 'Undo turn' });
    expect(undo).toHaveLength(1);
    fireEvent.click(undo[0]!);
    await waitFor(() => expect(mockGames().calls.some((c) => c.call === 'agentUndo' && c.sha === 'bbbbbbb2222')).toBe(true));
    expect(await screen.findByText(/Undid bbbbbbb with a new revert commit/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo turn' })).toBeNull();
  });
});

describe('game agent store', () => {
  it('marks per-pass commits squashed when the run ends with one squashed commit', () => {
    const store = useGameAgentStore.getState();
    store.started('g1', 'x', 'r1', 2);
    store.applyProgress({ gameId: 'g1', runId: 'r1', pass: 1, of: 2, commit: { sha: 'a1', files: ['src/a.js'] } });
    store.applyProgress({ gameId: 'g1', runId: 'r1', pass: 2, of: 2, commit: { sha: 'b2', files: ['src/b.js'] } });
    store.applyProgress({
      gameId: 'g1',
      runId: 'r1',
      pass: 2,
      of: 2,
      finished: { outcome: 'done', message: '1 commit.', commits: [{ sha: 'c3', files: ['src/a.js', 'src/b.js'] }] },
    });
    const entries = useGameAgentStore.getState().threads.g1!;
    expect(entries.filter((e) => e.kind === 'commit' && e.squashed)).toHaveLength(2);
    const last = undoableCommit(entries);
    expect(last?.kind === 'commit' && last.commit.sha).toBe('c3');
    expect(useGameAgentStore.getState().runs.g1).toBeUndefined();
  });

  it('parses engine choices, including Ollama tags with colons', () => {
    expect(parseEngineChoice('agent:claude')).toEqual({ kind: 'agent', agentId: 'claude' });
    expect(parseEngineChoice('ollama:qwen2.5-coder:7b')).toEqual({ kind: 'ollama', model: 'qwen2.5-coder:7b' });
    expect(parseEngineChoice('ollama:')).toBeNull();
  });
});
