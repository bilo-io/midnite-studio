import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useUiStore } from '../../store/ui-store';
import { useChatsStore } from '@midnite/studio-feature-chats/renderer';
import { useModelPrefs } from '../media/model/use-model';
import { chatDraftFor, modelPrefsFor, primarySelection, useFollowPrimaryAgent } from './follow-primary-agent';

describe('primarySelection', () => {
  it('maps the default row and a missing model to null', () => {
    expect(primarySelection('claude', {})).toEqual({ agentId: 'claude', model: null });
    expect(primarySelection('claude', { claude: 'default' }).model).toBeNull();
    expect(primarySelection('claude', { claude: 'opus-5' }).model).toBe('opus-5');
  });
});

describe('derivations', () => {
  it('chat draft follows agent and wire model', () => {
    expect(chatDraftFor({ agentId: 'claude', model: 'opus-5' })).toEqual({ engine: 'claude', model: 'opus-5' });
  });
  it('model prefs keep a known loop model, else default', () => {
    expect(modelPrefsFor({ agentId: 'claude', model: 'opus-5' })).toEqual({ engineId: 'claude', agentModel: 'opus-5' });
    expect(modelPrefsFor({ agentId: 'codex', model: 'opus-5' })).toEqual({ engineId: 'codex', agentModel: 'default' });
  });
  it('ollama carries its model name', () => {
    expect(modelPrefsFor({ agentId: 'ollama', model: 'qwen2.5-coder' })).toEqual({ engineId: 'ollama', ollamaModel: 'qwen2.5-coder' });
  });
});

describe('useFollowPrimaryAgent', () => {
  afterEach(() => {
    useUiStore.getState().setPrimaryAgentAndModel('claude', null);
  });

  it('syncs the chat draft and media prefs on a change, not at mount', () => {
    useChatsStore.getState().setDraft({ engine: 'codex', model: null });
    useModelPrefs.getState().set({ engineId: 'ollama' });
    renderHook(() => useFollowPrimaryAgent());
    expect(useChatsStore.getState().draft.engine).toBe('codex');
    useUiStore.getState().setPrimaryAgentAndModel('claude', 'opus-5');
    expect(useChatsStore.getState().draft).toMatchObject({ engine: 'claude', model: 'opus-5' });
    expect(useModelPrefs.getState()).toMatchObject({ engineId: 'claude', agentModel: 'opus-5' });
  });
});
