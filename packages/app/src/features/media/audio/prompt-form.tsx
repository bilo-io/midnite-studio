import {
  AUDIO_DURATION_MAX_S,
  AUDIO_DURATION_MIN_S,
  AUDIO_GENERATION_UNAVAILABLE,
  AUDIO_LOCAL_MAX_DURATION_S,
  AUDIO_LOCAL_MODEL_BYTES,
  AUDIO_LOCAL_MODEL_LICENSE,
  AUDIO_LYRIC_SECTIONS,
  AUDIO_MAX_VARIANTS,
  AUDIO_MUSIC_PROMPT_MAX,
  AUDIO_PROVIDERS,
  DEFAULT_AUDIO_PROVIDER,
  audioProviderInfo,
  type AudioEngineStatus,
  type AudioProviderId,
  type AudioProviderStatus,
} from '@midnite/studio-shared';
import { useRef, useState, type Dispatch } from 'react';
import { LuDownload, LuImport, LuInfo, LuMusic, LuWandSparkles, LuX } from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';
import { insertLyricSection, toPrompt, type PromptFormAction, type PromptFormState } from './prompt-form-state';
import { MEDIA_PROMPT_BOX } from '../prompt-input';
import { AiComposer, AttachMenu, ProviderModelPicker, useComposerMic, type PickerProvider } from '../../../components/ai-thread';
import { appendDictation, useSpeakOutcome, useVoiceThread } from '../voice/use-voice-thread';
import { SpeechToggle } from '../voice/voice-controls';
import { useAudioEngineInstall, useAudioPrefs, useExpandPrompt, type PendingImport } from './use-audio';
import { formatDuration } from './waveform';

export const AUDIO_PROVIDER_ICONS: Record<AudioProviderId, IconComponent> = { musicgen: LuMusic, import: LuImport };

const formatMb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/**
 * Generation providers only. "Import" is not one — it is an attachment, offered
 * once, in the composer's "+" menu — so with no generating provider this is
 * empty and the composer shows no provider picker at all.
 */
export function audioPickerProviders(statuses: readonly AudioProviderStatus[]): PickerProvider[] {
  return AUDIO_PROVIDERS.filter((p) => p.generates).map((p) => {
    const status = statuses.find((s) => s.id === p.id);
    const blocked = status && !status.available ? status.reason : undefined;
    return {
      id: p.id,
      label: p.label,
      icon: AUDIO_PROVIDER_ICONS[p.id],
      color: '#A78BFA',
      recommended: p.id === DEFAULT_AUDIO_PROVIDER,
      ...(blocked ? { disabled: true, reason: blocked } : {}),
    };
  });
}

const field = 'flex flex-col gap-1 text-[11px] font-medium text-muted-foreground';
const input =
  'rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/**
 * Media ▸ Audio's right pane (Phase 99 Theme E): a Suno-style prompt form.
 * **Create** renders with the selected local provider (MusicGen), **Enhance**
 * asks a small Ollama model to write the caption MusicGen is conditioned on,
 * and **Import audio…** attaches files as variants, recording this form's
 * title/style/lyrics in the session.
 */
export function PromptForm({
  state,
  dispatch,
  statuses,
  engine,
  importing,
  generating,
  progress,
  error,
  onImport,
  onGenerate,
  onCancel,
}: {
  state: PromptFormState;
  dispatch: Dispatch<PromptFormAction>;
  statuses: readonly AudioProviderStatus[];
  engine: AudioEngineStatus | null | undefined;
  importing: boolean;
  generating: boolean;
  progress: PendingImport | null;
  error: string | null;
  onImport: () => void;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const voice = useVoiceThread();
  const mic = useComposerMic({ onTranscript: (text) => dispatch({ type: 'lyrics', value: appendDictation(state.lyrics, text) }) });
  const [notice, setNotice] = useState<string | null>(null);
  const checked = toPrompt(state);
  const invalid = 'error' in checked ? checked.error : undefined;
  const pickerProviders = audioPickerProviders(statuses);
  const generates = audioProviderInfo(state.provider).generates;
  const local = state.provider === 'musicgen';
  const modelState = engine?.musicgen.state;
  const modelReady = !local || modelState === 'ready';
  const busy = importing || generating;
  const prefs = useAudioPrefs();
  const installer = useAudioEngineInstall();
  const enhancer = useExpandPrompt();
  const ollama = engine?.ollama;
  const hasBrief = state.title.trim() !== '' || state.style.length > 0 || state.tagDraft.trim() !== '' || state.lyrics.trim() !== '';
  const enhanceBlocked = !hasBrief
    ? 'Add a title, style tags or lyrics first.'
    : ollama && !ollama.running
      ? 'Ollama is not running — start it to enhance prompts.'
      : ollama && !(prefs.ollamaModel || ollama.model)
        ? `No small Ollama model installed. Run: ollama pull ${ollama.recommended}`
        : undefined;
  const createBlocked = invalid ?? (!modelReady ? 'Download the local model first.' : undefined);

  useSpeakOutcome(voice, busy, error, 'Your audio is ready.');

  const enhance = () => {
    const brief = toPrompt(state);
    const source = 'prompt' in brief ? brief.prompt : state;
    enhancer.mutate(
      {
        title: source.title,
        style: source.style,
        lyrics: source.lyrics,
        instrumental: source.instrumental,
        durationS: source.durationS,
        model: prefs.ollamaModel,
      },
      { onSuccess: (value) => dispatch({ type: 'expanded', musicPrompt: value.musicPrompt, sections: value.sections }) },
    );
  };

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
      ref={formRef}
      aria-label="Create audio"
      className="flex h-full min-h-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!generates) setNotice(AUDIO_GENERATION_UNAVAILABLE);
        else if (createBlocked === undefined && !busy) onGenerate();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        {local ? (
          <div data-testid="audio-engine" className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-2 text-[11px] text-muted-foreground">
            {modelState === 'missing' || modelState === 'downloading' ? (
              <>
                <p className="text-foreground">
                  MusicGen runs on this Mac — no account, no API key. It needs a one-time {formatMb(AUDIO_LOCAL_MODEL_BYTES)} download.
                </p>
                {installer.install.isPending ? (
                  <div role="progressbar" aria-label="Downloading model" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((installer.progress?.fraction ?? 0) * 100)} className="h-1.5 overflow-hidden rounded bg-accent">
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round((installer.progress?.fraction ?? 0) * 100)}%` }} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => installer.install.mutate()}
                    className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-accent"
                  >
                    <LuDownload aria-hidden className="h-3.5 w-3.5" />
                    Download model
                  </button>
                )}
              </>
            ) : modelState === 'unavailable' ? (
              <p role="alert" className="text-destructive">
                The local engine is unavailable: {engine?.musicgen.reason ?? 'unknown error'}
              </p>
            ) : (
              <p>
                Instrumental music, up to {formatDuration(AUDIO_LOCAL_MAX_DURATION_S)}, made offline. Lyrics only guide the mood. Model licence {AUDIO_LOCAL_MODEL_LICENSE}: personal use.
              </p>
            )}
            {installer.error ? (
              <p role="alert" className="text-destructive">
                {installer.error}
              </p>
            ) : null}
          </div>
        ) : null}

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
          <div className={`flex flex-wrap items-center gap-1 px-1.5 py-1 ${MEDIA_PROMPT_BOX}`}>
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

        {local ? (
          <div className={field}>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="audio-caption">Caption sent to MusicGen</label>
              <button
                type="button"
                onClick={enhance}
                disabled={enhanceBlocked !== undefined || enhancer.isPending}
                title={enhanceBlocked ?? 'Rewrite the brief as a MusicGen caption with a local Ollama model'}
                className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                <LuWandSparkles aria-hidden className="h-3 w-3" />
                {enhancer.isPending ? 'Enhancing…' : 'Enhance with Ollama'}
              </button>
            </div>
            <textarea
              id="audio-caption"
              value={state.musicPrompt ?? ''}
              maxLength={AUDIO_MUSIC_PROMPT_MAX}
              rows={3}
              onChange={(event) => dispatch({ type: 'caption', value: event.target.value })}
              placeholder="Optional. Defaults to your style tags — e.g. lo-fi hip hop, mellow piano, vinyl crackle, 80 bpm"
              className={`resize-none ${input}`}
            />
            {state.sections && state.sections.length > 1 ? (
              <span className="flex items-center justify-between text-[10px]">
                {state.sections.length} section captions will shape the arc.
                <button type="button" onClick={() => dispatch({ type: 'clearCaption' })} className="underline hover:text-foreground">
                  Clear
                </button>
              </span>
            ) : null}
            {enhancer.error ? (
              <span role="alert" className="text-[10px] text-destructive">
                {enhancer.error.message}
              </span>
            ) : null}
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={state.instrumental}
            onChange={(event) => dispatch({ type: 'instrumental', value: event.target.checked })}
            className="accent-primary"
          />
          Instrumental
        </label>

        <div className="flex gap-2">
          <label className={`flex-1 ${field}`}>
            Duration ({formatDuration(state.durationS)})
            <input
              type="range"
              min={AUDIO_DURATION_MIN_S}
              max={local ? AUDIO_LOCAL_MAX_DURATION_S : AUDIO_DURATION_MAX_S}
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

        {generating ? (
          <div role="status" aria-label="Generation progress" className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-2 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span className="text-foreground">{progress?.stage ?? 'Starting…'}</span>
              <button type="button" onClick={onCancel} className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent hover:text-foreground">
                Cancel
              </button>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress?.fraction ?? 0) * 100)} className="h-1.5 overflow-hidden rounded bg-accent">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }} />
            </div>
          </div>
        ) : null}
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

      </div>

      {/*
        The lyrics composer is the panel's prompt, so it sits at the bottom of
        the whole panel like every chat input, below the fields that shape it.
        Create is its Send; Import lives behind its "+".
      */}
      <div className={`shrink-0 border-t border-border/50 p-3 ${field}`}>
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
        <AiComposer
          textareaRef={lyricsRef}
          ariaLabel="Lyrics"
          value={state.instrumental ? '' : state.lyrics}
          disabled={state.instrumental}
          onChange={(value) => dispatch({ type: 'lyrics', value })}
          onSend={() => formRef.current?.requestSubmit()}
          canSend={createBlocked === undefined && !busy}
          enterToSend={false}
          sendAriaLabel="Create"
          sendTooltip={createBlocked ?? (generates ? 'Create (Cmd/Ctrl+Enter)' : AUDIO_GENERATION_UNAVAILABLE)}
          rows={5}
          placeholder={state.instrumental ? 'Instrumental — no lyrics' : '[Verse]\nStreetlights hum…'}
          mic={mic}
          leading={
            <>
              {pickerProviders.length > 0 ? (
                <ProviderModelPicker
                  testId="audio-picker"
                  providers={pickerProviders}
                  provider={state.provider}
                  onProviderChange={(id) => dispatch({ type: 'provider', value: id as AudioProviderId })}
                  models={[]}
                  model=""
                  onModelChange={() => undefined}
                />
              ) : null}
              <AttachMenu
              testId="audio-attach"
              options={[
                {
                  id: 'import',
                  label: importing ? 'Importing…' : 'Import audio…',
                  icon: LuImport,
                  onSelect: onImport,
                  disabled: busy || invalid !== undefined,
                  reason: invalid,
                },
              ]}
              />
            </>
          }
          trailing={<SpeechToggle voice={voice} />}
          boxClassName={MEDIA_PROMPT_BOX}
          testIdPrefix="audio-lyrics"
        />
      </div>
    </form>
  );
}
