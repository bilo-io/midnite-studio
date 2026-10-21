import { basename, extname } from 'node:path';

import { isAudioPath } from '@midnite/studio-shared';

import { AudioProviderError, type AudioProvider, type ProducedAudio } from './types';

/**
 * The only `AudioProvider` this phase ships: it "generates" by copying the
 * files the user picked. The request's prompt fields are ignored here — the
 * service still records them in the session, so an import can carry a title
 * and style tags like a real create would.
 */
export const importAudioProvider: AudioProvider = {
  id: 'import',
  generates: false,
  async generate(_req, deps) {
    if (deps.sources.length === 0) throw new AudioProviderError('No files were picked.');
    const out: ProducedAudio[] = [];
    for (const source of deps.sources) {
      if (deps.signal.aborted) throw new AudioProviderError('cancelled');
      const name = basename(source);
      if (!isAudioPath(name)) throw new AudioProviderError(`${name} is not an audio file.`);
      const bytes = await deps.readFile(source);
      const audio: ProducedAudio = { bytes, ext: extname(name).slice(1).toLowerCase(), source: name };
      out.push(audio);
      deps.onAudio?.(audio);
    }
    return out;
  },
};
