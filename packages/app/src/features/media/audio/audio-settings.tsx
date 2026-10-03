import {
  AUDIO_DURATION_MAX_S,
  AUDIO_DURATION_MIN_S,
  AUDIO_LOCAL_MODEL_LICENSE,
  AUDIO_MAX_VARIANTS,
  AUDIO_MP3_BITRATES,
} from '@midnite/studio-shared';

import { useAudioEngine, useAudioPrefs } from './use-audio';
import { formatDuration } from './waveform';

const field = 'flex flex-col gap-1 text-[11px] font-medium text-muted-foreground';
const select = 'h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground';

/**
 * Settings ▸ Media ▸ Audio (Phase 99 Theme E): the prompt form's defaults, the
 * MP3 export bitrate, and the local engine. There is no key row: MusicGen runs
 * on this machine, and Ollama (optional) is only used to rewrite prompts.
 */
export function AudioSettingsSection() {
  const prefs = useAudioPrefs();
  const engine = useAudioEngine().data;
  const ollama = engine?.ollama;

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className={field}>
          MP3 export bitrate
          <select
            value={prefs.mp3BitrateKbps}
            onChange={(event) => prefs.set({ mp3BitrateKbps: Number(event.target.value) })}
            className={select}
          >
            {AUDIO_MP3_BITRATES.map((kbps) => (
              <option key={kbps} value={kbps}>
                {kbps} kbps
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Default duration ({formatDuration(prefs.durationS)})
          <input
            type="range"
            min={AUDIO_DURATION_MIN_S}
            max={AUDIO_DURATION_MAX_S}
            step={5}
            value={prefs.durationS}
            onChange={(event) => prefs.set({ durationS: Number(event.target.value) })}
            className="accent-primary"
          />
        </label>
        <label className={field}>
          Default variants
          <select value={prefs.count} onChange={(event) => prefs.set({ count: Number(event.target.value) })} className={select}>
            {Array.from({ length: AUDIO_MAX_VARIANTS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={field}>
          Ollama model for Enhance
          <select
            aria-label="Ollama model for Enhance"
            value={prefs.ollamaModel}
            onChange={(event) => prefs.set({ ollamaModel: event.target.value })}
            className={select}
          >
            <option value="">Automatic{ollama?.model ? ` (${ollama.model})` : ''}</option>
            {(ollama?.models ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Music is generated locally by MusicGen-small ({AUDIO_LOCAL_MODEL_LICENSE}, personal use): instrumental only, no API key.
        {ollama && !ollama.running
          ? ' Ollama is not running, so Enhance is off.'
          : ollama && !ollama.model
            ? ` For Enhance, run: ollama pull ${ollama.recommended} (about 2 GB, fits an 8 GB Mac).`
            : ''}
      </p>
    </div>
  );
}
