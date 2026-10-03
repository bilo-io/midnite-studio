import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import type { ChatAttachment, ChatMode } from '@midnite/studio-shared';
import { LuFileText, LuPaperclip, LuX } from 'react-icons/lu';

import { AiComposer, AttachMenu, ProviderModelPicker, useComposerMic, type PickerProvider } from '../../components/ai-thread';
import { useToastStore } from '../../store/toast-store';
import { MEDIA_PROMPT_BOX } from '../media/prompt-input';
import { ModePicker, NO_REPO_ID, RepoPicker } from './chat-options';
import { CompanionToggle } from './companion-toggle';
import { pickerModel, type ChatEngine } from './use-chat-engines';

/**
 * The Chats page's composer — the shared `AiComposer` (auto-growing textarea,
 * Enter sends, Shift+Enter is a newline, Stop beside Send while streaming)
 * dressed with the chat-specific controls: attach text files, engine + model,
 * mode, repository, and the companion switch.
 *
 * The settings it shows are the chat's own (or the draft's, on the new-chat
 * screen); changing one calls `onSettingsChange`, and the page decides whether
 * that persists to a chat or to the draft. While a reply is streaming the
 * settings freeze — main refuses a mid-answer change, and a picker that looked
 * live but did nothing would be worse than a visibly dim one.
 */

export type ChatSettings = { engine: string | null; model: string | null; mode: ChatMode; repoId: string | null };

const MAX_ATTACHMENT_BYTES = 200_000;
const MAX_ATTACHMENTS = 10;

let attachmentSeq = 0;
const attachmentId = (): string => `att-${Date.now().toString(36)}-${(attachmentSeq += 1)}`;

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  engines,
  settings,
  onSettingsChange,
  repos,
  attachments,
  onAttachmentsChange,
  focusToken,
  placeholder = 'Message an agent…',
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  engines: readonly ChatEngine[];
  settings: ChatSettings;
  onSettingsChange: (patch: Partial<ChatSettings>) => void;
  repos: readonly { id: string; name: string }[];
  attachments: readonly ChatAttachment[];
  onAttachmentsChange: (next: ChatAttachment[]) => void;
  /** Changes whenever the page wants the field focused (new chat, suggestion picked). */
  focusToken: number;
  placeholder?: string;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    input.current?.focus();
  }, [focusToken]);

  const mic = useComposerMic({
    onTranscript: (text) => {
      onChange(value.length === 0 ? text : `${value} ${text}`);
      input.current?.focus();
    },
  });

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      const next = [...attachments];
      for (const file of Array.from(list)) {
        if (next.length >= MAX_ATTACHMENTS) {
          useToastStore.getState().addToast({ message: `Attach at most ${MAX_ATTACHMENTS} files.`, status: 'warning' });
          break;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          useToastStore.getState().addToast({ message: `${file.name} is larger than 200 KB.`, status: 'warning' });
          continue;
        }
        const text = await file.text();
        // A NUL byte means binary — inlining it into a prompt would only corrupt it.
        if (text.includes('\0')) {
          useToastStore.getState().addToast({ message: `${file.name} is not a text file.`, status: 'warning' });
          continue;
        }
        next.push({ id: attachmentId(), name: file.name, text });
      }
      onAttachmentsChange(next);
    },
    [attachments, onAttachmentsChange],
  );

  const engine = engines.find((e) => e.id === settings.engine) ?? null;
  const providers: PickerProvider[] = engines.map((e) => ({
    id: e.id,
    label: e.label,
    icon: e.icon,
    ...(e.accent ? { color: e.accent } : {}),
    ...(e.available ? {} : { disabled: true, ...(e.reason ? { reason: e.reason } : {}) }),
  }));

  const hasText = value.trim().length > 0 || attachments.length > 0;
  const canSend = hasText && !streaming && engine !== null && engine.available;

  const onFilePick = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void addFiles(event.target.files);
    event.target.value = '';
  };

  return (
    <div
      data-testid="chat-composer"
      onDragOver={(event) => {
        if (event.dataTransfer?.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        setDragging(false);
        if (event.dataTransfer?.files.length) {
          event.preventDefault();
          void addFiles(event.dataTransfer.files);
        }
      }}
      className={`rounded-md ${dragging ? 'ring-2 ring-primary/50' : ''}`}
    >
      <input ref={files} type="file" multiple hidden onChange={onFilePick} data-testid="chat-file-input" />
      <AiComposer
        textareaRef={input}
        ariaLabel="Message"
        rows={1}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        canSend={canSend}
        onSend={onSend}
        streaming={streaming}
        onStop={onStop}
        maxTextareaHeight={240}
        mic={mic}
        boxClassName={MEDIA_PROMPT_BOX}
        testIdPrefix="chat-input"
        sendTooltip={
          engine === null
            ? 'No engine available'
            : !engine.available
              ? (engine.reason ?? `${engine.label} is unavailable`)
              : streaming
                ? 'Send — wait for the answer, or stop it'
                : hasText
                  ? 'Send'
                  : 'Send — type something first'
        }
        above={
          attachments.length > 0 ? (
            <ul className="mb-1.5 flex flex-wrap gap-1" aria-label="Attached files" data-testid="chat-attachments">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-1 rounded-md border border-border bg-muted/40 py-0.5 pl-1.5 pr-0.5 text-[11px]">
                  <LuFileText aria-hidden className="h-3 w-3 text-muted-foreground" />
                  <span className="max-w-[12rem] truncate">{a.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => onAttachmentsChange(attachments.filter((x) => x.id !== a.id))}
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <LuX aria-hidden className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null
        }
        leading={
          <>
            <AttachMenu
              testId="chat-attach"
              options={[
                {
                  id: 'file',
                  label: 'Attach text files…',
                  icon: LuPaperclip,
                  disabled: attachments.length >= MAX_ATTACHMENTS,
                  reason: `At most ${MAX_ATTACHMENTS} files`,
                  onSelect: () => files.current?.click(),
                },
              ]}
            />
            <span className={streaming ? 'pointer-events-none opacity-60' : ''} aria-disabled={streaming || undefined}>
              <ProviderModelPicker
                testId="chat-engine-picker"
                providers={providers}
                provider={settings.engine ?? ''}
                onProviderChange={(id) => onSettingsChange({ engine: id, model: null })}
                models={engine?.models ?? []}
                model={engine ? pickerModel(engine, settings.model) : ''}
                onModelChange={(id) => onSettingsChange({ model: engine?.kind === 'agent' && id === 'default' ? null : id })}
              />
            </span>
            <ModePicker value={settings.mode} onChange={(mode) => onSettingsChange({ mode })} disabled={streaming} />
            <RepoPicker
              repos={repos}
              value={settings.repoId ?? NO_REPO_ID}
              onChange={(repoId) => onSettingsChange({ repoId })}
              disabled={streaming}
            />
          </>
        }
        trailing={<CompanionToggle />}
      />
    </div>
  );
}
