import { useEffect, useMemo, useRef, useState } from 'react';
import { agentHeadlessArgs, loopModelArgs, type LoopModel } from '@midnite/studio-shared';
import { LuClapperboard } from 'react-icons/lu';

import { AiComposer, AiThreadFrame, ThinkingIndicator, useComposerMic } from '../../../components/ai-thread';
import { useUiStore } from '../../../store/ui-store';
import { startAgent } from '../../terminal/start-agent';
import { useAgents } from '../../terminal/use-agents';
import { AgentModelPicker } from '../agent-model-picker';
import { MEDIA_PROMPT_BOX } from '../prompt-input';
import { useVoiceThread } from '../voice/use-voice-thread';
import { SpeechToggle } from '../voice/voice-controls';

export type VideoEditMessage = { id: string; role: 'user' | 'assistant'; text: string; error?: boolean };

/** What a video edit request is run against. */
export type VideoEditContext = {
  projectId: string;
  title: string;
  cwd: string | null;
  repoId: string | null;
  agent: { id: string; command: string };
  /** The composer's model pick; `default` (or absent) adds no `--model` flag. */
  model?: LoopModel;
};

/**
 * THE HANDLER SEAM. There is no video-edit AI backend over the bridge yet (the
 * video surface only exposes project/render/file ops), and this change adds no
 * IPC channel. Until one exists, an edit request is handed to the resolved
 * agent in a terminal session rooted at the project — the same route the
 * Brief tab's skill buttons use — and the thread acknowledges it. Swap this
 * function for a headless call once a backend lands; the thread UI is
 * unchanged.
 */
export type VideoEditHandler = (prompt: string, ctx: VideoEditContext) => Promise<string>;

export const terminalVideoEditHandler: VideoEditHandler = async (prompt, ctx) => {
  if (!ctx.repoId || !ctx.cwd) {
    throw new Error('Open a repository first — agent sessions need one.');
  }
  startAgent({
    repoId: ctx.repoId,
    cwd: ctx.cwd,
    title: `${ctx.title} — edit`,
    prompt,
    agentId: ctx.agent.id,
    command: ctx.agent.command,
    extraArgs: loopModelArgs(ctx.agent.id, ctx.model ?? 'default'),
  });
  return 'Started an editing session in the terminal for this project.';
};

/**
 * Media ▸ Video ▸ Edit: a Companion-style chat over the shared AI-thread
 * components. Messages live in memory per project (the handler is a seam,
 * so there is no thread store to persist to yet).
 */
export function VideoEditThread({
  projectId,
  title,
  cwd,
  repoId,
  agent,
  handler = terminalVideoEditHandler,
}: {
  projectId: string;
  title: string;
  cwd: string | null;
  repoId: string | null;
  agent: { id: string; command: string };
  handler?: VideoEditHandler;
}) {
  const [messages, setMessages] = useState<VideoEditMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [prompt, setPrompt] = useState('');
  const primaryAgent = useUiStore((s) => s.primaryAgent);
  const { agents } = useAgents();
  const [pickedAgentId, setPickedAgentId] = useState<string | null>(null);
  const [model, setModel] = useState<LoopModel>('default');
  const headless = useMemo(() => agents.filter((a) => agentHeadlessArgs(a.id) !== null), [agents]);
  const picked = pickedAgentId ? agents.find((a) => a.id === pickedAgentId) : undefined;
  const activeAgent = picked ? { id: picked.id, command: picked.command } : agent;
  const voice = useVoiceThread();
  const input = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const mic = useComposerMic({
    onTranscript: (text) => {
      setPrompt((current) => (current.length === 0 ? text : `${current} ${text}`));
      input.current?.focus();
    },
  });

  // A thread belongs to one project.
  useEffect(() => setMessages([]), [projectId]);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.length, pending]);

  const send = async () => {
    const text = prompt.trim();
    if (!text || pending) return;
    setPrompt('');
    setMessages((m) => [...m, { id: `u${m.length}`, role: 'user', text }]);
    setPending(true);
    try {
      const reply = await handler(text, { projectId, title, cwd, repoId, agent: activeAgent, model });
      setMessages((m) => [...m, { id: `a${m.length}`, role: 'assistant', text: reply }]);
      voice.speakReply(reply);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The edit request failed.';
      setMessages((m) => [...m, { id: `a${m.length}`, role: 'assistant', text: message, error: true }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <AiThreadFrame loading={pending} className="flex h-full min-h-0 flex-col" testId="video-thread">
      <div ref={list} className="hide-scrollbar min-h-0 flex-1 space-y-2 overflow-auto p-2" role="log" aria-label="Video edit thread">
        {messages.length === 0 ? (
          <p className="flex flex-col items-center gap-2 px-1 py-4 text-center text-xs text-muted-foreground">
            <LuClapperboard aria-hidden className="h-5 w-5" />
            Describe the change you want to this video.
          </p>
        ) : (
          messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="ml-6 whitespace-pre-wrap rounded-md bg-accent px-2 py-1.5 text-xs text-foreground">
                {message.text}
              </div>
            ) : (
              <div
                key={message.id}
                className={
                  message.error
                    ? 'rounded-md border border-destructive/40 px-2 py-1.5 text-xs text-destructive'
                    : 'text-xs text-muted-foreground'
                }
              >
                {message.text}
              </div>
            ),
          )
        )}
        {pending ? <ThinkingIndicator /> : null}
      </div>
      <div className="shrink-0 border-t border-border p-2">
        <AiComposer
          textareaRef={input}
          ariaLabel="Edit video"
          rows={3}
          value={prompt}
          onChange={setPrompt}
          placeholder="How should the video change?"
          canSend={prompt.trim().length > 0 && !pending}
          onSend={() => void send()}
          mic={mic}
          boxClassName={MEDIA_PROMPT_BOX}
          leading={
            <AgentModelPicker
              testId="video-edit-picker"
              agents={headless}
              primaryAgentId={primaryAgent}
              agentId={activeAgent.id}
              onAgentChange={(id) => {
                setPickedAgentId(id);
                setModel('default');
              }}
              model={model}
              onModelChange={setModel}
            />
          }
          trailing={<SpeechToggle voice={voice} />}
          testIdPrefix="video-edit"
        />
      </div>
    </AiThreadFrame>
  );
}
