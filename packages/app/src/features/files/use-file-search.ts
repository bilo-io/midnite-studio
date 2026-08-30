import { useEffect, useRef, useState } from 'react';

import type { FsSearchMode, GrepMatch } from '@midnite/studio-shared';

import { bridge, hasBridge } from '../../services/bridge';

export type FileSearchOptions = {
  mode: FsSearchMode;
  caseSensitive: boolean;
  wholeWord: boolean;
};

export const DEFAULT_FILE_SEARCH_OPTIONS: FileSearchOptions = {
  mode: 'fixed',
  caseSensitive: false,
  wholeWord: false,
};

type FileSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; matches: GrepMatch[]; truncated: boolean }
  | { status: 'error'; message: string };

const DEBOUNCE_MS = 300;

/**
 * `git grep` over a repo checkout, debounced and soft-cancellable.
 *
 * "Cancellable" means a generation counter, not a killed subprocess: main has
 * no per-search process registry (that is Phase 25's `stream-registry.ts`,
 * built for a different problem — concurrent *streams*). A superseded
 * request's own `invoke` still runs to completion; its answer is just
 * discarded here if a newer query has since started, so a slow response to
 * an old keystroke can never overwrite a fresh one that answered first.
 */
export function useFileSearch(
  repo: { repoId: string; worktreePath?: string } | null,
): {
  query: string;
  setQuery: (query: string) => void;
  options: FileSearchOptions;
  setOptions: (options: FileSearchOptions) => void;
  state: FileSearchState;
} {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<FileSearchOptions>(DEFAULT_FILE_SEARCH_OPTIONS);
  const [state, setState] = useState<FileSearchState>({ status: 'idle' });
  const generation = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!repo || !hasBridge() || trimmed.length === 0) {
      setState({ status: 'idle' });
      return;
    }

    const myGeneration = ++generation.current;
    setState({ status: 'loading' });

    const timer = setTimeout(() => {
      bridge()!
        .fs.search({
          repoId: repo.repoId,
          ...(repo.worktreePath ? { worktreePath: repo.worktreePath } : {}),
          query: trimmed,
          ...options,
        })
        .then((res) => {
          if (generation.current !== myGeneration) return; // superseded
          setState(
            res.ok
              ? { status: 'ok', matches: res.matches, truncated: res.truncated }
              : { status: 'error', message: res.message },
          );
        })
        .catch(() => {
          if (generation.current !== myGeneration) return;
          setState({ status: 'error', message: 'search failed' });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // Depend on `repo`'s and `options`' primitive fields, not the objects
    // themselves: `FilesView` passes a fresh `repo` literal every render, and
    // this hook's own `setState({status:'loading'})` above causes exactly
    // such a re-render — an object-identity dependency here would restart the
    // debounce on every tick and the request would never survive to fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo?.repoId, repo?.worktreePath, query, options.mode, options.caseSensitive, options.wholeWord]);

  return { query, setQuery, options, setOptions, state };
}
