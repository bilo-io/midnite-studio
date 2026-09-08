/**
 * The seams the companion's flow talks through — Phase 79 Themes D and E.
 *
 * The concierge script and the hand-off are the *spine* of this feature and
 * they landed before the voice half did (Theme F) and beside the panel (Theme
 * C). That is only possible if neither is reached for directly, so both sit
 * behind a port: speech behind {@link Speaker}, and the user's own input
 * behind the plain `submitCompanionInput` function in `runtime.ts`.
 *
 * The point is not abstraction for its own sake. It is that the whole flow —
 * greeting, overview, digest, intent, hand-off, read-back — is testable
 * without a `speechSynthesis` stub, without jsdom, and without a rendered
 * panel, because every one of those tests hands in a fake speaker and reads
 * the transcript back out of the store.
 */

export type SpeakOptions = {
  /**
   * Word-boundary progress, for Theme H's speaking pulse.
   *
   * Declared here rather than in Theme F so the port is stable before its
   * implementation exists: a boundary callback added later would be a
   * signature change across every call site.
   */
  onBoundary?: (charIndex: number) => void;
  /**
   * Cancels this utterance specifically.
   *
   * Separate from {@link Speaker.cancel}, which stops *everything* — the
   * difference matters for the interrupt path, where the flow needs to know
   * whether the line it was speaking was cut off (mark the turn
   * `spoken: false`) or finished (mark it `true`).
   */
  signal?: AbortSignal;
};

/**
 * Something that can read a line out loud.
 *
 * Theme F's `speaker.ts` implements this over `window.speechSynthesis` and
 * registers itself through `setCompanionSpeaker`. Until it does — and whenever
 * the user has voice switched off, which is the default — {@link silentSpeaker}
 * stands in, and the flow runs identically with every turn posted
 * `spoken: false`.
 */
export type Speaker = {
  /**
   * Speak `text`, resolving when it has finished or been cancelled.
   *
   * Never rejects. A synthesiser that is missing, muted or mid-cancel is a
   * turn that did not get read aloud, which the transcript already records —
   * not an error the flow has to branch on.
   */
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  /** Stop immediately and drop anything queued. */
  cancel(): void;
  /**
   * Whether this speaker actually produces audio.
   *
   * The flow reads it to decide whether a turn is marked `spoken`. Optional
   * because an implementation that omits it is assumed to be real — the
   * silent stand-in is the one that has to declare itself.
   */
  readonly available?: boolean;
};

/**
 * The stand-in: says nothing, resolves at once, and admits it.
 *
 * Not a `Speaker` that throws, and not `undefined`. A companion with no voice
 * is the **default configuration** of this feature, not a degraded one — the
 * panel is a chat thread that happens to be able to talk — so the no-audio
 * path has to be the ordinary path all the way through the flow rather than a
 * branch at every call site.
 */
export const silentSpeaker: Speaker = {
  speak: async () => {},
  cancel: () => {},
  available: false,
};
