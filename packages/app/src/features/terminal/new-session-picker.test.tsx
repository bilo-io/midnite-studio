import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentDefinition, AgentStatus } from '@midnite/studio-shared';

import { NewSessionPicker } from './new-session-picker';

afterEach(cleanup);

/**
 * A small roster rather than the full `BUILTIN_AGENTS` — enough to cover both
 * sections (`claude` is proprietary, `opencode` and `goose` are not) without
 * every assertion having to know the whole catalog's shape.
 */
const agents: AgentDefinition[] = [
  { id: 'claude', label: 'Claude', command: 'claude', args: [], accent: '#D97757' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', args: [], accent: '#03B000' },
  { id: 'goose', label: 'Goose', command: 'goose', args: ['session'], accent: '#2E7D32' },
];

const installed: AgentStatus[] = agents.map((a) => ({
  id: a.id,
  installed: true,
  resolvedPath: `/usr/local/bin/${a.command}`,
}));

function setup(over: Partial<Parameters<typeof NewSessionPicker>[0]> = {}) {
  const onNewTerminal = vi.fn();
  const onNewAgent = vi.fn();
  render(
    <NewSessionPicker
      agents={agents}
      status={installed}
      hasWorktree
      onNewTerminal={onNewTerminal}
      onNewAgent={onNewAgent}
      {...over}
    />,
  );
  return { onNewTerminal, onNewAgent };
}

const openMenu = () => fireEvent.click(screen.getByLabelText('New terminal or agent'));
const search = () => screen.getByLabelText('Search agent CLIs') as HTMLInputElement;

describe('NewSessionPicker', () => {
  it('opens with every section and both new agents visible', () => {
    setup();
    openMenu();

    expect(screen.getByText('Proprietary')).toBeDefined();
    expect(screen.getByText('Open Source')).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Claude' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Goose' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'OpenCode' })).toBeDefined();
  });

  it('lands focus in the search box the instant the menu opens', () => {
    setup();
    openMenu();

    expect(document.activeElement).toBe(search());
  });

  /** Typing the label finds it. */
  it('filters to matching rows as the label is typed', () => {
    setup();
    openMenu();

    fireEvent.change(search(), { target: { value: 'goose' } });

    expect(screen.getByRole('menuitem', { name: 'Goose' })).toBeDefined();
    expect(screen.queryByRole('menuitem', { name: 'Claude' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'OpenCode' })).toBeNull();
  });

  /** Typing an abbreviation finds it by fuzzy subsequence, not just prefix. */
  it('filters by a fuzzy abbreviation of the label', () => {
    setup();
    openMenu();

    fireEvent.change(search(), { target: { value: 'gs' } });

    expect(screen.getByRole('menuitem', { name: 'Goose' })).toBeDefined();
    expect(screen.queryByRole('menuitem', { name: 'Claude' })).toBeNull();
  });

  /** Typing the binary name, not just the label, finds a row too. */
  it('filters on command as well as label', () => {
    setup();
    openMenu();

    fireEvent.change(search(), { target: { value: 'opencode' } });

    expect(screen.getByRole('menuitem', { name: 'OpenCode' })).toBeDefined();
    expect(screen.queryByRole('menuitem', { name: 'Goose' })).toBeNull();
  });

  it('hides a section whose matches are empty rather than rendering an empty header', () => {
    setup();
    openMenu();

    fireEvent.change(search(), { target: { value: 'goose' } });

    expect(screen.queryByText('Proprietary')).toBeNull();
    expect(screen.getByText('Open Source')).toBeDefined();
  });

  it('says no CLI matches instead of rendering a blank menu', () => {
    setup();
    openMenu();

    fireEvent.change(search(), { target: { value: 'zzz-nonexistent' } });

    expect(screen.getByText(/No CLI matches/)).toBeDefined();
    // New Terminal is not part of the agent-CLI catalog the search filters —
    // it stays offered as an escape hatch even when nothing else matches.
    expect(screen.getByRole('menuitem', { name: 'New Terminal' })).toBeDefined();
  });

  it('moves the highlight through filtered rows with the arrow keys and picks with Enter', () => {
    const { onNewAgent } = setup();
    openMenu();

    // Highlight starts on New Terminal; one ArrowDown moves to the first agent
    // row, Claude, in section order.
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Claude' }).getAttribute('aria-selected')).toBe(
      'true',
    );

    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onNewAgent).toHaveBeenCalledWith(agents[0]);
  });

  it('wraps from the last row back to New Terminal on ArrowDown', () => {
    setup();
    openMenu();

    for (let i = 0; i < 4; i += 1) fireEvent.keyDown(search(), { key: 'ArrowDown' });

    expect(screen.getByRole('menuitem', { name: 'New Terminal' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('picks the highlighted row with Enter with no query typed', () => {
    const { onNewTerminal } = setup();
    openMenu();

    fireEvent.keyDown(search(), { key: 'Enter' });

    expect(onNewTerminal).toHaveBeenCalledOnce();
  });

  it('closes on Escape without picking anything', () => {
    const { onNewTerminal, onNewAgent } = setup();
    openMenu();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByLabelText('Search agent CLIs')).toBeNull();
    expect(onNewTerminal).not.toHaveBeenCalled();
    expect(onNewAgent).not.toHaveBeenCalled();
  });

  it('closes after picking an agent by click', () => {
    const { onNewAgent } = setup();
    openMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Goose' }));

    expect(onNewAgent).toHaveBeenCalledWith(agents[2]);
    expect(screen.queryByLabelText('Search agent CLIs')).toBeNull();
  });

  // No jest-dom matchers registered in this project's vitest setup — plain
  // DOM property/attribute reads, same as every other component test here.
  it('disables New Terminal and every row, with the worktree reason, when there is no worktree', () => {
    setup({ hasWorktree: false });
    openMenu();

    expect((screen.getByRole('menuitem', { name: 'New Terminal' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    const claude = screen.getByRole('menuitem', { name: 'Claude' }) as HTMLButtonElement;
    expect(claude.disabled).toBe(true);
    expect(claude.getAttribute('title')).toBe('No worktree selected');
  });
});
