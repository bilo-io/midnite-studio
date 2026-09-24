import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
    agentBackends: {},
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

  it('allows setting primary agent from card with "Make primary" and applies primary-agent-card class', async () => {
    renderView(<AgentPage />, { fixtures });

    const claudeCard = await screen.findByTestId('agent-card-claude');
    expect(within(claudeCard).getByText('Primary')).toBeTruthy();
    expect(claudeCard.className).toContain('primary-agent-card');

    const agyCard = screen.getByTestId('agent-card-agy');
    expect(agyCard.className).not.toContain('primary-agent-card');
    const setPrimaryBtn = within(agyCard).getByRole('button', { name: 'Make primary' });

    fireEvent.click(setPrimaryBtn);

    expect(useUiStore.getState().primaryAgent).toBe('agy');
    expect(agyCard.className).toContain('primary-agent-card');
    expect(claudeCard.className).not.toContain('primary-agent-card');
  });

  it('clicking "Uninstall…" spawns a shell and pastes the uninstall command without \\r', async () => {
    renderView(<AgentPage />, { fixtures });

    const claudeCard = await screen.findByTestId('agent-card-claude');
    const uninstallBtn = await within(claudeCard).findByRole('button', { name: 'Uninstall…' });

    fireEvent.click(uninstallBtn);

    const { sessions, pendingInput } = useTerminalStore.getState();
    expect(sessions.length).toBe(1);
    const session = sessions[0]!;
    expect(session.kind).toBe('shell');
    expect(session.title).toBe('Claude uninstall');

    // Pasted without trailing carriage return for safety (user presses Enter to confirm)
    expect(pendingInput[session.id]).toBe('npm rm -g @anthropic-ai/claude-code');
  });

  it('clicking "Reveal in Finder" button or path link invokes revealPath bridge', async () => {
    renderView(<AgentPage />, { fixtures });

    const { bridge } = await import('../../../services/bridge');
    const revealSpy = vi.spyOn(bridge()!.agent, 'revealPath');

    const claudeCard = await screen.findByTestId('agent-card-claude');
    const folderBtn = await within(claudeCard).findByRole('button', { name: 'Reveal in Finder' });
    fireEvent.click(folderBtn);

    expect(revealSpy).toHaveBeenCalledWith({ path: '/Users/e2e/.local/bin/claude' });

    const pathLink = await within(claudeCard).findByText('/Users/e2e/.local/bin/claude');
    fireEvent.click(pathLink);

    expect(revealSpy).toHaveBeenCalledTimes(2);
  });

  it('renders the Execution mode picker and updates skillExecutionMode on click', async () => {
    useUiStore.setState({ skillExecutionMode: 'interactive' });
    renderView(<AgentPage />, { fixtures });

    const interactiveRadio = await screen.findByRole('radio', { name: 'Interactive' });
    const headlessRadio = await screen.findByRole('radio', { name: 'Headless' });

    expect(interactiveRadio).toBeTruthy();
    expect(headlessRadio).toBeTruthy();
    expect(interactiveRadio.getAttribute('aria-checked')).toBe('true');
    expect(headlessRadio.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(headlessRadio);
    expect(useUiStore.getState().skillExecutionMode).toBe('headless');

    fireEvent.click(interactiveRadio);
    expect(useUiStore.getState().skillExecutionMode).toBe('interactive');
  });
});

describe('AgentPage - Session stamping (Phase 78 Theme E)', () => {
  it('renders a row per open repo, unchecked by default', async () => {
    renderView(<AgentPage />, { fixtures });

    const toggle = await screen.findByTestId('hook-toggle-repo-1');
    expect(toggle).toBeTruthy();
    expect((toggle as HTMLInputElement).checked).toBe(false);
  });

  it('reflects an already-installed hook as checked', async () => {
    renderView(<AgentPage />, { fixtures: { ...fixtures, hookInstalledRepos: ['repo-1'] } });

    const toggle = (await screen.findByTestId('hook-toggle-repo-1')) as HTMLInputElement;
    await waitFor(() => expect(toggle.checked).toBe(true));
  });

  it('checking the box installs the hook, and the checkbox reflects it once the status refetches', async () => {
    renderView(<AgentPage />, { fixtures });

    const toggle = (await screen.findByTestId('hook-toggle-repo-1')) as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle.checked).toBe(true));
  });

  it('unchecking removes the hook', async () => {
    renderView(<AgentPage />, { fixtures: { ...fixtures, hookInstalledRepos: ['repo-1'] } });

    const toggle = (await screen.findByTestId('hook-toggle-repo-1')) as HTMLInputElement;
    await waitFor(() => expect(toggle.checked).toBe(true));

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle.checked).toBe(false));
  });

  it('a refused install shows the refusal message and leaves the box unchecked', async () => {
    renderView(<AgentPage />, {
      fixtures: {
        ...fixtures,
        hookInstallError: { 'repo-1': 'A prepare-commit-msg hook already exists.' },
      },
    });

    const toggle = (await screen.findByTestId('hook-toggle-repo-1')) as HTMLInputElement;
    fireEvent.click(toggle);

    expect(await screen.findByText('A prepare-commit-msg hook already exists.')).toBeTruthy();
    expect(toggle.checked).toBe(false);
  });
});

describe('AgentPage - Ollama backend (Phase 96 Theme H)', () => {
  it('offers a Backend picker only on the five agents this theme wires', async () => {
    renderView(<AgentPage />, { fixtures });

    const claudeCard = await screen.findByTestId('agent-card-claude');
    expect(within(claudeCard).getByText('Backend:')).toBeTruthy();

    // Cursor is not one of the five Ollama-backed agents.
    const cursorCard = await screen.findByTestId('agent-card-cursor');
    expect(within(cursorCard).queryByText('Backend:')).toBeNull();
  });

  it('defaults to Native, with no model picker shown', async () => {
    renderView(<AgentPage />, { fixtures });

    const claudeCard = await screen.findByTestId('agent-card-claude');
    const nativeBtn = within(claudeCard).getByRole('button', { name: 'Native' });
    expect(nativeBtn.className).toContain('bg-background');
    expect(within(claudeCard).queryByLabelText('Claude Ollama model')).toBeNull();
  });

  it('switching to Ollama reveals the model picker, populated from ollama.list()', async () => {
    renderView(<AgentPage />, {
      fixtures: { ...fixtures, ollamaModels: [{ name: 'qwen3:14b' }, { name: 'llama3.1' }] },
    });

    const claudeCard = await screen.findByTestId('agent-card-claude');
    fireEvent.click(within(claudeCard).getByRole('button', { name: 'Ollama' }));

    const select = (await within(claudeCard).findByLabelText(
      'Claude Ollama model',
    )) as HTMLSelectElement;
    await waitFor(() => {
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(
        expect.arrayContaining(['qwen3:14b', 'llama3.1']),
      );
    });

    fireEvent.change(select, { target: { value: 'qwen3:14b' } });

    expect(useUiStore.getState().agentBackends['claude']).toEqual({
      backend: 'ollama',
      model: 'qwen3:14b',
    });
  });
});

describe('AgentPage - Ollama fit-for-agents warning (Phase 96 Theme G)', () => {
  it('shows no warning once a fit model (tools + >= 64k) is picked', async () => {
    renderView(<AgentPage />, {
      fixtures: { ...fixtures, ollamaModels: [{ name: 'qwen3.5:14b' }] },
    });

    const claudeCard = await screen.findByTestId('agent-card-claude');
    fireEvent.click(within(claudeCard).getByRole('button', { name: 'Ollama' }));
    const select = await within(claudeCard).findByLabelText('Claude Ollama model');
    fireEvent.change(select, { target: { value: 'qwen3.5:14b' } });

    await waitFor(() =>
      expect(useUiStore.getState().agentBackends['claude']?.model).toBe('qwen3.5:14b'),
    );
    expect(within(claudeCard).queryByText(/not agent-ready/)).toBeNull();
  });

  it('warns when the picked model has no tool calling or too little context', async () => {
    renderView(<AgentPage />, {
      fixtures: {
        ...fixtures,
        ollamaModels: [{ name: 'tiny:1b', capabilities: ['completion'], numCtx: 4096 }],
      },
    });

    const claudeCard = await screen.findByTestId('agent-card-claude');
    fireEvent.click(within(claudeCard).getByRole('button', { name: 'Ollama' }));
    const select = await within(claudeCard).findByLabelText('Claude Ollama model');
    fireEvent.change(select, { target: { value: 'tiny:1b' } });

    expect(await within(claudeCard).findByText(/not agent-ready/)).toBeTruthy();
  });
});

describe('AgentPage - Headless AI features use (Phase 96 Theme I)', () => {
  it('defaults to the primary agent and stores a picked Ollama model', async () => {
    useUiStore.setState({ headlessAiOllamaModel: null });
    renderView(<AgentPage />, {
      fixtures: { ...fixtures, ollamaModels: [{ name: 'qwen3:14b' }] },
    });

    const select = (await screen.findByLabelText('Headless AI features use')) as HTMLSelectElement;
    expect(select.value).toBe('');
    await waitFor(() => {
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toContain('Ollama · qwen3:14b');
    });

    fireEvent.change(select, { target: { value: 'qwen3:14b' } });
    expect(useUiStore.getState().headlessAiOllamaModel).toBe('qwen3:14b');

    fireEvent.change(select, { target: { value: '' } });
    expect(useUiStore.getState().headlessAiOllamaModel).toBeNull();
  });
});
