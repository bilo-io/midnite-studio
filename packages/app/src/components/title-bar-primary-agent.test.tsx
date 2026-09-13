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

  it('opens the dropdown on click and lists available agents with active one marked', () => {
    renderView(<TitleBarPrimaryAgent />);

    const trigger = screen.getByTestId('titlebar-primary-agent');
    fireEvent.click(trigger);

    expect(screen.getByText('Primary Agent')).toBeTruthy();
    expect(screen.getByTestId('primary-agent-item-claude')).toBeTruthy();
    expect(screen.getByTestId('primary-agent-item-codex')).toBeTruthy();
    expect(screen.getByTestId('primary-agent-item-agy')).toBeTruthy();

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
});
