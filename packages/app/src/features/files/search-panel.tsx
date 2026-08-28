import { Fragment, useMemo } from 'react';

import { LuSearch, LuX } from 'react-icons/lu';

import type { GrepMatch } from '@midnite/git-shared';

import { EmptyState } from '../../components/empty-state';
import { FileIcon } from './file-icons';
import type { FileSearchOptions, useFileSearch } from './use-file-search';

type FileSearchState = ReturnType<typeof useFileSearch>['state'];

/**
 * The always-visible query row: an input plus the three `git grep` toggles.
 * Split from the results list below it because it has to stay mounted with
 * an empty query — that's how a search *starts* — while the tree/results
 * swap underneath it (`FilesView` owns that swap).
 */
export function SearchBar({
  query,
  setQuery,
  options,
  setOptions,
}: {
  query: string;
  setQuery: (query: string) => void;
  options: FileSearchOptions;
  setOptions: (options: FileSearchOptions) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-border p-2">
      <div className="flex items-center gap-1.5">
        <LuSearch aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find in files…"
          aria-label="Find in files"
          className="h-6 min-w-0 flex-1 rounded border border-transparent bg-transparent text-xs outline-none placeholder:text-muted-foreground focus:border-border"
        />
        {query.length > 0 ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LuX aria-hidden className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <SearchToggle
          label="Match case"
          glyph="Aa"
          pressed={options.caseSensitive}
          onToggle={() => setOptions({ ...options, caseSensitive: !options.caseSensitive })}
        />
        <SearchToggle
          label="Match whole word"
          glyph="ab"
          pressed={options.wholeWord}
          onToggle={() => setOptions({ ...options, wholeWord: !options.wholeWord })}
        />
        <SearchToggle
          label="Use regular expression"
          glyph=".*"
          pressed={options.mode === 'regex'}
          onToggle={() =>
            setOptions({ ...options, mode: options.mode === 'regex' ? 'fixed' : 'regex' })
          }
        />
      </div>
    </div>
  );
}

/** The tree's replacement while a query is active — grouped, click-to-open-at-line. */
export function SearchResults({
  state,
  query,
  options,
  onOpenResult,
}: {
  state: FileSearchState;
  query: string;
  options: FileSearchOptions;
  onOpenResult: (relPath: string, line: number) => void;
}) {
  const grouped = useMemo(
    () => (state.status === 'ok' ? groupByPath(state.matches) : []),
    [state],
  );

  if (state.status === 'loading') {
    return <p className="p-3 text-xs text-muted-foreground">Searching…</p>;
  }
  if (state.status === 'error') {
    return <EmptyState icon={LuSearch} title="Search failed" body={state.message} bodySize="xs" />;
  }
  if (grouped.length === 0) {
    return (
      <EmptyState
        icon={LuSearch}
        title="No tracked file matches"
        body="git grep searches tracked content only — an untracked file never matches."
        bodySize="xs"
      />
    );
  }

  const total = grouped.reduce((n, [, matches]) => n + matches.length, 0);

  return (
    <div className="flex flex-col py-1">
      {grouped.map(([path, matches]) => (
        <Fragment key={path}>
          <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium">
            <FileIcon name={path.slice(path.lastIndexOf('/') + 1)} />
            <span className="truncate" title={path}>
              {path}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{matches.length}</span>
          </div>
          {matches.map((match) => (
            <button
              key={`${path}:${match.line}`}
              type="button"
              onClick={() => onOpenResult(path, match.line)}
              className="flex items-baseline gap-2 px-2 py-0.5 pl-7 text-left text-xs hover:bg-accent"
            >
              <span className="shrink-0 tabular-nums text-muted-foreground">{match.line}</span>
              <span className="truncate font-mono text-[11px]">
                {highlightedText(match.text, query, options)}
              </span>
            </button>
          ))}
        </Fragment>
      ))}
      {state.status === 'ok' && state.truncated ? (
        <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
          Showing the first {total} matches — narrow the query to see more.
        </p>
      ) : null}
    </div>
  );
}

function SearchToggle({
  label,
  glyph,
  pressed,
  onToggle,
}: {
  label: string;
  glyph: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onToggle}
      className={`flex h-5 min-w-5 items-center justify-center rounded border px-1 font-mono text-[10px] transition-colors ${
        pressed
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {glyph}
    </button>
  );
}

function groupByPath(matches: GrepMatch[]): [string, GrepMatch[]][] {
  const byPath = new Map<string, GrepMatch[]>();
  for (const match of matches) {
    const existing = byPath.get(match.path);
    if (existing) existing.push(match);
    else byPath.set(match.path, [match]);
  }
  return [...byPath.entries()];
}

/**
 * A client-side re-highlight of the query inside its own result line. Cheap
 * and approximate on purpose: it re-derives a case/whole-word-aware substring
 * match rather than threading match offsets back from `git grep`, and skips
 * entirely in `regex` mode, where "the query" is not literal text to find.
 */
function highlightedText(text: string, query: string, options: FileSearchOptions) {
  if (options.mode === 'regex' || query.length === 0) return text;
  const haystack = options.caseSensitive ? text : text.toLowerCase();
  const needle = options.caseSensitive ? query : query.toLowerCase();
  const index = haystack.indexOf(needle);
  if (index < 0) return text;
  if (options.wholeWord) {
    const before = haystack[index - 1];
    const after = haystack[index + needle.length];
    const isWordChar = (char: string | undefined) => char !== undefined && /\w/.test(char);
    if (isWordChar(before) || isWordChar(after)) return text;
  }
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-primary/25 text-inherit">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}
