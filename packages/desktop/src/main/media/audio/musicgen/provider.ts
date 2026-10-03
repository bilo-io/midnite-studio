import { AUDIO_LOCAL_MAX_DURATION_S } from '@midnite/studio-shared';

import { AudioProviderError, type AudioProvider, type ProducedAudio } from '../types';
import type { MusicEngine } from './engine';
import { encodeWav, finishTrack, stitch } from './pcm';
import { captionFor, planSegments, SECTION_CROSSFADE_S } from './prompt';

/**
 * The local generating provider: each variant is `planSegments(durationS)`
 * model renders stitched into one WAV. Pure orchestration over a `MusicEngine`
 * — the engine owns the model, this owns captions, sections and the file.
 */
export function createMusicgenProvider(engine: MusicEngine): AudioProvider {
  return {
    id: 'musicgen',
    generates: true,
    async generate(req, deps) {
      const segments = planSegments(Math.min(req.durationS, AUDIO_LOCAL_MAX_DURATION_S));
      const steps = req.count * segments.length;
      const out: ProducedAudio[] = [];
      let done = 0;

      for (let variant = 0; variant < req.count; variant += 1) {
        const chunks: Float32Array[] = [];
        let sampleRate = 32000;
        for (const segment of segments) {
          if (deps.signal.aborted) throw new AudioProviderError('cancelled');
          const label =
            `Rendering ${req.count > 1 ? `variant ${variant + 1}/${req.count}, ` : ''}` +
            (segments.length > 1 ? `section ${segment.index + 1}/${segments.length}` : 'track');
          deps.onProgress?.({ stage: label, fraction: done / steps });
          const render = await engine.render(
            { prompt: captionFor(req, segment.index), seconds: segment.seconds },
            {
              signal: deps.signal,
              onProgress: (f) => deps.onProgress?.({ stage: label, fraction: (done + f) / steps }),
            },
          );
          if (deps.signal.aborted) throw new AudioProviderError('cancelled');
          sampleRate = render.sampleRate;
          chunks.push(render.samples);
          done += 1;
        }
        const track = finishTrack(stitch(chunks, Math.round(SECTION_CROSSFADE_S * sampleRate)), sampleRate);
        const audio: ProducedAudio = { bytes: encodeWav(track, sampleRate), ext: 'wav' };
        out.push(audio);
        deps.onAudio?.(audio);
      }
      deps.onProgress?.({ stage: 'Done', fraction: 1 });
      return out;
    },
  };
}
