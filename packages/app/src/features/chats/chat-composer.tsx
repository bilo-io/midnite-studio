import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import type { ChatAttachment, ChatMode, ChatSkill } from '@midnite/studio-shared';
import { LuFileText, LuPaperclip, LuX } from 'react-icons/lu';

import { AiComposer, AttachMenu, ProviderModelPicker, useComposerMic, type PickerProvider } from '../../components/ai-thread';
import { useToastStore } from '../../store/toast-store';
import { MEDIA_PROMPT_BOX } from '../media/prompt-input';
import { ModePicker, NO_REPO_ID, RepoPicker } from './chat-options';
import { CompanionToggle } from './companion-toggle';
import { ComposerPicker, fileRows, skillRows } from './composer-picker';
import { findPills, findTrigger, insertToken, matchFiles, matchSkills, pillAtCaret, removePill, type PillToken } from './composer-tokens';
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
 *
 * `/` at the start of a word opens a picker of the agent's discovered skills,
 * `@` one of the files it can reach (`skills`/`files`, fetched by the page).
 * Arrows move, Tab or Enter inserts, Esc closes. An inserted `/skill` or
 * `@path` stays in the text verbatim — that is what the agent receives — and
 * the field's overlay paints it as a gradient pill; Backspace at a pill
 * deletes the whole token. See `composer-tokens.ts` for why pills are derived
 * from the text rather than kept as separate state.
 */

export type ChatSettings = { engine: string | null; model: string | null; mode: ChatMode; repoId: string | null };

const NO_SKILLS: readonly ChatSkill[] = [];
const NO_FILES: readonly string[] = [];

/** The text with every pill range wrapped — the overlay `AiComposer` paints under the transparent textarea. */
function paintPills(text: string, pills: readonly PillToken[]): ReactNode {
  if (pills.length === 0) return text;
  const out: ReactNode[] = [];
  let at = 0;
  for (const pill of pills) {
    if (pill.start > at) out.push(text.slice(at, pill.start));
    out.push(
      <span key={pill.start} className={`composer-pill composer-pill--${pill.kind}`} data-testid="chat-pill" data-kind={pill.kind}>
        {text.slice(pill.start, pill.end)}
      </span>,
    );
    at = pill.end;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

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
  skills = NO_SKILLS,
  files = NO_FILES,
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
  /** What `/` offers — the chat's agent's discovered skills. */
  skills?: readonly ChatSkill[];
  /** What `@` offers — relative paths the chat's agent can reach. */
  files?: readonly string[];
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    input.current?.focus();
  }, [focusToken]);

  // --- `/` and `@` pickers ----------------------------------------------------
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  /** The trigger start Esc closed — it stays closed until the caret leaves that word. */
  const [dismissed, setDismissed] = useState<number | null>(null);
  const pendingCaret = useRef<number | null>(null);

  const skillNames = useMemo(() => new Set(skills.map((s) => s.name)), [skills]);
  const fileSet = useMemo(() => new Set(files), [files]);
  const pills = useMemo(() => findPills(value, skillNames, fileSet), [value, skillNames, fileSet]);

  const rawTrigger = focused ? findTrigger(value, Math.min(caret, value.length)) : null;
  const trigger = rawTrigger && rawTrigger.start !== dismissed ? rawTrigger : null;
  const triggerKind = trigger?.kind ?? null;
  const triggerQuery = trigger?.query ?? '';
  const rows = useMemo(() => {
    if (triggerKind === null) return [];
    return triggerKind === 'skill' ? skillRows(matchSkills(skills, triggerQuery)) : fileRows(matchFiles(files, triggerQuery));
  }, [triggerKind, triggerQuery, skills, files]);
  const activeIndex = rows.length === 0 ? 0 : Math.min(active, rows.length - 1);

  useEffect(() => setActive(0), [triggerKind, trigger?.start, triggerQuery]);
  useEffect(() => {
    if (dismissed !== null && rawTrigger?.start !== dismissed) setDismissed(null);
  }, [dismissed, rawTrigger?.start]);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    if (document.activeElement === el) setFocused(true);
    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
    };
  }, []);

  // Put the caret where a pick or a pill removal left it, once React has written the new value.
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    const el = input.current;
    if (at === null || !el) return;
    pendingCaret.current = null;
    el.setSelectionRange(at, at);
    setCaret(at);
  }, [value]);

  const commit = (next: { text: string; caret: number }) => {
    pendingCaret.current = next.caret;
    onChange(next.text);
  };

  const pick = (index: number) => {
    const row = rows[index];
    if (!trigger || !row) return;
    commit(insertToken(value, trigger, `${trigger.kind === 'skill' ? '/' : '@'}${row.key}`));
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (trigger) {
      const n = rows.length;
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && n > 0) {
        event.preventDefault();
        setActive((activeIndex + (event.key === 'ArrowDown' ? 1 : n - 1)) % n);
        return;
      }
      const insertKey = event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey);
      if (insertKey && n > 0 && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        pick(activeIndex);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setDismissed(trigger.start);
        return;
      }
    }
    if (event.key === 'Backspace' && !event.altKey && !event.metaKey && !event.ctrlKey) {
      const el = event.currentTarget;
      if (el.selectionStart !== el.selectionEnd) return;
      const pill = pillAtCaret(pills, el.selectionStart);
      if (!pill) return;
      event.preventDefault();
      commit(removePill(value, pill));
    }
  };

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
      <input ref={fileInput} type="file" multiple hidden onChange={onFilePick} data-testid="chat-file-input" />
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
        onKeyDown={onKeyDown}
        onCaretChange={setCaret}
        renderOverlay={(text) => paintPills(text, pills)}
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
          <>
            {trigger ? (
              <ComposerPicker
                kind={trigger.kind}
                query={trigger.query}
                rows={rows}
                active={activeIndex}
                onPick={pick}
                onHover={setActive}
                emptyReason={
                  trigger.kind === 'skill'
                    ? skills.length === 0
                      ? `No skills found for ${engine?.label ?? 'this engine'}`
                      : null
                    : files.length === 0
                      ? 'No files to mention yet'
                      : null
                }
              />
            ) : null}
            {attachments.length > 0 ? (
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
            ) : null}
          </>
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
                  onSelect: () => fileInput.current?.click(),
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
