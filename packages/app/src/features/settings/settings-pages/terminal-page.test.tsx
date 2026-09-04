import type { AgentDefinition, TerminalSession } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_TERMINAL_LINE_HEIGHT,
} from '../../terminal/terminal-font';
import type { ConnectionState } from '../../terminal/terminal-store';
import { activityRows, rendererRows, TerminalPage } from './terminal-page';

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TerminalPage />
    </QueryClientProvider>,
  );
}

const session = (overrides: Partial<TerminalSession> & { id: string }): TerminalSession => ({
  kind: 'shell',
  title: 'repo',
  cwd: '/repo',
  repoId: 'repo-1',
  createdAt: 0,
  ...overrides,
});

const agent = (overrides: Partial<AgentDefinition> & { id: string }): AgentDefinition => ({
  label: overrides.id,
  command: overrides.id,
  args: [],
  accent: '#000000',
  ...overrides,
});

describe('activityRows', () => {
  it('is empty with no sessions', () => {
    expect(activityRows([], {}, {}, {}, {}, [], 0)).toEqual([]);
  });

  it('excludes a plain shell and an exited agent session', () => {
    const sessions = [
      session({ id: 'a', kind: 'shell' }),
      session({ id: 'b', kind: 'agent', agentId: 'claude' }),
    ];
    const states: Record<string, ConnectionState> = { a: 'open', b: 'exited' };
    expect(activityRows(sessions, states, {}, {}, {}, [], 0)).toEqual([]);
  });

  it('includes a plain shell the probe found running an agent', () => {
    const sessions = [session({ id: 's1', kind: 'shell', title: 'repo' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };
    const agents = [agent({ id: 'claude', label: 'Claude', activity: { thinking: 't', frameEnd: 'f' } })];

    const rows = activityRows(sessions, states, {}, {}, { s1: 'claude' }, agents, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Claude');
  });

  it('reports "no detector" for an agent with no marker set', () => {
    const sessions = [session({ id: 's1', kind: 'agent', agentId: 'codex' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };
    const agents = [agent({ id: 'codex', label: 'Codex' })];

    const rows = activityRows(sessions, states, {}, {}, {}, agents, 0);
    expect(rows[0]?.activity).toBe('no detector');
    expect(rows[0]?.lastSeenSecondsAgo).toBeNull();
  });

  it('reports "unknown" for an agent with a detector that has not spoken', () => {
    const sessions = [session({ id: 's1', kind: 'agent', agentId: 'claude' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };
    const agents = [agent({ id: 'claude', activity: { thinking: 't', frameEnd: 'f' } })];

    const rows = activityRows(sessions, states, {}, {}, {}, agents, 0);
    expect(rows[0]?.activity).toBe('unknown');
  });

  it('reports the real guess and how long ago it was set', () => {
    const sessions = [session({ id: 's1', kind: 'agent', agentId: 'claude' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };
    const agents = [agent({ id: 'claude', activity: { thinking: 't', frameEnd: 'f' } })];

    const rows = activityRows(
      sessions,
      states,
      { s1: 'thinking' },
      { s1: 7_000 },
      {},
      agents,
      10_000,
    );
    expect(rows[0]?.activity).toBe('thinking');
    expect(rows[0]?.lastSeenSecondsAgo).toBe(3);
  });

  it('preserves session-list order rather than most-recently-active-first', () => {
    const sessions = [
      session({ id: 'a', kind: 'agent', agentId: 'claude' }),
      session({ id: 'b', kind: 'agent', agentId: 'claude' }),
    ];
    const states: Record<string, ConnectionState> = { a: 'open', b: 'open' };
    const agents = [agent({ id: 'claude', activity: { thinking: 't', frameEnd: 'f' } })];

    // b was seen more recently than a, but the order must not change for it.
    const rows = activityRows(
      sessions,
      states,
      { a: 'idle', b: 'thinking' },
      { a: 1, b: 9 },
      {},
      agents,
      10,
    );
    expect(rows.map((r) => r.sessionId)).toEqual(['a', 'b']);
  });
});

describe('rendererRows', () => {
  it('is empty with no sessions', () => {
    expect(rendererRows([], {}, {}, [])).toEqual([]);
  });

  it('excludes a session that is not live', () => {
    const sessions = [session({ id: 'a', kind: 'shell' })];
    const states: Record<string, ConnectionState> = { a: 'exited' };
    expect(rendererRows(sessions, states, { a: 'webgl' }, [])).toEqual([]);
  });

  it('reports "unmounted" for a live session with no reported renderer yet', () => {
    const sessions = [session({ id: 's1', kind: 'shell' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };

    const rows = rendererRows(sessions, states, {}, []);
    expect(rows[0]?.renderer).toBe('unmounted');
  });

  it('reports the renderer a live session actually landed on', () => {
    const sessions = [session({ id: 's1', kind: 'shell' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };

    const rows = rendererRows(sessions, states, { s1: 'dom' }, []);
    expect(rows[0]?.renderer).toBe('dom');
  });

  it("names an agent session by the roster's label", () => {
    const sessions = [session({ id: 's1', kind: 'agent', agentId: 'claude' })];
    const states: Record<string, ConnectionState> = { s1: 'open' };
    const agents = [agent({ id: 'claude', label: 'Claude' })];

    const rows = rendererRows(sessions, states, { s1: 'webgl' }, agents);
    expect(rows[0]?.name).toBe('Claude');
  });
});

describe('TerminalPage — Appearance (Phase 51 Theme B)', () => {
  afterEach(() => {
    cleanup();
    useUiStore.setState({
      terminalFontFamily: '',
      terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
      terminalLineHeight: DEFAULT_TERMINAL_LINE_HEIGHT,
    });
  });

  it('renders an empty font family (falling back to the default via its placeholder) and the persisted size/line-height', () => {
    useUiStore.setState({ terminalFontSize: 16, terminalLineHeight: 1.3 });
    renderWithClient();

    const family = screen.getByLabelText('Font family') as HTMLInputElement;
    expect(family.value).toBe('');
    expect(family.placeholder).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
    expect(screen.getByLabelText('Font size')).toHaveProperty('value', '16');
    expect(screen.getByLabelText('Line height')).toHaveProperty('value', '1.3');
  });

  it('typing a font family updates the store', () => {
    renderWithClient();

    fireEvent.change(screen.getByLabelText('Font family'), { target: { value: 'Comic Mono' } });

    expect(useUiStore.getState().terminalFontFamily).toBe('Comic Mono');
  });

  it('moving the font size slider updates the store', () => {
    renderWithClient();

    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '18' } });

    expect(useUiStore.getState().terminalFontSize).toBe(18);
  });

  it('moving the line height slider updates the store', () => {
    renderWithClient();

    fireEvent.change(screen.getByLabelText('Line height'), { target: { value: '1.45' } });

    expect(useUiStore.getState().terminalLineHeight).toBe(1.45);
  });
});
