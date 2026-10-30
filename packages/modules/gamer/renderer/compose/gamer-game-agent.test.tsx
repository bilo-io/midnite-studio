// vitest/jsdom: the panel's controls and its thread over a mock bridge — no layout or browser needed.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameAgentStore } from '@midnite/studio-feature-media-game/renderer';
import type { GameAgentProgress, GameSummary } from '@midnite/studio-shared';

import { GAMER_GAME_AGENT_UI } from './gamer-game-agent';

const GAME = { gameId: 'g1', name: 'Demo', path: '/games/demo', valid: true } as unknown as GameSummary;
let progress: ((event: GameAgentProgress) => void) | null = null;
const agent = {
  run: vi.fn(async () => ({ ok: true as const, value: { runId: 'ga-1', warnings: [] } })),
  cancel: vi.fn(async () => ({ ok: true as const })),
  undo: vi.fn(async () => ({ ok: true as const })),
  onProgress: vi.fn((handler: (event: GameAgentProgress) => void) => {
    progress = handler;
    return () => undefined;
  }),
};

beforeEach(() => {
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { games: { agent } };
  useGameAgentStore.setState({ threads: {}, runs: {}, engine: null, passes: 1 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Panel() {
  GAMER_GAME_AGENT_UI.useEvents();
  return <GAMER_GAME_AGENT_UI.IteratePanel game={GAME} />;
}

describe('Gamer’s create-and-iterate panel', () => {
  it('offers only Claude Code and Codex', () => {
    render(<Panel />);
    const options = Array.from(screen.getByLabelText('Agent').querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Claude Code', 'Codex']);
  });

  it('starts a run with the picked agent, shows its passes and lets the last turn be undone', async () => {
    render(<Panel />);
    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'agent:codex' } });
    fireEvent.change(screen.getByLabelText('Describe a change'), { target: { value: 'add a jump' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    });
    expect(agent.run).toHaveBeenCalledWith({ gameId: 'g1', prompt: 'add a jump', engine: { kind: 'agent', agentId: 'codex' }, passes: 1 });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();

    const commit = { sha: 'abcdef1234', files: ['src/main.js'] };
    act(() => progress?.({ gameId: 'g1', runId: 'ga-1', pass: 1, of: 1, commit }));
    act(() => progress?.({ gameId: 'g1', runId: 'ga-1', pass: 1, of: 1, finished: { outcome: 'done', message: '1 commit — Added a jump.', commits: [commit] } }));
    expect(screen.getByText(/Pass 1\/1: abcdef1 · src\/main.js/)).toBeTruthy();
    expect(screen.getByText('1 commit — Added a jump.')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo turn' }));
    });
    expect(agent.undo).toHaveBeenCalledWith({ gameId: 'g1', sha: 'abcdef1234' });
  });

  it('shows why a run could not start', async () => {
    agent.run.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'This game has uncommitted changes.' } as never);
    render(<Panel />);
    fireEvent.change(screen.getByLabelText('Describe a change'), { target: { value: 'x' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    });
    expect(screen.getByText('This game has uncommitted changes.')).toBeTruthy();
  });
});
