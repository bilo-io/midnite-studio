import {
  IMAGE_ASPECTS,
  DEFAULT_IMAGE_PROVIDER,
  IMAGE_MAX_COUNT,
  IMAGE_PROVIDERS,
  imageModelsFor,
  type ImageAspect,
  type ImageProviderId,
  type ImageProviderStatus,
} from '@midnite/studio-shared';
import type { Dispatch } from 'react';
import { LuKeyRound, LuSquare } from 'react-icons/lu';
import { SiGooglegemini, SiOllama } from 'react-icons/si';

import type { IconComponent } from '../../../components/icon-button';
import { AntigravityIcon, CodexIcon } from '../../../components/icons';
import type { PickerProvider } from '../../../components/ai-thread';
import { useUiStore } from '../../../store/ui-store';
import { AiComposer, ProviderModelPicker, useComposerMic } from '../../../components/ai-thread';
import { MediaPanelBody, MediaPanelFooter, MediaPanelLayout } from '../media-panel-layout';
import { MEDIA_PROMPT_BOX } from '../prompt-input';
import { appendDictation, useSpeakOutcome, useVoiceThread } from '../voice/use-voice-thread';
import { SpeechToggle } from '../voice/voice-controls';
import { generateBlockedReason, type CreateAction, type CreateState } from './create-panel-state';

/** One glyph per provider — shown in the list and on the chosen value. */
export const IMAGE_PROVIDER_ICONS: Record<ImageProviderId, IconComponent> = {
  gemini: SiGooglegemini,
  openai: CodexIcon,
  agy: AntigravityIcon,
  ollama: SiOllama,
};

const IMAGE_PROVIDER_COLORS: Record<ImageProviderId, string> = {
  gemini: '#8E75B2',
  openai: '#10A37F',
  agy: '#4285F4',
  ollama: '#F5F5F5',
};

/**
 * Picker rows: every provider, disabled with its reason when it cannot run.
 * Ollama is hidden entirely when it reports no image-output models. Antigravity
 * is the recommended default (key-free, Gemini 2.5 Flash Image).
 */
export function imagePickerProviders(statuses: readonly ImageProviderStatus[]): PickerProvider[] {
  return IMAGE_PROVIDERS.filter((p) => {
    if (p.id !== 'ollama') return true;
    const status = statuses.find((s) => s.id === 'ollama');
    return (status?.models.length ?? 0) > 0;
  }).map((p) => {
    const status = statuses.find((s) => s.id === p.id);
    // A missing key is fixable from here ("Add key"), so it stays pickable.
    const blocked = p.disabledReason ?? (status && !status.available && !status.missingKey ? status.reason : undefined);
    return {
      id: p.id,
      label: p.label,
      icon: IMAGE_PROVIDER_ICONS[p.id],
      color: IMAGE_PROVIDER_COLORS[p.id],
      ...(p.id === DEFAULT_IMAGE_PROVIDER ? { recommended: true } : {}),
      ...(blocked ? { disabled: true, reason: blocked } : {}),
    };
  });
}

export function CreatePanel({
  state,
  dispatch,
  statuses,
  running,
  error,
  onGenerate,
  onCancel,
  onPick,
}: {
  state: CreateState;
  dispatch: Dispatch<CreateAction>;
  statuses: readonly ImageProviderStatus[];
  running: boolean;
  error: string | null;
  onGenerate: () => void;
  onCancel: () => void;
  /** Fired after the picker changes provider/model, e.g. to remember it as the default. */
  onPick?: (provider: ImageProviderId, model: string) => void;
}) {
  const voice = useVoiceThread();
  const mic = useComposerMic({ onTranscript: (text) => dispatch({ type: 'prompt', prompt: appendDictation(state.prompt, text) }) });
  useSpeakOutcome(voice, running, error, 'Your image is ready.');
  const status = statuses.find((s) => s.id === state.provider);
  const models = imageModelsFor(state.provider, status?.models);
  const blocked = generateBlockedReason(state, status, running);
  const openSettings = () => {
    const ui = useUiStore.getState();
    ui.setActiveView('settings');
    ui.setSettingsPage('media');
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
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            Aspect
            <select
              value={state.aspect}
              onChange={(event) => dispatch({ type: 'aspect', aspect: event.target.value as ImageAspect })}
              className="h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
            >
              {IMAGE_ASPECTS.map((aspect) => (
                <option key={aspect} value={aspect}>
                  {aspect}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-20 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            Count
            <select
              value={state.count}
              onChange={(event) => dispatch({ type: 'count', count: Number(event.target.value) })}
              className="h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
            >
              {Array.from({ length: IMAGE_MAX_COUNT }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {status?.missingKey ? (
          <p className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            <LuKeyRound aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{status.reason}</span>
            <button type="button" onClick={openSettings} className="font-medium text-primary underline decoration-dotted">
              Add key
            </button>
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
      </MediaPanelBody>

      {/*
        The prompt sits at the bottom of the whole panel, like every chat
        input, under the controls that shape it. Generate is its Send.
      */}
      <MediaPanelFooter className="flex flex-col gap-2 border-t border-border/50 p-3">
        <div className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
          Prompt
          <AiComposer
            ariaLabel="Prompt"
            value={state.prompt}
            onChange={(prompt) => dispatch({ type: 'prompt', prompt })}
            onSend={onGenerate}
            canSend={!blocked}
            enterToSend={false}
            sendTooltip={blocked ?? 'Generate (Cmd/Ctrl+Enter)'}
            sendAriaLabel="Generate"
            rows={5}
            placeholder="A lighthouse on a basalt cliff at blue hour, film grain"
            mic={mic}
            leading={
              <ProviderModelPicker
                testId="image-picker"
                providers={imagePickerProviders(statuses)}
                provider={state.provider}
                models={models.map((m) => ({ ...m, ...(m.id === models[0]?.id ? { recommended: true } : {}) }))}
                model={state.model}
                onProviderChange={(id) => {
                  const provider = id as ImageProviderId;
                  const discovered = statuses.find((s) => s.id === id)?.models ?? [];
                  dispatch({ type: 'provider', provider, discovered });
                  onPick?.(provider, imageModelsFor(provider, discovered)[0]?.id ?? '');
                }}
                onModelChange={(model) => {
                  dispatch({ type: 'model', model });
                  onPick?.(state.provider, model);
                }}
              />
            }
            trailing={<SpeechToggle voice={voice} />}
            boxClassName={MEDIA_PROMPT_BOX}
            testIdPrefix="image-prompt"
          />
        </div>
        {/* Generate is the prompt composer's own Send; only Cancel sits beside it. */}
        {running ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs text-foreground hover:bg-accent"
            >
              <LuSquare aria-hidden className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        ) : null}
      </MediaPanelFooter>
    </MediaPanelLayout>
  );
}
