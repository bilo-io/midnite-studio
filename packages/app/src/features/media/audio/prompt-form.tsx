import {
  AUDIO_DURATION_MAX_S,
  AUDIO_DURATION_MIN_S,
  AUDIO_GENERATION_UNAVAILABLE,
  AUDIO_LYRIC_SECTIONS,
  AUDIO_MAX_VARIANTS,
  AUDIO_PROVIDERS,
  audioProviderInfo,
  type AudioProviderId,
  type AudioProviderStatus,
} from '@midnite/studio-shared';
import { useRef, useState, type Dispatch } from 'react';
import { LuImport, LuInfo, LuSparkles, LuX } from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';
import { IconSelect, type IconSelectOption } from '../../../components/select/icon-select';
import { insertLyricSection, toPrompt, type PromptFormAction, type PromptFormState } from './prompt-form-state';
import { formatDuration } from './waveform';

export const AUDIO_PROVIDER_ICONS: Record<AudioProviderId, IconComponent> = { import: LuImport };

export function audioProviderOptions(statuses: readonly AudioProviderStatus[]): IconSelectOption[] {
  return AUDIO_PROVIDERS.map((p) => {
    const status = statuses.find((s) => s.id === p.id);
    const blocked = status && !status.available ? status.reason : undefined;
    return {
      id: p.id,
      label: p.label,
      icon: AUDIO_PROVIDER_ICONS[p.id],
      ...(p.generates ? {} : { hint: 'Attach files as variants' }),
      ...(blocked ? { isDisabled: true, disabledReason: blocked } : {}),
    };
  });
}

const field = 'flex flex-col gap-1 text-[11px] font-medium text-muted-foreground';
const input =
  'rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/**
 * Media ▸ Audio's right pane (Phase 99 Theme E): a Suno-style prompt form.
 * With only the Import provider, **Create** answers the "later phase" state
 * and **Import audio…** attaches files as variants, recording this form's
 * title/style/lyrics in the session.
 */
export function PromptForm({
  state,
  dispatch,
  statuses,
  importing,
  error,
  onImport,
}: {
  state: PromptFormState;
  dispatch: Dispatch<PromptFormAction>;
  statuses: readonly AudioProviderStatus[];
  importing: boolean;
  error: string | null;
  onImport: () => void;
}) {
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const checked = toPrompt(state);
  const invalid = 'error' in checked ? checked.error : undefined;
  const generates = audioProviderInfo(state.provider).generates;

  const addSection = (section: string) => {
    const el = lyricsRef.current;
    const { text, caret } = insertLyricSection(state.lyrics, el?.selectionStart ?? state.lyrics.length, section);
    dispatch({ type: 'lyrics', value: text });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  return (
    <form
      aria-label="Create audio"
      className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!generates) setNotice(AUDIO_GENERATION_UNAVAILABLE);
      }}
    >
      <label className={field}>
        Title
        <input
          value={state.title}
          onChange={(event) => dispatch({ type: 'title', value: event.target.value })}
          placeholder="Night drive"
          className={`h-7 ${input}`}
        />
      </label>

      <div className={field}>
        <span id="audio-style-label">Style</span>
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background px-1.5 py-1">
          {state.style.map((tag) => (
            <span key={tag} className="flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-[11px] text-foreground">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => dispatch({ type: 'removeTag', tag })}
                className="text-muted-foreground hover:text-foreground"
              >
                <LuX aria-hidden className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            aria-labelledby="audio-style-label"
            value={state.tagDraft}
            onChange={(event) => dispatch({ type: 'tagDraft', value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                dispatch({ type: 'addTag' });
              } else if (event.key === 'Backspace' && state.tagDraft === '' && state.style.length > 0) {
                dispatch({ type: 'removeTag', tag: state.style.at(-1)! });
              }
            }}
            placeholder={state.style.length === 0 ? 'synthwave, female vocals, 110 bpm' : ''}
            className="h-5 min-w-[6rem] flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={state.instrumental}
          onChange={(event) => dispatch({ type: 'instrumental', value: event.target.checked })}
          className="accent-primary"
        />
        Instrumental
      </label>

      <div className={field}>
        <span id="audio-lyrics-label">Lyrics</span>
        <div role="toolbar" aria-label="Lyric sections" className="flex flex-wrap gap-1">
          {AUDIO_LYRIC_SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              disabled={state.instrumental}
              onClick={() => addSection(section)}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              [{section}]
            </button>
          ))}
        </div>
        <textarea
          ref={lyricsRef}
          aria-labelledby="audio-lyrics-label"
          value={state.instrumental ? '' : state.lyrics}
          disabled={state.instrumental}
          onChange={(event) => dispatch({ type: 'lyrics', value: event.target.value })}
          rows={8}
          placeholder={state.instrumental ? 'Instrumental — no lyrics' : '[Verse]\nStreetlights hum…'}
          className={`resize-y font-mono disabled:opacity-50 ${input}`}
        />
      </div>

      <div className="flex gap-2">
        <label className={`flex-1 ${field}`}>
          Duration ({formatDuration(state.durationS)})
          <input
            type="range"
            min={AUDIO_DURATION_MIN_S}
            max={AUDIO_DURATION_MAX_S}
            step={5}
            value={state.durationS}
            onChange={(event) => dispatch({ type: 'duration', value: Number(event.target.value) })}
            className="accent-primary"
          />
        </label>
        <label className={`w-20 ${field}`}>
          Variants
          <select
            value={state.count}
            onChange={(event) => dispatch({ type: 'count', value: Number(event.target.value) })}
            className="h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
          >
            {Array.from({ length: AUDIO_MAX_VARIANTS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={field}>
        Provider
        <IconSelect
          ariaLabel="Audio provider"
          options={audioProviderOptions(statuses)}
          value={state.provider}
          isSearchable={false}
          menuInPortal
          onChange={(id) => id && dispatch({ type: 'provider', value: id as AudioProviderId })}
        />
      </div>

      {notice ? (
        <p role="status" className="flex items-start gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-[11px] text-muted-foreground">
          <LuInfo aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onImport}
          disabled={importing || invalid !== undefined}
          title={invalid}
          aria-busy={importing || undefined}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LuImport aria-hidden className="h-3.5 w-3.5" />
          {importing ? 'Importing…' : 'Import audio…'}
        </button>
        <button
          type="submit"
          disabled={invalid !== undefined}
          title={invalid ?? (generates ? undefined : AUDIO_GENERATION_UNAVAILABLE)}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-primary bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LuSparkles aria-hidden className="h-3.5 w-3.5" />
          Create
        </button>
      </div>
    </form>
  );
}
