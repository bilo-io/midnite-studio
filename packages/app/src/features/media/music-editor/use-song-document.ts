import { SongSchema, type MusicSongEntry, type Song } from '@midnite/studio-shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { bridge } from '../../../services/bridge';
import {
  canRedo, canUndo, commit as commitStep, commitExternal, redo as redoStep, reset, undo as undoStep,
  type History,
} from './model/history';
import { emptySong } from '@midnite/studio-shared';

/** How long an edit sits before it is written. A burst of edits is one write. */
export const SAVE_DEBOUNCE_MS = 600;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type DocStatus = 'loading' | 'empty' | 'ready' | 'error';

/**
 * The open song of an Audio project (Phase 101 Theme E): the project's songs from the music IPC,
 * the one being edited with its undo history, and a debounced save. Edits that did not come from
 * the user — an agent's `music_*` call (Theme H) — go through {@link applyExternal}, which lands
 * them as one undoable step.
 */
export function useSongDocument(repoId: string, project: string | null, requested: { name: string; seq: number } | null = null) {
  const [songs, setSongs] = useState<MusicSongEntry[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [status, setStatus] = useState<DocStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>('idle');

  const historyRef = useRef(history);
  historyRef.current = history;
  const dirtyRef = useRef(false);
  const timer = useRef<number | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  const music = () => bridge()?.media.music;

  const flush = useCallback(async () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const h = historyRef.current;
    const n = nameRef.current;
    const api = bridge()?.media.music;
    if (!dirtyRef.current || !h || !n || !project || !api) return;
    dirtyRef.current = false;
    setSave('saving');
    const res = await api.write({ repoId, project, name: n, song: { ...h.present, name: n } });
    if (res.ok) setSave(historyRef.current?.present === h.present ? 'saved' : 'dirty');
    else {
      dirtyRef.current = true;
      setSave('error');
    }
  }, [repoId, project]);

  const refreshList = useCallback(async (): Promise<MusicSongEntry[]> => {
    const api = bridge()?.media.music;
    if (!api || !project) return [];
    const res = await api.list({ repoId, project });
    const list = res.ok ? res.value : [];
    setSongs(list);
    return list;
  }, [repoId, project]);

  const open = useCallback(
    async (target: string) => {
      await flush();
      const api = bridge()?.media.music;
      if (!api || !project) return;
      setStatus('loading');
      const res = await api.read({ repoId, project, name: target });
      const parsed = res.ok ? SongSchema.safeParse(res.value) : null;
      if (!parsed?.success) {
        setError(res.ok ? 'This song file is not a valid song.' : failure(res));
        setStatus('error');
        return;
      }
      setError(null);
      setName(target);
      setHistory(reset(parsed.data));
      setSave('idle');
      setStatus('ready');
    },
    [flush, repoId, project],
  );

  // Load the project's songs and open the first.
  useEffect(() => {
    let cancelled = false;
    setName(null);
    setHistory(null);
    dirtyRef.current = false;
    if (!project || !music()) {
      setSongs([]);
      setStatus('empty');
      return;
    }
    setStatus('loading');
    void (async () => {
      const list = await refreshList();
      if (cancelled) return;
      const wanted = list.find((entry) => entry.name === requested?.name) ?? list[0];
      if (wanted) await open(wanted.name);
      else setStatus('empty');
    })();
    return () => {
      cancelled = true;
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId, project]);

  // Debounced autosave while the song is dirty.
  useEffect(() => {
    if (!dirtyRef.current) return;
    setSave('dirty');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [history?.present, flush]);

  const apply = useCallback((fn: (h: History) => History, persisted = false) => {
    setHistory((h) => {
      if (!h) return h;
      const next = fn(h);
      if (next.present !== h.present && !persisted) dirtyRef.current = true;
      return next;
    });
  }, []);

  // Theme H: an agent's `music_*` edit arrives whole, as one undoable step. An edit to a song that
  // is not open just refreshes the list; one that main already wrote to disk is not saved again.
  useEffect(() => {
    const api = bridge()?.media.music;
    if (!api?.onChanged || !project) return;
    return api.onChanged((event) => {
      if (event.repoId !== repoId || event.project !== project) return;
      if (event.name !== nameRef.current) {
        void refreshList();
        return;
      }
      apply((h) => commitExternal(h, event.song), event.saved);
    });
  }, [repoId, project, apply, refreshList]);

  // `music_open` (or the audio tab) asks for a particular song.
  const requestSeq = requested?.seq;
  useEffect(() => {
    if (!requested || !project) return;
    void (async () => {
      await refreshList();
      await open(requested.name);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestSeq]);

  const create = useCallback(
    async (wanted?: string) => {
      const api = bridge()?.media.music;
      if (!api || !project) return;
      await flush();
      const used = new Set(songs.map((s) => s.name));
      let n = songs.length + 1;
      let target = wanted ?? `Song ${n}`;
      while (used.has(target)) target = `Song ${++n}`;
      const res = await api.write({ repoId, project, name: target, song: emptySong(target) });
      if (!res.ok) {
        setError(failure(res));
        return;
      }
      await refreshList();
      await open(target);
    },
    [flush, open, project, refreshList, repoId, songs],
  );

  const importMidi = useCallback(async () => {
    const api = bridge()?.media.music;
    if (!api || !project) return;
    const res = await api.import({ repoId, project });
    if (!res.ok || res.value.length === 0) return;
    for (const item of res.value) await api.write({ repoId, project, name: item.name, song: item.song });
    await refreshList();
    await open(res.value[0]!.name);
  }, [open, project, refreshList, repoId]);

  const song: Song | null = history?.present ?? null;
  return {
    songs,
    name,
    song,
    status,
    error,
    save,
    canUndo: history ? canUndo(history) : false,
    canRedo: history ? canRedo(history) : false,
    open,
    create,
    importMidi,
    /** One user edit. Commits sharing `key` fold into one undo step. */
    commit: (next: Song, key: string | null = null) => apply((h) => commitStep(h, next, key)),
    /** One edit from outside the editor (an agent), always its own undo step. */
    applyExternal: (next: Song, persisted = false) => apply((h) => commitExternal(h, next), persisted),
    undo: () => apply(undoStep),
    redo: () => apply(redoStep),
    flush,
  };
}


const failure = (res: { ok: false; kind: string } & { message?: string }): string =>
  res.message ?? 'The song could not be read or written.';
