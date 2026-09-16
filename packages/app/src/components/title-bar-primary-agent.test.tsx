import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderView } from '../../test-support/render';
import { useUiStore } from '../store/ui-store';
import { TitleBarPrimaryAgent } from './title-bar-primary-agent';

describe('TitleBarPrimaryAgent', () => {
  beforeEach(() => {
    useUiStore.setState({ primaryAgent: 'claude' });
  });

  afterEach(cleanup);

  it('renders a compact trigger button with accessible label for active primary agent', () => {
    renderView(<TitleBarPrimaryAgent />);

    const trigger = screen.getByTestId('titlebar-primary-agent');
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-label')).toBe('Primary agent: Claude');
  });

  it('opens the dropdown on click and lists available agents with active one marked and section headers displayed', () => {
    renderView(<TitleBarPrimaryAgent />);

    const trigger = screen.getByTestId('titlebar-primary-agent');
    fireEvent.click(trigger);

    // Section headers
    expect(screen.getByText('Proprietary')).toBeTruthy();
    expect(screen.getByText('Open Source')).toBeTruthy();

    // Proprietary agents
    expect(screen.getByTestId('primary-agent-item-claude')).toBeTruthy();
    expect(screen.getByTestId('primary-agent-item-codex')).toBeTruthy();
    expect(screen.getByTestId('primary-agent-item-agy')).toBeTruthy();

    // Open source agents
    expect(screen.getByTestId('primary-agent-item-goose')).toBeTruthy();
    expect(screen.getByTestId('primary-agent-item-opencode')).toBeTruthy();

    // Checkmark is shown for currently active primary agent
    expect(screen.getByTestId('primary-agent-check-claude')).toBeTruthy();
    expect(screen.queryByTestId('primary-agent-check-codex')).toBeNull();
  });

  it('clicking an agent item selects it as primaryAgent and updates the trigger', () => {
    renderView(<TitleBarPrimaryAgent />);

    // Open dropdown
    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));

    // Select Codex
    fireEvent.click(screen.getByTestId('primary-agent-item-codex'));

    // ui-store is updated
    expect(useUiStore.getState().primaryAgent).toBe('codex');

    // Trigger is updated
    const trigger = screen.getByTestId('titlebar-primary-agent');
    expect(trigger.getAttribute('aria-label')).toBe('Primary agent: Codex');
  });

  it('initialises with non-default primaryAgent if configured in store', () => {
    renderView(<TitleBarPrimaryAgent />, { uiState: { primaryAgent: 'agy' } });

    const trigger = screen.getByTestId('titlebar-primary-agent');
    expect(trigger.getAttribute('aria-label')).toBe('Primary agent: Antigravity');
  });

  it('filters agents by search query matching label or command', () => {
    renderView(<TitleBarPrimaryAgent />);

    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    const input = screen.getByPlaceholderText('Find an agent…');

    // Query for "goose" (Open Source)
    fireEvent.change(input, { target: { value: 'goose' } });

    expect(screen.queryByText('Proprietary')).toBeNull();
    expect(screen.getByText('Open Source')).toBeTruthy();
    expect(screen.getByTestId('primary-agent-item-goose')).toBeTruthy();
    expect(screen.queryByTestId('primary-agent-item-claude')).toBeNull();

    // Query for "agy" (Proprietary command)
    fireEvent.change(input, { target: { value: 'agy' } });

    expect(screen.getByText('Proprietary')).toBeTruthy();
    expect(screen.queryByText('Open Source')).toBeNull();
    expect(screen.getByTestId('primary-agent-item-agy')).toBeTruthy();
    expect(screen.queryByTestId('primary-agent-item-goose')).toBeNull();
  });

  it('displays empty state message when no agent matches the query', () => {
    renderView(<TitleBarPrimaryAgent />);

    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    const input = screen.getByPlaceholderText('Find an agent…');

    fireEvent.change(input, { target: { value: 'nonexistent-agent' } });

    expect(screen.getByText('No agent matches "nonexistent-agent".')).toBeTruthy();
    expect(screen.queryByText('Proprietary')).toBeNull();
    expect(screen.queryByText('Open Source')).toBeNull();
    expect(screen.queryByRole('menuitemradio')).toBeNull();
  });

  it('supports keyboard navigation across filtered items and selection on Enter', () => {
    renderView(<TitleBarPrimaryAgent />);

    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    const input = screen.getByPlaceholderText('Find an agent…');

    // Filter to "open" -> matches OpenClaude and OpenCode
    fireEvent.change(input, { target: { value: 'open' } });

    const openClaude = screen.getByTestId('primary-agent-item-openclaude');
    const openCode = screen.getByTestId('primary-agent-item-opencode');

    // Initially first item is highlighted
    expect(openClaude.getAttribute('aria-selected')).toBe('true');
    expect(openCode.getAttribute('aria-selected')).toBe('false');

    // Press ArrowDown to move highlight to OpenCode
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(openClaude.getAttribute('aria-selected')).toBe('false');
    expect(openCode.getAttribute('aria-selected')).toBe('true');

    // Press Enter to select highlighted item
    fireEvent.keyDown(input, { key: 'Enter' });

    // Store is updated
    expect(useUiStore.getState().primaryAgent).toBe('opencode');

    // Popover is closed
    expect(screen.queryByPlaceholderText('Find an agent…')).toBeNull();

    // Trigger is updated
    const trigger = screen.getByTestId('titlebar-primary-agent');
    expect(trigger.getAttribute('aria-label')).toBe('Primary agent: OpenCode');
  });

  it('wraps keyboard navigation at list boundaries', () => {
    renderView(<TitleBarPrimaryAgent />);

    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    const input = screen.getByPlaceholderText('Find an agent…');

    fireEvent.change(input, { target: { value: 'open' } });

    const openClaude = screen.getByTestId('primary-agent-item-openclaude');
    const openCode = screen.getByTestId('primary-agent-item-opencode');

    // ArrowUp from index 0 wraps to the last item (OpenCode)
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(openCode.getAttribute('aria-selected')).toBe('true');

    // ArrowDown from last item wraps back to first item (OpenClaude)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(openClaude.getAttribute('aria-selected')).toBe('true');
  });

  it('selecting an agent updates primary agent and checkmark', () => {
    renderView(<TitleBarPrimaryAgent />);

    // Initially Claude is primary
    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    expect(screen.getByTestId('primary-agent-check-claude')).toBeTruthy();

    // Select Goose
    fireEvent.click(screen.getByTestId('primary-agent-item-goose'));
    expect(useUiStore.getState().primaryAgent).toBe('goose');

    // Reopen popover
    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    expect(screen.getByTestId('primary-agent-check-goose')).toBeTruthy();
    expect(screen.queryByTestId('primary-agent-check-claude')).toBeNull();
  });
});
