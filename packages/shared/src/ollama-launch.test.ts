import { describe, expect, it } from 'vitest';

import { agentHeadlessArgs, agentInteractiveArgs } from './agent-invocation';
import {
  AgentOllamaBindingSchema,
  OLLAMA_BACKED_AGENTS,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_LOCAL_AUTH_TOKEN,
  ollamaLaunchRecipe,
  resolveAgentLaunch,
  supportsOllamaBackend,
} from './ollama-launch';

const BASE = 'http://127.0.0.1:11434';

describe('AgentOllamaBindingSchema', () => {
  it('accepts a native binding with no model', () => {
    expect(AgentOllamaBindingSchema.safeParse({ backend: 'native' }).success).toBe(true);
  });

  it('accepts an ollama binding with a model', () => {
    expect(AgentOllamaBindingSchema.safeParse({ backend: 'ollama', model: 'qwen3:14b' }).success).toBe(
      true,
    );
  });

  it('rejects an unknown backend', () => {
    expect(AgentOllamaBindingSchema.safeParse({ backend: 'vllm' }).success).toBe(false);
  });
});

describe('supportsOllamaBackend', () => {
  it('is true for exactly the five agents this theme wires', () => {
    expect(OLLAMA_BACKED_AGENTS).toEqual(['claude', 'codex', 'cline', 'opencode', 'copilot']);
    for (const id of OLLAMA_BACKED_AGENTS) expect(supportsOllamaBackend(id)).toBe(true);
  });

  it('is false for an agent this theme does not wire', () => {
    expect(supportsOllamaBackend('agy')).toBe(false);
    expect(supportsOllamaBackend('cursor')).toBe(false);
  });
});

describe('ollamaLaunchRecipe', () => {
  it('claude: env + --model, ANTHROPIC_API_KEY forced empty', () => {
    const recipe = ollamaLaunchRecipe('claude', 'qwen3:14b', BASE);
    expect(recipe).toEqual({
      env: {
        ANTHROPIC_BASE_URL: BASE,
        ANTHROPIC_AUTH_TOKEN: OLLAMA_LOCAL_AUTH_TOKEN,
        ANTHROPIC_API_KEY: '',
      },
      argsBefore: ['--model', 'qwen3:14b'],
    });
  });

  it('claude: a cloud auth token replaces the local sentinel, not the base or the empty key', () => {
    const recipe = ollamaLaunchRecipe('claude', 'qwen3:14b', 'https://ollama.com', 'sk-cloud-key');
    expect(recipe?.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-cloud-key');
    expect(recipe?.env.ANTHROPIC_BASE_URL).toBe('https://ollama.com');
    expect(recipe?.env.ANTHROPIC_API_KEY).toBe('');
  });

  it('copilot: provider env only, no argsBefore', () => {
    const recipe = ollamaLaunchRecipe('copilot', 'llama3.1', BASE);
    expect(recipe).toEqual({
      env: {
        COPILOT_PROVIDER_BASE_URL: `${BASE}/v1`,
        COPILOT_PROVIDER_API_KEY: '',
        COPILOT_PROVIDER_WIRE_API: 'responses',
        COPILOT_MODEL: 'llama3.1',
      },
      argsBefore: [],
    });
  });

  it('codex: --oss -m <model>, no env', () => {
    const recipe = ollamaLaunchRecipe('codex', 'gpt-oss:120b', BASE);
    expect(recipe).toEqual({ env: {}, argsBefore: ['--oss', '-m', 'gpt-oss:120b'] });
  });

  it('cline: ollama launch cline --model <m> --yes --, no env', () => {
    const recipe = ollamaLaunchRecipe('cline', 'qwen3:14b', BASE);
    expect(recipe).toEqual({
      env: {},
      argsBefore: ['launch', 'cline', '--model', 'qwen3:14b', '--yes', '--'],
      commandOverride: 'ollama',
    });
  });

  it('opencode: ollama launch opencode --model <m> --yes --, no env', () => {
    const recipe = ollamaLaunchRecipe('opencode', 'qwen3:14b', BASE);
    expect(recipe).toEqual({
      env: {},
      argsBefore: ['launch', 'opencode', '--model', 'qwen3:14b', '--yes', '--'],
      commandOverride: 'ollama',
    });
  });

  it('returns null for an agent this theme does not wire', () => {
    expect(ollamaLaunchRecipe('agy', 'llama3.1', BASE)).toBeNull();
    expect(ollamaLaunchRecipe('cursor', 'llama3.1', BASE)).toBeNull();
  });

  it('defaults the auth token to the local sentinel, never leaves it unset', () => {
    const recipe = ollamaLaunchRecipe('claude', 'llama3.1', BASE);
    expect(recipe?.env.ANTHROPIC_AUTH_TOKEN).toBe('ollama');
  });
});

describe('resolveAgentLaunch — the one resolver', () => {
  const claude = { id: 'claude', command: 'claude' };

  it('native binding resolves to the plain agent command, no args, no env', () => {
    const launch = resolveAgentLaunch(claude, { backend: 'native' }, BASE);
    expect(launch).toEqual({ command: 'claude', argsBefore: [], env: {}, backend: 'native' });
  });

  it('absent binding resolves identically to native', () => {
    const launch = resolveAgentLaunch(claude, undefined, BASE);
    expect(launch.backend).toBe('native');
    expect(launch.argsBefore).toEqual([]);
    expect(launch.env).toEqual({});
  });

  it('ollama binding with no model resolves identically to native (nothing to launch yet)', () => {
    const launch = resolveAgentLaunch(claude, { backend: 'ollama' }, BASE);
    expect(launch.backend).toBe('native');
  });

  it('an unsupported agent id with an ollama binding still resolves to native', () => {
    const launch = resolveAgentLaunch({ id: 'agy', command: 'agy' }, { backend: 'ollama', model: 'x' }, BASE);
    expect(launch).toEqual({ command: 'agy', argsBefore: [], env: {}, backend: 'native' });
  });

  it('ollama binding with a model resolves the full recipe and echoes the model', () => {
    const launch = resolveAgentLaunch(claude, { backend: 'ollama', model: 'qwen3:14b' }, BASE);
    expect(launch.backend).toBe('ollama');
    expect(launch.model).toBe('qwen3:14b');
    expect(launch.command).toBe('claude');
    expect(launch.argsBefore).toEqual(['--model', 'qwen3:14b']);
    expect(launch.env.ANTHROPIC_API_KEY).toBe('');
  });

  it('cline/opencode resolve a commandOverride, replacing the roster command', () => {
    const launch = resolveAgentLaunch(
      { id: 'cline', command: 'cline' },
      { backend: 'ollama', model: 'qwen3:14b' },
      BASE,
    );
    expect(launch.command).toBe('ollama');
    expect(launch.argsBefore).toEqual(['launch', 'cline', '--model', 'qwen3:14b', '--yes', '--']);
  });

  it('OLLAMA_DEFAULT_BASE_URL matches the daemon default every caller falls back to', () => {
    expect(OLLAMA_DEFAULT_BASE_URL).toBe(BASE);
  });
});

/**
 * Headless composition (councils, workflow agent nodes) is "recipe.argsBefore
 * ahead of the agent's own headless flag" — never a conflict, since none of
 * the five recipes' argsBefore overlaps a headless flag's own words.
 */
describe('Ollama recipe composes with headless invocation for all five agents', () => {
  for (const agentId of OLLAMA_BACKED_AGENTS) {
    it(`${agentId}: argsBefore + headless args form a well-formed word list`, () => {
      const recipe = ollamaLaunchRecipe(agentId, 'a-model', BASE);
      expect(recipe).not.toBeNull();
      const headless = agentHeadlessArgs(agentId) ?? agentInteractiveArgs(agentId);
      const words = [recipe!.commandOverride ?? agentId, ...recipe!.argsBefore, ...headless, 'PROMPT'];
      // No empty-string words — a shell-typed invocation must never carry a
      // stray blank token, which would show up as an extra space or, worse,
      // an accidental empty positional arg.
      expect(words.every((w) => w.length > 0)).toBe(true);
    });
  }
});
