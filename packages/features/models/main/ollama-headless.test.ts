// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { runOllamaPrompt } from './ollama-headless';

describe('runOllamaPrompt', () => {
  it('sends one user message to the host it was given and answers the text', async () => {
    const chat = vi.fn(async () => 'hello');
    const reply = await runOllamaPrompt('llama3.2', 'hi', 5000, { chat, baseUrl: async () => 'http://127.0.0.1:1' });
    expect(reply).toEqual({ ok: true, data: 'hello' });
    expect(chat).toHaveBeenCalledWith(
      { model: 'llama3.2', messages: [{ role: 'user', content: 'hi' }] },
      { baseUrl: 'http://127.0.0.1:1', timeoutMs: 5000 },
    );
  });

  it('names the model when the daemon cannot be reached', async () => {
    const chat = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(await runOllamaPrompt('llama3.2', 'hi', 5000, { chat, baseUrl: async () => 'http://x' })).toEqual({
      ok: false,
      message: 'Could not reach Ollama (llama3.2): ECONNREFUSED',
    });
  });

  it('turns an abort into the plain too-long message', async () => {
    const chat = vi.fn(async () => {
      throw new Error('The operation was aborted: timeout');
    });
    expect(await runOllamaPrompt('m', 'hi', 1, { chat, baseUrl: async () => 'http://x' })).toMatchObject({
      ok: false,
      message: 'That took too long, so the request was cancelled.',
    });
  });
});
