import { cleanup, fireEvent, screen } from '@testing-library/react';
import { createBlankAgentProfile, type AgentProfile } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderView } from '../../test-support/render';
import { useUiStore } from '../store/ui-store';
import { TitleBarPrimaryAgent } from './title-bar-primary-agent';

/** Phase 154 Theme H — the picker's "Your agents" section makes a custom agent the companion's. */

const reviewer: AgentProfile = { ...createBlankAgentProfile(), id: 'profile-rev', name: 'Reviewer', baseAgentId: 'claude', accent: '#22aa88' };
const ghost: AgentProfile = { ...createBlankAgentProfile(), id: 'profile-ghost', name: 'Ghost', baseAgentId: 'not-a-cli', accent: '#aa2288' };
const profiles = vi.hoisted(() => ({ list: [] as AgentProfile[] }));

vi.mock('../compose/profile-launch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../compose/profile-launch')>()),
  useStudioAgentProfiles: () => profiles.list,
}));

describe('TitleBarPrimaryAgent — Your agents', () => {
  beforeEach(() => {
    profiles.list = [reviewer, ghost];
    useUiStore.setState({ primaryAgent: 'codex', primaryModelByAgent: {}, primaryAgentProfileId: null });
  });
  afterEach(cleanup);

  it('lists custom agents first, with their base CLI', () => {
    renderView(<TitleBarPrimaryAgent />);
    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    expect(screen.getByText('Your agents')).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: 'Reviewer (Claude)' })).toBeTruthy();
  });

  it('choosing one sets the companion agent only, and the pill names it', () => {
    renderView(<TitleBarPrimaryAgent />);
    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    fireEvent.click(screen.getByTestId('primary-agent-profile-profile-rev'));
    expect(useUiStore.getState().primaryAgentProfileId).toBe('profile-rev');
    expect(useUiStore.getState().primaryAgent).toBe('codex');
    const trigger = screen.getByTestId('titlebar-primary-agent');
    expect(trigger.getAttribute('aria-label')).toBe('Companion agent: Reviewer (Claude)');
    expect(screen.getByTestId('titlebar-companion-profile').textContent).toBe('Reviewer');
  });

  it('marks the chosen custom agent, unchecks the built-in and hides the Model rows', () => {
    useUiStore.setState({ primaryAgent: 'claude', primaryAgentProfileId: 'profile-rev' });
    renderView(<TitleBarPrimaryAgent />);
    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    expect(screen.getByTestId('primary-agent-profile-check-profile-rev')).toBeTruthy();
    expect(screen.queryByTestId('primary-agent-check-claude')).toBeNull();
    expect(screen.queryByTestId('primary-model-section')).toBeNull();
  });

  it('Enter on the first row picks the first custom agent', () => {
    renderView(<TitleBarPrimaryAgent />);
    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    fireEvent.keyDown(screen.getByLabelText('Search agents'), { key: 'Enter' });
    expect(useUiStore.getState().primaryAgentProfileId).toBe('profile-rev');
  });

  it('a custom agent whose base CLI is missing cannot be chosen', () => {
    renderView(<TitleBarPrimaryAgent />);
    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    const row = screen.getByTestId('primary-agent-profile-profile-ghost');
    expect(row.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row);
    expect(useUiStore.getState().primaryAgentProfileId).toBeNull();
  });

  it('picking a built-in clears the custom agent; a deleted one shows the built-in', () => {
    useUiStore.setState({ primaryAgentProfileId: 'profile-rev' });
    renderView(<TitleBarPrimaryAgent />);
    fireEvent.click(screen.getByTestId('titlebar-primary-agent'));
    fireEvent.click(screen.getByTestId('primary-agent-item-agy'));
    expect(useUiStore.getState().primaryAgentProfileId).toBeNull();
    cleanup();

    profiles.list = [];
    useUiStore.setState({ primaryAgent: 'codex', primaryAgentProfileId: 'profile-rev' });
    renderView(<TitleBarPrimaryAgent />);
    expect(screen.getByTestId('titlebar-primary-agent').getAttribute('aria-label')).toBe('Primary agent: Codex');
  });
});
