import {
  AUDIO_DURATION_MAX_S,
  AUDIO_DURATION_MIN_S,
  AUDIO_GENERATION_UNAVAILABLE,
  AUDIO_MAX_VARIANTS,
  AUDIO_MP3_BITRATES,
  type AudioProviderId,
} from '@midnite/studio-shared';

import { IconSelect } from '../../../components/select/icon-select';
import { audioProviderOptions } from './prompt-form';
import { useAudioPrefs, useAudioProviders } from './use-audio';
import { formatDuration } from './waveform';

const field = 'flex flex-col gap-1 text-[11px] font-medium text-muted-foreground';
const select = 'h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground';

/**
 * Settings ▸ Media ▸ Audio (Phase 99 Theme E): the prompt form's defaults and
 * the MP3 export bitrate. Import is the only provider, so there is no key row
 * yet — a generating provider brings its own when it lands.
 */
export function AudioSettingsSection() {
  const prefs = useAudioPrefs();
  const providers = useAudioProviders();

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className={field}>
          Default provider
          <IconSelect
            ariaLabel="Default audio provider"
            options={audioProviderOptions(providers.data ?? [])}
            value={prefs.provider}
            isSearchable={false}
            menuInPortal
            onChange={(id) => id && prefs.set({ provider: id as AudioProviderId })}
          />
        </div>
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
      <p className="text-xs text-muted-foreground">{AUDIO_GENERATION_UNAVAILABLE}</p>
    </div>
  );
}
