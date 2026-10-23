// vitest/jsdom: the modal over a mock bridge — it appears on the event and answers resume or kill; no real browser needed.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AgentPausePrompt } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentPauseModal } from './agent-pause-modal';

const prompt: AgentPausePrompt = {
  id: 'p1',
  sessionId: 's1',
  severity: 'critical',
  title: 'Agent asked the keychain for a password',
  detail: 'An agent session ran security find-generic-password.',
  at: 1,
};

let emit: (p: AgentPausePrompt) => void = () => undefined;
const resolveAgentPause = vi.fn();

beforeEach(() => {
  resolveAgentPause.mockResolvedValue(true);
  window.midniteStudio = {
    vanguard: {
      onAgentPaused: (handler: (p: AgentPausePrompt) => void) => {
        emit = handler;
        return () => undefined;
      },
      resolveAgentPause,
    },
  } as never;
});
afterEach(() => {
  cleanup();
  resolveAgentPause.mockReset();
});

describe('AgentPauseModal', () => {
  it('is closed until a pause arrives, then shows what happened', () => {
    render(<AgentPauseModal />);
    expect(screen.queryByText('Kill session')).toBeNull();
    act(() => emit(prompt));
    expect(screen.getByText(prompt.title)).toBeTruthy();
  });

  it('Resume and Kill answer main with the prompt id and close the modal', () => {
    render(<AgentPauseModal />);
    act(() => emit(prompt));
    fireEvent.click(screen.getByText('Kill session'));
    expect(resolveAgentPause).toHaveBeenCalledWith({ id: 'p1', action: 'kill' });
    expect(screen.queryByText('Kill session')).toBeNull();
    act(() => emit({ ...prompt, id: 'p2' }));
    fireEvent.click(screen.getByText('Resume'));
    expect(resolveAgentPause).toHaveBeenCalledWith({ id: 'p2', action: 'resume' });
  });
});
