import { AUDIO_OLLAMA_RECOMMENDED } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { expandPrompt, expansionMessages, parseExpansion, pickOllamaModel, sectionCount } from './ollama-expand';

const req = { title: 'Night drive', style: ['synthwave'], lyrics: '', instrumental: true, durationS: 90, model: '' };

describe('pickOllamaModel', () => {
  it('prefers the user pick, then the preference order, ignoring :latest', () => {
    expect(pickOllamaModel(['qwen3:4b', 'llama3.2:3b'])).toBe('llama3.2:3b');
    expect(pickOllamaModel(['qwen3:4b', 'gemma3:4b'])).toBe('qwen3:4b');
    expect(pickOllamaModel(['qwen3:4b'], 'llama3.2:3b')).toBeNull();
    expect(pickOllamaModel(['mistral:latest'], 'mistral')).toBe('mistral:latest');
  });
  it('never grabs an arbitrary model that might not fit in memory', () => {
    expect(pickOllamaModel(['llama3.1:70b', 'codellama:34b'])).toBeNull();
  });
});

describe('parseExpansion', () => {
  it('reads plain JSON, fenced JSON and replies with a <think> block', () => {
    const json = '{"musicPrompt":"synthwave, 100 bpm","sections":["intro","drop"]}';
    expect(parseExpansion(json)).toEqual({ musicPrompt: 'synthwave, 100 bpm', sections: ['intro', 'drop'] });
    expect(parseExpansion('```json\n' + json + '\n```')).toMatchObject({ musicPrompt: 'synthwave, 100 bpm' });
    expect(parseExpansion('<think>{"musicPrompt":"no"}</think>Sure! ' + json)).toMatchObject({ musicPrompt: 'synthwave, 100 bpm' });
  });
  it('rejects replies with no usable caption and drops non-string sections', () => {
    expect(parseExpansion('I cannot help')).toBeNull();
    expect(parseExpansion('{"sections":["x"]}')).toBeNull();
    expect(parseExpansion('{"musicPrompt":"a","sections":["b",3,""]}')).toEqual({ musicPrompt: 'a', sections: ['b'] });
  });
});

describe('expansionMessages', () => {
  it('asks for one caption per ~30 s and passes lyrics only when vocals are off the table', () => {
    expect(sectionCount(90)).toBe(3);
    expect(sectionCount(10)).toBe(1);
    expect(sectionCount(480)).toBe(4);
    const [system, user] = expansionMessages({ ...req, instrumental: false, lyrics: '[Verse] rain on glass' });
    expect(system!.content).toContain('exactly 3 captions');
    expect(user!.content).toContain('Title: Night drive');
    expect(user!.content).toContain('rain on glass');
    expect(expansionMessages(req)[1]!.content).not.toContain('Lyrics');
  });
});

describe('expandPrompt', () => {
  const reply = '{"musicPrompt":"dark synthwave, analog bass, 100 bpm","sections":["intro","build","peak"]}';

  it('chats with the chosen model and returns the caption', async () => {
    const chat = vi.fn(async () => reply);
    const result = await expandPrompt(req, { listModels: async () => ['llama3.2:3b'], chat });
    expect(result).toEqual({ ok: true, value: { musicPrompt: 'dark synthwave, analog bass, 100 bpm', sections: ['intro', 'build', 'peak'], model: 'llama3.2:3b' } });
    expect(chat).toHaveBeenCalledWith('llama3.2:3b', expect.any(Array));
  });

  it('fails soft when the daemon is down', async () => {
    const result = await expandPrompt(req, { listModels: async () => Promise.reject(new Error('ECONNREFUSED')), chat: vi.fn() });
    expect(result).toMatchObject({ ok: false, kind: 'error', message: expect.stringContaining('not running') });
  });

  it('names the pull command when no suitable model is installed', async () => {
    const result = await expandPrompt(req, { listModels: async () => ['llama3.1:70b'], chat: vi.fn() });
    expect(result).toMatchObject({ ok: false, message: `No small Ollama model is installed. Run: ollama pull ${AUDIO_OLLAMA_RECOMMENDED}` });
  });

  it('fails soft on garbage and on a chat error', async () => {
    const garbage = await expandPrompt(req, { listModels: async () => ['llama3.2:3b'], chat: async () => 'nope' });
    expect(garbage).toMatchObject({ ok: false, message: expect.stringContaining('usable caption') });
    const boom = await expandPrompt(req, { listModels: async () => ['llama3.2:3b'], chat: async () => Promise.reject(new Error('timed out')) });
    expect(boom).toMatchObject({ ok: false, message: 'timed out' });
  });
});
