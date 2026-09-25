import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { LuDownload, LuSearch } from 'react-icons/lu';

import { Spinner } from '../../components/skeleton';
import { useModelsPullQueueStore } from './models-pull-queue-store';
import { buildPullModelOptions, findPullOption, type PullModelOption } from './model-pull-options';
import {
  useOllamaModels,
  useOllamaSearch,
  usePullModel,
  useVerifyPullTarget,
} from './use-models';

/** Same debounce as Discover and the finance panel search field. */
const SEARCH_DEBOUNCE_MS = 300;

type FieldError = { message: string };

/**
 * Installed-tab pull field (Phase 96 Theme C) — autocomplete over ollama.com
 * search with one row per parameter variant. A pull starts only after
 * {@link useVerifyPullTarget} confirms the tag via `ollama show`.
 */
export function PullModelField() {
  const installedModels = useOllamaModels();
  const pull = usePullModel();
  const verify = useVerifyPullTarget();
  const queued = useModelsPullQueueStore((s) => s.queued);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<FieldError | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const search = useOllamaSearch(debounced, 'local');
  const installed = useMemo(
    () => new Set((installedModels.data ?? []).map((m) => m.model)),
    [installedModels.data],
  );

  const searchReady = debounced.trim() === query.trim();
  const options = useMemo(
    () => buildPullModelOptions(searchReady ? (search.data?.items ?? []) : [], installed),
    [search.data, searchReady, installed],
  );

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const searching = query.trim().length > 0 && (query !== debounced || search.isFetching);
  const expanded = open && query.trim().length > 0;
  const busy = pull.isPending || verify.isPending || confirming !== null;

  useEffect(() => {
    const first = options.findIndex((o) => !o.installed);
    setActive(first === -1 ? 0 : first);
  }, [options]);

  const startPull = (model: string) => {
    setError(null);
    setConfirming(model);
    verify.mutate(model, {
      onSuccess: (result) => {
        if (!result.ok) {
          setConfirming(null);
          setError({
            message:
              result.kind === 'error'
                ? result.message
                : `"${model}" is not in the Ollama library — pick a variant from the list.`,
          });
          return;
        }
        pull.mutate(model, {
          onSuccess: (pullResult) => {
            setConfirming(null);
            if (pullResult.ok) {
              queued(pullResult.value.pullId, pullResult.value.model);
              setQuery('');
              setDebounced('');
              setOpen(false);
            } else {
              setError({
                message:
                  pullResult.kind === 'error'
                    ? pullResult.message
                    : 'The pull could not start.',
              });
            }
          },
          onError: (err) => {
            setConfirming(null);
            setError({ message: err instanceof Error ? err.message : String(err) });
          },
        });
      },
      onError: (err) => {
        setConfirming(null);
        setError({ message: err instanceof Error ? err.message : String(err) });
      },
    });
  };

  const select = (option: PullModelOption) => {
    if (option.installed) return;
    startPull(option.model);
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

  const submitCurrent = () => {
    const match = findPullOption(options, query);
    if (!match) {
      setError({
        message: 'Choose a model variant from the suggestions — unlisted names are not pulled.',
      });
      return;
    }
    if (match.installed) {
      setError({ message: `"${match.model}" is already installed.` });
      return;
    }
    select(match);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitCurrent();
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
      if (expanded && options[active] && !options[active].installed) {
        event.preventDefault();
        select(options[active]);
      }
    } else if (event.key === 'Escape') {
      if (expanded) event.preventDefault();
      setOpen(false);
    }
  };

  const activeOption = expanded ? options[active] : undefined;
  const canSubmit =
    query.trim().length > 0 &&
    !busy &&
    findPullOption(options, query) !== undefined &&
    !findPullOption(options, query)?.installed;

  return (
    <form className="flex flex-col gap-1" onSubmit={onSubmit}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <LuSearch
            aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            role="combobox"
            aria-label="Pull a model"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listboxId}
            aria-activedescendant={activeOption ? optionId(active) : undefined}
            aria-invalid={error ? true : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setError(null);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            placeholder="Search to pull — qwen3.5, llama3.2, nomic-embed-text…"
            disabled={busy}
            className="h-7 w-full rounded-md border border-border bg-card pl-7 pr-7 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
          />
          {searching || confirming ? (
            <Spinner
              label={confirming ? `Confirming ${confirming}` : 'Searching ollama.com'}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            />
          ) : null}
          {expanded ? (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Model variants"
              className="hide-scrollbar absolute left-0 top-full z-menu mt-1 max-h-64 w-full animate-fade-in overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
            >
              {search.data?.parseFailed && searchReady ? (
                <li className="px-2 py-1 text-[11px] text-muted-foreground">
                  Couldn&apos;t read ollama.com&apos;s results — try again or use the Discover tab.
                </li>
              ) : null}
              {options.map((option, index) => (
                <li
                  key={option.model}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  aria-disabled={option.installed || undefined}
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
                    <span className="block truncate font-mono">{option.model}</span>
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
              {searchReady && !search.isFetching && options.length === 0 && !search.data?.parseFailed ? (
                <li className="px-2 py-1 text-[11px] text-muted-foreground">No matching models on ollama.com.</li>
              ) : null}
            </ul>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {busy ? <Spinner className="h-3 w-3" /> : <LuDownload className="h-3 w-3" />}
          Pull
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error.message}
        </p>
      ) : null}
    </form>
  );
}
