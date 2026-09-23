import { describe, expect, it } from 'vitest';

import { cheapModelFor, fastModelFor, modelArgsFor } from './ai-models';

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
});
