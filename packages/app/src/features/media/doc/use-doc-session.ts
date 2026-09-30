import { useCallback, useEffect, useReducer, useRef } from 'react';

import { useMediaFileText, useMediaMutations } from '../use-media';
import { docSessionReducer, INITIAL_DOC_SESSION, isDirty } from './doc-session';

/** Debounce between the last keystroke and the write. */
export const DOC_AUTOSAVE_MS = 800;

export type DocRef = { repoId: string; project: string; path: string };

/**
 * The open doc (Phase 99 Theme B): reads it through the media store, feeds
 * disk changes (`mediaChanged` → refetch) into `docSessionReducer`, and
 * autosaves the draft through `file-write`, debounced. Switching docs flushes
 * a pending save first.
 */
export function useDocSession(doc: DocRef | null) {
  const key = doc ? `${doc.project}/${doc.path}` : null;
  const [state, dispatch] = useReducer(docSessionReducer, INITIAL_DOC_SESSION);
  const file = useMediaFileText(doc?.repoId ?? null, 'doc', doc?.project ?? null, doc?.path ?? null);
  const { writeFile } = useMediaMutations(doc?.repoId ?? null, 'doc');
  const write = useRef(writeFile.mutateAsync);
  write.current = writeFile.mutateAsync;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ doc: DocRef; text: string } | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const job = pending.current;
    pending.current = null;
    if (!job) return;
    void write.current({ project: job.doc.project, path: job.doc.path, content: job.text }).then((result) => {
      if (result.ok) dispatch({ type: 'saved', text: job.text });
    });
  }, []);

  // A doc switch (or unmount) flushes what the previous doc still owes.
  useEffect(() => {
    dispatch({ type: 'open', key });
    return flush;
  }, [key, flush]);

  useEffect(() => {
    if (state.key === key && typeof file.data === 'string') dispatch({ type: 'disk', text: file.data });
  }, [file.data, key, state.key]);

  const schedule = useCallback(
    (text: string, immediate = false) => {
      if (!doc) return;
      pending.current = { doc, text };
      if (timer.current) clearTimeout(timer.current);
      if (immediate) flush();
      else timer.current = setTimeout(flush, DOC_AUTOSAVE_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `doc` is identified by `key`.
    [key, flush],
  );

  const edit = useCallback(
    (text: string) => {
      dispatch({ type: 'edit', text });
      schedule(text);
    },
    [schedule],
  );

  const replace = useCallback(
    (text: string) => {
      dispatch({ type: 'replace', text });
      schedule(text, true);
    },
    [schedule],
  );

  const reload = useCallback(() => {
    if (typeof file.data !== 'string') return;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    dispatch({ type: 'reload', text: file.data });
  }, [file.data]);

  const keepMine = useCallback(() => {
    if (typeof file.data !== 'string' || state.draft === null) return;
    dispatch({ type: 'keepMine', text: file.data });
    schedule(state.draft, true);
  }, [file.data, state.draft, schedule]);

  return {
    ready: state.key === key && state.draft !== null,
    draft: state.draft ?? '',
    nonce: state.nonce,
    dirty: isDirty(state),
    conflict: state.conflict,
    error: file.isError ? String(file.error) : null,
    edit,
    replace,
    reload,
    keepMine,
  };
}

export type DocSession = ReturnType<typeof useDocSession>;
