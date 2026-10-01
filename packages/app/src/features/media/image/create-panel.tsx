import {
  IMAGE_ASPECTS,
  IMAGE_MAX_COUNT,
  IMAGE_PROVIDERS,
  imageModelsFor,
  type ImageAspect,
  type ImageProviderId,
  type ImageProviderStatus,
} from '@midnite/studio-shared';
import type { Dispatch } from 'react';
import { LuKeyRound, LuSparkles, LuSquare } from 'react-icons/lu';
import { SiGooglegemini, SiOllama } from 'react-icons/si';

import type { IconComponent } from '../../../components/icon-button';
import { AntigravityIcon, CodexIcon } from '../../../components/icons';
import { IconSelect, type IconSelectOption } from '../../../components/select/icon-select';
import { useUiStore } from '../../../store/ui-store';
import { PromptTextarea } from '../prompt-input';
import { generateBlockedReason, type CreateAction, type CreateState } from './create-panel-state';

/** One glyph per provider — shown in the list and on the chosen value. */
export const IMAGE_PROVIDER_ICONS: Record<ImageProviderId, IconComponent> = {
  gemini: SiGooglegemini,
  openai: CodexIcon,
  agy: AntigravityIcon,
  ollama: SiOllama,
};

/**
 * Picker rows: every provider, disabled with its reason when it cannot run.
 * Ollama is hidden entirely when it reports no image-output models.
 */
export function providerOptions(statuses: readonly ImageProviderStatus[]): IconSelectOption[] {
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
      ...(blocked ? { isDisabled: true, disabledReason: blocked } : {}),
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
}: {
  state: CreateState;
  dispatch: Dispatch<CreateAction>;
  statuses: readonly ImageProviderStatus[];
  running: boolean;
  error: string | null;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  const status = statuses.find((s) => s.id === state.provider);
  const models = imageModelsFor(state.provider, status?.models);
  const blocked = generateBlockedReason(state, status, running);
  const openSettings = () => {
    const ui = useUiStore.getState();
    ui.setActiveView('settings');
    ui.setSettingsPage('media');
  };

  return (
    <form
      aria-label="Create image"
      className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked) onGenerate();
      }}
    >
      <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
        Prompt
        <PromptTextarea
          value={state.prompt}
          onChange={(event) => dispatch({ type: 'prompt', prompt: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !blocked) {
              event.preventDefault();
              onGenerate();
            }
          }}
          rows={5}
          placeholder="A lighthouse on a basalt cliff at blue hour, film grain"
          className="resize-none"
        />
      </label>

      <div className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
        Provider
        <IconSelect
          ariaLabel="Image provider"
          options={providerOptions(statuses)}
          value={state.provider}
          isSearchable={false}
          menuInPortal
          onChange={(id) => id && dispatch({ type: 'provider', provider: id as ImageProviderId, discovered: statuses.find((s) => s.id === id)?.models ?? [] })}
        />
      </div>

      <div className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
        Model
        <IconSelect
          ariaLabel="Image model"
          options={models.map((m) => ({ id: m.id, label: m.label }))}
          value={state.model}
          isSearchable={false}
          menuInPortal
          onChange={(id) => dispatch({ type: 'model', model: id })}
        />
      </div>

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

      <div className="mt-auto flex items-center gap-2">
        {running ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-xs text-foreground hover:bg-accent"
          >
            <LuSquare aria-hidden className="h-3.5 w-3.5" />
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={blocked !== undefined}
          title={blocked}
          aria-busy={running || undefined}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-primary bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LuSparkles aria-hidden className="h-3.5 w-3.5" />
          {running ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </form>
  );
}
