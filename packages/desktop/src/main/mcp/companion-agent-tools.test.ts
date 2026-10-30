import { COMPANION_SETTINGS_OFF_MESSAGE } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as uiBridge from '@midnite/studio-feature-companion/main/ui-bridge';
import { companionAgentGet, companionAgentSet, companionModelsList } from './companion-tools';
import { MCP_HANDLERS } from './dispatch';
import { McpToolError } from './errors';
import { resetMcpAllowUiStateForTests, setMcpAllowCompanionSettingsState } from './ui-gate';

/**
 * vitest: the `companion_agent_*` and `companion_models_list` handlers
 * (Phase 111 Theme E) — the shared `allowCompanionSettings` switch, the
 * request each tool sends, and the answers passed through. Validation itself
 * is the renderer's: `app/features/companion/agent-switch.test.ts`.
 */

vi.mock('@midnite/studio-feature-companion/main/ui-bridge', () => ({
  requestUiAction: vi.fn(),
  UI_BRIDGE_TIMEOUT_MESSAGE: 'the window did not answer',
}));
vi.mock('@midnite/studio-feature-companion/main/tts-broker', () => ({ companionTtsModelOnDisk: vi.fn(() => true) }));

const requestUiAction = vi.mocked(uiBridge.requestUiAction);

beforeEach(() => setMcpAllowCompanionSettingsState(true));
afterEach(() => {
  resetMcpAllowUiStateForTests();
  requestUiAction.mockReset();
});

async function refusal(promise: Promise<unknown>): Promise<McpToolError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(McpToolError);
  return error as McpToolError;
}

describe('the allowCompanionSettings switch', () => {
  it('refuses all three tools before any IPC while it is off', async () => {
    setMcpAllowCompanionSettingsState(false);
    for (const call of [
      () => companionAgentGet(),
      () => companionAgentSet({ agent: 'codex' }),
      () => companionModelsList({}),
    ]) {
      const error = await refusal(call());
      expect(error.message).toBe(COMPANION_SETTINGS_OFF_MESSAGE);
    }
    expect(requestUiAction).not.toHaveBeenCalled();
  });
});

describe('companion_agent_get', () => {
  it('returns the renderer reply without the did tag', async () => {
    requestUiAction.mockResolvedValue({
      ok: true,
      value: {
        did: 'agentState',
        primaryAgent: 'claude',
        model: 'opus-5',
        agents: [{ id: 'claude', label: 'Claude', installed: true, model: 'opus-5' }],
        locked: false,
      },
    });
    const out = await companionAgentGet();
    expect(requestUiAction).toHaveBeenCalledWith({ kind: 'agentState' });
    expect(out).toEqual({
      primaryAgent: 'claude',
      model: 'opus-5',
      agents: [{ id: 'claude', label: 'Claude', installed: true, model: 'opus-5' }],
      locked: false,
    });
  });

  it('turns a missing window into a refusal', async () => {
    requestUiAction.mockResolvedValue({ ok: false, kind: 'error', message: 'no window' });
    expect((await refusal(companionAgentGet())).message).toBe('no window');
  });

  it('rejects a reply of the wrong shape', async () => {
    requestUiAction.mockResolvedValue({ ok: true, value: { did: 'voices', system: [], selected: { local: null, system: null } } });
    await refusal(companionAgentGet());
  });
});

describe('companion_agent_set', () => {
  it('sends the agent and model and passes an applied answer through', async () => {
    requestUiAction.mockResolvedValue({
      ok: true,
      value: {
        did: 'agentSet',
        status: 'applied',
        previous: { agentId: 'claude', modelId: null },
        next: { agentId: 'claude', modelId: 'opus-5' },
      },
    });
    const out = await companionAgentSet({ agent: 'claude', model: 'opus' });
    expect(requestUiAction).toHaveBeenCalledWith({ kind: 'agentSet', agent: 'claude', model: 'opus' });
    expect(out.status).toBe('applied');
    expect(out.next).toEqual({ agentId: 'claude', modelId: 'opus-5' });
  });

  it('omits model when none was given', async () => {
    requestUiAction.mockResolvedValue({ ok: true, value: { did: 'agentSet', status: 'applied' } });
    await companionAgentSet({ agent: 'codex' });
    expect(requestUiAction).toHaveBeenCalledWith({ kind: 'agentSet', agent: 'codex' });
  });

  it('passes an unknown-model refusal through as data', async () => {
    requestUiAction.mockResolvedValue({
      ok: true,
      value: { did: 'agentSet', status: 'refused', reason: 'unknownModel', message: 'Unknown model: zzz for agent: Claude' },
    });
    const out = await companionAgentSet({ agent: 'claude', model: 'zzz' });
    expect(out).toEqual({ status: 'refused', reason: 'unknownModel', message: 'Unknown model: zzz for agent: Claude' });
  });

  it('is registered in the handler table', () => {
    expect(MCP_HANDLERS.companion_agent_set).toBe(companionAgentSet);
    expect(MCP_HANDLERS.companion_agent_get).toBe(companionAgentGet);
    expect(MCP_HANDLERS.companion_models_list).toBe(companionModelsList);
  });
});

describe('companion_models_list', () => {
  it('asks for the primary agent by default and for a named one on request', async () => {
    requestUiAction.mockResolvedValue({
      ok: true,
      value: { did: 'modelsList', agentId: 'ollama', models: [{ id: 'qwen2.5-coder', label: 'qwen2.5-coder' }], selected: null, ollamaRunning: true },
    });
    await companionModelsList({});
    expect(requestUiAction).toHaveBeenLastCalledWith({ kind: 'modelsList' });
    const out = await companionModelsList({ agent: 'ollama' });
    expect(requestUiAction).toHaveBeenLastCalledWith({ kind: 'modelsList', agent: 'ollama' });
    expect(out.ollamaRunning).toBe(true);
    expect(out.models).toHaveLength(1);
  });
});
