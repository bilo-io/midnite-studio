import type { ChatMessage, Song, SongChatChange, SongChatMessage } from '@midnite/studio-shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuMousePointerClick, LuTrash2 } from 'react-icons/lu';

import { AiComposer, ProviderModelPicker, type PickerProvider } from '../../../../components/ai-thread';
import { IconButton } from '../../../../components/icon-button';
import { bridge } from '../../../../services/bridge';
import { AssistantMessage, UserMessage } from '../../../chats/chat-message';
import { pickEngine, pickerModel, useChatEngines, wireModel } from '../../../chats/use-chat-engines';
import { MEDIA_PROMPT_BOX } from '../../prompt-input';
import { barRange } from './change-summary';
import { engineMode, modeHint, toMusicEngine } from './engine-mode';
import { progressLabel } from './run-progress';
import { useSongChat } from './use-song-chat';

const noop = (): void => undefined;

/** A stored message in the shape the Chats page's message components take. */
function asChatMessage(m: SongChatMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    createdAt: m.at,
    status: m.state === 'failed' ? 'error' : m.state === 'cancelled' ? 'cancelled' : 'done',
    ...(m.state === 'failed' ? { error: m.text } : {}),
    ...(m.engine ? { engine: m.engine } : {}),
  } as ChatMessage;
}

/**
 * The agent chat beside the Editor (Phase 101 Theme I). Each song has its own thread, saved next to
 * it. The composer, the message components and the markdown renderer are the Chats page's
 * (`AiComposer`, `UserMessage`/`AssistantMessage`, `MarkdownBody`); only the controls differ: the
 * engine and model pickers say whether the engine refines over passes or writes in one, a progress
 * line shows "Pass n of N" with the latest tool action, and Stop sits directly left of Send. A reply
 * lists the tracks and bars it touched, with a link that selects those notes in the piano roll.
 */
export function SongChatPanel({
  repoId,
  project,
  name,
  getSong,
  flush,
  onShowChange,
}: {
  repoId: string;
  project: string | null;
  name: string | null;
  getSong: () => Song | null;
  flush: () => Promise<void>;
  onShowChange: (change: SongChatChange) => void;
}) {
  const { engines, primaryAgent } = useChatEngines();
  const { chat, run, running, send, stop, setSettings, clear } = useSongChat({ repoId, project, name, getSong, flush });
  const [draft, setDraft] = useState('');
  const [agyRegistered, setAgyRegistered] = useState(false);
  useEffect(() => {
    void bridge()?.media.music?.agy?.status().then((res) => setAgyRegistered(res.ok && res.value.registered));
  }, []);

  const engine = pickEngine(engines, chat.engine, primaryAgent);
  const modelId = engine ? pickerModel(engine, chat.model) : '';
  const musicEngine = toMusicEngine(engine, engine ? wireModel(engine, chat.model) : null);
  const providers = useMemo<PickerProvider[]>(
    () =>
      engines.map((e) => ({
        id: e.id,
        label: `${e.label} · ${engineMode(e.id, agyRegistered) === 'iterative' ? 'refines' : 'one pass'}`,
        icon: e.icon,
        ...(e.accent ? { color: e.accent } : {}),
        ...(e.available ? {} : { disabled: true, ...(e.reason ? { reason: e.reason } : {}) }),
      })),
    [engines, agyRegistered],
  );

  const canSend = draft.trim().length > 0 && !running && musicEngine !== null && !!name;
  const submit = useCallback(() => {
    if (!canSend || !engine || !musicEngine) return;
    const text = draft;
    setDraft('');
    void send({ text, engine: musicEngine, engineId: engine.id, via: engine.label });
  }, [canSend, draft, engine, musicEngine, send]);

  // Keep the newest message in view.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, run?.pass]);

  const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <aside aria-label="Song chat" data-testid="song-chat" className="flex h-full min-h-0 w-full flex-col border-l border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <span className="font-medium">{name ? `Chat · ${name}` : 'Chat'}</span>
        <span className="ml-auto" />
        <IconButton icon={LuTrash2} label="Clear chat" size="sm" disabled={running || chat.messages.length === 0} onClick={clear} />
      </div>
      <div ref={scroller} role="log" aria-label="Conversation" aria-live="polite" aria-busy={running} data-testid="song-chat-thread" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {chat.messages.length === 0 ? (
          <p data-testid="song-chat-empty" className="text-xs text-muted-foreground">
            Ask for a change to this song — "make the bridge sadder", "add a walking bass on track 3". Claude and Codex refine it over several passes;
            the others write it in one.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {chat.messages.map((m) =>
              m.role === 'user' ? (
                <UserMessage key={m.id} message={asChatMessage(m)} canEdit={false} onEdit={noop} />
              ) : (
                <div key={m.id} className="flex flex-col gap-1.5">
                  <AssistantMessage
                    message={asChatMessage(m)}
                    engine={engines.find((e) => e.id === m.engine)}
                    isLast={m.id === lastAssistant}
                    canRetry={false}
                    onRetry={noop}
                    onOpenChanges={noop}
                    onResolveAll={noop}
                    resolving={false}
                  />
                  {m.via ? <p className="ml-9 text-[10px] text-muted-foreground">{m.via}</p> : null}
                  {m.changes?.length ? (
                    <ul className="ml-9 flex flex-col gap-1" aria-label="Changed notes" data-testid="song-chat-changes">
                      {m.changes.map((c) => (
                        <li key={c.trackId}>
                          <button
                            type="button"
                            onClick={() => onShowChange(c)}
                            data-testid="song-chat-show"
                            className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                          >
                            <LuMousePointerClick aria-hidden className="h-3 w-3" />
                            Select in piano roll: {c.trackName}, {barRange(c)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ),
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border p-2">
        {run ? (
          <div role="status" data-testid="song-chat-progress" className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
            <span className="shrink-0 font-medium text-foreground">{progressLabel(run)}</span>
            {run.action ? <span className="min-w-0 truncate" data-testid="song-chat-action">{run.action}</span> : null}
          </div>
        ) : null}
        <AiComposer
          value={draft}
          onChange={setDraft}
          onSend={submit}
          canSend={canSend}
          ariaLabel="Message the song's agent"
          placeholder="Describe a change…"
          rows={2}
          streaming={running}
          onStop={stop}
          sendAriaLabel="Send"
          testIdPrefix="song-chat-composer"
          boxClassName={MEDIA_PROMPT_BOX}
          leading={
            <span className={running ? 'pointer-events-none opacity-60' : ''} aria-disabled={running || undefined}>
              <ProviderModelPicker
                testId="song-chat-engine-picker"
                providers={providers}
                provider={engine?.id ?? ''}
                onProviderChange={(id) => setSettings({ engine: id, model: null })}
                models={engine?.models ?? []}
                model={modelId}
                onModelChange={(id) => setSettings({ model: engine?.kind === 'agent' && id === 'default' ? null : id })}
              />
            </span>
          }
        />
        {engine ? (
          <p data-testid="song-chat-mode" className="text-[10px] text-muted-foreground">
            {modeHint(engine.id, agyRegistered)}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
