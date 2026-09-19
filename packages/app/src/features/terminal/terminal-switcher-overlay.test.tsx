import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AgentDefinition, AgentStatus } from '@midnite/studio-shared';

import { createTestQueryClient, renderView } from '../../../test-support/render';
import { keys } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from './terminal-store';
import { TerminalSwitcherOverlay } from './terminal-switcher-overlay';

const REPO_ID = 'repo-1';
const CWD = '/repos/demo';

/**
 * A small roster — an installed one (`claude`) and an installed-but-second
 * one (`cursor`) so cycling has somewhere to land, plus a not-installed one
 * (`goose`) whose whole job in this file is to prove it never shows up here
 * at all — the not-installed-agent picker is a sibling surface's concern
 * (`title-bar-primary-agent.tsx`), not this HUD's.
 */
const agents: AgentDefinition[] = [
  { id: 'claude', label: 'Claude', command: 'claude', args: [], accent: '#D97757' },
  { id: 'cursor', label: 'Cursor', command: 'cursor-agent', args: [], accent: '#0066FF' },
  { id: 'goose', label: 'Goose', command: 'goose', args: ['session'], accent: '#2E7D32' },
];

const status: AgentStatus[] = [
  { id: 'claude', installed: true, resolvedPath: '/usr/local/bin/claude' },
  { id: 'cursor', installed: true, resolvedPath: '/usr/local/bin/cursor-agent' },
  { id: 'goose', installed: false, resolvedPath: null },
];

function open() {
  useUiStore.setState({
    selectedRepoId: REPO_ID,
    selectedWorktreePath: CWD,
    terminalOpen: false,
    terminalSwitcherOpen: true,
    terminalSwitcherIndex: 0,
  });
  const queryClient = createTestQueryClient();
  // Seeded directly rather than through a mock bridge (`renderView`'s
  // `fixtures` option): `useAgents`/`useRepos` both key off a plain
  // `['agents']`/`keys.repos` query, and pre-populating the cache is what
  // makes every assertion below synchronous — no `waitFor` for a fetch that
  // would otherwise race the fallback roster it starts from.
  queryClient.setQueryData(['agents'], { agents, status });
  queryClient.setQueryData(keys.repos, [{ id: REPO_ID, name: 'demo', path: CWD, worktrees: [] }]);
  return renderView(<TerminalSwitcherOverlay />, { queryClient });
}

describe('TerminalSwitcherOverlay', () => {
  beforeEach(() => {
    useUiStore.setState({
      selectedRepoId: null,
      selectedWorktreePath: null,
      terminalOpen: false,
      terminalSwitcherOpen: false,
      terminalSwitcherIndex: 0,
    });
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, foregroundCommand: {} });
  });

  afterEach(cleanup);

  it('renders nothing when terminalSwitcherOpen is false', () => {
    useUiStore.setState({ terminalSwitcherOpen: false });
    const { container } = renderView(<TerminalSwitcherOverlay />, { queryClient: createTestQueryClient() });
    expect(container.firstChild).toBeNull();
  });

  it('renders "Terminal" first, then every INSTALLED agent — never a not-installed one', () => {
    open();

    expect(screen.getByTestId('terminal-switcher-option-terminal')).toBeDefined();
    expect(screen.getByTestId('terminal-switcher-option-claude')).toBeDefined();
    expect(screen.getByTestId('terminal-switcher-option-cursor')).toBeDefined();
    expect(screen.queryByTestId('terminal-switcher-option-goose')).toBeNull();
    expect(
      screen.getByTestId('terminal-switcher-option-terminal').getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('cycles selection on ArrowRight and ArrowLeft, wrapping across all 3 options', () => {
    open();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useUiStore.getState().terminalSwitcherIndex).toBe(1);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useUiStore.getState().terminalSwitcherIndex).toBe(2);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useUiStore.getState().terminalSwitcherIndex).toBe(0);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(useUiStore.getState().terminalSwitcherIndex).toBe(2);
  });

  it('selects an option directly using digit keys 1-3', () => {
    open();

    fireEvent.keyDown(window, { key: '2' });
    expect(useUiStore.getState().terminalSwitcherIndex).toBe(1);
    fireEvent.keyDown(window, { key: '3' });
    expect(useUiStore.getState().terminalSwitcherIndex).toBe(2);
    fireEvent.keyDown(window, { key: '1' });
    expect(useUiStore.getState().terminalSwitcherIndex).toBe(0);
  });

  it('commits "Terminal" on Enter — a plain shell, exactly like terminal.new used to', () => {
    open();

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(useUiStore.getState()).toMatchObject({
      terminalSwitcherOpen: false,
      terminalOpen: true,
    });
    const { sessions } = useTerminalStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.kind).toBe('shell');
    expect(sessions[0]?.agentId).toBeUndefined();
    expect(sessions[0]?.cwd).toBe(CWD);
    expect(sessions[0]?.title).toBe('demo');
  });

  it('commits the highlighted agent on Enter — an agent session, not a shell', () => {
    open();

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // index 0 is Terminal, 1 is Claude
    fireEvent.keyDown(window, { key: 'Enter' });

    const { sessions } = useTerminalStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.kind).toBe('agent');
    expect(sessions[0]?.agentId).toBe('claude');
  });

  it('cancels without starting anything on Escape', () => {
    open();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(useUiStore.getState()).toMatchObject({
      terminalSwitcherOpen: false,
      terminalOpen: false,
    });
    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });

  it('commits on keyup of Meta (Mod on macOS)', () => {
    open();

    fireEvent.keyUp(window, { key: 'Meta' });

    expect(useUiStore.getState().terminalSwitcherOpen).toBe(false);
    expect(useTerminalStore.getState().sessions).toHaveLength(1);
  });

  it('commits on keyup of Control (Mod on Linux/Windows)', () => {
    open();

    fireEvent.keyUp(window, { key: 'Control' });

    expect(useUiStore.getState().terminalSwitcherOpen).toBe(false);
    expect(useTerminalStore.getState().sessions).toHaveLength(1);
  });

  it('clicking an option selects it and commits immediately', () => {
    open();

    fireEvent.click(screen.getByTestId('terminal-switcher-option-cursor'));

    expect(useUiStore.getState().terminalSwitcherOpen).toBe(false);
    const { sessions } = useTerminalStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.agentId).toBe('cursor');
  });

  it('registers and unregisters as an occluder during its lifecycle', () => {
    expect(useUiStore.getState().occluders).toBe(0);
    open();
    expect(useUiStore.getState().occluders).toBe(1);

    cleanup();
    expect(useUiStore.getState().occluders).toBe(0);
  });
});
