// vitest/jsdom: Settings ▸ AI over a mock bridge — pick a model, save it, and Test it.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { settingsClient } from './ai-settings';
import { STARTUP_SETTINGS } from '../startup-settings';

const Page = STARTUP_SETTINGS.find((p) => p.id === 'app:startup-ai')!.Page;

function install(over: { agents?: { id: string; label: string }[]; test?: unknown } = {}) {
  let state = { agentId: 'claude', ollamaModel: '' };
  const setAiSettings = vi.fn(async ({ settings }: { settings: typeof state }) => ((state = settings), { ok: true, value: state }));
  const testAiModel = vi.fn(async () => over.test ?? { ok: true, value: { model: 'claude', reply: 'ready' } });
  window.midniteStudio = {
    startup: {
      getAiSettings: vi.fn(async () => ({ ok: true, value: state })),
      listAiAgents: vi.fn(async () => ({ ok: true, value: over.agents ?? [{ id: 'claude', label: 'Claude' }, { id: 'codex', label: 'Codex' }] })),
      setAiSettings,
      testAiModel,
      onChanged: () => () => undefined,
    },
  } as unknown as typeof window.midniteStudio;
  return { setAiSettings, testAiModel };
}

afterEach(() => {
  cleanup();
  settingsClient.clear();
  window.midniteStudio = undefined;
});

describe('Settings ▸ AI', () => {
  it('is registered as an app page called AI', () => {
    expect(STARTUP_SETTINGS.find((p) => p.id === 'app:startup-ai')).toMatchObject({ label: 'AI', scope: 'app' });
  });

  it('defaults to Claude and keeps Save off until something changes', async () => {
    install();
    render(<Page />);
    const model = (await screen.findByLabelText('Model')) as HTMLSelectElement;
    await waitFor(() => expect(model.value).toBe('claude'));
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves another installed agent', async () => {
    const { setAiSettings } = install();
    render(<Page />);
    const model = await screen.findByLabelText('Model');
    await waitFor(() => expect((model as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(model, { target: { value: 'codex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(setAiSettings).toHaveBeenCalledWith({ settings: { agentId: 'codex', ollamaModel: '' } }));
  });

  it('asks for an Ollama model name and saves it', async () => {
    const { setAiSettings } = install();
    render(<Page />);
    const model = await screen.findByLabelText('Model');
    await waitFor(() => expect((model as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(model, { target: { value: '__ollama__' } });
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Ollama model name'), { target: { value: 'llama3.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(setAiSettings).toHaveBeenCalledWith({ settings: { agentId: 'claude', ollamaModel: 'llama3.1' } }));
  });

  it('Test shows the reply, or the failure', async () => {
    const ok = install();
    render(<Page />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Test' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'claude answered: ready');
    expect(ok.testAiModel).toHaveBeenCalledWith({ agentId: 'claude' });
    cleanup();
    settingsClient.clear();
    install({ test: { ok: false, kind: 'io', message: 'No agent CLI with a headless mode is installed.' } });
    render(<Page />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Test' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No agent CLI');
  });

  it('says so when no agent CLI is installed', async () => {
    install({ agents: [] });
    render(<Page />);
    expect(await screen.findByText(/No agent CLI \(claude, codex or agy\) was found/)).toBeTruthy();
  });
});
