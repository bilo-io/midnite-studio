import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Chat, ChatAttachment, ChatMode } from '@midnite/studio-shared';

import { ExplorerNotice } from '../../components/explorer';
import { useDialogs } from '../../components/dialog-host';
import { useRepos } from '../../services/queries';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';
import { decisionsFor } from './chat-changes';
import { ChatChangesModal } from './chat-changes-modal';
import { ChatComposer, type ChatSettings } from './chat-composer';
import { ChatEmptyState } from './chat-empty-state';
import { ChatThread } from './chat-thread';
import { isStreaming, useChatsStore } from './chats-store';
import { pickEngine, useChatEngines, wireModel, type ChatEngine } from './use-chat-engines';
import { useChatFiles, useChatSkills } from './use-composer-sources';

/**
 * The centre of the Chats page: the thread (or the new-chat screen) over a
 * composer pinned to the bottom, centred in a readable column.
 *
 * The composer's text and attachments are kept per chat in a ref map — switching
 * to another chat and back must not eat what you were typing. Its settings are
 * the chat's own once it exists, and the store's draft before that.
 */

const NEW_KEY = '__new__';

type DraftText = { text: string; attachments: ChatAttachment[] };

export function ChatPane({ selectedId }: { selectedId: string | null }) {
  const chat = useChatsStore((s) => (selectedId === null ? undefined : s.chats[selectedId]));
  const loadError = useChatsStore((s) => s.loadError);
  const draft = useChatsStore((s) => s.draft);
  const { engines, primaryAgent } = useChatEngines();
  const repos = useRepos();
  const dialogs = useDialogs();
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);

  const key = selectedId ?? NEW_KEY;
  const drafts = useRef(new Map<string, DraftText>());
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [focusToken, setFocusToken] = useState(0);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  // Park the outgoing chat's draft, restore the incoming one's.
  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current === key) return;
    drafts.current.set(previousKey.current, { text, attachments });
    const next = drafts.current.get(key) ?? { text: '', attachments: [] };
    previousKey.current = key;
    setText(next.text);
    setAttachments(next.attachments);
    setReviewing(null);
    setFocusToken((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // A new chat starts in the repo you are looking at, once, if it has none yet.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || selectedRepoId === null) return;
    seeded.current = true;
    if (useChatsStore.getState().draft.repoId === null) useChatsStore.getState().setDraft({ repoId: selectedRepoId });
  }, [selectedRepoId]);

  const streaming = isStreaming(chat);
  const repoOptions = useMemo(() => (repos.data ?? []).map((r) => ({ id: r.id, name: r.name })), [repos.data]);

  const settings: ChatSettings = useMemo(() => {
    if (chat) return { engine: chat.engine, model: chat.model, mode: chat.mode, repoId: chat.repoId };
    const engine = pickEngine(engines, draft.engine, primaryAgent);
    return { engine: engine?.id ?? null, model: draft.model, mode: draft.mode, repoId: draft.repoId };
  }, [chat, draft, engines, primaryAgent]);
  const engine = engines.find((e) => e.id === settings.engine) ?? null;
  const skills = useChatSkills(settings.engine, settings.repoId);
  const files = useChatFiles(settings.repoId, chat?.id ?? null);

  const onSettingsChange = useCallback(
    (patch: Partial<ChatSettings>) => {
      const normalised = normalise(patch, engines);
      if (chat) {
        void useChatsStore
          .getState()
          .updateChat(chat.id, normalised)
          .then((result) => {
            if (!result.ok && result.kind === 'error') useToastStore.getState().addToast({ message: result.message, status: 'error' });
          });
      } else {
        useChatsStore.getState().setDraft(normalised);
      }
    },
    [chat, engines],
  );

  const send = useCallback(() => {
    const body = text.trim();
    if (body.length === 0 && attachments.length === 0) return;
    const sent = { text: body, attachments };
    setText('');
    setAttachments([]);
    drafts.current.delete(key);
    // A brand-new chat has no engine until the first send resolves the default.
    if (!chat && useChatsStore.getState().draft.engine === null && engine) useChatsStore.getState().setDraft({ engine: engine.id, model: wireModel(engine, settings.model) });
    void useChatsStore
      .getState()
      .sendMessage({ text: sent.text, ...(sent.attachments.length > 0 ? { attachments: sent.attachments } : {}) })
      .then((result) => {
        if (!result.ok) {
          // Put it back — a failed send must not eat the message.
          setText(sent.text);
          setAttachments(sent.attachments);
          useToastStore.getState().addToast({ message: result.kind === 'error' ? result.message : 'Could not send.', status: 'error' });
        }
      });
  }, [text, attachments, key, chat, engine, settings.model]);

  const stop = useCallback(() => {
    if (chat) void useChatsStore.getState().cancel(chat.id);
  }, [chat]);

  const edit = useCallback(
    (messageId: string, body: string) => {
      const current = useChatsStore.getState().chats[selectedId ?? ''];
      if (!current) return;
      const index = current.messages.findIndex((m) => m.id === messageId);
      const doRewind = () =>
        void useChatsStore
          .getState()
          .sendMessage({ fromMessageId: messageId, text: body })
          .then((result) => {
            if (!result.ok && result.kind === 'error') useToastStore.getState().addToast({ message: result.message, status: 'error' });
          });
      // Editing the last message loses nothing; an earlier one drops the rest of the thread.
      if (index === current.messages.length - 2 || index === current.messages.length - 1) doRewind();
      else {
        dialogs.confirm({
          title: 'Edit this message?',
          confirmLabel: 'Edit and resend',
          danger: true,
          blastRadius: null,
          warnings: [`${current.messages.length - index - 1} later message${current.messages.length - index - 1 === 1 ? '' : 's'} will be removed.`],
          onConfirm: doRewind,
        });
      }
    },
    [selectedId, dialogs],
  );

  const retry = useCallback(
    (assistantId: string) => {
      if (!selectedId) return;
      void useChatsStore
        .getState()
        .retry(selectedId, assistantId)
        .then((result) => {
          if (!result.ok && result.kind === 'error') useToastStore.getState().addToast({ message: result.message, status: 'error' });
        });
    },
    [selectedId],
  );

  const resolveAll = useCallback(
    (changeSetId: string, action: 'accept' | 'reject') => {
      const current = useChatsStore.getState().chats[selectedId ?? ''];
      const changeSet = current?.messages.find((m) => m.changeSet?.id === changeSetId)?.changeSet;
      if (!current || !changeSet) return;
      const decisions = decisionsFor(changeSet, action);
      if (decisions.length === 0) return;
      setResolving(changeSetId);
      void useChatsStore
        .getState()
        .resolveChanges(current.id, changeSetId, decisions)
        .then((result) => {
          if (!result.ok && result.kind === 'conflict') {
            useToastStore.getState().addToast({ message: `${result.files.length} file${result.files.length === 1 ? '' : 's'} no longer apply — open the changes to see why.`, status: 'warning' });
          } else if (!result.ok) {
            useToastStore.getState().addToast({ message: result.message, status: 'error' });
          }
        })
        .finally(() => setResolving(null));
    },
    [selectedId],
  );

  // px-16: symmetric clearance so the floating launcher (bottom-right, 40px) never covers Send.
  const composer = (
    <div className="shrink-0 px-16 pb-4 pt-1">
      <div className="mx-auto w-full max-w-3xl">
        <ChatComposer
          value={text}
          onChange={setText}
          onSend={send}
          onStop={stop}
          streaming={streaming}
          engines={engines}
          settings={settings}
          onSettingsChange={onSettingsChange}
          repos={repoOptions}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          focusToken={focusToken}
          placeholder={chat ? 'Reply…' : 'Message an agent…'}
          skills={skills}
          files={files}
        />
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/70">
          {settings.mode === 'edit' && settings.repoId ? 'Edits happen on a copy — nothing changes in your repository until you accept it.' : 'Agents can make mistakes. Check important output.'}
        </p>
      </div>
    </div>
  );

  let body;
  if (selectedId !== null && !chat) {
    body = loadError ? <ExplorerNotice tone="destructive">{loadError}</ExplorerNotice> : <ExplorerNotice>Opening chat…</ExplorerNotice>;
  } else if (!chat || chat.messages.length === 0) {
    body = (
      <ChatEmptyState
        hasRepo={settings.repoId !== null}
        engineLabel={engine?.label ?? null}
        onPick={(prompt) => {
          setText(prompt);
          setFocusToken((n) => n + 1);
        }}
      />
    );
  } else {
    body = (
      <ChatThread
        chat={chat}
        engines={engines}
        streaming={streaming}
        resolvingChangeSetId={resolving}
        onEdit={edit}
        onRetry={retry}
        onOpenChanges={setReviewing}
        onResolveAll={resolveAll}
      />
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={chat ? chat.title : 'New chat'} data-testid="chat-pane">
      {chat ? <ChatHeader chat={chat} engine={engine} streaming={streaming} /> : null}
      {body}
      {selectedId !== null && !chat ? null : composer}
      {chat && reviewing ? <ChatChangesModal chatId={chat.id} changeSetId={reviewing} onClose={() => setReviewing(null)} /> : null}
    </section>
  );
}

/** A picker selection → the wire patch: an engine change resets the model to that engine's default. */
function normalise(patch: Partial<ChatSettings>, engines: readonly ChatEngine[]): { engine?: string; model?: string | null; mode?: ChatMode; repoId?: string | null } {
  const out: { engine?: string; model?: string | null; mode?: ChatMode; repoId?: string | null } = {};
  if (patch.engine !== undefined && patch.engine !== null) {
    out.engine = patch.engine;
    const next = engines.find((e) => e.id === patch.engine);
    out.model = next ? wireModel(next, patch.model ?? null) : null;
  } else if (patch.model !== undefined) {
    out.model = patch.model;
  }
  if (patch.mode !== undefined) out.mode = patch.mode;
  if (patch.repoId !== undefined) out.repoId = patch.repoId;
  return out;
}

function ChatHeader({ chat, engine, streaming }: { chat: Chat; engine: ChatEngine | null; streaming: boolean }) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-1.5 text-xs">
      <h2 className="min-w-0 truncate text-sm font-medium" data-testid="chat-title">
        {chat.title}
      </h2>
      <span className="shrink-0 text-muted-foreground">
        {engine?.label ?? chat.engine}
        {chat.repoName ? ` · ${chat.repoName}` : ''}
      </span>
      {streaming ? (
        <span className="shrink-0 text-muted-foreground" aria-live="polite" data-testid="chat-answering">
          Answering…
        </span>
      ) : null}
    </header>
  );
}
