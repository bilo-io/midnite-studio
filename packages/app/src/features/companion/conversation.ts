import {
  COMPANION_TUNE_QUESTIONS,
  COMPANION_TUNE_TARGET_SPOKEN,
  buildPersonaFromAnswers,
  classifyTuneReply,
  parseWakePhrase,
  type CompanionPersonaReply,
  type CompanionTuneAnswers,
  type CompanionTuneTarget,
} from '@midnite/studio-shared';

import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { isElevatorPlaying } from './audio/elevator';
import { encodeWav } from './audio/wav';
import {
  RecorderError,
  cancelRecording,
  classifyMediaError,
  isRecording,
  recorderErrorMessage,
  transcribe as transcribeBlob,
} from './recorder';
import { companionTtsSpeaker } from './speaker';
import { describeMicFailure, reportVoiceError } from './voice-ports';

/**
 * Conversation mode: the composer's second voice control.
 *
 * Push-to-talk (`voice-ports.ts`) captures one held press and leaves the text
 * in the box unsent. With conversation mode on, the mic stays open, each
 * phrase is cut off at the pause that ends it, transcribed through the same
 * `mstudio:companion:transcribe` path, and handed to the composer that owns
 * the session — which sends it straight away (`AiComposer`'s auto-send). The
 * next phrase needs no press.
 *
 * Three pieces, each separately testable:
 *
 * - {@link createUtteranceSegmenter} — pure. Frames of samples in, "speech
 *   started" and finished utterances out. An adaptive noise floor rather than
 *   a fixed level, because a laptop mic in a quiet room and the same mic next
 *   to a fan differ by an order of magnitude.
 * - {@link openConversationCapture} — the one `getUserMedia` stream and a
 *   `ScriptProcessorNode` tap, which delivers every buffer (an analyser can
 *   only be polled, and a poll drops whatever arrived between two ticks).
 * - the session — at most one, owned by one composer at a time. The setting
 *   is shared, but the microphone is one device, so whichever composer the
 *   user last started listening from owns it.
 *
 * **Two triggers** (`voiceConversationTrigger`). `always` sends every phrase.
 * `wake` sends only a phrase addressed to the companion by one of the user's
 * own `companionNames` — "Companion, open the pull request" sends "open the
 * pull request" — and a name said on its own arms the *next* phrase for
 * {@link WAKE_FOLLOW_UP_MS}, so "Companion." … "open the pull request" works
 * the way a person would say it. Everything else the mic hears is dropped
 * after transcription, unsent and unshown.
 *
 * **Half-duplex.** While the companion is speaking (or its elevator music is
 * playing), frames are ignored rather
 * than segmented, so a spoken reply is never transcribed back as the user's
 * next message. Echo cancellation would cover the same ground only for audio
 * Chromium itself plays, which the system `speechSynthesis` voice is not.
 */

// --- the segmenter ----------------------------------------------------------

export type SegmenterOptions = {
  sampleRate: number;
  /** Silence after speech that ends a phrase. Long enough for a breath, short enough to feel live. */
  endSilenceMs?: number;
  /** Sustained speech before a phrase counts as started — a click or a key is shorter. */
  startSpeechMs?: number;
  /** Audio kept from before the onset, so the first syllable is not clipped. */
  preRollMs?: number;
  /** A monologue is cut here; the rest carries on as the next phrase. Whisper's own window is 30 s. */
  maxUtteranceMs?: number;
  /** A phrase with less speech than this is a cough, not something to send. */
  minSpeechMs?: number;
  /** No RMS below this is ever speech, however quiet the room has measured. */
  minThreshold?: number;
};

export type SegmenterOutput = {
  /** Speech just started — the moment to show "listening". */
  onset: boolean;
  /** A finished phrase, ready to encode. */
  utterance: Float32Array | null;
};

export type UtteranceSegmenter = {
  /** Feed one frame. `gated` (the companion is speaking) drops the frame and any phrase in progress. */
  push: (frame: Float32Array, gated?: boolean) => SegmenterOutput;
  /** Whether a phrase is in progress. */
  inSpeech: () => boolean;
};

export const CONVERSATION_DEFAULTS = {
  endSilenceMs: 1000,
  startSpeechMs: 150,
  preRollMs: 300,
  maxUtteranceMs: 28_000,
  minSpeechMs: 300,
  minThreshold: 0.012,
} as const;

/** How far above the room's own level a frame must be to count as speech. */
const NOISE_MULTIPLIER = 3;
/**
 * The noise floor drops to a quieter frame quickly and creeps up to a louder
 * one slowly: a fan that was always there is learned within a few seconds,
 * while the first syllables of speech barely move it.
 */
const NOISE_FALL = 0.5;
const NOISE_RISE = 0.01;

function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < frame.length; index += 1) sum += frame[index]! * frame[index]!;
  return Math.sqrt(sum / frame.length);
}

function concat(frames: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(frames.reduce((total, frame) => total + frame.length, 0));
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}

export function createUtteranceSegmenter(options: SegmenterOptions): UtteranceSegmenter {
  const settings = { ...CONVERSATION_DEFAULTS, ...options };
  let noiseFloor: number | null = null;
  let preRoll: Float32Array[] = [];
  let preRollSamples = 0;
  let speechRunMs = 0;
  let utterance: Float32Array[] | null = null;
  let utteranceMs = 0;
  let speechMs = 0;
  let silenceMs = 0;

  const reset = (): void => {
    preRoll = [];
    preRollSamples = 0;
    speechRunMs = 0;
    utterance = null;
    utteranceMs = 0;
    speechMs = 0;
    silenceMs = 0;
  };

  const finish = (): Float32Array | null => {
    const frames = utterance;
    const enough = speechMs >= settings.minSpeechMs;
    utterance = null;
    utteranceMs = 0;
    speechMs = 0;
    silenceMs = 0;
    return frames !== null && enough ? concat(frames) : null;
  };

  return {
    inSpeech: () => utterance !== null,
    push: (frame, gated = false) => {
      const none: SegmenterOutput = { onset: false, utterance: null };
      if (gated) {
        reset();
        return none;
      }

      const frameMs = (frame.length / settings.sampleRate) * 1000;
      const level = rms(frame);
      // The very first frame is taken as the room — a session opens on a
      // click, not mid-sentence — so a noisy room is never mistaken for
      // someone talking from the start.
      noiseFloor ??= level;
      const threshold = Math.max(settings.minThreshold, noiseFloor * NOISE_MULTIPLIER);
      const loud = level > threshold;

      if (utterance === null) {
        // Between phrases: the room sets the floor, and recent audio is kept
        // as pre-roll for whichever frame turns out to be the onset.
        noiseFloor += (level - noiseFloor) * (level < noiseFloor ? NOISE_FALL : NOISE_RISE);
        preRoll.push(frame);
        preRollSamples += frame.length;
        const keep = (settings.preRollMs / 1000) * settings.sampleRate;
        while (preRoll.length > 1 && preRollSamples - preRoll[0]!.length >= keep) {
          preRollSamples -= preRoll.shift()!.length;
        }

        speechRunMs = loud ? speechRunMs + frameMs : 0;
        if (speechRunMs < settings.startSpeechMs) return none;

        utterance = preRoll;
        utteranceMs = (preRollSamples / settings.sampleRate) * 1000;
        speechMs = speechRunMs;
        silenceMs = 0;
        preRoll = [];
        preRollSamples = 0;
        speechRunMs = 0;
        return { onset: true, utterance: null };
      }

      utterance.push(frame);
      utteranceMs += frameMs;
      if (loud) {
        speechMs += frameMs;
        silenceMs = 0;
      } else {
        silenceMs += frameMs;
      }

      if (silenceMs >= settings.endSilenceMs) return { onset: false, utterance: finish() };
      if (utteranceMs >= settings.maxUtteranceMs) {
        // Cut the monologue here and keep listening: the speaker has not
        // stopped, so the next frame is already part of the next phrase.
        const cut = finish();
        utterance = [];
        return { onset: false, utterance: cut };
      }
      return none;
    },
  };
}

// --- the capture ------------------------------------------------------------

export type ConversationCapture = {
  stream: MediaStream;
  sampleRate: number;
  close: () => void;
};

/** Frames of ~43 ms at 48 kHz: fine enough for a one-second pause, cheap enough to run on the main thread. */
const CAPTURE_FRAME_SIZE = 2048;

/**
 * Open the microphone once for the whole session.
 *
 * Audio only, for the same reason `recorder.ts` gives: main's permission
 * handler grants exactly `['audio']`. Throws {@link RecorderError} with the
 * same kinds push-to-talk reports, so a refusal reads the same either way.
 */
export async function openConversationCapture(
  onFrame: (frame: Float32Array) => void,
): Promise<ConversationCapture> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof AudioContext !== 'function') {
    throw new RecorderError('unsupported', recorderErrorMessage('unsupported'));
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    const kind = classifyMediaError(error);
    throw new RecorderError(kind, recorderErrorMessage(kind));
  }

  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(CAPTURE_FRAME_SIZE, 1, 1);
  // A processor only runs while it reaches the destination; a muted gain
  // gets it there without playing the mic back over the speakers.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  processor.onaudioprocess = (event) => {
    onFrame(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);
  void ctx.resume().catch(() => {});

  return {
    stream,
    sampleRate: ctx.sampleRate,
    close: () => {
      processor.onaudioprocess = null;
      try {
        source.disconnect();
        processor.disconnect();
        mute.disconnect();
      } catch {
        // Already torn down.
      }
      for (const track of stream.getTracks()) track.stop();
      void ctx.close().catch(() => {});
    },
  };
}

// --- the session ------------------------------------------------------------

/** One composer's claim on the session. Compared by identity. */
export type ConversationOwner = {
  /** Put a finished phrase in this composer, which then sends it. */
  deliver: (text: string) => void;
};

export type ConversationDeps = {
  openCapture: (onFrame: (frame: Float32Array) => void) => Promise<ConversationCapture>;
  transcribe: (blob: Blob) => ReturnType<typeof transcribeBlob>;
  isSpeaking: () => boolean;
  segmenterOptions?: Omit<SegmenterOptions, 'sampleRate'>;
  /** Defaults to {@link WAKE_FOLLOW_UP_MS}. */
  wakeFollowUpMs?: number;
};

const defaultDeps = (): ConversationDeps => ({
  openCapture: openConversationCapture,
  transcribe: (blob) => transcribeBlob(blob),
  // The elevator music fills the companion's thinking time, which is exactly
  // when an open mic would otherwise transcribe it as the next request.
  isSpeaking: () => companionTtsSpeaker.isSpeaking() || isElevatorPlaying(),
});

let deps: ConversationDeps = defaultDeps();

/** How long a wake word said on its own keeps the next phrase armed. */
export const WAKE_FOLLOW_UP_MS = 8000;

type Session = {
  owner: ConversationOwner;
  /** `wake` trigger: the name was said on its own, and the next phrase is the command. */
  armed: ReturnType<typeof setTimeout> | null;
  /** The last phrase failed to transcribe; the failure has been reported once. */
  failing: boolean;
  capture: ConversationCapture | null;
  segmenter: UtteranceSegmenter | null;
  /** Phrases are transcribed and delivered in the order they were spoken. */
  queue: Promise<void>;
};

let session: Session | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** The composer currently listening, or `null`. A `useSyncExternalStore` snapshot. */
export function conversationOwner(): ConversationOwner | null {
  return session?.owner ?? null;
}

export function subscribeConversation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The live stream, for the composer's level meter. */
export function getConversationStream(): MediaStream | null {
  return session?.capture?.stream ?? null;
}

/** Whether the session is waiting for the command that follows a lone wake word. */
export function conversationArmed(): boolean {
  return session?.armed != null;
}

/** Leave `listening` only if this session put the companion there — never a turn it is thinking about. */
function settleListening(): void {
  const store = useCompanionStore.getState();
  if (store.state === 'listening') store.send('settle');
}

function disarm(owned: Session): void {
  if (owned.armed === null) return;
  clearTimeout(owned.armed);
  owned.armed = null;
  notify();
}

function arm(owned: Session): void {
  disarm(owned);
  owned.armed = setTimeout(() => {
    owned.armed = null;
    settleListening();
    notify();
  }, deps.wakeFollowUpMs ?? WAKE_FOLLOW_UP_MS);
  // The companion's own "I'm listening" glow is the acknowledgement.
  useCompanionStore.getState().send('listen');
  notify();
}

/**
 * What of this phrase to send, under the current trigger — `null` for nothing.
 * Reads the settings per phrase, so a change in Settings applies to the very
 * next thing said rather than the next session.
 */
function commandFor(owned: Session, text: string): string | null {
  const { voiceConversationTrigger, companionNames } = useUiStore.getState();
  if (voiceConversationTrigger === 'always') return text;
  const wake = parseWakePhrase(text, companionNames);
  if (wake.woke && wake.command === '') {
    arm(owned);
    return null;
  }
  if (wake.woke) {
    disarm(owned);
    return wake.command;
  }
  if (owned.armed !== null) {
    disarm(owned);
    return text;
  }
  return null;
}

function onFrame(owned: Session, frame: Float32Array): void {
  if (session !== owned || owned.segmenter === null) return;
  const { onset, utterance } = owned.segmenter.push(frame, deps.isSpeaking());
  // Under the wake trigger, sound alone is not a turn — only an armed
  // session shows "listening" as speech starts.
  if (onset && (useUiStore.getState().voiceConversationTrigger === 'always' || owned.armed !== null)) {
    useCompanionStore.getState().send('listen');
  }
  if (utterance === null) return;

  const sampleRate = owned.capture?.sampleRate ?? 48_000;
  const speaker = owned.owner;
  owned.queue = owned.queue
    .then(async () => {
      const wav = new Blob([encodeWav(utterance, sampleRate).buffer as ArrayBuffer], { type: 'audio/wav' });
      const result = await deps.transcribe(wav);
      settleListening();
      // Stopped (or stopped and restarted) while this phrase was in flight:
      // whoever is listening now did not say it to this session.
      if (session !== owned) return;
      if (!result.ok) {
        // Once per run of failures: an engine that is down would otherwise
        // say so after every phrase of background talk.
        if (!owned.failing) reportVoiceError(result.kind === 'error' ? result.message : recorderErrorMessage('failed'));
        owned.failing = true;
        return;
      }
      owned.failing = false;
      // Silence and Whisper's "[BLANK_AUDIO]" both arrive as empty text — in
      // conversation mode that is a pause, not a failure worth saying aloud.
      if (result.value.text.length === 0) return;
      const command = commandFor(owned, result.value.text);
      if (command !== null && command.length > 0) speaker.deliver(command);
    })
    .catch(() => {
      // Never let one bad phrase stop the queue behind it.
    });
}

/**
 * Start listening for `owner`, or hand an open session to it.
 *
 * A second composer starting takes the session over rather than opening a
 * second stream: there is one microphone, and the phrase belongs wherever the
 * user is now looking. Never throws — a refused or missing mic is reported the
 * way a push-to-talk press reports it, and the session ends.
 */
export async function startConversation(owner: ConversationOwner): Promise<void> {
  if (session !== null) {
    if (session.owner !== owner) {
      session.owner = owner;
      notify();
    }
    return;
  }

  // A push-to-talk capture in flight would hold the same device; the press it
  // belonged to has been superseded by this one.
  if (isRecording()) cancelRecording();

  const starting: Session = { owner, armed: null, failing: false, capture: null, segmenter: null, queue: Promise.resolve() };
  session = starting;
  notify();

  let capture: ConversationCapture;
  try {
    capture = await deps.openCapture((frame) => onFrame(starting, frame));
  } catch (error) {
    if (session === starting) {
      session = null;
      notify();
    }
    reportVoiceError(await describeMicFailure(error));
    return;
  }

  if (session !== starting) {
    // Stopped while the mic was still opening.
    capture.close();
    return;
  }
  starting.capture = capture;
  starting.segmenter = createUtteranceSegmenter({ sampleRate: capture.sampleRate, ...deps.segmenterOptions });
  notify();
}

/**
 * Stop listening. With an `owner`, only if that composer holds the session —
 * an unmounting composer must not close a session another one took over.
 */
export function stopConversation(owner?: ConversationOwner): void {
  if (session === null || (owner !== undefined && session.owner !== owner)) return;
  const ending = session;
  session = null;
  if (ending.armed !== null) clearTimeout(ending.armed);
  ending.capture?.close();
  settleListening();
  notify();
}

/*
  The two ways a session ends without a click: the shared setting going off
  (from any composer, or Settings), and the window being hidden — a hidden
  window is not one anybody is talking to, the same rule `watchCompanionSilence`
  applies to speech.
*/
useUiStore.subscribe((state, previous) => {
  if (previous.voiceConversation && !state.voiceConversation) stopConversation();
});
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopConversation();
  });
}

// --- the tune interview (Phase 109 Theme H) ----------------------------------

/**
 * "Tune yourself" and "be more sarcastic", as a turn-by-turn state machine.
 *
 * Personality and About me never take raw dictation (Decision 4). They are
 * written from a short interview — three or four fixed questions from
 * `COMPANION_TUNE_QUESTIONS`, one per turn — or from a one-line tweak, by the
 * user's agent CLI through `ask.ts`'s `'persona'` mode, and the template when
 * there is none (Decision 6). Then the companion reads back the summary, asks
 * "Want to hear all of it?" (Decision 11), and only then asks to replace the
 * text, through the confirm tier.
 *
 * The machine here is pure: {@link stepTuneSession} takes the session and
 * what the user said and returns what happens next, and nothing in it speaks,
 * asks a CLI or writes a setting — `tune.ts` does those, around it. The
 * session itself is one module-level slot, like `handoff.ts`'s `declined`: a
 * conversational scrap that lives for a few turns, never persisted. Every
 * answer is an ordinary turn in the thread already, posted before it reaches
 * here.
 *
 * "Skip", "start over" and "cancel" work at every stage. A session nobody has
 * answered for {@link TUNE_SESSION_IDLE_MS} is dropped, so a "push" said the
 * next morning is not taken as the answer to a question asked the night before.
 */

/** Where the draft came from — said once on the template path, so the user knows why it reads plainly. */
export type TuneDraft = CompanionPersonaReply & { source: 'agent' | 'template' };

/** How a session started. An interview can start over; a tweak has nothing to start over from. */
export type TuneOrigin = 'interview' | 'tweak';

export type TuneSession =
  | {
      stage: 'asking';
      origin: 'interview';
      target: CompanionTuneTarget;
      /** The question waiting on an answer — an index into `COMPANION_TUNE_QUESTIONS[target]`. */
      index: number;
      answers: CompanionTuneAnswers;
      at: number;
    }
  | {
      /** Waiting on the agent CLI (or about to fill the template). */
      stage: 'composing';
      origin: TuneOrigin;
      target: CompanionTuneTarget;
      at: number;
    }
  | {
      /** The summary has been read back; "Want to hear all of it?" is waiting on a yes or no. */
      stage: 'hearAll';
      origin: TuneOrigin;
      target: CompanionTuneTarget;
      draft: TuneDraft;
      at: number;
    };

/** What happens after one reply. Every arm but `compose` and `confirm` is just "say this". */
export type TuneStep =
  /** Say `say`, and wait for the next reply in `session`. */
  | { kind: 'ask'; session: TuneSession; say: string }
  /** The interview is answered: write `target` from `answers`, then {@link beginTuneReview}. */
  | { kind: 'compose'; session: Extract<TuneSession, { stage: 'composing' }>; answers: CompanionTuneAnswers }
  /** Still writing: say so, and leave the session as it is. */
  | { kind: 'wait'; session: TuneSession; say: string }
  /** Over with nothing written — cancelled, or every question skipped. */
  | { kind: 'end'; say: string }
  /** The read-back is done: read the whole draft first when `readAll`, then ask to apply it. */
  | { kind: 'confirm'; target: CompanionTuneTarget; draft: TuneDraft; readAll: boolean };

/** Five minutes, the same memory `handoff.ts` gives a declined command. */
export const TUNE_SESSION_IDLE_MS = 5 * 60 * 1000;

const HEAR_ALL = 'Want to hear all of it?';

function leftAsItWas(target: CompanionTuneTarget): string {
  return `Okay, I've left ${COMPANION_TUNE_TARGET_SPOKEN[target]} as it was.`;
}

function questionAt(target: CompanionTuneTarget, index: number): string {
  return (COMPANION_TUNE_QUESTIONS[target][index] as { ask: string }).ask;
}

/**
 * Start an interview: the session at its first question, and the line that
 * opens it — what is about to happen, the three steering words, and the first
 * question.
 */
export function beginTuneInterview(
  target: CompanionTuneTarget,
  now: number = Date.now(),
): { session: TuneSession; say: string } {
  const count = COMPANION_TUNE_QUESTIONS[target].length;
  const opener =
    target === 'companionPersonality'
      ? `Let's tune my personality — ${count} quick questions.`
      : `Tell me about you — ${count} quick questions.`;
  return {
    session: { stage: 'asking', origin: 'interview', target, index: 0, answers: {}, at: now },
    say: `${opener} Say skip, start over or cancel at any point. ${questionAt(target, 0)}`,
  };
}

/** A tweak goes straight to writing — there are no questions to ask. */
export function beginTuneTweak(
  target: CompanionTuneTarget,
  now: number = Date.now(),
): Extract<TuneSession, { stage: 'composing' }> {
  return { stage: 'composing', origin: 'tweak', target, at: now };
}

/**
 * A draft is ready: read back its summary and ask whether to hear the rest
 * (Decision 11). The template path says so first, once, so a plainer text is
 * not a surprise.
 */
export function beginTuneReview(
  origin: TuneOrigin,
  target: CompanionTuneTarget,
  draft: TuneDraft,
  now: number = Date.now(),
): { session: TuneSession; say: string } {
  const lead = draft.source === 'template' ? "I've filled in the basic template from your answers. " : '';
  return {
    session: { stage: 'hearAll', origin, target, draft, at: now },
    say: `${lead}Here's the gist: ${draft.summary} ${HEAR_ALL}`,
  };
}

function startOver(session: TuneSession, now: number): TuneStep {
  if (session.origin === 'tweak') return { kind: 'end', say: leftAsItWas(session.target) };
  return {
    kind: 'ask',
    session: { stage: 'asking', origin: 'interview', target: session.target, index: 0, answers: {}, at: now },
    say: `Starting over. ${questionAt(session.target, 0)}`,
  };
}

/** Move past the current question: the next one, or — after the last — write from what was said. */
function advance(
  session: Extract<TuneSession, { stage: 'asking' }>,
  answers: CompanionTuneAnswers,
  now: number,
): TuneStep {
  const next = session.index + 1;
  if (next < COMPANION_TUNE_QUESTIONS[session.target].length) {
    return { kind: 'ask', session: { ...session, index: next, answers, at: now }, say: questionAt(session.target, next) };
  }
  // The template is the measure of "said anything": an answer that cleans to
  // nothing ("um") counts as skipped, for the CLI's prompt as much as here.
  if (buildPersonaFromAnswers(session.target, answers).text === '') {
    return {
      kind: 'end',
      say: `You skipped every question, so I've left ${COMPANION_TUNE_TARGET_SPOKEN[session.target]} as it was.`,
    };
  }
  return {
    kind: 'compose',
    session: { stage: 'composing', origin: 'interview', target: session.target, at: now },
    answers,
  };
}

/**
 * One reply, one step. Pure: `session` is never mutated, and the returned
 * step carries the next one.
 */
export function stepTuneSession(session: TuneSession, text: string, now: number = Date.now()): TuneStep {
  const reply = classifyTuneReply(text);
  if (reply === 'cancel') return { kind: 'end', say: leftAsItWas(session.target) };
  if (reply === 'startOver') return startOver(session, now);

  switch (session.stage) {
    case 'asking': {
      if (reply === 'skip' || reply === 'no') return advance(session, session.answers, now);
      // "Anything I should avoid?" "Yes." — the answer is still to come.
      if (reply === 'yes') return { kind: 'ask', session: { ...session, at: now }, say: 'Go on.' };
      const question = COMPANION_TUNE_QUESTIONS[session.target][session.index] as { id: string };
      return advance(session, { ...session.answers, [question.id]: text.trim() }, now);
    }
    case 'composing':
      return { kind: 'wait', session, say: 'Still writing it — one moment. Say cancel to drop it.' };
    case 'hearAll':
      if (reply === 'yes') return { kind: 'confirm', target: session.target, draft: session.draft, readAll: true };
      if (reply === 'no' || reply === 'skip') {
        return { kind: 'confirm', target: session.target, draft: session.draft, readAll: false };
      }
      return { kind: 'ask', session: { ...session, at: now }, say: `${HEAR_ALL} Yes or no.` };
  }
}

let tuneSession: TuneSession | null = null;

/** The session waiting on a reply, or `null` — and `null` once it has sat idle past {@link TUNE_SESSION_IDLE_MS}. */
export function currentTuneSession(now: number = Date.now()): TuneSession | null {
  if (tuneSession !== null && now - tuneSession.at > TUNE_SESSION_IDLE_MS) tuneSession = null;
  return tuneSession;
}

/** Replace (or, with `null`, end) the session. */
export function setTuneSession(next: TuneSession | null): void {
  tuneSession = next;
}

/** Swap the device-facing pieces and drop any session. Tests only. */
export function __setConversationDepsForTest(overrides: Partial<ConversationDeps> | null): void {
  if (session?.armed) clearTimeout(session.armed);
  session?.capture?.close();
  session = null;
  deps = overrides === null ? defaultDeps() : { ...defaultDeps(), ...overrides };
  listeners.clear();
}
