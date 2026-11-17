// vitest/jsdom-free node test: Ollama routing and fallback with a mocked fetch (no daemon).
import { describe, expect, it, vi } from 'vitest';

import { isNoLlm, ollamaUrl, probe, routeModels, run } from './ollama.mjs';

const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const daemon = (models, generate = { response: ' hello ' }) =>
  vi.fn(async (url) => (String(url).endsWith('/api/tags') ? json({ models: models.map((name) => ({ name })) }) : json(generate)));

describe('routing', () => {
  it('sends classify/note to the small models and draft/audit to qwen', () => {
    expect(routeModels('classify')[0]).toBe('gemma4:e2b');
    expect(routeModels('note')).toContain('ministral-3:3b');
    expect(routeModels('draft')).toEqual(['qwen3.5:9b']);
    expect(routeModels('audit', 100)).toEqual(['qwen3.5:9b']);
  });
  it('prefers the 64k model past 8k chars for draft/audit only', () => {
    expect(routeModels('draft', 8001)[0]).toBe('qwen3.5:9b-64k');
    expect(routeModels('classify', 50_000)[0]).toBe('gemma4:e2b');
  });
  it('rejects an unknown task', () => expect(() => routeModels('x')).toThrow(/unknown task/));
});

describe('flags', () => {
  it('honours --no-llm and MSTUDIO_NO_LLM', () => {
    expect(isNoLlm(['--no-llm'], {})).toBe(true);
    expect(isNoLlm([], { MSTUDIO_NO_LLM: '1' })).toBe(true);
    expect(isNoLlm([], { MSTUDIO_NO_LLM: '0' })).toBe(false);
    expect(isNoLlm([], {})).toBe(false);
  });
  it('reads MSTUDIO_OLLAMA_URL, trimming a trailing slash', () => {
    expect(ollamaUrl({ MSTUDIO_OLLAMA_URL: 'http://x:1/' })).toBe('http://x:1');
    expect(ollamaUrl({})).toBe('http://localhost:11434');
  });
});

describe('probe', () => {
  it('lists installed models', async () => {
    expect(await probe({ fetch: daemon(['a', 'b']) })).toEqual({ up: true, models: ['a', 'b'] });
  });
  it('reports down when fetch rejects or returns non-ok', async () => {
    expect((await probe({ fetch: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) })).up).toBe(false);
    expect((await probe({ fetch: vi.fn().mockResolvedValue(json({}, false, 500)) })).up).toBe(false);
  });
});

describe('run', () => {
  const fallback = () => 'FALLBACK';
  it('uses the model when the daemon is up and the model is pulled', async () => {
    const fetch = daemon(['gemma4:e2b']);
    const r = await run({ task: 'note', prompt: 'p', fallback, noLlm: false, fetch });
    expect(r).toEqual({ source: 'ollama', model: 'gemma4:e2b', text: 'hello' });
    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body).toMatchObject({ model: 'gemma4:e2b', prompt: 'p', stream: false });
  });
  it('falls back to the second candidate model', async () => {
    const r = await run({ task: 'classify', prompt: 'p', fallback, noLlm: false, fetch: daemon(['ministral-3:3b']) });
    expect(r.model).toBe('ministral-3:3b');
  });
  it('never touches the network under --no-llm', async () => {
    const fetch = vi.fn();
    const r = await run({ task: 'draft', prompt: 'p', fallback, noLlm: true, fetch });
    expect(r).toMatchObject({ source: 'fallback', text: 'FALLBACK', reason: 'no-llm' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('falls back when the daemon is unreachable', async () => {
    const r = await run({ task: 'draft', prompt: 'p', fallback, noLlm: false, fetch: vi.fn().mockRejectedValue(new Error('down')) });
    expect(r).toMatchObject({ source: 'fallback', reason: 'unreachable' });
  });
  it('falls back when no candidate model is pulled', async () => {
    const r = await run({ task: 'draft', prompt: 'p', fallback, noLlm: false, fetch: daemon(['gemma4:e2b']) });
    expect(r.reason).toBe('model-missing');
  });
  it('falls back on an empty or failed generation', async () => {
    expect((await run({ task: 'note', prompt: 'p', fallback, noLlm: false, fetch: daemon(['gemma4:e2b'], { response: '  ' }) })).reason).toBe('empty');
    const failing = vi.fn(async (u) => (String(u).endsWith('/api/tags') ? json({ models: [{ name: 'gemma4:e2b' }] }) : json({}, false, 500)));
    expect((await run({ task: 'note', prompt: 'p', fallback, noLlm: false, fetch: failing })).reason).toBe('http-500');
  });
  it('awaits an async fallback', async () => {
    const r = await run({ task: 'note', prompt: 'p', fallback: async () => 42, noLlm: true });
    expect(r.text).toBe(42);
  });
});
