import { describe, expect, it } from 'vitest';

import type { ChatEngine } from '../../../chats/use-chat-engines';
import { engineMode, modeHint, toMusicEngine } from './engine-mode';

const agent = (id: string, available = true): ChatEngine =>
  ({ id, label: id, kind: 'agent', icon: () => null, available, models: [], defaultModelId: 'default' }) as ChatEngine;

describe('engine mode', () => {
  it('refines for Claude and Codex, writes in one pass for the rest', () => {
    expect(engineMode('claude', false)).toBe('iterative');
    expect(engineMode('codex', false)).toBe('iterative');
    expect(engineMode('ollama', false)).toBe('single-pass');
    expect(engineMode('agy', false)).toBe('single-pass');
  });
  it('lets a registered Antigravity refine', () => {
    expect(engineMode('agy', true)).toBe('iterative');
    expect(modeHint('agy', false)).toMatch(/one pass.*Settings/);
    expect(modeHint('agy', true)).toMatch(/Refines/);
  });
});

describe('toMusicEngine', () => {
  it('maps an agent, dropping the default model', () => {
    expect(toMusicEngine(agent('claude'), 'default')).toEqual({ kind: 'agent', agentId: 'claude' });
    expect(toMusicEngine(agent('claude'), 'sonnet-5')).toEqual({ kind: 'agent', agentId: 'claude', model: 'sonnet-5' });
  });
  it('maps Ollama to its model and refuses one without', () => {
    const ollama = { ...agent('ollama'), kind: 'ollama', defaultModelId: 'llama3' } as ChatEngine;
    expect(toMusicEngine(ollama, null)).toEqual({ kind: 'ollama', model: 'llama3' });
    expect(toMusicEngine({ ...ollama, defaultModelId: null } as ChatEngine, null)).toBeNull();
  });
  it('refuses an engine that is not available or missing', () => {
    expect(toMusicEngine(agent('claude', false), null)).toBeNull();
    expect(toMusicEngine(null, null)).toBeNull();
  });
});
