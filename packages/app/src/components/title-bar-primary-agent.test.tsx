import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../test-support/fixtures';
import { renderView } from '../../test-support/render';
import { useUiStore } from '../store/ui-store';
import { TitleBarPrimaryAgent } from './title-bar-primary-agent';

describe('TitleBarPrimaryAgent', () => {
  beforeEach(() => {
    useUiStore.setState({ primaryAgent: 'claude', primaryModelByAgent: {} });
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

  /**
   * OpenClaude is the mock bridge's own "not installed" fixture
   * (`test-support/mock-bridge.ts`'s `agent.list` status array) — the same
   * roster `new-session-picker.test.tsx` exercises for the terminal's `+`
   * menu. Both dropdowns read the identical `AgentStatus[]`, so a row here
   * greys out and routes exactly the way that one does.
   */
  describe('an unconfigured agent (OpenClaude)', () => {
    /**
     * `useAgents()` reads through TanStack Query, so the fixture's `status`
     * (`installed: false` for OpenClaude) only lands after the `agent.list`
     * promise resolves — a beat after the popover opens. Every assertion
     * below awaits the row rather than reading it synchronously, or it would
     * see the pre-resolution fallback (`UNPROBED`: empty status, "assume it
     * works") and read as configured.
     */
    it('renders as a real, non-native-disabled row, greyed via aria-disabled', async () => {
      renderView(<TitleBarPrimaryAgent />, { fixtures });
      fireEvent.click(screen.getByTestId('titlebar-primary-agent'));

      const row = (await screen.findByTestId('primary-agent-item-openclaude')) as HTMLButtonElement;
      await vi.waitFor(() => expect(row.getAttribute('aria-disabled')).toBe('true'));
      expect(row.disabled).toBe(false);
    });

    it('routes a click to Settings ▸ Agents instead of setting it primary', async () => {
      renderView(<TitleBarPrimaryAgent />, { fixtures });
      fireEvent.click(screen.getByTestId('titlebar-primary-agent'));

      const row = await screen.findByTestId('primary-agent-item-openclaude');
      await vi.waitFor(() => expect(row.getAttribute('aria-disabled')).toBe('true'));
      fireEvent.click(row);

      expect(useUiStore.getState().primaryAgent).toBe('claude');
      expect(useUiStore.getState().activeView).toBe('settings');
      expect(useUiStore.getState().settingsPage).toBe('agent');
      expect(useUiStore.getState().pendingAgentFocus).toBe('openclaude');
      // The popover closes like a normal selection would.
      expect(screen.queryByPlaceholderText('Find an agent…')).toBeNull();
    });

    it('routes Enter on the highlighted row the same way', async () => {
      renderView(<TitleBarPrimaryAgent />, { fixtures });
      fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
      const input = screen.getByPlaceholderText('Find an agent…');

      fireEvent.change(input, { target: { value: 'openclaude' } });
      const row = await screen.findByTestId('primary-agent-item-openclaude');
      await vi.waitFor(() => expect(row.getAttribute('aria-disabled')).toBe('true'));
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(useUiStore.getState().primaryAgent).toBe('claude');
      expect(useUiStore.getState().activeView).toBe('settings');
      expect(useUiStore.getState().pendingAgentFocus).toBe('openclaude');
    });
  });

  describe('model pill and quick switcher (Phase 111 Theme D)', () => {
    it('shows no pill on the default model', () => {
      renderView(<TitleBarPrimaryAgent />);
      expect(screen.queryByTestId('titlebar-primary-model')).toBeNull();
    });

    it('shows the chosen model beside the icon and in the label', () => {
      useUiStore.setState({ primaryModelByAgent: { claude: 'opus-5' } });
      renderView(<TitleBarPrimaryAgent />);
      expect(screen.getByTestId('titlebar-primary-model').textContent).toBe('Opus 5');
      expect(screen.getByTestId('titlebar-primary-agent').getAttribute('aria-label')).toBe(
        'Primary agent: Claude · Opus 5',
      );
    });

    it('lists the primary agent models and picks one on click', () => {
      renderView(<TitleBarPrimaryAgent />);
      fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
      expect(screen.getByTestId('primary-model-section')).toBeTruthy();
      fireEvent.click(screen.getByTestId('primary-model-item-opus-5'));
      expect(useUiStore.getState().primaryModelByAgent['claude']).toBe('opus-5');
      expect(useUiStore.getState().primaryAgent).toBe('claude');
    });

    it('choosing Default clears the model', () => {
      useUiStore.setState({ primaryModelByAgent: { claude: 'opus-5' } });
      renderView(<TitleBarPrimaryAgent />);
      fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
      fireEvent.click(screen.getByTestId('primary-model-item-default'));
      expect(useUiStore.getState().primaryModelByAgent['claude']).toBeNull();
    });

    it('ArrowUp from the first row wraps into the model list and Enter picks it', () => {
      renderView(<TitleBarPrimaryAgent />);
      fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
      const input = screen.getByPlaceholderText('Find an agent…');
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(useUiStore.getState().primaryModelByAgent['claude']).toBe('haiku');
    });

    it('hides the model list for an agent with a single model', () => {
      useUiStore.setState({ primaryAgent: 'codex' });
      renderView(<TitleBarPrimaryAgent />);
      fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
      expect(screen.queryByTestId('primary-model-section')).toBeNull();
    });
  });
});
