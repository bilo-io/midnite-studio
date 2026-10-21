import { useMemo, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { LuCheck, LuChevronDown, LuPlus, LuSend, LuSquare } from 'react-icons/lu';

import type {
  ChatsAiComposerProps,
  ChatsAttachOption,
  ChatsComposerMic,
  ChatsMultiSelectMenuProps,
  ChatsProviderModelPickerProps,
} from '@midnite/studio-feature-chats/renderer';

import { Popover } from './plain-ui';

/**
 * Agents' composer kit — the plain counterparts of the AI-thread pieces Studio shares across ten
 * surfaces (Phase 113 Theme N). A textarea with Send/Stop, a "+" menu, a provider/model pair of
 * selects and a checkbox filter menu. There is no mic: Agents has no voice companion, so
 * {@link useComposerMic} answers "unavailable" and the composer hides the button.
 */

const NO_MIC: ChatsComposerMic = { available: false, reason: 'Voice input arrives with the companion', held: false, pressStart: () => undefined };

export function useComposerMic(): ChatsComposerMic {
  return NO_MIC;
}

const MAX_ROWS_HEIGHT = 240;

export function AiComposer({
  value,
  onChange,
  onSend,
  canSend,
  placeholder,
  ariaLabel,
  rows = 1,
  onKeyDown,
  textareaRef,
  above,
  leading,
  trailing,
  sendTooltip,
  streaming = false,
  onStop,
  maxTextareaHeight = MAX_ROWS_HEIGHT,
  testIdPrefix = 'ai-composer',
  className = '',
  boxClassName = 'rounded-md border border-input',
  renderOverlay,
  onCaretChange,
}: ChatsAiComposerProps) {
  const [overlayScroll, setOverlayScroll] = useState(0);
  const handleKey = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };
  return (
    <div className={`flex flex-col gap-1.5 ${className}`} data-testid={testIdPrefix}>
      {above}
      <div className={`relative bg-background ${boxClassName}`}>
        {renderOverlay ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-2 py-1.5 text-xs text-transparent"
            style={{ transform: `translateY(${-overlayScroll}px)` }}
          >
            {renderOverlay(value)}
          </div>
        ) : null}
        <textarea
          ref={textareaRef as Ref<HTMLTextAreaElement>}
          aria-label={ariaLabel}
          data-testid={`${testIdPrefix}-textarea`}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            onChange(event.target.value);
            onCaretChange?.(event.target.selectionStart);
          }}
          onSelect={(event) => onCaretChange?.(event.currentTarget.selectionStart)}
          onScroll={(event) => setOverlayScroll(event.currentTarget.scrollTop)}
          onKeyDown={handleKey}
          style={{ maxHeight: maxTextareaHeight }}
          className="relative block w-full resize-none bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/70"
        />
        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          {leading}
          <span className="ml-auto flex items-center gap-1">
            {trailing}
            {streaming && onStop ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop"
                title="Stop"
                data-testid={`${testIdPrefix}-stop`}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-border hover:bg-accent"
              >
                <LuSquare aria-hidden className="h-3 w-3" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              aria-label="Send"
              title={sendTooltip ?? 'Send'}
              data-testid={`${testIdPrefix}-send`}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
            >
              <LuSend aria-hidden className="h-3 w-3" />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

export function AttachMenu({ options, label = 'Attach', testId = 'attach-menu' }: { options: readonly ChatsAttachOption[]; label?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      label={label}
      side="top"
      align="start"
      open={open}
      onOpenChange={setOpen}
      testId={testId}
      triggerClassName="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      panelClassName="w-52"
      trigger={<LuPlus aria-hidden className="h-3.5 w-3.5" />}
    >
      <ul className="flex flex-col">
        {options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              disabled={option.disabled}
              title={option.reason}
              onClick={() => {
                setOpen(false);
                option.onSelect();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent disabled:opacity-50"
            >
              <option.icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

const SELECT = 'h-6 max-w-[11rem] rounded-md border border-input bg-background px-1 text-[11px] outline-none focus-visible:border-primary';

export function ProviderModelPicker({
  providers,
  provider,
  onProviderChange,
  models,
  model,
  onModelChange,
  testId = 'provider-model-picker',
}: ChatsProviderModelPickerProps) {
  return (
    <div className="flex items-center gap-1" data-testid={testId}>
      <select aria-label="Provider" value={provider} onChange={(event) => onProviderChange(event.target.value)} className={SELECT}>
        {providers.map((p) => (
          <option key={p.id} value={p.id} disabled={p.disabled} title={p.reason}>
            {p.label}
          </option>
        ))}
      </select>
      {models.length > 0 ? (
        <select aria-label="Model" value={model} onChange={(event) => onModelChange(event.target.value)} className={SELECT}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

/** "Everything" is the empty selection, as in Studio's menu. */
export function MultiSelectMenu({ options, selected, onChange, icon, allLabel, searchPlaceholder, emptyLabel, label, summarise }: ChatsMultiSelectMenuProps) {
  const [query, setQuery] = useState('');
  const shown = useMemo(
    () => options.filter((o) => `${o.label} ${o.keywords ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  );
  const toggle = (value: string): void =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const summary: ReactNode = selected.length === 0 ? allLabel : selected.length === 1 ? (options.find((o) => o.value === selected[0])?.label ?? summarise(1)) : summarise(selected.length);
  return (
    <Popover
      label={label}
      side="bottom"
      align="start"
      triggerClassName="flex h-7 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs hover:bg-accent"
      panelClassName="w-56"
      trigger={
        <>
          {icon}
          <span className="truncate">{summary}</span>
          <LuChevronDown aria-hidden className="h-3 w-3 shrink-0" />
        </>
      }
    >
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        className="mb-1 h-6 w-full rounded border border-input bg-background px-1.5 text-xs outline-none"
      />
      <ul className="max-h-56 overflow-auto">
        {shown.length === 0 ? <li className="px-2 py-1 text-xs text-muted-foreground">{emptyLabel}</li> : null}
        {shown.map((option) => (
          <li key={option.value}>
            <button type="button" onClick={() => toggle(option.value)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded border border-border">{selected.includes(option.value) ? <LuCheck className="h-3 w-3" /> : null}</span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.meta}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
