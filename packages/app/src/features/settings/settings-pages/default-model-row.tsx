import type { OllamaModel } from '@midnite/studio-shared';
import { useMemo } from 'react';
import { LuArrowRight, LuDownload } from 'react-icons/lu';

import { IconSelect, type IconSelectOption } from '../../../components/select/icon-select';
import { useUiStore } from '../../../store/ui-store';
import {
  useOllamaModels,
  useOllamaSettings,
  useOllamaStatus,
  useSetOllamaSettings,
} from '../../models/use-models';

/** Installed-model options for the default-model picker, plus a stale saved name when needed. */
export function buildDefaultModelOptions(
  models: OllamaModel[],
  saved: string | null,
): IconSelectOption[] {
  const options: IconSelectOption[] = models.map((m) => ({ id: m.name, label: m.name }));
  if (saved && !models.some((m) => m.name === saved)) {
    options.unshift({
      id: saved,
      label: `${saved} (not installed)`,
      isDisabled: true,
      disabledReason: 'Pull this model from the Models view',
    });
  }
  return options;
}

/**
 * Settings ▸ Ollama — default model for new agent bindings (Phase 96 Theme C),
 * limited to models already on disk via `ollama list`.
 */
export function DefaultModelRow() {
  const settings = useOllamaSettings();
  const setSettings = useSetOllamaSettings();
  const status = useOllamaStatus();
  const { data: models, isLoading } = useOllamaModels();

  const saved = settings.data?.defaultModel ?? null;
  const options = useMemo(
    () => buildDefaultModelOptions(models ?? [], saved),
    [models, saved],
  );
  const unreachable = status.data !== undefined && !status.data.reachable;
  const value = saved ?? '';

  const goToModels = () => useUiStore.getState().setActiveView('models');

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-foreground">Default model</p>
      <p className="text-[11px] text-muted-foreground">
        Pre-fills the model picker when a new agent binding is created (Phase 96 Theme H).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <IconSelect
            ariaLabel="Default Ollama model"
            options={options}
            value={value}
            isClearable
            isDisabled={unreachable || isLoading}
            placeholder={
              unreachable
                ? 'Ollama isn’t reachable'
                : options.length === 0
                  ? 'No models installed'
                  : 'Select a model…'
            }
            onChange={(id) => setSettings.mutate({ defaultModel: id.length > 0 ? id : null })}
          />
        </div>
        <button
          type="button"
          onClick={goToModels}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-accent/40 px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          <LuDownload aria-hidden className="h-3 w-3" />
          Download local models
          <LuArrowRight aria-hidden className="h-2.5 w-2.5" />
        </button>
      </div>
      {unreachable ? (
        <p className="text-[11px] text-muted-foreground">
          Start Ollama (Settings ▸ Health or the Models view) to list installed models.
        </p>
      ) : null}
      {!unreachable && !isLoading && (models ?? []).length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No models on this machine yet — use Download local models to open the Models view.
        </p>
      ) : null}
    </div>
  );
}
