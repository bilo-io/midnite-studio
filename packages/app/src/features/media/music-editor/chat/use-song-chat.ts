import {
  MUSIC_CHAT_MAX_MESSAGES,
  MUSIC_PASSES_DEFAULT,
  SongChatSchema,
  type MusicEngine,
  type Song,
  type SongChat,
  type SongChatMessage,
} from '@midnite/studio-shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { bridge } from '../../../../services/bridge';
import { buildChangeSummary, replyText } from './change-summary';
import { reduceProgress, startRun, type RunProgress } from './run-progress';

/** Folds the message list to the persisted cap, newest kept. */
export const capMessages = (messages: SongChatMessage[]): SongChatMessage[] => messages.slice(-MUSIC_CHAT_MAX_MESSAGES);

let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`;

export type SendRequest = {
  text: string;
  engine: MusicEngine;
  /** The picker id and a human label, kept on the reply. */
  engineId: string;
  via: string;
};

/**
 * One song's chat (Phase 101 Theme I): the thread persisted beside the song, the run in flight with
 * its progress, and Send / Stop. A turn flushes the editor's pending edits first (main's run starts
 * from what is on disk), runs the agent, then diffs the song before and after to write the reply's
 * "what changed" summary. The agent's edits themselves reach the editor through `music.onChanged`,
 * one undo step each, exactly as Theme H wired.
 */
export function useSongChat(opts: {
  repoId: string;
  project: string | null;
  name: string | null;
  /** The editor's current song, read after the run settles. */
  getSong: () => Song | null;
  /** Writes the editor's unsaved edits so the agent starts from them. */
  flush: () => Promise<void>;
}) {
  const { repoId, project, name, getSong, flush } = opts;
  const [chat, setChat] = useState<SongChat>(() => SongChatSchema.parse({}));
  const [run, setRun] = useState<RunProgress | null>(null);
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const target = useRef({ repoId, project, name });
  target.current = { repoId, project, name };

  const persist = useCallback(
    (next: SongChat, at = target.current) => {
      const api = bridge()?.media.music?.chat;
      if (!api || !at.project || !at.name) return;
      void api.write({ repoId: at.repoId, project: at.project, name: at.name, chat: next });
    },
    [],
  );
  const update = useCallback(
    (fn: (c: SongChat) => SongChat) => {
      const next = fn(chatRef.current);
      chatRef.current = next;
      setChat(next);
      persist(next);
    },
    [persist],
  );

  // Load the thread when the song changes.
  useEffect(() => {
    let cancelled = false;
    setChat(SongChatSchema.parse({}));
    chatRef.current = SongChatSchema.parse({});
    const api = bridge()?.media.music?.chat;
    if (!api || !project || !name) return;
    void api.read({ repoId, project, name }).then((res) => {
      if (cancelled || !res.ok) return;
      chatRef.current = res.value;
      setChat(res.value);
    });
    return () => {
      cancelled = true;
    };
  }, [repoId, project, name]);

  useEffect(() => {
    const api = bridge()?.media.music?.agent;
    if (!api?.onProgress) return;
    return api.onProgress((event) => setRun((r) => reduceProgress(r, event)));
  }, []);

  const runIdRef = useRef<string | null>(null);

  const send = useCallback(
    async (req: SendRequest): Promise<void> => {
      const at = target.current;
      const api = bridge()?.media.music?.agent;
      const text = req.text.trim();
      if (!api || !at.project || !at.name || !text || runIdRef.current) return;
      const runId = nextId('run');
      runIdRef.current = runId;
      setRun(startRun(runId, MUSIC_PASSES_DEFAULT));
      update((c) => ({
        ...c,
        messages: capMessages([...c.messages, { id: nextId('u'), role: 'user', text, at: Date.now() }]),
      }));
      await flush();
      const before = getSong();
      const res = await api.run({ runId, repoId: at.repoId, project: at.project, name: at.name, prompt: text, engine: req.engine });
      // Let the last `onChanged` event land in the editor before reading the song back.
      await new Promise((r) => setTimeout(r, 0));
      const sameSong = target.current.name === at.name && target.current.project === at.project;
      const after = sameSong ? getSong() : null;
      const summary = before && after ? buildChangeSummary(before, after) : { changes: [], extras: [] };

      const cancelled = !res.ok && res.kind === 'error' && res.message === 'cancelled';
      const base = { id: nextId('a'), role: 'assistant' as const, at: Date.now(), engine: req.engineId };
      let reply: SongChatMessage;
      if (res.ok) {
        const passes = res.value.mode === 'iterative' ? `refined over ${res.value.passes} pass${res.value.passes === 1 ? '' : 'es'}` : 'wrote in one pass';
        reply = {
          ...base,
          state: 'done',
          text: replyText(res.value.mode === 'iterative' ? res.value.summary : '', summary),
          via: `${req.via} · ${passes}`,
          ...(summary.changes.length ? { changes: summary.changes } : {}),
          ...(summary.extras.length ? { extras: summary.extras } : {}),
        };
      } else if (cancelled) {
        reply = {
          ...base,
          state: 'cancelled',
          text: summary.changes.length || summary.extras.length ? replyText('Stopped before the end.', summary) : 'Stopped.',
          ...(summary.changes.length ? { changes: summary.changes } : {}),
          ...(summary.extras.length ? { extras: summary.extras } : {}),
        };
      } else {
        reply = { ...base, state: 'failed', text: res.kind === 'error' ? res.message : 'The agent could not finish.' };
      }
      if (sameSong) update((c) => ({ ...c, messages: capMessages([...c.messages, reply]) }));
      else {
        // The user moved to another song mid-run: file the reply on the song it belongs to.
        const chatApi = bridge()?.media.music?.chat;
        const stored = at.project && at.name && chatApi ? await chatApi.read({ repoId: at.repoId, project: at.project, name: at.name }) : null;
        if (stored?.ok && chatApi && at.project && at.name) {
          void chatApi.write({ repoId: at.repoId, project: at.project, name: at.name, chat: { ...stored.value, messages: capMessages([...stored.value.messages, reply]) } });
        }
      }
      runIdRef.current = null;
      setRun(null);
    },
    [flush, getSong, update],
  );

  const stop = useCallback(() => {
    const id = runIdRef.current;
    if (id) void bridge()?.media.music?.agent.cancel({ runId: id });
  }, []);

  const setSettings = useCallback((patch: { engine?: string | null; model?: string | null }) => update((c) => ({ ...c, ...patch })), [update]);
  const clear = useCallback(() => update((c) => ({ ...c, messages: [] })), [update]);

  return { chat, run, running: run !== null, send, stop, setSettings, clear };
}
