import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { LuMic, LuMicOff, LuSendHorizontal } from 'react-icons/lu';

import { GRADIENT_FIELD_CLASSES } from '../../components/gradient-field';
import { Tooltip } from '../../components/tooltip';
import { useCompanionStore } from '../../store/companion-store';
import { companionPorts, setCompanionPorts } from './companion-ports';

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
 *   reason on hover rather than a silent grey button — `micAvailable()` and
 *   `micUnavailableReason()` are read through the port registry precisely so
 *   this file needs no knowledge of which provider or where its key lives.
 *   Read through `useSyncExternalStore`, not a plain call during render: this
 *   panel is a persistent dock that commonly stays mounted while Settings ▸
 *   Companion is where a key actually gets saved, and nothing about that save
 *   touches a prop or a store field this component renders from. A plain
 *   `companionPorts().micAvailable()` read once per render would show the
 *   stale answer until some *unrelated* re-render happened to occur — which
 *   for a panel that is just sitting open can be indefinitely. Subscribing is
 *   what makes the enable transition visible the moment it happens.
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
  reserveFabSpace = false,
  onInterrupt,
}: {
  /** True while `state === 'thinking'` — send is refused, typing is not. */
  disabled: boolean;
  /** Leaves the FAB's bottom-right corner clear — see `CompanionPanel`'s own prop. */
  reserveFabSpace?: boolean;
  /** Called on the first keypress and on a mic press, to cut off a spoken line. */
  onInterrupt: () => void;
}) {
  const [value, setValue] = useState('');
  const [micHeld, setMicHeld] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const micAvailable = useSyncExternalStore(
    (listener) => companionPorts().onMicAvailabilityChange(listener),
    () => companionPorts().micAvailable(),
  );
  /*
    A second, independent subscription rather than folding this into
    `micAvailable` above: the *reason* can change (`checking` → `no-key`, say)
    without the boolean ever flipping, and each `useSyncExternalStore` call
    re-renders on its own snapshot alone. One combined snapshot string would
    work too, but two plain reads say what each is for.
  */
  const micUnavailableReason = useSyncExternalStore(
    (listener) => companionPorts().onMicAvailabilityChange(listener),
    () => companionPorts().micUnavailableReason(),
  );

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

  /**
   * Empty Return confirms (Phase 81 Theme C) — but only while a `confirm`-tier
   * command is actually waiting, and only from the keyboard: the Send button
   * stays governed by `canSend` below (disabled, with the "type something
   * first" reason on hover), so a click there still does nothing on an empty
   * field. `useCompanionStore.getState()` rather than a subscription: this
   * only matters at the instant Return is pressed, and a component that
   * re-rendered on every `pendingAction` tick for a check made once per
   * keypress would be trading a read for nothing.
   */
  const confirmPending = (): boolean => {
    if (disabled || !useCompanionStore.getState().pendingAction) return false;
    companionPorts().submit('confirm');
    return true;
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
      if (value.trim().length === 0) {
        confirmPending();
        return;
      }
      send();
      return;
    }
    /*
      Space is push-to-talk **only while the textarea is empty** (Theme F) —
      the moment there is a draft it is a space, and a shortcut that ate one
      mid-sentence would be unusable. `event.repeat` is ignored because a held
      key autorepeats and only the first press starts anything.
    */
    if (event.key === ' ' && value.length === 0 && micAvailable && !micHeld && !event.repeat) {
      event.preventDefault();
      onInterrupt();
      setMicHeld(true);
      companionPorts().micPressStart();
      return;
    }
    // Any other keystroke is the user taking the floor.
    onInterrupt();
  };

  /*
    A transcript arrives from main (Theme F), and the phase requires it to land
    here **unsent** — the user reads it and presses Return. The textarea's
    value is this component's own `useState`, so the port is registered from
    here rather than by the voice module: it is the only writer there can be.
    Appended rather than replacing, so a transcript never eats something
    already typed.
  */
  useEffect(() => {
    setCompanionPorts({
      transcriptSink: (text) => {
        const trimmed = text.trim();
        if (trimmed.length === 0) return;
        setValue((current) => (current.length === 0 ? trimmed : `${current} ${trimmed}`));
        textareaRef.current?.focus();
      },
    });
    return () => setCompanionPorts({ transcriptSink: () => {} });
  }, []);

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
    /*
      Space release too, and on the window for the same reason a pointer
      release is: a keyup that arrives after focus has moved still has to stop
      the recorder, or a click away mid-utterance leaves it recording forever.
    */
    const keyRelease = (event: KeyboardEvent) => {
      if (event.key === ' ') release();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('keyup', keyRelease);
    // A window that loses focus mid-press never sees the release at all.
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('keyup', keyRelease);
      window.removeEventListener('blur', release);
    };
  }, [micHeld]);

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div
      className={`shrink-0 border-t border-border bg-card/40 p-2 ${
        reserveFabSpace ? 'pr-14' : ''
      }`}
    >
      <div className="flex items-end gap-1.5">
        {/*
          The same `.gradient-border` treatment as the repos panel's own
          filter box (`repos-panel.tsx`) — a borderless field with the conic
          ring living on this wrapper, lighting up on `:focus-within` rather
          than the field's own `:focus`. `min-w-0` because this sits beside a
          `shrink-0` button cluster in a flex row and a bare `w-full` on a
          flex item does not stop it fighting that sibling for space the way
          it does in a block-level parent.

          Dimmed rather than disabled while `disabled` (the companion is
          `thinking`): the prop's own contract is "send is refused, typing is
          not" — a native `disabled` textarea would block the very typing
          that is still allowed, so the opacity is the only cue, matching the
          send button's own dimmed-not-dead treatment below.
        */}
        <div
          className={`min-w-0 flex-1 gradient-border rounded-md ${disabled ? 'opacity-60' : ''}`}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            aria-label="Message the companion"
            placeholder="Ask for a task, or say hello…"
            data-testid="companion-input"
            className={`${GRADIENT_FIELD_CLASSES} block min-h-[28px] resize-none px-2 py-1.5 text-xs leading-relaxed`}
          />
        </div>
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
                : micUnavailableReason
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
