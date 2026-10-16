import {
  AUDIO_LOCAL_MODEL_BYTES,
  AUDIO_OLLAMA_RECOMMENDED,
  type AudioEngineStatus,
  type AudioExpandRequest,
} from '@midnite/studio-shared';

import { expandPrompt, pickOllamaModel, type ExpandDeps } from './ollama-expand';
import type { MusicBroker } from './musicgen/music-broker';

/**
 * What the Audio tab shows about its generating engines, and the Ollama prompt
 * expansion — built over the music broker and an optional Ollama client the
 * composer injects, so this module imports neither Electron nor an HTTP client.
 * An app with no Ollama passes none: the engine reports it as not running and
 * Expand fails inline, which the form already renders.
 */
export type AudioEngineDeps = {
  broker: Pick<MusicBroker, 'status'>;
  ollama?: ExpandDeps;
};

export function createAudioEngineServices(deps: AudioEngineDeps) {
  const listModels = deps.ollama?.listModels ?? (() => Promise.reject(new Error('Ollama is not available in this app.')));

  async function status(): Promise<AudioEngineStatus> {
    const [music, installed] = await Promise.all([
      deps.broker.status(),
      listModels().then(
        (models) => ({ running: true, models }),
        () => ({ running: false, models: [] as string[] }),
      ),
    ]);
    return {
      musicgen: {
        state: music.state,
        downloadBytes: music.state === 'ready' ? 0 : AUDIO_LOCAL_MODEL_BYTES,
        ...(music.reason ? { reason: music.reason } : {}),
      },
      ollama: { ...installed, model: pickOllamaModel(installed.models), recommended: AUDIO_OLLAMA_RECOMMENDED },
    };
  }

  const expand = (req: AudioExpandRequest) =>
    expandPrompt(req, {
      listModels,
      chat: deps.ollama?.chat ?? (() => Promise.reject(new Error('Ollama is not available in this app.'))),
    });

  return { status, expand };
}

export type AudioEngineServices = ReturnType<typeof createAudioEngineServices>;
