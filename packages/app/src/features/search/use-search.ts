import { useEffect, useRef } from 'react';

import type { Commit, GrepHit } from '@midnite/studio-shared';

import { useSearchStore } from './search-store';

export function useSearch(repoId: string | null, worktreePath?: string | null) {
  const mode = useSearchStore((s) => s.mode);
  const commitsOptions = useSearchStore((s) => s.commitsOptions);
  const contentOptions = useSearchStore((s) => s.contentOptions);
  const filesOptions = useSearchStore((s) => s.filesOptions);

  const startSearch = useSearchStore((s) => s.startSearch);
  const appendCommits = useSearchStore((s) => s.appendCommits);
  const appendContentHits = useSearchStore((s) => s.appendContentHits);
  const setFilesResults = useSearchStore((s) => s.setFilesResults);
  const finishSearch = useSearchStore((s) => s.finishSearch);
  const resetResults = useSearchStore((s) => s.resetResults);

  const reqCountRef = useRef(0);

  // Subscribe to search events across the bridge
  useEffect(() => {
    const bridge = window.midniteGit;
    if (!bridge) return;

    const unsubs = [
      bridge.search.onBatch((event) => {
        if (event.mode === 'commits') {
          appendCommits(event.requestId, event.commits as Commit[]);
        } else if (event.mode === 'content') {
          appendContentHits(event.requestId, event.hits as GrepHit[]);
        }
      }),
      bridge.search.onDone((event) => {
        finishSearch(event.requestId, event.total, event.truncated, event.error);
      }),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [appendCommits, appendContentHits, finishSearch]);

  // Execute search whenever options change, debounced strictly at 250ms
  useEffect(() => {
    if (!repoId) {
      resetResults();
      return;
    }

    const bridge = window.midniteGit;
    if (!bridge) return;

    const timer = setTimeout(async () => {
      reqCountRef.current += 1;
      const requestId = `search-${Date.now()}-${reqCountRef.current}`;

      if (mode === 'commits') {
        const hasQuery =
          commitsOptions.grep.trim() ||
          commitsOptions.author.trim() ||
          commitsOptions.since.trim() ||
          commitsOptions.until.trim() ||
          commitsOptions.paths.trim() ||
          commitsOptions.pickaxeString.trim();

        if (!hasQuery) {
          resetResults();
          return;
        }

        startSearch(requestId, 'commits');
        const res = await bridge.search.start({
          repoId,
          mode: 'commits',
          requestId,
          query: {
            grep: commitsOptions.grep.trim() ? [commitsOptions.grep.trim()] : undefined,
            author: commitsOptions.author.trim() ? [commitsOptions.author.trim()] : undefined,
            since: commitsOptions.since.trim() || undefined,
            until: commitsOptions.until.trim() || undefined,
            paths: commitsOptions.paths.trim()
              ? commitsOptions.paths.split(',').map((p) => p.trim()).filter(Boolean)
              : undefined,
            pickaxeString: commitsOptions.pickaxeString.trim() || undefined,
            regexp: commitsOptions.regexp,
            ignoreCase: commitsOptions.ignoreCase,
          },
        });

        if (!res.ok) {
          const errMsg = res.kind === 'error' ? res.message : 'Operation conflict';
          finishSearch(requestId, 0, false, errMsg);
        }
      } else if (mode === 'content') {
        const pattern = contentOptions.pattern.trim();
        if (!pattern) {
          resetResults();
          return;
        }

        startSearch(requestId, 'content');
        const res = await bridge.search.start({
          repoId,
          mode: 'content',
          requestId,
          query: {
            pattern,
            rev: contentOptions.rev.trim() || undefined,
            paths: contentOptions.paths.trim()
              ? contentOptions.paths.split(',').map((p) => p.trim()).filter(Boolean)
              : undefined,
            regexp: contentOptions.regexp,
            ignoreCase: contentOptions.ignoreCase,
            wordMatch: contentOptions.wordMatch,
            contextLines: contentOptions.contextLines,
          },
        });

        if (!res.ok) {
          const errMsg = res.kind === 'error' ? res.message : 'Operation conflict';
          finishSearch(requestId, 0, false, errMsg);
        }
      } else if (mode === 'files') {
        const query = filesOptions.query.trim().toLowerCase();
        if (!query) {
          resetResults();
          return;
        }

        startSearch(requestId, 'files');
        const res = await bridge.fs.listFiles({
          repoId,
          ...(worktreePath ? { worktreePath } : {}),
        });

        if (res.ok) {
          const filtered = res.files.filter((f) => f.toLowerCase().includes(query));
          setFilesResults(requestId, filtered);
          finishSearch(requestId, filtered.length, res.truncated);
        } else {
          finishSearch(requestId, 0, false, res.message);
        }

      }
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [
    repoId,
    worktreePath,
    mode,
    commitsOptions,
    contentOptions,
    filesOptions,
    startSearch,
    finishSearch,
    setFilesResults,
    resetResults,
  ]);
}
