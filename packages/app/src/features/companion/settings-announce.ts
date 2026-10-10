import {
  companionSettingReadBacks,
  companionSettingSpec,
  describeCompanionSettingValue,
  type CompanionSettingKey,
  type CompanionSettingSource,
} from '@midnite/studio-shared';

import { dismissToast, showToast, type ToastRequest } from '../../components/toast-host';
import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';
import { silentSpeaker, type Speaker } from './ports';
import {
  COMPANION_UNDO_WINDOW_MS,
  applyCompanionSetting,
  lastCompanionSettingChange,
  previewCompanionSetting,
  undoLastCompanionSetting,
  type CompanionLastChange,
  type CompanionSettingApplied,
  type CompanionSettingChange,
  type CompanionSettingResult,
  type CompanionUndoResult,
} from './settings-apply';
import { companionTtsSpeaker } from './speaker';

/**
 * Hearing a settings change, and taking it back (Phase 109 Theme E).
 *
 * Every change the companion's voice or an agent over MCP makes is **spoken
 * back** — "This is Bella now." — and gets an **Undo toast** for as long as
 * "undo that" can still reach it. A change made on Settings ▸ Companion gets
 * neither: the control is right there, and reading back every slider step
 * would be noise.
 *
 * The read-back normally follows the store write, so a voice change is
 * confirmed *in the new voice* (`speaker.ts` reads `companionVoices.local` per
 * utterance). The guards' `readBackBeforeApply` effect reverses that for the
 * two changes whose read-back would otherwise be lost: muting (after the
 * write there is no voice to say so) and a rename (after the write the old
 * name stops waking anything). {@link applyAndAnnounceCompanionSetting} owns
 * that ordering; {@link announceCompanionSettingChange} is the after-the-fact
 * half, for a caller that has already written.
 *
 * Plain functions over `getState()`, like the setter: a spoken turn outlives
 * the render that started it. Everything with a side effect comes through
 * {@link AnnounceDeps}, so the order of speech and write is testable.
 */

export type AnnounceDeps = {
  /** Post the line to the companion's thread and speak it; resolves once it has been said. */
  speak: (text: string) => Promise<void>;
  /** Show a toast from outside React; `null` when no host is mounted. */
  showToast: (request: ToastRequest) => string | null;
  dismissToast: (id: string) => void;
  undo: () => CompanionUndoResult;
  lastChange: () => Readonly<CompanionLastChange> | null;
  /** A system voice's display name from its URI — only `speechSynthesis` knows it. */
  systemVoiceName: (uri: string) => string | null;
  now: () => number;
  rng: () => number;
};

/**
 * The speaker to use *now*, read from the store rather than from the
 * registration `useCompanionSpeakerWiring` makes in an effect: right after
 * "speak out loud" lands, the effect has not run yet, and the read-back would
 * otherwise go to the silent stand-in.
 */
export function liveCompanionSpeaker(): Speaker {
  const ui = useUiStore.getState();
  return ui.companionEnabled && ui.companionSpeakAloud ? companionTtsSpeaker : silentSpeaker;
}

/** The default `speak`: a companion turn in the thread, read aloud when there is a voice. */
async function speakIntoThread(text: string): Promise<void> {
  const turn = useCompanionStore.getState().addTurn({ role: 'companion', text, spoken: false });
  const speaker = liveCompanionSpeaker();
  if (speaker.available !== true) return;
  await speaker.speak(text);
  useCompanionStore.getState().markSpoken(turn.id);
}

function systemVoiceNameFromSynth(uri: string): string | null {
  const synth = typeof window === 'undefined' ? null : (window.speechSynthesis ?? null);
  return synth?.getVoices().find((voice) => voice.voiceURI === uri)?.name ?? null;
}

export function defaultAnnounceDeps(): AnnounceDeps {
  return {
    speak: speakIntoThread,
    showToast,
    dismissToast,
    undo: undoLastCompanionSetting,
    lastChange: lastCompanionSettingChange,
    systemVoiceName: systemVoiceNameFromSynth,
    now: () => Date.now(),
    rng: Math.random,
  };
}

// --- what gets said ----------------------------------------------------------

/**
 * What changed, from the companion's side of the conversation — the noun in
 * "Your agent changed my voice." Total over the keys, so a new setting needs
 * a word here before it compiles.
 */
const SPOKEN_NOUN: Readonly<Record<CompanionSettingKey, string>> = {
  companionEnabled: 'whether I am on',
  companionSttEngine: 'my recognition engine',
  companionSttProvider: 'my speech provider',
  companionHandsFree: 'hands-free run',
  companionSpeakAloud: 'whether I speak out loud',
  companionNames: 'what I answer to',
  companionMicMode: 'the mic button',
  voiceConversation: 'conversation mode',
  voiceConversationTrigger: 'how conversation mode listens',
  companionPersonality: 'my personality',
  companionAboutUser: 'what I know about you',
  'companionVoices.local': 'my voice',
  'companionVoices.system': 'my fallback voice',
  companionVolume: 'my volume',
  companionHonorifics: 'what I call you',
  companionMusicOffer: 'the elevator music offer',
  companionActiveProfile: 'my profile',
};

/** The last read-back picked per key, so the next pick for that key differs. */
const lastPicked = new Map<CompanionSettingKey, string>();

function pickReadBack(key: CompanionSettingKey, next: unknown, rng: () => number): string {
  const pool = companionSettingReadBacks(key, next);
  const fresh = pool.length > 1 ? pool.filter((line) => line !== lastPicked.get(key)) : pool;
  const picked = fresh[Math.min(fresh.length - 1, Math.floor(rng() * fresh.length))] ?? pool[0] ?? '';
  lastPicked.set(key, picked);
  return picked;
}

/**
 * The sentence for an applied change: a varied read-back of the new value,
 * led by "Your agent changed …" when an agent made it — so a voice the user
 * did not ask for never just starts talking differently.
 */
export function companionSettingAnnouncement(
  result: Pick<CompanionSettingApplied, 'key' | 'next'>,
  source: CompanionSettingSource,
  rng: () => number = Math.random,
): string {
  const line = pickReadBack(result.key, result.next, rng);
  return source === 'mcp' ? `Your agent changed ${SPOKEN_NOUN[result.key]}. ${line}` : line;
}

const UNDO_OPENERS = ['Put it back.', 'Undone.', 'Back how it was.'] as const;

/** "Put it back. This is Heart now." — read in the restored voice. */
export function companionUndoAnnouncement(
  restored: { keys: readonly CompanionSettingKey[]; restored: Partial<Record<CompanionSettingKey, unknown>> },
  rng: () => number = Math.random,
): string {
  const opener = UNDO_OPENERS[Math.min(UNDO_OPENERS.length - 1, Math.floor(rng() * UNDO_OPENERS.length))];
  const lines = restored.keys.map((key) => pickReadBack(key, restored.restored[key], rng));
  return [opener, ...lines].join(' ');
}

/** What "undo that" says when there is nothing it can do. */
export const COMPANION_UNDO_REFUSALS: Readonly<Record<Extract<CompanionUndoResult, { ok: false }>['reason'], string>> = {
  nothing: 'Nothing to undo.',
  expired: 'That was too long ago — change it again, or use Settings, Companion.',
  locked: 'The screen is locked — unlock it first.',
};

// --- the Undo toast ----------------------------------------------------------

/** The one companion Undo toast on screen; a newer change replaces it. */
let currentToast: string | null = null;

function valueForToast(key: CompanionSettingKey, value: unknown, deps: AnnounceDeps): string {
  if (key === 'companionVoices.system' && typeof value === 'string') {
    return deps.systemVoiceName(value) ?? 'a new system voice';
  }
  return describeCompanionSettingValue(key, value);
}

/**
 * The Undo toast for a voice- or MCP-originated change (Theme E) — up for what
 * is left of the sixty-second undo window, and only undoing *this* change: if
 * anything has taken the undo slot since, the button does nothing rather than
 * undo something the toast never mentioned.
 */
export function showCompanionUndoToast(
  result: Pick<CompanionSettingApplied, 'key' | 'next'>,
  source: CompanionSettingSource,
  deps: AnnounceDeps = defaultAnnounceDeps(),
): void {
  if (source === 'page') return;
  const change = deps.lastChange();
  if (change === null || !change.keys.includes(result.key)) return;
  const remaining = COMPANION_UNDO_WINDOW_MS - (deps.now() - change.at);
  if (remaining <= 0) return;

  const label = companionSettingSpec(result.key).label;
  const value = valueForToast(result.key, result.next, deps);
  dismissCompanionUndoToast(deps);
  currentToast = deps.showToast({
    message: source === 'mcp' ? `Your agent changed ${label} to ${value}.` : `${label} set to ${value}.`,
    durationMs: remaining,
    action: {
      label: 'Undo',
      onAction: () => {
        currentToast = null;
        if (deps.lastChange() !== change) return;
        void undoAndAnnounceCompanionSetting(deps);
      },
    },
  });
}

export function dismissCompanionUndoToast(deps: Pick<AnnounceDeps, 'dismissToast'> = defaultAnnounceDeps()): void {
  if (currentToast !== null) deps.dismissToast(currentToast);
  currentToast = null;
}

// --- the three entry points --------------------------------------------------

const changed = (previous: unknown, next: unknown): boolean =>
  !Object.is(previous, next) && JSON.stringify(previous) !== JSON.stringify(next);

/**
 * Speak the read-back and show the Undo toast for a change that has already
 * been written — the contract with Theme D's MCP `setting` arm, which calls it
 * with `'mcp'` after a successful apply. A refusal, a page change or a change
 * that changed nothing is not announced.
 *
 * For a change carrying `readBackBeforeApply` this is already too late to
 * speak first; {@link applyAndAnnounceCompanionSetting} is the version that
 * gets the order right, and the thread and the toast still carry this one.
 */
export async function announceCompanionSettingChange(
  result: CompanionSettingResult,
  source: CompanionSettingSource,
  deps: AnnounceDeps = defaultAnnounceDeps(),
): Promise<void> {
  if (!result.ok || source === 'page' || !changed(result.previous, result.next)) return;
  showCompanionUndoToast(result, source, deps);
  await deps.speak(companionSettingAnnouncement(result, source, deps.rng));
}

/** The setter as this module uses it — injectable so a test can watch the write land between two sentences. */
export type AnnounceSetter = {
  preview: (change: CompanionSettingChange, source: CompanionSettingSource) => CompanionSettingResult;
  apply: (change: CompanionSettingChange, source: CompanionSettingSource) => CompanionSettingResult;
};

const defaultSetter: AnnounceSetter = { preview: previewCompanionSetting, apply: applyCompanionSetting };

/**
 * Apply one change and announce it in the right order: write then speak, or —
 * for a mute or a rename — speak, then write. Returns the setter's result, so a
 * refusal comes back unspoken for the caller to word.
 */
export async function applyAndAnnounceCompanionSetting(
  change: CompanionSettingChange,
  source: CompanionSettingSource,
  deps: AnnounceDeps = defaultAnnounceDeps(),
  setter: AnnounceSetter = defaultSetter,
): Promise<CompanionSettingResult> {
  const preview = setter.preview(change, source);
  if (!preview.ok) return preview;

  if (preview.effect === 'readBackBeforeApply' && source !== 'page' && changed(preview.previous, preview.next)) {
    await deps.speak(companionSettingAnnouncement(preview, source, deps.rng));
    const applied = setter.apply(change, source);
    if (applied.ok) showCompanionUndoToast(applied, source, deps);
    return applied;
  }

  const applied = setter.apply(change, source);
  await announceCompanionSettingChange(applied, source, deps);
  return applied;
}

/**
 * "Undo that" (Theme E): restore the last change and read back what it
 * restored, in the restored voice. Undoing an unmute reads back *first*, for
 * the same reason a mute does.
 */
export async function undoAndAnnounceCompanionSetting(
  deps: AnnounceDeps = defaultAnnounceDeps(),
): Promise<CompanionUndoResult> {
  const pending = deps.lastChange();
  const silencing =
    pending !== null &&
    pending.keys.includes('companionSpeakAloud') &&
    pending.previous.companionSpeakAloud === false &&
    deps.now() - pending.at <= COMPANION_UNDO_WINDOW_MS;

  if (silencing && pending !== null) {
    await deps.speak(companionUndoAnnouncement({ keys: pending.keys, restored: pending.previous }, deps.rng));
  }

  const result = deps.undo();
  if (!result.ok) {
    await deps.speak(COMPANION_UNDO_REFUSALS[result.reason]);
    return result;
  }
  dismissCompanionUndoToast(deps);
  if (!silencing) await deps.speak(companionUndoAnnouncement(result, deps.rng));
  return result;
}

/** Tests only: forget the last pick per key and the toast on screen. */
export function resetCompanionAnnounceForTests(): void {
  lastPicked.clear();
  currentToast = null;
}
