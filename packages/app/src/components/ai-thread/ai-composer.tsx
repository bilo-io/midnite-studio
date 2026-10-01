import {
  useEffect,
  useRef,
  type MutableRefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { LuMic, LuMicOff, LuSendHorizontal } from 'react-icons/lu';

import { useMicLevelBars, type LevelBars } from '../../features/companion/audio/waveform';
import { GRADIENT_FIELD_CLASSES } from '../gradient-field';
import { Tooltip } from '../tooltip';
import type { ComposerMic } from './use-composer-mic';

const MAX_TEXTAREA_HEIGHT = 160;

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
 * textarea with a push-to-talk mic and a send button.
 *
 * Slots: `above` (anchored popovers, e.g. slash commands), `leading` (shown
 * before the buttons when the mic is idle — the Companion's speaking meter) and
 * `trailing` (extra controls after Send — e.g. a speech on/off toggle).
 * `onKeyDown` runs first; if it calls `preventDefault` the composer's own
 * Enter-to-send is skipped.
 */
export function AiComposer({
  value,
  onChange,
  onSend,
  canSend,
  placeholder,
  ariaLabel,
  rows = 1,
  dimmed = false,
  mic,
  onKeyDown,
  textareaRef,
  above,
  leading,
  trailing,
  sendTooltip,
  testIdPrefix = 'ai-composer',
  className = '',
  boxClassName = 'gradient-border rounded-md',
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  placeholder?: string;
  ariaLabel: string;
  rows?: number;
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
  testIdPrefix?: string;
  className?: string;
  /** The gradient-border wrapper around the field (Media pages pass `MEDIA_PROMPT_BOX`). */
  boxClassName?: string;
}) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const setRef = (el: HTMLTextAreaElement | null) => {
    inner.current = el;
    if (typeof textareaRef === 'function') textareaRef(el);
    else if (textareaRef) (textareaRef as MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className={`relative shrink-0 ${className}`} data-testid={`${testIdPrefix}`}>
      {above}
      <div className="flex items-end gap-1.5">
        <div className={`min-w-0 flex-1 ${boxClassName} ${dimmed ? 'opacity-60' : ''}`}>
          <textarea
            ref={setRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={rows}
            aria-label={ariaLabel}
            placeholder={placeholder}
            data-testid={`${testIdPrefix}-input`}
            className={`${GRADIENT_FIELD_CLASSES} block min-h-[28px] resize-none px-2 py-1.5 text-xs leading-relaxed`}
          />
        </div>
        <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
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
          <Tooltip label={sendTooltip ?? (canSend ? 'Send' : 'Send — type something first')}>
            <button
              type="button"
              aria-label="Send"
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
          {trailing}
        </div>
      </div>
    </div>
  );
}
