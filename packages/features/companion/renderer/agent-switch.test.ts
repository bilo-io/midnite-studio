import { beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from './ext';
import { buildAgentStateReply, buildModelsListReply, resolveAgentSet } from './agent-switch';

/**
 * vitest: the renderer half of the Phase 111 Theme E tools — validation and the
 * write through `setPrimaryAgentAndModel`. No bridge under jsdom, so the roster
 * is the builtins with nothing known about install state, and Ollama is down.
 */

beforeEach(() => {
  useUiStore.setState({ primaryAgent: 'claude', primaryModelByAgent: {}, screensaverLocked: false });
});

describe('buildAgentStateReply', () => {
  it('reports the primary agent, its model and the roster', async () => {
    useUiStore.setState({ primaryModelByAgent: { claude: 'opus-5' } });
    const out = await buildAgentStateReply();
    expect(out.primaryAgent).toBe('claude');
    expect(out.model).toBe('opus-5');
    expect(out.agents.find((a) => a.id === 'claude')?.model).toBe('opus-5');
    expect(out.agents.find((a) => a.id === 'codex')?.model).toBeNull();
  });
});

describe('resolveAgentSet', () => {
  it('switches the agent by spoken name and records the previous choice', async () => {
    const out = await resolveAgentSet({ agent: 'openai' });
    expect(out.status).toBe('applied');
    expect(out.previous).toEqual({ agentId: 'claude', modelId: null });
    expect(out.next?.agentId).toBe('codex');
    expect(useUiStore.getState().primaryAgent).toBe('codex');
  });

  it('sets a model with the agent', async () => {
    const out = await resolveAgentSet({ agent: 'claude', model: 'opus' });
    expect(out.status).toBe('applied');
    expect(useUiStore.getState().primaryModelByAgent['claude']).toBe(out.next?.modelId);
    expect(out.next?.modelId).toMatch(/^opus/);
  });

  it('refuses an unknown agent and changes nothing', async () => {
    const out = await resolveAgentSet({ agent: 'zzzzzzzz' });
    expect(out).toMatchObject({ status: 'refused', reason: 'unknownAgent' });
    expect(useUiStore.getState().primaryAgent).toBe('claude');
  });

  it('refuses an unknown model and changes nothing', async () => {
    const out = await resolveAgentSet({ agent: 'claude', model: 'not-a-model-at-all' });
    expect(out).toMatchObject({ status: 'refused', reason: 'unknownModel' });
    expect(useUiStore.getState().primaryModelByAgent).toEqual({});
  });

  it('refuses an Ollama model while the daemon is down', async () => {
    const out = await resolveAgentSet({ agent: 'ollama', model: 'qwen2.5-coder' });
    expect(out).toMatchObject({ status: 'refused', reason: 'ollamaDown' });
    expect(useUiStore.getState().primaryAgent).toBe('claude');
  });

  it('refuses while the screen is locked', async () => {
    useUiStore.setState({ screensaverLocked: true });
    const out = await resolveAgentSet({ agent: 'codex' });
    expect(out).toMatchObject({ status: 'refused', reason: 'locked' });
    expect(useUiStore.getState().primaryAgent).toBe('claude');
  });
});

describe('buildModelsListReply', () => {
  it('lists the primary agent catalogue by default', async () => {
    useUiStore.setState({ primaryModelByAgent: { claude: 'opus-5' } });
    const out = await buildModelsListReply({});
    expect(out.agentId).toBe('claude');
    expect(out.selected).toBe('opus-5');
    expect(out.models.map((m) => m.id)).toContain('opus-5');
  });

  it('flags a daemon that is down for Ollama', async () => {
    const out = await buildModelsListReply({ agent: 'ollama' });
    expect(out.agentId).toBe('ollama');
    expect(out.ollamaRunning).toBe(false);
  });

  it('answers a message for an unknown agent', async () => {
    const out = await buildModelsListReply({ agent: 'zzzzzzzz' });
    expect(out.agentId).toBeNull();
    expect(out.message).toMatch(/Unknown agent/);
  });
});
