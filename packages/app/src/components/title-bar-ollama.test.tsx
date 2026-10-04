import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../test-support/fixtures';
import { renderView } from '../../test-support/render';
import * as modelsModule from '../features/models/use-models';
import * as installRunnerModule from '../features/setup/install-runner';
import { useUiStore } from '../store/ui-store';
import { TitleBarOllama } from './title-bar-ollama';

const submitCommand = vi.hoisted(() => vi.fn(() => 'session-1'));
vi.mock('../features/terminal/submit-command', () => ({ submitCommand }));

describe('TitleBarOllama', () => {
  beforeEach(() => {
    submitCommand.mockClear();
    useUiStore.setState({ activeView: 'dashboard', settingsPage: 'appearance' });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders trigger button in running state with shimmer and active dot by default in fixtures', async () => {
    renderView(<TitleBarOllama />, { fixtures });

    const trigger = await screen.findByTestId('titlebar-ollama');
    expect(trigger).toBeDefined();

    await waitFor(() => {
      expect(trigger.getAttribute('aria-label')).toBe('Ollama: Running');
      expect(screen.getByTestId('titlebar-ollama-dot')).toBeDefined();
      expect(screen.getByTestId('titlebar-ollama-shimmer')).toBeDefined();
    });
  });

  it('opens popover menu on click when running and shows status, host, and toggle buttons', async () => {
    renderView(<TitleBarOllama />, { fixtures });

    const trigger = await screen.findByTestId('titlebar-ollama');
    fireEvent.click(trigger);

    const panel = await screen.findByTestId('titlebar-ollama-panel');
    expect(panel).toBeDefined();
    expect(screen.getByTestId('titlebar-ollama-status-badge').textContent).toContain('Running');

    // Controls: Play is disabled while running; Stop is enabled
    const playBtn = screen.getByTestId('titlebar-ollama-play');
    const stopBtn = screen.getByTestId('titlebar-ollama-stop');
    expect((playBtn as HTMLButtonElement).disabled).toBe(true);
    expect((stopBtn as HTMLButtonElement).disabled).toBe(false);

    // Clicking Stop invokes submitCommand with Stop Ollama
    fireEvent.click(stopBtn);
    expect(submitCommand).toHaveBeenCalledWith(expect.stringContaining('ollama'), 'Stop Ollama');
  });

  it('renders stopped state without shimmer when reachable is false and installed is true', async () => {
    vi.spyOn(modelsModule, 'useOllamaStatus').mockReturnValue({
      data: { reachable: false, version: null, host: 'http://127.0.0.1:11434' },
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({ data: { reachable: false } }),
    } as unknown as ReturnType<typeof modelsModule.useOllamaStatus>);

    vi.spyOn(installRunnerModule, 'useSetupProbe').mockReturnValue({
      data: { ollama: { id: 'ollama', installed: true, version: '0.1.0', path: '/opt/homebrew/bin/ollama' } },
      isLoading: false,
    } as unknown as ReturnType<typeof installRunnerModule.useSetupProbe>);

    renderView(<TitleBarOllama />, { fixtures });

    const trigger = screen.getByTestId('titlebar-ollama');
    expect(trigger.getAttribute('aria-label')).toBe('Ollama: Stopped');

    // Shimmer MUST NOT be present when stopped
    expect(screen.queryByTestId('titlebar-ollama-shimmer')).toBeNull();
    expect(screen.getByTestId('titlebar-ollama-dot')).toBeDefined();

    // Click opens popover with Stopped status and enabled Start button
    fireEvent.click(trigger);
    expect(await screen.findByTestId('titlebar-ollama-panel')).toBeDefined();
    expect(screen.getByTestId('titlebar-ollama-status-badge').textContent).toContain('Stopped');

    const playBtn = screen.getByTestId('titlebar-ollama-play');
    const stopBtn = screen.getByTestId('titlebar-ollama-stop');
    expect((playBtn as HTMLButtonElement).disabled).toBe(false);
    expect((stopBtn as HTMLButtonElement).disabled).toBe(true);

    // Clicking Start invokes submitCommand with Start Ollama
    fireEvent.click(playBtn);
    await waitFor(() => {
      expect(submitCommand).toHaveBeenCalledWith(expect.stringMatching(/ollama/i), 'Start Ollama');
    });
  });

  it('navigates to Settings when not installed', async () => {
    vi.spyOn(modelsModule, 'useOllamaStatus').mockReturnValue({
      data: { reachable: false, version: null, host: '' },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof modelsModule.useOllamaStatus>);

    vi.spyOn(installRunnerModule, 'useSetupProbe').mockReturnValue({
      data: { ollama: { id: 'ollama', installed: false, version: null, path: null } },
      isLoading: false,
    } as unknown as ReturnType<typeof installRunnerModule.useSetupProbe>);

    renderView(<TitleBarOllama />, { fixtures });

    const trigger = screen.getByTestId('titlebar-ollama');
    expect(trigger.getAttribute('data-installed')).toBe('false');
    expect(trigger.getAttribute('aria-label')).toBe('Ollama: Not installed (manage in Settings)');

    // Clicking when not installed navigates to Settings ▸ Ollama directly without opening popover
    fireEvent.click(trigger);
    expect(useUiStore.getState().activeView).toBe('settings');
    expect(useUiStore.getState().settingsPage).toBe('ollama');
    expect(screen.queryByTestId('titlebar-ollama-panel')).toBeNull();
  });

  it('navigates to settings and models view via footer links in popover menu', async () => {
    renderView(<TitleBarOllama />, { fixtures });

    fireEvent.click(screen.getByTestId('titlebar-ollama'));
    expect(await screen.findByTestId('titlebar-ollama-panel')).toBeDefined();

    // Browse models
    fireEvent.click(screen.getByTestId('titlebar-ollama-models'));
    expect(useUiStore.getState().activeView).toBe('models');

    // Reopen menu and click settings
    fireEvent.click(screen.getByTestId('titlebar-ollama'));
    fireEvent.click(await screen.findByTestId('titlebar-ollama-settings'));
    expect(useUiStore.getState().activeView).toBe('settings');
    expect(useUiStore.getState().settingsPage).toBe('ollama');
  });
});
