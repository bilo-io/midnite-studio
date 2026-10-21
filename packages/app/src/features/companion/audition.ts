import {
  COMPANION_AUDITION_MEMORY_MS,
  COMPANION_LOCAL_VOICES,
  auditionBatches,
  auditionLocalVoices,
  auditionNumberWord,
  auditionSampleLine,
  auditionSystemVoices,
  describeAuditionFilter,
  parseAuditionReply,
  parseIntent,
  type CompanionAuditionFilter,
  type CompanionAuditionVoice,
  type CompanionIntent,
  type CompanionVoiceEngine,
} from '@midnite/studio-shared';

import { say } from './concierge';
import type { HandoffDeps } from './handoff';
import type { CompanionSettingChange } from './settings-apply';

/**
 * The voice audition (Phase 109 Theme F) — "try some British voices".
 *
 * The companion plays three or four numbered samples ("Hi, I'm number two —
 * Bella."), each in the voice it names, then waits. The reply is a turn of
 * its own, so the audition is a small state machine over turns rather than a
 * single `act()` arm:
 *
 * - "number two" / "two" picks that voice of the batch just played;
 * - "that one" picks whichever sample played last (the one talked over, on a
 *   barge-in);
 * - "next" plays the next batch, wrapping to the first after the last;
 * - "again" replays the batch;
 * - "none" / "stop" ends it, keeping the voice there is.
 *
 * A pick goes through B's setter as an ordinary `voice` change (direct tier),
 * so E's read-back says it in the new voice and it takes the 60 s undo slot.
 *
 * The state is module state, for the reason `handoff.ts`'s `voiceChoice` is:
 * a scrap of conversation that lives for a couple of minutes, not something
 * to persist. It is read by three callers: `submitInput` (a reply), the mic's
 * press (`voice-ports.ts`) and conversation mode (`conversation.ts`), the last
 * two for barge-in — talking over a sample cuts it off, and the batch with it.
 *
 * **Local first, system as the fallback.** Samples play through the Kokoro
 * engine when its model is on disk. When it isn't, or a sample fails to
 * synthesize, the audition plays the `speechSynthesis` voices instead and says
 * so — once.
 */

/** What the audition needs beyond `act()`'s deps: the samples, played in a voice not yet chosen. */
export type AuditionPort = {
  /** Whether the local voice's model is downloaded — `false` auditions system voices from the start. */
  localReady: () => Promise<boolean>;
  /**
   * Play one sample through one engine in one voice. `false` when the local
   * engine produced nothing, which is the cue to fall back.
   */
  playSample: (engine: CompanionVoiceEngine, voice: string, text: string, signal: AbortSignal) => Promise<boolean>;
};

export type AuditionDeps = HandoffDeps & {
  /** `proposeSetting` — the pick, by tier, with E's read-back. */
  pick: (change: CompanionSettingChange) => Promise<void>;
};

type Audition = {
  engine: CompanionVoiceEngine;
  filter: CompanionAuditionFilter;
  batches: CompanionAuditionVoice[][];
  batch: number;
  /** The sample that started most recently — "that one". */
  lastPlayed: CompanionAuditionVoice | null;
  /** Last line said or sample started; the audition lapses {@link COMPANION_AUDITION_MEMORY_MS} after it. */
  at: number;
};

let audition: Audition | null = null;
/** The batch in flight: aborted by a barge-in, and which engine is speaking it. */
let playback: { controller: AbortController; engine: CompanionVoiceEngine } | null = null;

function live(now = Date.now()): Audition | null {
  if (audition !== null && now - audition.at > COMPANION_AUDITION_MEMORY_MS) audition = null;
  return audition;
}

/** Whether an audition is waiting on a reply — conversation mode's wake trigger lets a bare "two" through while it is. */
export function auditionActive(): boolean {
  return live() !== null;
}

/**
 * Whether the sound right now is a sample the user may talk over in
 * conversation mode. Only a local-engine sample: Kokoro plays through the
 * page's own Web Audio graph, which Chromium's echo canceller hears and
 * subtracts from the mic. A system voice is the OS speaking, invisible to it,
 * so conversation mode stays half-duplex for those and the reply comes after.
 */
export function auditionSampleBargeable(): boolean {
  return playback?.engine === 'local';
}

/**
 * Talking over a sample: stop it, and the rest of the batch with it. Returns
 * whether there was one. The audition itself stays, waiting for what was said.
 */
export function bargeInAudition(): boolean {
  if (playback === null) return false;
  playback.controller.abort();
  playback = null;
  return true;
}

export function resetAuditionState(): void {
  bargeInAudition();
  audition = null;
}

/** The `audition` intent: pick the voices, say what they are, play the first batch. */
export async function startAudition(
  intent: Extract<CompanionIntent, { kind: 'audition' }>,
  deps: AuditionDeps,
): Promise<void> {
  resetAuditionState();
  const speaker = deps.companionSettings.liveSpeaker?.() ?? deps.speaker;
  if (speaker.available !== true) {
    await say(deps, "I'd have to speak out loud for that — say “speak out loud” first.");
    return;
  }

  const filter: CompanionAuditionFilter = {
    ...(intent.accent === undefined ? {} : { accent: intent.accent }),
    ...(intent.gender === undefined ? {} : { gender: intent.gender }),
  };
  const described = describeAuditionFilter(filter);
  const localReady = await deps.companionSettings.audition.localReady().catch(() => false);
  if (deps.signal.aborted) return;

  if (localReady) {
    const pool = auditionLocalVoices(COMPANION_LOCAL_VOICES, filter, currentVoice('local', deps));
    if (pool.length === 0) {
      await say(deps, `I don't have any other ${described === '' ? '' : `${described} `}voices.`);
      return;
    }
    audition = { engine: 'local', filter, batches: auditionBatches(pool), batch: 0, lastPlayed: null, at: Date.now() };
    await say(deps, introLine(audition, described));
    await playBatch(deps);
    return;
  }

  await switchToSystem(deps, filter, 'missing');
}

/**
 * One line said while an audition is live. `true` when it was a reply and
 * has been dealt with; `false` when it was not one — the audition is over and
 * the line goes on to be parsed as usual.
 *
 * A line that is neither a reply nor anything else the companion knows (a
 * mis-heard "two", a word of background talk) keeps the audition and asks
 * again, rather than ending it and sending the noise to the router.
 */
export async function continueAudition(text: string, deps: AuditionDeps): Promise<boolean> {
  const current = live();
  if (current === null) return false;
  const reply = parseAuditionReply(text);

  if (reply === null) {
    if (parseIntent(text, deps.vocabulary()).kind !== 'freeform') {
      resetAuditionState();
      return false;
    }
    current.at = Date.now();
    await say(deps, 'Say a number to pick one, or “next”, “again” or “none”.');
    return true;
  }

  const batch = current.batches[current.batch] ?? [];
  switch (reply.kind) {
    case 'end':
      resetAuditionState();
      await say(deps, 'Okay — keeping the voice I have.');
      return true;

    case 'again':
      current.at = Date.now();
      await playBatch(deps);
      return true;

    case 'next':
      current.at = Date.now();
      if (current.batches.length === 1) {
        await say(deps, `That's every one I have — say a number, “again”, or “none”.`);
        return true;
      }
      current.batch = (current.batch + 1) % current.batches.length;
      if (current.batch === 0) await say(deps, 'That was the last of them — back to the start.');
      await playBatch(deps);
      return true;

    case 'that':
      if (current.lastPlayed === null) {
        current.at = Date.now();
        await say(deps, 'Which number?');
        return true;
      }
      await pick(current, current.lastPlayed, deps);
      return true;

    case 'pick': {
      const chosen = batch[reply.number - 1];
      if (chosen === undefined) {
        current.at = Date.now();
        const count = auditionNumberWord(batch.length);
        await say(
          deps,
          batch.length === 1
            ? 'There was only one — say “one” or “none”.'
            : `There were only ${count} — say a number from one to ${count}.`,
        );
        return true;
      }
      await pick(current, chosen, deps);
      return true;
    }
  }
}

/** End the audition and write the voice — the setter, the read-back in the new voice, the undo slot. */
async function pick(current: Audition, voice: CompanionAuditionVoice, deps: AuditionDeps): Promise<void> {
  resetAuditionState();
  await deps.pick({
    key: current.engine === 'local' ? 'companionVoices.local' : 'companionVoices.system',
    value: voice.value,
  });
}

function currentVoice(engine: CompanionVoiceEngine, deps: AuditionDeps): string | null {
  const value = deps.companionSettings.read(engine === 'local' ? 'companionVoices.local' : 'companionVoices.system');
  return typeof value === 'string' ? value : null;
}

/** "Here are four British voices — say a number when you hear one you like." */
function introLine(current: Audition, described: string): string {
  const size = current.batches[current.batch]?.length ?? 0;
  const what = `${described === '' ? '' : `${described} `}voice${size === 1 ? '' : 's'}`;
  const lead = size === 1 ? `Here's one ${what}` : `Here are ${auditionNumberWord(size)} ${what}`;
  const more = current.batches.length > 1 ? ', or “next” for more' : '';
  return `${lead} — say a number when you hear one you like${more}.`;
}

/**
 * Audition the system voices instead — from the start when the local model
 * isn't downloaded, or mid-batch when the engine fails. Said once: this is
 * the only place that says it, and a system audition never comes back here.
 */
async function switchToSystem(
  deps: AuditionDeps,
  filter: CompanionAuditionFilter,
  why: 'missing' | 'failed',
): Promise<void> {
  const pool = auditionSystemVoices(
    deps.companionSettings.systemVoices(),
    filter,
    currentVoice('system', deps),
  );
  const reason =
    why === 'missing'
      ? "The local voices aren't downloaded, so these are your system voices."
      : "The local voices aren't working right now, so these are your system voices instead.";
  if (pool.length === 0) {
    resetAuditionState();
    await say(deps, `${reason.split(',')[0]}, and there are no system voices to play instead.`);
    return;
  }
  audition = { engine: 'system', filter, batches: auditionBatches(pool), batch: 0, lastPlayed: null, at: Date.now() };
  // `speechSynthesis` does not say which voices are which, so a gender asked
  // for is not one the system list can honour — said, not guessed from names.
  const gender = filter.gender === undefined ? '' : " They don't say whether they're male or female, so you'll hear all of them.";
  await say(deps, `${reason}${gender} ${introLine(audition, describeAuditionFilter({ accent: filter.accent }))}`);
  await playBatch(deps);
}

/**
 * Play the current batch, one numbered sample per voice, then ask which.
 *
 * Its own `AbortController`, chained to this turn's interrupt token: a new
 * line, Escape or "stop" aborts the turn and so the batch, and a barge-in
 * ({@link bargeInAudition}) aborts the batch alone. Either way nothing after
 * the cut-off sample plays, and the question is not asked over the user.
 */
async function playBatch(deps: AuditionDeps): Promise<void> {
  const current = live();
  if (current === null) return;
  const batch = current.batches[current.batch] ?? [];
  const controller = new AbortController();
  const follow = (): void => controller.abort();
  if (deps.signal.aborted) controller.abort();
  else deps.signal.addEventListener('abort', follow, { once: true });

  try {
    for (let index = 0; index < batch.length; index += 1) {
      if (controller.signal.aborted || audition !== current) return;
      const voice = batch[index] as CompanionAuditionVoice;
      const line = auditionSampleLine(index + 1, voice.name);
      const turn = deps.store.addTurn({ role: 'companion', text: line, spoken: false });
      current.lastPlayed = voice;
      current.at = Date.now();
      playback = { controller, engine: current.engine };
      const played = await deps.companionSettings.audition
        .playSample(current.engine, voice.value, line, controller.signal)
        .catch(() => false);
      if (playback?.controller === controller) playback = null;
      if (controller.signal.aborted || audition !== current) return;
      if (!played && current.engine === 'local') {
        await switchToSystem(deps, current.filter, 'failed');
        return;
      }
      if (played) deps.store.markSpoken(turn.id);
    }
  } finally {
    if (playback?.controller === controller) playback = null;
    deps.signal.removeEventListener('abort', follow);
  }

  current.at = Date.now();
  await say(
    deps,
    current.batches.length > 1
      ? 'Which one? Say a number, “next”, “again”, or “none”.'
      : 'Which one? Say a number, “again”, or “none”.',
  );
}
