import {
  AUDIO_DURATION_MAX_S,
  AUDIO_DURATION_MIN_S,
  AUDIO_LOCAL_MAX_DURATION_S,
  AUDIO_LOCAL_MODEL_BYTES,
  AUDIO_PROVIDERS,
  audioProviderInfo,
  type AudioProviderId,
} from '@midnite/studio-shared';

import { MediaPanelBody, MediaPanelFooter, MediaPanelLayout, PromptTextarea, BrandSlider } from '@midnite/studio-frame';

import type { AudioPromptFormProps } from './host';
import { toPrompt } from './prompt-form-state';
import { useAudioEngineInstall } from './use-audio';
import { formatDuration } from './waveform';

const SELECT = 'h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground';
const INPUT = 'h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground';
const LABEL = 'flex flex-col gap-1 text-[11px] font-medium text-muted-foreground';
const BUTTON = 'h-8 rounded-md px-3 text-xs font-medium disabled:opacity-50';

/**
 * The plain prompt form (Phase 113 Theme Q) — what an app with no composer of
 * its own (Creator) shows in the Audio detail pane. The same form state and
 * the same validation as Studio's Suno-style form; plain controls in place of
 * its ai-thread composer, voice and Ollama "Enhance".
 */
export function BasicPromptForm({
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
}: AudioPromptFormProps) {
  const installer = useAudioEngineInstall();
  const checked = toPrompt(state);
  const local = state.provider === 'musicgen';
  const modelState = engine?.musicgen.state;
  const generates = audioProviderInfo(state.provider).generates;
  const busy = importing || generating;
  const status = statuses.find((s) => s.id === state.provider);
  const maxDuration = local ? AUDIO_LOCAL_MAX_DURATION_S : AUDIO_DURATION_MAX_S;
  const createBlocked =
    'error' in checked
      ? checked.error
      : status && !status.available
        ? status.reason
        : local && modelState !== 'ready'
          ? 'The local model is not ready.'
          : undefined;

  return (
    <MediaPanelLayout
      as="form"
      aria-label="Create audio"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && !createBlocked) (generates ? onGenerate : onImport)();
      }}
    >
      <MediaPanelBody className="flex flex-col gap-3 p-3">
        <label className={LABEL}>
          Provider
          <select
            value={state.provider}
            onChange={(e) => dispatch({ type: 'provider', value: e.target.value as AudioProviderId })}
            className={SELECT}
          >
            {AUDIO_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Title
          <input aria-label="Title" value={state.title} onChange={(e) => dispatch({ type: 'title', value: e.target.value })} className={INPUT} />
        </label>
        <label className={LABEL}>
          Style tags (comma separated)
          <input
            aria-label="Style tags"
            value={state.tagDraft}
            onChange={(e) => dispatch({ type: 'tagDraft', value: e.target.value })}
            onBlur={() => dispatch({ type: 'addTag' })}
            placeholder={state.style.join(', ') || 'lofi, mellow'}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          Duration — {formatDuration(state.durationS)}
          <BrandSlider
            aria-label="Duration"
            min={AUDIO_DURATION_MIN_S}
            max={maxDuration}
            value={Math.min(state.durationS, maxDuration)}
            onValueChange={(next) => dispatch({ type: 'duration', value: next })}
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={state.instrumental}
            onChange={(e) => dispatch({ type: 'instrumental', value: e.target.checked })}
          />
          Instrumental
        </label>
        {local && modelState !== 'ready' ? (
          <div className="flex flex-col gap-1.5 rounded-md border border-border p-2 text-[11px] text-muted-foreground">
            <span>
              {engine?.musicgen.reason ??
                `The local model is a one-time ${Math.round(AUDIO_LOCAL_MODEL_BYTES / 1_000_000)} MB download.`}
            </span>
            {modelState === 'missing' ? (
              <button type="button" onClick={() => installer.install.mutate()} disabled={installer.install.isPending} className={`${BUTTON} border border-border hover:bg-accent`}>
                {installer.install.isPending ? 'Downloading…' : 'Download model'}
              </button>
            ) : null}
            {installer.error ? <span role="alert">{installer.error}</span> : null}
          </div>
        ) : null}
        {progress ? (
          <p role="status" className="text-[11px] text-muted-foreground">
            {progress.stage ?? 'Working'} — {progress.completed}/{progress.total}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
      </MediaPanelBody>
      <MediaPanelFooter className="flex flex-col gap-2 border-t border-border/50 p-3">
        {state.provider === 'import' ? null : (
          <PromptTextarea
            aria-label="Lyrics or caption"
            rows={4}
            value={state.lyrics}
            onChange={(e) => dispatch({ type: 'lyrics', value: e.target.value })}
            placeholder="Lyrics (optional)"
          />
        )}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy || createBlocked !== undefined}
            title={createBlocked}
            className={`${BUTTON} flex-1 bg-primary text-primary-foreground`}
          >
            {generates ? 'Create' : 'Import audio…'}
          </button>
          {generates ? (
            <button type="button" onClick={onImport} disabled={busy} className={`${BUTTON} border border-border hover:bg-accent`}>
              Import audio…
            </button>
          ) : null}
          {busy ? (
            <button type="button" onClick={onCancel} className={`${BUTTON} border border-border hover:bg-accent`}>
              Cancel
            </button>
          ) : null}
        </div>
      </MediaPanelFooter>
    </MediaPanelLayout>
  );
}
