import { useCompanionStore } from '../../store/companion-store';

/**
 * The seam between the companion **panel** (Phase 79 Theme C) and the three
 * behaviours that arrive in later themes — the concierge flow and the
 * hand-off (Theme D/E), and voice (Theme F/G).
 *
 * A module-level registry with no-op defaults rather than a prop drilled down
 * from `app.tsx`, for two reasons that both come from those themes landing in
 * *separate PRs*:
 *
 * - **The panel has to be complete on its own.** Theme C ships a thread, an
 *   input bar and a mic button before there is a speaker to interrupt or a
 *   recorder to press. Every one of those controls needs somewhere to send its
 *   gesture today, and `() => {}` is an honest answer where a `?.` on a prop
 *   that does not exist yet is a hole the typechecker cannot see.
 * - **A later theme must not have to edit the panel to plug in.** `speaker.ts`
 *   and `concierge.ts` are files this PR deliberately does not create. They
 *   register themselves here — one call, at module scope or from an effect —
 *   and the panel's internals stay closed to them.
 *
 * Registering is **merge, not replace**: three separate modules each own two or
 * three members, and `setCompanionPorts` is called once per module.
 */
export type CompanionPorts = {
  /**
   * The input bar's submit, and (Theme F) a finished transcript the user has
   * accepted. Theme E parses it into a `CompanionIntent` and routes it.
   *
   * **Owns the whole turn lifecycle.** The default below posts the user's turn
   * into the transcript and stops there, so the panel is usable and testable
   * before Theme E lands — but a registered `submit` posts its own turn and
   * the panel stops doing it, or every message would appear twice.
   */
  submit: (text: string) => void;
  /**
   * Theme D's `greet()`. The panel calls it when it opens from `idle`, once
   * per open — not on every render, and not while the machine is mid-anything.
   */
  greet: () => void;
  /**
   * Cancel whatever is being said or played right now: `speechSynthesis.cancel()`
   * (Theme F), the filler scheduler and any audio (Theme G).
   *
   * The panel calls this on Escape inside the thread and on a mic press,
   * which is the phase's "every scripted turn is interruptible" rule seen
   * from the surface that has the keyboard.
   */
  interrupt: () => void;
  /** Re-speak the last companion turn — the assistant popover's "Repeat" row (Theme E's `repeat` intent). */
  repeat: () => void;
  /** Push-to-talk down. Theme F starts `MediaRecorder` here. */
  micPressStart: () => void;
  /** Push-to-talk up. Theme F stops the recorder and sends the blob to be transcribed. */
  micPressEnd: () => void;
  /**
   * Whether speech-to-text is actually available — a provider chosen and a key
   * stored (Theme F). `false` keeps the mic button `disabled` with the
   * "Add a speech key in Settings ▸ Companion" reason, which is the state it
   * ships in.
   *
   * A function rather than a boolean because it is read at render time from a
   * store this module must not import: the registry is written once at module
   * scope, and a boolean captured there would be the value at import time
   * forever.
   */
  micAvailable: () => boolean;
  /**
   * Why `micAvailable()` answers `false` right now, as a sentence a tooltip
   * can show verbatim — "no key stored" and "a key is stored for a provider
   * that isn't implemented yet" are different problems with different fixes,
   * and a user told to do a thing they already did cannot act on it. Read
   * only while `micAvailable()` is `false`; its answer while available is
   * unspecified.
   */
  micUnavailableReason: () => string;
  /**
   * Subscribe to `micAvailable()`'s answer changing, and get an unsubscribe
   * back.
   *
   * `micAvailable()` alone is enough for a value read fresh on every render,
   * but the panel is a persistent dock that very often stays mounted while
   * Settings ▸ Companion is where the change actually happens — saving a key
   * does not touch a prop or a store field the input bar renders from, so
   * nothing would otherwise tell React to look again. This is that signal.
   */
  onMicAvailabilityChange: (listener: () => void) => () => void;
  /**
   * Where a finished transcript lands (Theme F).
   *
   * **Registered by the input bar, not by a later theme** — the exception to
   * this registry's usual direction, and for a concrete reason: the phase
   * requires transcript text to arrive in the textarea *unsent*, so the user
   * reads it and presses Return. The textarea's value is `useState` inside
   * `CompanionInputBar`, which is the only place that can write it, while the
   * thing holding the transcript is `voice-ports.ts` in the main process's
   * reply path. One of them has to reach the other, and a registry that
   * already exists beats a second mechanism.
   *
   * The default is a no-op, so a transcript arriving with no panel mounted is
   * dropped rather than queued for a textarea that may never exist.
   */
  transcriptSink: (text: string) => void;
};

/**
 * What the panel gets before anything registers.
 *
 * `submit` is the only one that does real work, and only the part that cannot
 * wait: a message the user typed has to appear in the thread, or the input bar
 * looks broken. Everything else is genuinely nothing — there is no voice to
 * stop and no recorder to start until Theme F.
 */
const DEFAULT_PORTS: CompanionPorts = {
  submit: (text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    useCompanionStore.getState().addTurn({ role: 'user', text: trimmed, spoken: false });
  },
  greet: () => {},
  interrupt: () => {},
  repeat: () => {},
  micPressStart: () => {},
  micPressEnd: () => {},
  micAvailable: () => false,
  micUnavailableReason: () => 'Hold to talk — add a speech key in Settings ▸ Companion',
  onMicAvailabilityChange: () => () => {},
  transcriptSink: () => {},
};

let ports: CompanionPorts = { ...DEFAULT_PORTS };

/** Merge implementations in. Called once per registering module (Theme D/E, Theme F/G). */
export function setCompanionPorts(partial: Partial<CompanionPorts>): void {
  ports = { ...ports, ...partial };
}

/**
 * What the panel calls. Every member is always defined, so no call site needs
 * a guard — that is the whole point of a registry over an optional prop.
 */
export function companionPorts(): CompanionPorts {
  return ports;
}

/** Tests only: put the registry back to its no-op defaults between cases. */
export function resetCompanionPorts(): void {
  ports = { ...DEFAULT_PORTS };
}
