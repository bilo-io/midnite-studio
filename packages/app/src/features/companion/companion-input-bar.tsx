import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { LuMic, LuMicOff, LuSendHorizontal } from 'react-icons/lu';

import { Tooltip } from '../../components/tooltip';
import { companionPorts } from './companion-ports';

/** How tall the textarea may grow before it starts scrolling instead. */
const MAX_TEXTAREA_HEIGHT = 160;

/**
 * The docked bar at the bottom of the companion panel (Phase 79 Theme C).
 *
 * Three controls, and each one's disabled state says something specific:
 *
 * - **The textarea.** Return sends, Shift+Return newlines — the convention
 *   every chat surface uses, and the one an agent prompt needs (a multi-line
 *   request is normal here). It grows with its content up to
 *   {@link MAX_TEXTAREA_HEIGHT} and scrolls past that, so a long paste cannot
 *   eat the thread.
 * - **The mic.** Disabled until Theme F's provider is configured, with the
 *   reason on hover rather than a silent grey button — `micAvailable()` is read
 *   through the port registry precisely so this file needs no knowledge of
 *   which provider or where its key lives.
 * - **Send.** Disabled on an empty input, and while `thinking`: the companion
 *   is mid-turn, and Decision 10 makes a second command a scripted refusal
 *   rather than a queued one.
 *
 * **Escape clears the textarea; it does not close the panel.** The panel is a
 * layout column, not an overlay (Phase 62's stack owns overlays), and Escape
 * inside a text field means "undo what I was typing" everywhere else in this
 * app. It also interrupts whatever is being spoken, which is the phase's
 * "every scripted turn is interruptible" rule reaching the keyboard.
 */
export function CompanionInputBar({
  disabled,
  onInterrupt,
}: {
  /** True while `state === 'thinking'` — send is refused, typing is not. */
  disabled: boolean;
  /** Called on the first keypress and on a mic press, to cut off a spoken line. */
  onInterrupt: () => void;
}) {
  const [value, setValue] = useState('');
  const [micHeld, setMicHeld] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const micAvailable = companionPorts().micAvailable();

  /*
    Autogrow. Reset to `auto` before reading `scrollHeight` — without it the
    element never shrinks again, because `scrollHeight` of a box with an
    explicit height is that height.
  */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  const send = () => {
    const text = value.trim();
    if (text.length === 0 || disabled) return;
    setValue('');
    companionPorts().submit(text);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      /*
        Stop the propagation, always — `useDismiss` (Phase 62) puts a
        window-level Escape handler on top of whatever overlay is open, and an
        Escape aimed at this textarea must not also dismiss something behind
        the panel. `preventDefault` too, so a browser-level "revert the field"
        does not fight the explicit clear below.
      */
      event.preventDefault();
      event.stopPropagation();
      onInterrupt();
      setValue('');
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
      return;
    }
    // Any other keystroke is the user taking the floor.
    onInterrupt();
  };

  /*
    Push-to-talk, not click-to-record: the mic is held down for as long as you
    are speaking, which is the gesture with no "did it hear me stop?" failure
    mode. `onPointerUp` on the WINDOW rather than the button, because a press
    that starts on the button and releases anywhere else still has to stop the
    recorder — otherwise a drag off the button leaves it recording forever.
  */
  useEffect(() => {
    if (!micHeld) return undefined;
    const release = () => {
      setMicHeld(false);
      companionPorts().micPressEnd();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [micHeld]);

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="shrink-0 border-t border-border bg-card/40 p-2">
      <div className="flex items-end gap-1.5">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          aria-label="Message the companion"
          placeholder="Ask for a task, or say hello…"
          data-testid="companion-input"
          className="min-h-[28px] w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
          {/*
            Plain buttons wrapped in `Tooltip` rather than `IconButton`, and
            only because of the gesture: push-to-talk needs `onPointerDown`,
            which `IconButtonProps` does not forward (it takes `onClick`
            alone, deliberately). Both keep `IconButton`'s own convention for
            an explained disable — `aria-disabled` with the reason on hover,
            not the native `disabled` attribute, which suppresses pointer
            events and so silences the tooltip on the one state that most
            needs explaining.
          */}
          <Tooltip
            label={
              micAvailable
                ? micHeld
                  ? 'Listening — release to send'
                  : 'Hold to talk'
                : 'Hold to talk — add a speech key in Settings ▸ Companion'
            }
          >
            <button
              type="button"
              aria-label="Hold to talk"
              aria-disabled={micAvailable ? undefined : true}
              data-testid="companion-mic"
              onPointerDown={() => {
                if (!micAvailable) return;
                onInterrupt();
                setMicHeld(true);
                companionPorts().micPressStart();
              }}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                micAvailable
                  ? micHeld
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  : 'cursor-default text-muted-foreground/40'
              }`}
            >
              {micAvailable ? (
                <LuMic aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <LuMicOff aria-hidden className="h-3.5 w-3.5" />
              )}
            </button>
          </Tooltip>
          <Tooltip
            label={
              canSend
                ? 'Send'
                : value.trim().length === 0
                  ? 'Send — type something first'
                  : 'Send — wait for the current turn to finish'
            }
          >
            <button
              type="button"
              aria-label="Send"
              aria-disabled={canSend ? undefined : true}
              data-testid="companion-send"
              onClick={send}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                canSend
                  ? 'text-primary hover:bg-accent hover:text-foreground'
                  : 'cursor-default text-muted-foreground/40'
              }`}
            >
              <LuSendHorizontal aria-hidden className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
