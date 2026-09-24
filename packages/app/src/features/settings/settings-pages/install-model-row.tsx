import type { OllamaSearchResultItem } from '@midnite/studio-shared';
import { toOllamaCloudModelName } from '@midnite/studio-shared';
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { LuArrowRight, LuDownload, LuSearch } from 'react-icons/lu';

import { Spinner } from '../../../components/skeleton';
import { useUiStore } from '../../../store/ui-store';
import { useModelsPullQueueStore } from '../../models/models-pull-queue-store';
import {
  useOllamaModels,
  useOllamaSearch,
  useOllamaStatus,
  usePullModel,
  useRefetchModelsOnPullDone,
} from '../../models/use-models';

/** Same debounce the Models view's Discover tab uses for the same search. */
const SEARCH_DEBOUNCE_MS = 300;

export type InstallOption = {
  /** The exact name handed to `ollama pull` — `name:variant`, or `name`. */
  model: string;
  description?: string;
  capabilities?: string[];
  installed: boolean;
  /** The "Pull "<typed>"" fallback, for a name the search did not return. */
  freeText?: boolean;
};

/** Whether `model` is installed — a bare `name` also matches Ollama's own `name:latest`. */
function isInstalled(model: string, installed: Set<string>): boolean {
  return installed.has(model) || (!model.includes(':') && installed.has(`${model}:latest`));
}

/**
 * One option per pullable tag: every `name:variant` a result lists, or the
 * plain `name` when it lists none, plus a trailing free-text option whenever
 * the typed text is not already one of them — so an exact name the scraper
 * never surfaces (a private namespace, a brand-new tag) still pulls.
 */
export function buildInstallOptions(
  items: OllamaSearchResultItem[],
  typed: string,
  installed: Set<string>,
): InstallOption[] {
  const seen = new Set<string>();
  const options: InstallOption[] = [];
  for (const item of items) {
    const tags = item.variants && item.variants.length > 0 ? item.variants.map((v) => `${item.name}:${v}`) : [item.name];
    for (const tag of tags) {
      const model = item.cloud ? toOllamaCloudModelName(tag) : tag;
      if (seen.has(model)) continue;
      seen.add(model);
      options.push({
        model,
        description: item.description,
        capabilities: item.capabilities,
        installed: isInstalled(model, installed),
      });
    }
  }
  const trimmed = typed.trim();
  if (trimmed.length > 0 && !seen.has(trimmed)) {
    options.push({ model: trimmed, installed: isInstalled(trimmed, installed), freeText: true });
  }
  return options;
}

type PullStatus = { model: string; error: string | null };

/**
 * Settings ▸ Ollama's install field — a combobox over the same ollama.com
 * search the Models view's Discover tab runs, pulling through the same
 * `usePullModel` + pull-queue store path, so a pull started here shows up in
 * the Models view's queue panel exactly as one started there does.
 */
export function InstallModelRow() {
  const status = useOllamaStatus();
  const installedModels = useOllamaModels();
  const pull = usePullModel();
  const queued = useModelsPullQueueStore((s) => s.queued);
  // The Models view owns this subscription while it is mounted; mounting it
  // here too keeps the pull queue fed while only Settings is on screen.
  useRefetchModelsOnPullDone();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pullStatus, setPullStatus] = useState<PullStatus | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const search = useOllamaSearch(debounced, 'local');
  const installed = useMemo(
    () => new Set((installedModels.data ?? []).map((m) => m.model)),
    [installedModels.data],
  );
  // Options track the typed text for the free-text row, but the search
  // results only once the debounce settles.
  const options = useMemo(
    () => buildInstallOptions(debounced.trim() === query.trim() ? search.data?.items ?? [] : [], query, installed),
    [search.data, debounced, query, installed],
  );

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const unreachable = status.data !== undefined && !status.data.reachable;
  const searching = query.trim().length > 0 && (query !== debounced || search.isFetching);
  const expanded = open && query.trim().length > 0 && !unreachable;

  // Keep the highlight on a selectable row as the option list changes under it.
  useEffect(() => {
    const first = options.findIndex((o) => !o.installed);
    setActive(first === -1 ? 0 : first);
  }, [options]);

  const select = (option: InstallOption) => {
    if (option.installed) return;
    const model = option.model;
    setPullStatus({ model, error: null });
    pull.mutate(model, {
      onSuccess: (result) => {
        if (result.ok) queued(result.value.pullId, result.value.model);
        else setPullStatus({ model, error: result.kind === 'error' ? result.message : 'The pull could not start.' });
      },
      onError: (error) => setPullStatus({ model, error: error instanceof Error ? error.message : String(error) }),
    });
    setQuery('');
    setDebounced('');
    setOpen(false);
  };

  const move = (delta: 1 | -1) => {
    if (options.length === 0) return;
    let next = active;
    for (let step = 0; step < options.length; step += 1) {
      next = (next + delta + options.length) % options.length;
      if (!options[next]?.installed) break;
    }
    setActive(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      const option = options[active];
      if (expanded && option) {
        event.preventDefault();
        select(option);
      }
    } else if (event.key === 'Escape') {
      if (expanded) event.preventDefault();
      setOpen(false);
    }
  };

  const activeOption = expanded ? options[active] : undefined;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-foreground">Install a model</p>
      <p className="text-[11px] text-muted-foreground">
        Search ollama.com and pull a model onto this machine, or type an exact name.
      </p>
      <div className="relative">
        <LuSearch
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          role="combobox"
          aria-label="Install a model"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-activedescendant={activeOption ? optionId(active) : undefined}
          value={query}
          disabled={unreachable}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={unreachable ? 'Ollama isn’t reachable' : 'qwen3, llama3.2, nomic-embed-text…'}
          className="h-7 w-full rounded-md border border-border bg-card pl-7 pr-7 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
        />
        {searching ? (
          <Spinner label="Searching ollama.com" className="absolute right-2 top-1/2 -translate-y-1/2" />
        ) : null}
        {expanded ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Models"
            className="hide-scrollbar absolute left-0 top-full z-menu mt-1 max-h-64 w-full animate-fade-in overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
          >
            {search.data?.parseFailed && debounced === query ? (
              <li className="px-2 py-1 text-[11px] text-muted-foreground">
                Couldn’t read ollama.com’s results — an exact name still pulls.
              </li>
            ) : null}
            {options.map((option, index) => (
              <li
                key={`${option.freeText ? 'free' : 'result'}:${option.model}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                aria-disabled={option.installed || undefined}
                // Keep focus in the input so its blur does not close the list
                // before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => !option.installed && setActive(index)}
                onClick={() => select(option)}
                className={`flex items-start gap-2 px-2 py-1 text-xs ${
                  option.installed
                    ? 'cursor-default opacity-50'
                    : `cursor-pointer ${index === active ? 'bg-accent' : 'hover:bg-accent'}`
                }`}
              >
                <LuDownload aria-hidden className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono">
                    {option.freeText ? `Pull “${option.model}”` : option.model}
                  </span>
                  {option.description || (option.capabilities?.length ?? 0) > 0 ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[option.capabilities?.join(' · '), option.description].filter(Boolean).join(' — ')}
                    </span>
                  ) : null}
                </span>
                {option.installed ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">Installed</span>
                ) : null}
              </li>
            ))}
            {options.length === 0 ? (
              <li className="px-2 py-1 text-[11px] text-muted-foreground">No models found.</li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {unreachable ? (
        <p className="text-[11px] text-muted-foreground">
          Start Ollama (Settings ▸ Health or the Models view) to pull models.
        </p>
      ) : null}
      {pullStatus ? (
        <p role="status" className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {pullStatus.error ? (
            <span className="text-destructive">
              Couldn’t pull <code className="font-mono">{pullStatus.model}</code>: {pullStatus.error}
            </span>
          ) : (
            <>
              <span>
                Pulling <code className="font-mono">{pullStatus.model}</code>… —
              </span>
              <button
                type="button"
                onClick={() => useUiStore.getState().setActiveView('models')}
                className="inline-flex items-center gap-0.5 underline decoration-dotted hover:text-foreground"
              >
                View in Models <LuArrowRight aria-hidden className="h-2.5 w-2.5" />
              </button>
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
