import { IMAGE_ASPECTS, IMAGE_MAX_COUNT, IMAGE_PROVIDERS, imageModelsFor, type ImageAspect, type ImageProviderId } from '@midnite/studio-shared';

import { MediaPanelBody, MediaPanelFooter, MediaPanelLayout, PromptTextarea } from '@midnite/studio-frame';

import { generateBlockedReason } from './create-panel-state';
import type { ImageCreatePanelProps } from './host';

const SELECT = 'h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground';
const LABEL = 'flex flex-col gap-1 text-[11px] font-medium text-muted-foreground';

/**
 * The plain create form (Phase 113 Theme Q) — what an app with no composer
 * of its own (Creator) shows in the Images detail pane. Same form state and
 * the same "why can't I generate" rule as Studio's panel; plain controls in
 * place of its ai-thread composer, provider picker and voice.
 */
export function BasicCreatePanel({ state, dispatch, statuses, running, error, onGenerate, onCancel, onPick }: ImageCreatePanelProps) {
  const status = statuses.find((s) => s.id === state.provider);
  const models = imageModelsFor(state.provider, status?.models);
  const blocked = generateBlockedReason(state, status, running);
  const pickProvider = (provider: ImageProviderId) => {
    const discovered = statuses.find((s) => s.id === provider)?.models ?? [];
    dispatch({ type: 'provider', provider, discovered });
    onPick?.(provider, imageModelsFor(provider, discovered)[0]?.id ?? '');
  };

  return (
    <MediaPanelLayout
      as="form"
      aria-label="Create image"
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked) onGenerate();
      }}
    >
      <MediaPanelBody className="flex flex-col gap-3 p-3">
        <label className={LABEL}>
          Provider
          <select value={state.provider} onChange={(e) => pickProvider(e.target.value as ImageProviderId)} className={SELECT}>
            {IMAGE_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id} disabled={p.disabledReason !== undefined}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {models.length > 0 ? (
          <label className={LABEL}>
            Model
            <select
              value={state.model}
              onChange={(e) => {
                dispatch({ type: 'model', model: e.target.value });
                onPick?.(state.provider, e.target.value);
              }}
              className={SELECT}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex gap-2">
          <label className={`${LABEL} flex-1`}>
            Aspect
            <select value={state.aspect} onChange={(e) => dispatch({ type: 'aspect', aspect: e.target.value as ImageAspect })} className={SELECT}>
              {IMAGE_ASPECTS.map((aspect) => (
                <option key={aspect} value={aspect}>
                  {aspect}
                </option>
              ))}
            </select>
          </label>
          <label className={`${LABEL} w-20`}>
            Count
            <select value={state.count} onChange={(e) => dispatch({ type: 'count', count: Number(e.target.value) })} className={SELECT}>
              {Array.from({ length: IMAGE_MAX_COUNT }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {status && !status.available && status.reason ? (
          <p className="text-[11px] text-muted-foreground">{status.reason}</p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
      </MediaPanelBody>
      <MediaPanelFooter className="flex flex-col gap-2 border-t border-border/50 p-3">
        <PromptTextarea
          aria-label="Prompt"
          rows={5}
          value={state.prompt}
          onChange={(e) => dispatch({ type: 'prompt', prompt: e.target.value })}
          placeholder="A lighthouse on a basalt cliff at blue hour, film grain"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={blocked !== undefined}
            title={blocked}
            className="h-8 flex-1 rounded-md bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Generate
          </button>
          {running ? (
            <button type="button" onClick={onCancel} className="h-8 rounded-md border border-border px-3 text-xs hover:bg-accent">
              Cancel
            </button>
          ) : null}
        </div>
      </MediaPanelFooter>
    </MediaPanelLayout>
  );
}
