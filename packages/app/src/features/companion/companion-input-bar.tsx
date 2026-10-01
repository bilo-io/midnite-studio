import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { AiComposer, LevelMeterBars, useComposerMic } from '../../components/ai-thread';
import { useDismissable } from '../../components/use-dismissable';
import { useCompanionStore } from '../../store/companion-store';
import { useCompanionSpeakingLevelBars } from './audio/waveform';
import { companionPorts, setCompanionPorts } from './companion-ports';
import {
  filterSlashCommands,
  runSlashCommand,
  slashInsertText,
  type SlashCommandItem,
} from './slash-commands';

/**
 * The "/" popover's own trigger grammar: the *whole* textarea value is a
 * slash plus a run of non-space characters — no leading text, no space yet.
 * `Text before it ("please /exec")` and `text after a completed token
 * ("/exec ")` both fall through to plain typing, which is what closes the
 * popover the instant a skill's inserted phrase gets its own trailing word.
 */
const SLASH_TRIGGER = /^\/(\S*)$/;

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
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /*
    Derived from `value` on every render rather than a second piece of state
    kept in sync with it — `value` already changes from three places (typing,
    `transcriptSink`, `send`/Escape clearing it), and a query string that
    read stale after any one of them would be a bug all its own. Cheap:
    `filterSlashCommands` scores at most a few dozen items.
  */
  const slashQuery = SLASH_TRIGGER.exec(value)?.[1] ?? null;
  const slashItems = slashQuery === null ? [] : filterSlashCommands(slashQuery);
  /*
    The draft a click-away or focus-away dismissed the list for. Keyed on the
    text rather than a boolean so the next keystroke brings the list back on
    its own — it is still derived from `value`, just not for this exact draft.
  */
  const [slashDismissedFor, setSlashDismissedFor] = useState<string | null>(null);
  const slashListRef = useRef<HTMLDivElement>(null);
  const slashOpen = slashItems.length > 0 && slashDismissedFor !== value;
  // Outside `pointerdown` and focus leaving the textarea-plus-list close it,
  // as every other gradient-border list does. Escape and Tab stay the
  // textarea's own (`onKeyDown` below), so the hook takes neither.
  useDismissable({
    open: slashOpen,
    surfaceRef: slashListRef,
    trigger: textareaRef,
    escape: false,
    tab: 'none',
    onDismiss: () => setSlashDismissedFor(value),
  });
  const slashSelected = Math.min(slashIndex, Math.max(slashItems.length - 1, 0));

  // A fresh filter always highlights its own top match, not wherever the
  // previous (longer or shorter) list happened to leave the cursor.
  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  const acceptSlashItem = (item: SlashCommandItem): void => {
    const insert = slashInsertText(item);
    if (insert === null) {
      // `command`/`control`: runs now, through the same ports a typed or
      // spoken line already reaches — nothing is left in the box.
      setValue('');
      runSlashCommand(item);
      return;
    }
    // `skill`: still needs a free-text argument, so it replaces the "/query"
    // token with the canonical phrase and a trailing space, unsent.
    setValue(insert);
    textareaRef.current?.focus();
  };
  const mic = useComposerMic({ onInterrupt });
  /*
    The two level meters (Ad Hoc: companion input + voice improvements) —
    mutually exclusive in practice (a mic press already interrupts any
    speech, `onInterrupt` above), but read independently rather than as one
    "active engine" union so each stays a one-line call at its own render
    site. See `audio/waveform.ts`'s module doc for the reduced-motion, window-
    focus and system-TTS-engine fallbacks both already apply.
  */
  const speaking = useCompanionStore((state) => state.state === 'speaking');
  const speakingLevels = useCompanionSpeakingLevelBars(speaking);

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
    /*
      The "/" popover's own keyboard surface, checked before any of the
      textarea's own bindings below — while it is open, Up/Down/Tab/Enter
      belong to the list, not to sending or newlining, and Escape closes only
      the popover (the repo's one-Escape-per-surface convention, Phase 62):
      it does not also clear the draft or interrupt speech the way a bare
      Escape does. Typing keeps re-filtering through `slashQuery`/`slashItems`
      above; nothing here needs to touch `value` for that.
    */
    if (slashOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSlashIndex((current) => Math.min(current + 1, slashItems.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSlashIndex((current) => Math.max(current - 1, 0));
        return;
      }
      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        const item = slashItems[slashSelected];
        if (item) acceptSlashItem(item);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        // Closing is just "stop matching" — deleting back past the slash
        // (or past the query) already does that on its own; this covers the
        // case where the user wants the "/…" text itself gone too.
        setValue('');
        return;
      }
    }
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
    if (event.key === ' ' && value.length === 0 && mic.available && !mic.held && !event.repeat) {
      event.preventDefault();
      mic.pressStart();
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

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div
      className={`relative shrink-0 border-t border-border bg-card/40 p-2 ${
        reserveFabSpace ? 'pr-14' : ''
      }`}
    >
      {/*
        The "/" popover — anchored to this bar (not the textarea directly,
        which grows) and opening upward: the bar is docked at the panel's own
        bottom, so a downward list would run off the panel. Small and capped
        at `filterSlashCommands`' own `limit` (8), per the ad hoc's own
        "keep them small and inline" instruction — this is a combobox for a
        docked textarea, not the `Mod+K` palette, so it is not built from
        that component: `Popover` (`components/popover.tsx`) owns a click
        trigger and a focus trap, both wrong here — the textarea must keep
        focus and keyboard input the whole time this is open. The visual
        language (gradient border, `bg-popover`, `z-popover`) is copied from
        it anyway, and the row layout/labels mirror `components/palette.tsx`'s.
      */}
      {slashOpen ? (
        <div
          ref={slashListRef}
          role="listbox"
          aria-label="Slash commands"
          data-testid="companion-slash-popover"
          className="gradient-border gradient-border--always absolute bottom-full left-2 right-2 z-popover mb-1 max-h-64 animate-fade-in overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        >
          {slashItems.map((item, index) => (
            <div
              key={item.id}
              role="option"
              aria-selected={index === slashSelected}
              data-testid={`companion-slash-item-${item.id}`}
              onMouseEnter={() => setSlashIndex(index)}
              // `onMouseDown` + `preventDefault`, not `onClick`: a click fires
              // after the browser has already tried to move focus off the
              // textarea to this (unfocusable) row, and on some platforms
              // that alone blurs it before `onClick` runs. Preventing default
              // on `mousedown` is what keeps focus — and the caret position
              // `acceptSlashItem` relies on — right where it was.
              onMouseDown={(event) => {
                event.preventDefault();
                acceptSlashItem(item);
              }}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1 text-xs transition-colors ${
                index === slashSelected
                  ? 'bg-accent text-foreground'
                  : 'text-foreground hover:bg-accent/60'
              }`}
            >
              {/*
                `shrink-0` on the label, `min-w-0 flex-1` on the description:
                without an explicit basis, a flex row's default `shrink` is
                equal on both children, and truncation was landing on the
                short label — "Backlog Task" cut to "Backlog …" — while the
                long description had barely started giving up space. The
                label is the thing a row is picked by; it never truncates.
              */}
              <span className="shrink-0 font-medium">{item.label}</span>
              <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
                {item.description}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <AiComposer
        value={value}
        onChange={setValue}
        onSend={send}
        canSend={canSend}
        ariaLabel="Message the companion"
        placeholder="Ask for a task, or say hello…"
        dimmed={disabled}
        mic={mic}
        onKeyDown={onKeyDown}
        textareaRef={textareaRef}
        testIdPrefix="companion"
        sendTooltip={
          canSend
            ? 'Send'
            : value.trim().length === 0
              ? 'Send — type something first'
              : 'Send — wait for the current turn to finish'
        }
        leading={
          speaking ? (
            <LevelMeterBars bars={speakingLevels} label="Companion speaking level" testId="companion-level-meter" />
          ) : null
        }
      />
    </div>
  );
}
