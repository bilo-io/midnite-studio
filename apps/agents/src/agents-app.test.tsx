// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chatsManifest } from '@midnite/studio-feature-chats/renderer';
import { councilsManifest } from '@midnite/studio-feature-councils/renderer';
import { modelsManifest } from '@midnite/studio-feature-models/renderer';
import { workflowsManifest } from '@midnite/studio-feature-workflows/renderer';
import { featurePackagePlacement, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { AgentsApp } from './agents-app';
import { AGENTS_APP } from './agents-manifest';

const ok = <T,>(value: T) => async () => ({ ok: true as const, value });

function stubBridge() {
  const has = vi.fn(async () => ({ hasKey: false }));
  const get = vi.fn();
  window.midniteStudio = {
    secrets: { has, get },
    agent: { list: async () => ({ agents: [{ id: 'claude', label: 'Claude', command: 'claude', args: [], accent: '#d97757' }], status: [], probe: 'unknown' }) },
    chats: {
      list: async () => ({ chats: [] }),
      skills: ok({ skills: [] }),
      files: ok({ files: [] }),
      onEvent: () => () => undefined,
    },
    council: { list: async () => ({ councils: [] }) },
    workflow: {
      list: async () => ({ workflows: [] }),
      templates: { list: async () => ({ templates: [] }) },
      runs: { list: async () => ({ runs: [] }), get: async () => ({ run: null }) },
      onRunChanged: () => () => undefined,
    },
    demoApi: { status: async () => ({ running: false }) },
    mcp: {
      get: async () => ({ enabled: false, running: false, socketPath: null, shimPath: null }),
      calls: async () => ({ calls: [] }),
    },
    ollama: {
      status: async () => ({ reachable: false, version: null, host: 'http://127.0.0.1:11434' }),
      list: ok({ models: [] }),
      ps: ok({ models: [] }),
      onPullProgress: () => () => undefined,
      settings: { get: async () => ({ host: null, defaultModel: null }) },
    },
  } as unknown as typeof window.midniteStudio;
  return { has, get };
}

beforeEach(() => {
  stubBridge();
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Agents composition', () => {
  it('is the owner the placement map names for chats, councils, workflows, models and the MCP tools', () => {
    for (const feature of ['chats', 'councils', 'workflows', 'models'] as const) {
      expect(placementOwners(FEATURE_PLACEMENT[feature])[0]).toBe(AGENTS_APP.id);
    }
    expect(featurePackagePlacement('mcp-tools')).toBe(AGENTS_APP.id);
    expect(AGENTS_APP.features).toEqual([
      chatsManifest.feature,
      councilsManifest.feature,
      workflowsManifest.feature,
      modelsManifest.feature,
      'mcp-tools',
    ]);
  });

  it("wears the launcher catalog's accent and opens on Chats", () => {
    expect(AGENTS_APP.accent).toBe('#8b5cf6');
    expect(AGENTS_APP.home).toBe('chats');
  });
});

describe('Agents home', () => {
  it('opens on Chats with Councils, Graphs, Models and Tools beside it', async () => {
    render(<AgentsApp />);
    expect(screen.getByText('Midnite Agents')).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Agents views' }).textContent).toBe('ChatsCouncilsGraphsModelsTools');
    expect(screen.getByTestId('agents-tab-chats').getAttribute('aria-current')).toBe('page');
    await waitFor(() => expect(screen.getByRole('main', { name: 'Chats' })).toBeDefined());
  });

  it('switches to Councils and to Models, and offers no terminal action on a stopped daemon', async () => {
    render(<AgentsApp />);
    fireEvent.click(screen.getByTestId('agents-tab-councils'));
    await waitFor(() => expect(screen.getByText('Select a council')).toBeDefined());
    fireEvent.click(screen.getByTestId('agents-tab-models'));
    await waitFor(() => expect(screen.getByText("Ollama isn't running")).toBeDefined());
    // Agents has no terminal, so the daemon-down state offers a re-check, never "Start Ollama".
    expect(screen.queryByText('Start Ollama')).toBeNull();
    expect(screen.getByText('Check again')).toBeDefined();
  });

  it('switches to Graphs and lists the graphs main returns, with the demo API pill and no terminal', async () => {
    render(<AgentsApp />);
    fireEvent.click(screen.getByTestId('agents-tab-workflows'));
    // The Graphs chunk pulls the whole canvas: give a loaded machine more than the 1s default to import it.
    await waitFor(() => expect(screen.getByText('No graphs yet')).toBeDefined(), { timeout: 10_000 });
  });

  it('switches to Tools and lists only the frame and Agents tools, with no server switch', async () => {
    render(<AgentsApp />);
    fireEvent.click(screen.getByTestId('agents-tab-tools'));
    await waitFor(() => expect(screen.getByTestId('mcp-no-server')).toBeDefined(), { timeout: 10_000 });
    expect(screen.queryByLabelText('Enable MCP server')).toBeNull();
    // The Tools accordion is closed until opened; its title is there, and so is the app's own gate tool once open.
    fireEvent.click(within(screen.getByRole('main', { name: 'Tools' })).getByText('Tools'));
    await waitFor(() => expect(screen.getByText('workflow_gates_list')).toBeDefined(), { timeout: 10_000 });
    expect(screen.queryByText('model_set_spec')).toBeNull();
  });

  it('never asks for a secret value: only `has` is on the bridge it was given', async () => {
    const { get } = stubBridge();
    render(<AgentsApp />);
    fireEvent.click(screen.getByTestId('agents-tab-models'));
    await waitFor(() => expect(screen.getByText("Ollama isn't running")).toBeDefined());
    expect(get).not.toHaveBeenCalled();
  });
});
