import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { useTerminalStore } from '../../terminal/terminal-store';
import { useUiStore } from '../../../store/ui-store';
import { AgentPage } from './agent-page';

// Mock openInMidnite so we can assert on docs link clicks.
vi.mock('../../../services/open-in-midnite', () => ({
  openInMidnite: vi.fn(),
}));

import { openInMidnite } from '../../../services/open-in-midnite';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useTerminalStore.setState({ sessions: [], activeId: null, pendingInput: {} });
  useUiStore.setState({
    agentModes: {},
    agentApiKeys: {},
    primaryAgent: 'claude',
    selectedWorktreePath: '/Users/test/midnite-studio',
    selectedRepoId: 'repo-1',
  });
});

describe('AgentPage - Agents Roster', () => {
  it('renders all agents with their install status and version', async () => {
    renderView(<AgentPage />, { fixtures });

    // Claude is installed with v2.1.34 in mock fixtures
    const claudeCard = await screen.findByTestId('agent-card-claude');
    expect(await within(claudeCard).findByText('v2.1.34')).toBeTruthy();
    expect(within(claudeCard).getByText('Claude')).toBeTruthy();
    expect(within(claudeCard).getByText('/Users/e2e/.local/bin/claude')).toBeTruthy();
    expect(within(claudeCard).getByRole('button', { name: 'Update in Terminal' })).toBeTruthy();

    // Antigravity is installed with v1.2.2
    const agyCard = screen.getByTestId('agent-card-agy');
    expect(await within(agyCard).findByText('v1.2.2')).toBeTruthy();
    expect(within(agyCard).getByText('Antigravity')).toBeTruthy();

    // OpenClaude is marked installed: false
    const openclaudeCard = screen.getByTestId('agent-card-openclaude');
    expect(await within(openclaudeCard).findByText('Not installed')).toBeTruthy();
    expect(within(openclaudeCard).getByText('OpenClaude')).toBeTruthy();
    expect(within(openclaudeCard).getByRole('button', { name: 'Install in Terminal' })).toBeTruthy();
  });

  it('clicking "Install in Terminal" spawns a shell and submits the command with \\r', async () => {
    renderView(<AgentPage />, { fixtures });

    const openclaudeCard = await screen.findByTestId('agent-card-openclaude');
    const installBtn = await within(openclaudeCard).findByRole('button', {
      name: 'Install in Terminal',
    });

    fireEvent.click(installBtn);

    const { sessions, pendingInput } = useTerminalStore.getState();
    expect(sessions.length).toBe(1);
    const session = sessions[0]!;
    expect(session.kind).toBe('shell');
    expect(session.title).toBe('OpenClaude install');
    expect(session.cwd).toBe('/Users/test/midnite-studio');

    // Must be queued with trailing carriage return to submit automatically
    expect(pendingInput[session.id]).toBe('npm i -g @gitlawb/openclaude\r');
  });

  it('clicking "Update in Terminal" spawns a shell and submits update command with \\r', async () => {
    renderView(<AgentPage />, { fixtures });

    const claudeCard = await screen.findByTestId('agent-card-claude');
    const updateBtn = await within(claudeCard).findByRole('button', { name: 'Update in Terminal' });

    fireEvent.click(updateBtn);

    const { sessions, pendingInput } = useTerminalStore.getState();
    expect(sessions.length).toBe(1);
    const session = sessions[0]!;
    expect(session.kind).toBe('shell');
    expect(session.title).toBe('Claude update');

    expect(pendingInput[session.id]).toBe('claude update\r');
  });

  it('clicking Docs opens documentation in midnite/browser', async () => {
    renderView(<AgentPage />, { fixtures });

    const claudeCard = await screen.findByTestId('agent-card-claude');
    const docsBtn = within(claudeCard).getByRole('button', { name: 'Docs' });

    fireEvent.click(docsBtn);

    expect(openInMidnite).toHaveBeenCalledWith(
      'https://docs.anthropic.com/en/docs/agents-and-tools/claude-code',
    );
  });

  it('toggling agent mode updates uiStore agentModes', async () => {
    renderView(<AgentPage />, { fixtures });

    const claudeCard = await screen.findByTestId('agent-card-claude');

    // Default mode is 'both'
    const cliBtn = within(claudeCard).getByRole('button', { name: 'CLI' });
    fireEvent.click(cliBtn);

    expect(useUiStore.getState().agentModes['claude']).toBe('cli');

    const apiBtn = within(claudeCard).getByRole('button', { name: 'API' });
    fireEvent.click(apiBtn);

    expect(useUiStore.getState().agentModes['claude']).toBe('api');

    const noneBtn = within(claudeCard).getByRole('button', { name: 'None' });
    fireEvent.click(noneBtn);

    expect(useUiStore.getState().agentModes['claude']).toBe('none');

    const bothBtn = within(claudeCard).getByRole('button', { name: 'Both' });
    fireEvent.click(bothBtn);

    expect(useUiStore.getState().agentModes['claude']).toBe('both');
  });

  it('entering API key stores it in uiStore and toggles visibility', async () => {
    renderView(<AgentPage />, { fixtures });

    const claudeCard = await screen.findByTestId('agent-card-claude');
    const apiKeyInput = within(claudeCard).getByLabelText('Claude API Key') as HTMLInputElement;

    expect(apiKeyInput.type).toBe('password');
    expect(apiKeyInput.value).toBe('');

    fireEvent.change(apiKeyInput, { target: { value: 'sk-ant-test-key-12345' } });

    expect(useUiStore.getState().agentApiKeys['claude']).toBe('sk-ant-test-key-12345');
    expect(apiKeyInput.value).toBe('sk-ant-test-key-12345');

    // Toggle visibility
    const showBtn = within(claudeCard).getByRole('button', { name: 'Show key' });
    fireEvent.click(showBtn);

    expect(apiKeyInput.type).toBe('text');

    const hideBtn = within(claudeCard).getByRole('button', { name: 'Hide key' });
    fireEvent.click(hideBtn);

    expect(apiKeyInput.type).toBe('password');

    // Clear key
    const clearBtn = within(claudeCard).getByRole('button', { name: 'Clear Claude API Key' });
    fireEvent.click(clearBtn);

    expect(useUiStore.getState().agentApiKeys['claude']).toBe('');
  });

  it('allows setting primary agent from card', async () => {
    renderView(<AgentPage />, { fixtures });

    const claudeCard = await screen.findByTestId('agent-card-claude');
    expect(within(claudeCard).getByText('Primary')).toBeTruthy();

    const agyCard = screen.getByTestId('agent-card-agy');
    const setPrimaryBtn = within(agyCard).getByRole('button', { name: 'Set as primary' });

    fireEvent.click(setPrimaryBtn);

    expect(useUiStore.getState().primaryAgent).toBe('agy');
  });
});
