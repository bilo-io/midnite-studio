import {
  useEffect,
  useRef,
  type MutableRefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { LuMic, LuMicOff, LuSendHorizontal, LuSquare } from 'react-icons/lu';

import { useMicLevelBars, type LevelBars } from '../../features/companion/audio/waveform';
import { GRADIENT_FIELD_CLASSES } from '../gradient-field';
import { Tooltip } from '../tooltip';
import type { ComposerMic } from './use-composer-mic';

const MAX_TEXTAREA_HEIGHT = 160;

/** Box metrics shared by the textarea and its optional overlay — they must match to the pixel. */
const FIELD_METRICS = 'px-2 py-1.5 text-xs leading-relaxed';

/** Nine thin bars scaled 0..1 — the mic / speech level meter. */
export function LevelMeterBars({ bars, label, testId }: { bars: LevelBars; label: string; testId: string }) {
  return (
    <div role="img" aria-label={label} data-testid={testId} className="flex h-4 w-6 shrink-0 items-end justify-center gap-px">
      {bars.map((level, index) => (
        <span key={index} className="w-0.5 rounded-full bg-primary/70" style={{ height: `${Math.max(2, Math.round(level * 16))}px` }} />
      ))}
    </div>
  );
}

function MicMeter({ testId }: { testId: string }) {
  const bars = useMicLevelBars(true);
  return <LevelMeterBars bars={bars} label="Microphone level" testId={testId} />;
}

/**
 * The shared prompt box of every AI thread: a gradient-bordered, auto-growing
 * textarea with its controls INSIDE the box, in a row under the text: the
 * push-to-talk mic bottom-left, Send bottom-right.
 *
 * Slots: `above` (anchored popovers, e.g. slash commands), `leading` (shown
 * before the mic when it is idle — the Companion's speaking meter, an attach
 * menu) and `trailing` (after the mic, still on the left — e.g. a speech
 * on/off toggle).
 * `onKeyDown` runs first; if it calls `preventDefault` the composer's own
 * Enter-to-send is skipped.
 *
 * `streaming` + `onStop` (the Chats page): while a response is being written, a
 * Stop button appears IMMEDIATELY to the left of Send, in the same right-hand
 * group, so the two read as one control that swaps meaning as a turn starts and
 * ends. Send stays put (disabled by the caller's `canSend`), which is what keeps
 * Enter from firing a second turn on top of the first.
 */
export function AiComposer({
  value,
  onChange,
  onSend,
  canSend,
  placeholder,
  ariaLabel,
  rows = 1,
  disabled = false,
  enterToSend = true,
  sendAriaLabel = 'Send',
  dimmed = false,
  mic,
  onKeyDown,
  textareaRef,
  above,
  leading,
  trailing,
  sendTooltip,
  streaming = false,
  onStop,
  maxTextareaHeight = MAX_TEXTAREA_HEIGHT,
  testIdPrefix = 'ai-composer',
  className = '',
  boxClassName = 'gradient-border rounded-md',
  renderOverlay,
  onCaretChange,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  placeholder?: string;
  ariaLabel: string;
  rows?: number;
  /** Disable the textarea (Send and Mic stay as the caller dictates). */
  disabled?: boolean;
  /** Plain Enter sends (default). `false` makes Enter a newline and Cmd/Ctrl+Enter send. */
  enterToSend?: boolean;
  /** Accessible name of the send button, e.g. "Generate". */
  sendAriaLabel?: string;
  /** Dim the field without blocking typing (a turn is in flight). */
  dimmed?: boolean;
  /** Pass `useComposerMic(...)`; omit to hide the mic button. */
  mic?: ComposerMic;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  above?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  sendTooltip?: string;
  /** A response is being written: show Stop immediately left of Send (needs `onStop`). */
  streaming?: boolean;
  /** Stop the in-flight response. */
  onStop?: () => void;
  /** Tallest the auto-growing field gets before it scrolls. */
  maxTextareaHeight?: number;
  testIdPrefix?: string;
  className?: string;
  /** The gradient-border wrapper around the field (Media pages pass `MEDIA_PROMPT_BOX`). */
  boxClassName?: string;
  /**
   * Paint the text through a mirror layer instead of the textarea itself —
   * the Chats composer's pills. The textarea stays the real, editable field
   * (caret, selection, IME, undo) with transparent text; this layer sits
   * behind it with identical metrics and renders `value` however it likes, as
   * long as it adds no horizontal advance (a pill's padding is cancelled by a
   * negative margin), or the caret would drift off the painted glyphs.
   */
  renderOverlay?: (value: string) => ReactNode;
  /** Fired when the caret or selection may have moved (key, click, focus). */
  onCaretChange?: (caret: number) => void;
}) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const overlay = useRef<HTMLDivElement | null>(null);
  const setRef = (el: HTMLTextAreaElement | null) => {
    inner.current = el;
    if (typeof textareaRef === 'function') textareaRef(el);
    else if (textareaRef) (textareaRef as MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxTextareaHeight)}px`;
    if (overlay.current) overlay.current.scrollTop = el.scrollTop;
  }, [value, maxTextareaHeight]);

  const syncScroll = () => {
    if (overlay.current && inner.current) overlay.current.scrollTop = inner.current.scrollTop;
  };
  const reportCaret = () => {
    if (inner.current) onCaretChange?.(inner.current.selectionStart);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    // Enter that commits an IME composition (Japanese, Chinese, …) is not a send.
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && (enterToSend ? !event.shiftKey : event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className={`relative shrink-0 ${className}`} data-testid={`${testIdPrefix}`}>
      {above}
      <div className={`min-w-0 ${boxClassName} ${dimmed ? 'opacity-60' : ''}`}>
        <div className="flex flex-col rounded-md bg-background">
          <div className="relative">
            {renderOverlay ? (
              <div
                ref={overlay}
                aria-hidden
                data-testid={`${testIdPrefix}-overlay`}
                className={`${FIELD_METRICS} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-foreground [scrollbar-gutter:stable]`}
              >
                {renderOverlay(value)}
                {/* A trailing newline in a textarea still takes a line; the mirror needs one too. */}
                {'\n'}
              </div>
            ) : null}
            <textarea
              ref={setRef}
              value={value}
              onChange={(event) => {
                onChange(event.target.value);
                onCaretChange?.(event.target.selectionStart);
              }}
              onKeyDown={handleKeyDown}
              onKeyUp={reportCaret}
              onClick={reportCaret}
              onFocus={reportCaret}
              onSelect={reportCaret}
              onScroll={renderOverlay ? syncScroll : undefined}
              rows={rows}
              disabled={disabled}
              aria-label={ariaLabel}
              placeholder={placeholder}
              data-testid={`${testIdPrefix}-input`}
              className={`${GRADIENT_FIELD_CLASSES} ${FIELD_METRICS} block min-h-[28px] resize-none disabled:opacity-50 ${
                renderOverlay ? 'relative !bg-transparent !text-transparent [caret-color:hsl(var(--foreground))] [scrollbar-gutter:stable]' : ''
              }`}
            />
          </div>
          {/*
            Controls live INSIDE the box, under the text: the mic and any
            extras (attach, speech toggle) bottom-left, Send alone bottom-right.
          */}
          <div className="flex items-center gap-0.5 px-1 pb-1" data-testid={`${testIdPrefix}-controls`}>
            {mic?.held ? <MicMeter testId={`${testIdPrefix}-level-meter`} /> : leading}
            {mic ? (
              <Tooltip label={mic.available ? (mic.held ? 'Listening — release to send' : 'Hold to talk') : mic.reason}>
                <button
                  type="button"
                  aria-label="Hold to talk"
                  aria-disabled={mic.available ? undefined : true}
                  data-testid={`${testIdPrefix}-mic`}
                  onPointerDown={mic.pressStart}
                  className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                    mic.available
                      ? mic.held
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      : 'cursor-default text-muted-foreground/40'
                  }`}
                >
                  {mic.available ? <LuMic aria-hidden className="h-3.5 w-3.5" /> : <LuMicOff aria-hidden className="h-3.5 w-3.5" />}
                </button>
              </Tooltip>
            ) : null}
            {trailing}
            <span className="flex-1" aria-hidden />
            {streaming && onStop ? (
              <Tooltip label="Stop generating">
                <button
                  type="button"
                  aria-label="Stop"
                  data-testid={`${testIdPrefix}-stop`}
                  onClick={onStop}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LuSquare aria-hidden className="h-3 w-3 fill-current" />
                </button>
              </Tooltip>
            ) : null}
            <Tooltip label={sendTooltip ?? (canSend ? 'Send' : 'Send — type something first')}>
              <button
                type="button"
                aria-label={sendAriaLabel}
                aria-disabled={canSend ? undefined : true}
                data-testid={`${testIdPrefix}-send`}
                onClick={() => {
                  if (canSend) onSend();
                }}
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                  canSend ? 'text-primary hover:bg-accent hover:text-foreground' : 'cursor-default text-muted-foreground/40'
                }`}
              >
                <LuSendHorizontal aria-hidden className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
