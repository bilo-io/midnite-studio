// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createAudioEngineServices } from './engine-services';

const broker = (state: 'ready' | 'missing') => ({ status: async () => ({ state }) });

describe('createAudioEngineServices', () => {
  it('reports the engine and a running Ollama with its installed models', async () => {
    const engine = createAudioEngineServices({
      broker: broker('missing'),
      ollama: { listModels: async () => ['llama3.2:3b'], chat: async () => '' },
    });
    const status = await engine.status();
    expect(status.musicgen.state).toBe('missing');
    expect(status.musicgen.downloadBytes).toBeGreaterThan(0);
    expect(status.ollama).toMatchObject({ running: true, models: ['llama3.2:3b'] });
  });

  it('needs no download once ready, and treats a missing Ollama as not running', async () => {
    const status = await createAudioEngineServices({ broker: broker('ready') }).status();
    expect(status.musicgen.downloadBytes).toBe(0);
    expect(status.ollama).toMatchObject({ running: false, models: [], model: null });
  });

  it('fails Expand softly without an Ollama', async () => {
    const result = await createAudioEngineServices({ broker: broker('ready') }).expand({ title: 't', style: [], lyrics: '', instrumental: true, durationS: 30, ollamaModel: '' } as never);
    expect(result.ok).toBe(false);
  });
});
