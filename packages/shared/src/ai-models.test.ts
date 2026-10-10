import { describe, expect, it } from 'vitest';

import {
  cheapModelFor,
  fastModelFor,
  modelArgsFor,
  modelsForAgent,
  resolveAgentAndModel,
} from './ai-models';

describe('ai-models', () => {
  it('resolves the cheap model for a covered provider', () => {
    expect(cheapModelFor('claude')).toBe('haiku');
    expect(cheapModelFor('codex')).toBe('gpt-5-mini');
    expect(cheapModelFor('gemini')).toBe('gemini-2.5-flash');
    expect(cheapModelFor('agy')).toBe('gemini-2.5-flash');
  });

  it('resolves the fast model for a covered provider', () => {
    expect(fastModelFor('claude')).toBe('haiku');
    expect(fastModelFor('grok')).toBe('grok-4-fast');
  });

  it('returns null for a provider with no documented small model', () => {
    expect(cheapModelFor('opencode')).toBeNull();
    expect(cheapModelFor('copilot')).toBeNull();
    expect(fastModelFor('cline')).toBeNull();
  });

  it('returns null for an unknown agent id', () => {
    expect(cheapModelFor('not-a-real-agent')).toBeNull();
    expect(fastModelFor('not-a-real-agent')).toBeNull();
  });

  it('builds the --model flag pair for any agent', () => {
    expect(modelArgsFor('claude', 'haiku')).toEqual(['--model', 'haiku']);
    expect(modelArgsFor('codex', 'gpt-5-mini')).toEqual(['--model', 'gpt-5-mini']);
  });

  describe('modelsForAgent', () => {
    it('returns Claude loop models including default and tiers', () => {
      const models = modelsForAgent('claude');
      expect(models.length).toBeGreaterThan(5);
      const defaultModel = models.find((m) => m.id === 'default');
      expect(defaultModel).toEqual({ id: 'default', label: 'Default', cliModel: null, tier: 'default' });
      const haiku = models.find((m) => m.id === 'haiku-4-5');
      expect(haiku?.cliModel).toBe('claude-haiku-4-5');
      expect(haiku?.tier).toBe('cheap');
    });

    it('returns cheap/fast tier for Codex', () => {
      const models = modelsForAgent('codex');
      expect(models).toEqual([
        { id: 'gpt-5-mini', label: 'gpt-5-mini', cliModel: 'gpt-5-mini', tier: 'cheap' },
      ]);
    });

    it('merges Ollama models when provided', () => {
      const models = modelsForAgent('claude', ['qwen2.5-coder:7b', 'llama3.2']);
      expect(models.some((m) => m.id === 'qwen2.5-coder:7b')).toBe(true);
      expect(models.some((m) => m.id === 'llama3.2')).toBe(true);
    });
  });

  describe('resolveAgentAndModel', () => {
    it('resolves canonical agent without model', () => {
      expect(resolveAgentAndModel('claude')).toEqual({ agentId: 'claude', modelId: null });
      expect(resolveAgentAndModel('codex')).toEqual({ agentId: 'codex', modelId: null });
      expect(resolveAgentAndModel('agy')).toEqual({ agentId: 'agy', modelId: null });
    });

    it('resolves agent aliases', () => {
      expect(resolveAgentAndModel('Claude Code')).toEqual({ agentId: 'claude', modelId: null });
      expect(resolveAgentAndModel('antigravity')).toEqual({ agentId: 'agy', modelId: null });
      expect(resolveAgentAndModel('gemini')).toEqual({ agentId: 'agy', modelId: null });
      expect(resolveAgentAndModel('openai')).toEqual({ agentId: 'codex', modelId: null });
    });

    it('resolves agent with canonical or alias model', () => {
      expect(resolveAgentAndModel('claude', 'haiku')).toEqual({ agentId: 'claude', modelId: 'haiku-4-5' });
      expect(resolveAgentAndModel('claude', 'sonnet 5.5')).toEqual({ agentId: 'claude', modelId: 'sonnet-5-5' });
      expect(resolveAgentAndModel('claude', 'opus')).toEqual({ agentId: 'claude', modelId: 'opus-5' });
      expect(resolveAgentAndModel('codex', 'gpt-5-mini')).toEqual({ agentId: 'codex', modelId: 'gpt-5-mini' });
    });

    it('fuzzy matches agent names with minor typos', () => {
      expect(resolveAgentAndModel('cloude')).toEqual({ agentId: 'claude', modelId: null });
      expect(resolveAgentAndModel('codeks')).toEqual({ agentId: 'codex', modelId: null });
    });

    it('returns error on empty or unknown agent', () => {
      expect(resolveAgentAndModel('')).toEqual({ error: 'Agent name is required' });
      expect(resolveAgentAndModel('completely-unknown-agent-xyz')).toEqual({
        error: 'Unknown agent: completely-unknown-agent-xyz',
      });
    });

    it('returns error on unknown model for known agent', () => {
      const res = resolveAgentAndModel('claude', 'non-existent-model-xyz');
      expect(res).toEqual({ error: 'Unknown model: non-existent-model-xyz for agent: Claude' });
    });
  });
});

