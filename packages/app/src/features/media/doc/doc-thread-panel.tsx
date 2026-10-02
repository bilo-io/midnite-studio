import { agentHeadlessArgs, loopModelsFor, type DocThreadMessage, type LoopModel } from '@midnite/studio-shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LuCheck, LuCopy, LuSparkles, LuX } from 'react-icons/lu';

import { AiComposer, AiThreadFrame, ThinkingIndicator, useComposerMic } from '../../../components/ai-thread';
import { EmptyState } from '../../../components/empty-state';
import { useToastStore } from '../../../store/toast-store';
import { useUiStore } from '../../../store/ui-store';
import { useAgents } from '../../terminal/use-agents';
import { AgentModelPicker } from '../agent-model-picker';
import { MEDIA_PROMPT_BOX } from '../prompt-input';
import { applyProposal } from './doc-thread';
import { lineDiff } from './line-diff';
import { useVoiceThread } from '../voice/use-voice-thread';
import { SpeechToggle } from '../voice/voice-controls';
import type { DocSession } from './use-doc-session';
import { useDocThread } from './use-doc-thread';
import type { DocRef } from './use-doc-session';

/**
 * The right pane of Docs (Phase 99 Theme B): the doc's own AI thread.
 *
 * A prompt runs headless through the picked agent (the primary agent by
 * default). With a selection pending (`selection`), the edit is scoped to it;
 * otherwise to the whole doc. The answer arrives as a **diff card** —
 * Accept writes through the media store, Reject only marks it, Copy puts the
 * replacement on the clipboard. Nothing touches the doc without Accept.
 */
export function DocThreadPanel({
  doc,
  session,
  selection,
  onClearSelection,
  getMarkdown,
  focusToken,
}: {
  doc: DocRef | null;
  session: DocSession;
  /** Markdown of the selection Ask AI was invoked on, if any. */
  selection: string | undefined;
  onClearSelection: () => void;
  getMarkdown: () => string;
  /** Changes whenever Ask AI is invoked — focuses the prompt. */
  focusToken: number;
}) {
  const thread = useDocThread(doc);
  const primaryAgent = useUiStore((s) => s.primaryAgent);
  const { agents } = useAgents();
  const [agentId, setAgentId] = useState(primaryAgent);
  const [model, setModel] = useState<LoopModel>('default');
  const [prompt, setPrompt] = useState('');
  const voice = useVoiceThread();
  const input = useRef<HTMLTextAreaElement>(null);
  const mic = useComposerMic({
    onTranscript: (text) => {
      setPrompt((current) => (current.length === 0 ? text : `${current} ${text}`));
      input.current?.focus();
    },
  });
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusToken > 0) input.current?.focus();
  }, [focusToken]);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [thread.messages.length]);

  // Speak each new assistant reply (simplified) — never the replies already there on load.
  const spokenUpTo = useRef<{ key: string; count: number } | null>(null);
  const docKey = doc ? `${doc.repoId}:${doc.project}:${doc.path}` : '';
  useEffect(() => {
    const count = thread.messages.length;
    if (spokenUpTo.current === null || spokenUpTo.current.key !== docKey) {
      spokenUpTo.current = { key: docKey, count };
      return;
    }
    for (const m of thread.messages.slice(spokenUpTo.current.count)) {
      if (m.role === 'assistant') {
        voice.speakReply(
          m.error ?? m.text ?? (m.proposal ? `I have proposed an edit to the ${m.proposal.scope === 'selection' ? 'selection' : 'document'}.` : ''),
        );
      }
    }
    spokenUpTo.current = { key: docKey, count };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.messages]);

  const headless = useMemo(() => agents.filter((a) => agentHeadlessArgs(a.id) !== null), [agents]);
  const models = loopModelsFor(agentId);

  if (!doc) return <EmptyState icon={LuSparkles} title="Ask AI" body="Open a doc to edit it with the primary agent." />;

  const send = () => {
    const text = prompt.trim();
    if (!text || thread.ask.isPending) return;
    setPrompt('');
    thread.ask.mutate(
      {
        prompt: text,
        markdown: getMarkdown(),
        selection,
        agentId,
        ...(models.some((m) => m.id === model) && model !== 'default' ? { model } : {}),
      },
      { onSettled: onClearSelection },
    );
  };

  const accept = (message: DocThreadMessage) => {
    if (!message.proposal) return;
    const next = applyProposal(getMarkdown(), message.proposal);
    if (next === null) {
      useToastStore.getState().addToast({
        message: 'The selected text has changed since this edit was proposed. Copy it instead.',
        status: 'warning',
      });
      return;
    }
    session.replace(next);
    void thread.resolve(message.id, 'accepted');
  };

  return (
    <AiThreadFrame loading={thread.ask.isPending} className="flex h-full min-h-0 flex-col" testId="doc-thread">
      <div ref={list} className="hide-scrollbar min-h-0 flex-1 space-y-2 overflow-auto p-2" role="log" aria-label="AI thread">
        {thread.messages.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            Ask for an edit. Select text first to scope it to the selection.
          </p>
        ) : (
          thread.messages.map((message) => (
            <ThreadMessage
              key={message.id}
              message={message}
              onAccept={() => accept(message)}
              onReject={() => void thread.resolve(message.id, 'rejected')}
            />
          ))
        )}
        {thread.ask.isPending ? <ThinkingIndicator /> : null}
      </div>

      <div className="shrink-0 border-t border-border p-2">
        {selection ? (
          <div className="mb-1.5 flex items-center gap-1 rounded bg-accent/60 px-1.5 py-1 text-[11px] text-muted-foreground">
            <span className="truncate">Selection: {selection.slice(0, 80)}</span>
            <button
              type="button"
              aria-label="Clear selection scope"
              onClick={onClearSelection}
              className="ml-auto shrink-0 hover:text-foreground"
            >
              <LuX aria-hidden className="h-3 w-3" />
            </button>
          </div>
        ) : null}
        <AiComposer
          textareaRef={input}
          ariaLabel="Ask AI"
          rows={3}
          value={prompt}
          onChange={setPrompt}
          placeholder={selection ? 'How should the selection change?' : 'How should the doc change?'}
          canSend={prompt.trim().length > 0 && !thread.ask.isPending}
          onSend={send}
          mic={mic}
          boxClassName={MEDIA_PROMPT_BOX}
          leading={
            <AgentModelPicker
              testId="doc-ask-picker"
              agents={headless}
              primaryAgentId={primaryAgent}
              agentId={agentId}
              onAgentChange={(id) => {
                setAgentId(id);
                setModel('default');
              }}
              model={model}
              onModelChange={setModel}
            />
          }
          trailing={<SpeechToggle voice={voice} />}
          testIdPrefix="doc-ask"
        />
        {session.dirty ? <p className="mt-1 text-[10px] text-muted-foreground">Saving…</p> : null}
      </div>
    </AiThreadFrame>
  );
}

function ThreadMessage({
  message,
  onAccept,
  onReject,
}: {
  message: DocThreadMessage;
  onAccept: () => void;
  onReject: () => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="ml-6 whitespace-pre-wrap rounded-md bg-accent px-2 py-1.5 text-xs text-foreground">{message.text}</div>
    );
  }
  if (message.error) {
    return <div className="rounded-md border border-destructive/40 px-2 py-1.5 text-xs text-destructive">{message.error}</div>;
  }
  if (!message.proposal) return <div className="text-xs text-muted-foreground">{message.text}</div>;
  return <DiffCard message={message} onAccept={onAccept} onReject={onReject} />;
}

function DiffCard({ message, onAccept, onReject }: { message: DocThreadMessage; onAccept: () => void; onReject: () => void }) {
  const proposal = message.proposal!;
  const lines = useMemo(() => lineDiff(proposal.original, proposal.replacement), [proposal.original, proposal.replacement]);
  const pending = proposal.status === 'pending';

  return (
    <div className="overflow-hidden rounded-md border border-border" data-testid="doc-diff-card" data-status={proposal.status}>
      <div className="flex items-center gap-1 border-b border-border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
        <LuSparkles aria-hidden className="h-3 w-3 text-primary" />
        <span>{proposal.scope === 'selection' ? 'Edit to selection' : 'Edit to document'}</span>
        {!pending ? <span className="ml-auto capitalize">{proposal.status}</span> : null}
      </div>
      <pre className="hide-scrollbar max-h-64 overflow-auto py-1 font-mono text-[11px] leading-snug">
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.kind === 'add'
                ? 'bg-emerald-500/10 px-2 text-emerald-700 dark:text-emerald-300'
                : line.kind === 'del'
                  ? 'bg-red-500/10 px-2 text-red-700 line-through decoration-red-500/40 dark:text-red-300'
                  : 'px-2 text-muted-foreground'
            }
          >
            {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '- ' : '  '}
            {line.text || ' '}
          </div>
        ))}
      </pre>
      <div className="flex items-center gap-1 border-t border-border px-1.5 py-1">
        <button
          type="button"
          disabled={!pending}
          onClick={onAccept}
          className="flex h-6 items-center gap-1 rounded bg-primary px-2 text-[11px] text-primary-foreground disabled:opacity-40"
        >
          <LuCheck aria-hidden className="h-3 w-3" /> Accept
        </button>
        <button
          type="button"
          disabled={!pending}
          onClick={onReject}
          className="flex h-6 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40"
        >
          <LuX aria-hidden className="h-3 w-3" /> Reject
        </button>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(proposal.replacement)}
          className="ml-auto flex h-6 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:bg-accent"
        >
          <LuCopy aria-hidden className="h-3 w-3" /> Copy
        </button>
      </div>
    </div>
  );
}
