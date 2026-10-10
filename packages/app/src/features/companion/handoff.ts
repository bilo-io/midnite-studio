import {
  COMPANION_COMMAND_IDS,
  COMPANION_LOCAL_VOICES,
  COMPANION_NEVER_AUTOSEND,
  COMPANION_READBACK_TAIL_CHARS,
  companionSettingQuestion,
  companionSettingSpec,
  describeCompanionSettingValue,
  extractLastAgentTurn,
  matchVoice,
  parseIntent,
  type CommandId,
  type CompanionAskReply,
  type CompanionCommandId,
  type CompanionIntent,
  type CompanionSettingIntent,
  type CompanionSettingKey,
  type CompanionPersonaReply,
  type CompanionPersonaRequest,
  type CompanionVocabulary,
  type GitOpResult,
  type RepoDescriptor,
  type SessionActivity,
} from '@midnite/studio-shared';

import { overlayDepth } from '../../components/dialog-host';
import type { PendingAction } from '../../store/companion-store';
import { runCommand } from './command-runtime';
import { phrase, say, matchRepoByName, type ConciergeDeps } from './concierge';
import { actOnProfile, type CompanionProfilesPort } from './profile-handoff';
import type { Speaker } from './ports';
import type {
  CompanionSettingChange,
  CompanionSettingResult,
  CompanionUndoResult,
} from './settings-apply';
import type { AgentCommandId } from '../../store/ui-store';

/**
 * From "start a swarm" to hearing what the swarm did — Phase 79 Theme E.
 *
 * Four things happen here, in order, and each is a seam the previous themes
 * left open. A line of input becomes a {@link CompanionIntent} through
 * `shared`'s keyword grammar. A `command` intent becomes a typed-not-sent
 * agent session through Phase 35's own hand-off. That session's `pty:activity`
 * rungs become the end of the loading state. And its scrollback becomes an
 * `agent` turn plus a spoken summary.
 *
 * Nothing in this file talks to a model except through `deps.ask`, which is
 * `mstudio:companion:ask` — the installed CLI in print mode. The grammar comes
 * first precisely so that most sentences never reach it.
 */

/**
 * Compile-time proof that the companion's command list is a subset of the
 * real thing.
 *
 * `COMPANION_COMMAND_IDS` is declared in `shared`, which cannot import this
 * package's `AgentCommandId` union — the dependency runs the other way. This
 * assignment is what stops the two drifting: rename or remove an id in
 * `ui-store.ts` and the build fails here rather than at runtime, when
 * `skillHandoff` would quietly return `null` and the companion would say it
 * had started something it had not.
 */
const _companionIdsAreAgentCommandIds: readonly AgentCommandId[] = COMPANION_COMMAND_IDS;
void _companionIdsAreAgentCommandIds;

export type HandoffDeps = ConciergeDeps & {
  /** `skillHandoff` bound to the live roster — returns the session, or `null` if it could not start. */
  startSkill: (opts: {
    skillId: CompanionCommandId;
    body?: string;
    autoSend: boolean;
  }) => { id: string } | null;
  /** `window.midniteStudio.companion.ask`. */
  ask: (req: {
    kind: 'route' | 'summarise';
    text: string;
  }) => Promise<GitOpResult<CompanionAskReply>>;
  /** The session's scrollback as text, or `null` when there is no live pty. */
  scrollback: (sessionId: string) => Promise<string | null>;
  /** The roster's activity markers for whatever agent that session is running. */
  markers: (sessionId: string) => { awaitingInput?: string; frameEnd?: string } | undefined;
  /** Type text into a fresh agent session verbatim — the no-CLI fallback. */
  startVerbatim: (text: string) => { id: string } | null;
  /** Which repositories the switch offer can name, and how to pick one. */
  repos: () => Promise<readonly RepoDescriptor[]>;
  selectRepo: (repoId: string) => void;
  /** Theme G's audio, when it exists. Absent means the request is acknowledged and no more. */
  onMusic?: ((on: boolean) => void) | undefined;
  /** Whether the hands-free switch is on AND a provider is configured — the only `autoSend: true`. */
  autoSendAllowed: () => boolean;
  activeHandoff: () => { sessionId: string; command: string } | null;
  setActiveHandoff: (handoff: { sessionId: string; command: string } | null) => void;
  /** The one `confirm`-tier command waiting on a yes, or `null` (Phase 81 Theme C). */
  pendingAction: () => PendingAction | null;
  setPendingAction: (action: PendingAction | null) => void;
  /**
   * Views, settings pages, commands (by tier), skills and repos — what the
   * grammar (`parseIntent`'s `navigate`/`run`) and Theme E's `ask` prompt are
   * both allowed to name. `runtime.ts` builds this once per flow, beside
   * `refreshRoster()`, from `vocabulary.ts`'s `buildVocabulary` — never by
   * hand, and never a second copy of the palette's own tables (Finding 2).
   */
  vocabulary: () => CompanionVocabulary;
  /**
   * Carry out a `navigate` intent and say what happened — `navigate.ts`'s
   * `navigateCompanion`, assembled here so `handoff.ts` never imports a store
   * directly (Theme B). Returns rather than speaks: `act()`'s `navigate` arm
   * is what calls {@link say}, the same as every other arm, so a fake in a
   * test can assert on the returned sentence without a speaker double.
   */
  navigate: (
    intent: Extract<CompanionIntent, { kind: 'navigate' }>,
  ) => Promise<{ say: string }>;
  /**
   * The settings setter and Theme E's read-back, assembled in `runtime.ts`
   * over `settings-apply.ts` and `settings-announce.ts` (Phase 109 Theme C) —
   * a port for the reason `navigate` is one: this file never touches a store.
   */
  companionSettings: CompanionSettingsPort;
  /**
   * `window.midniteStudio.companion.ask` in `'persona'` mode (Phase 109 Theme
   * H): personality or About me text from an interview or a tweak, or why
   * there is none. A reply that was not the `{text, summary}` shape comes back
   * as a failure, so the interview falls back to its template.
   */
  persona: (request: CompanionPersonaRequest) => Promise<GitOpResult<CompanionPersonaReply>>;
  /** Whether the agent roster has anything with a headless mode — without one a tweak points to the page. */
  hasAgentCli: () => boolean;
};

/**
 * What the `setting` and `undoSetting` arms need (Phase 109 Themes C and E).
 *
 * `applyAndAnnounce` and `undoAndAnnounce` take the `speak` to use rather than
 * owning one, so the read-back goes through {@link say} — into the thread,
 * through this turn's interrupt token — exactly like every other line here.
 */
export type CompanionSettingsPort = {
  /** The current value — "louder" and "call me boss" change what is already there. */
  read: (key: CompanionSettingKey) => unknown;
  /** Every check the setter makes for a `voice` change, writing nothing. */
  preview: (change: CompanionSettingChange) => CompanionSettingResult;
  /** Write a `voice` change and read it back — before the write for a mute or a rename — with an Undo toast. */
  applyAndAnnounce: (
    change: CompanionSettingChange,
    speak: (text: string) => Promise<void>,
  ) => Promise<CompanionSettingResult>;
  /** "Undo that": restore the last change and read back what came back, or say why not. */
  undoAndAnnounce: (speak: (text: string) => Promise<void>) => Promise<CompanionUndoResult>;
  /** `speechSynthesis`'s voices, which exist only in the renderer. */
  systemVoices: () => readonly { uri: string; name: string; lang?: string }[];
  /** Persona profiles (Phase 109 Theme G): save, switch, delete and list — `profiles.ts` behind a port. */
  profiles: CompanionProfilesPort;
  /**
   * The speaker to read back with once the write has landed — "speak out
   * loud" turns speech on mid-turn, after this turn's `deps.speaker` was
   * captured as the silent one. Absent means `deps.speaker`.
   */
  liveSpeaker?: () => Speaker;
};

/**
 * The command a live hand-off refused, kept so a bare "anyway" can mean
 * something.
 *
 * Module state rather than store state, and deliberately: it is a
 * conversational scrap with a lifetime of one exchange, not something worth
 * persisting, rehydrating or rendering. `resetHandoffState` exists for tests,
 * which are the only other caller.
 */
let declined: { intent: CompanionIntent; at: number } | null = null;

/** How long a declined command stays available to "anyway". */
export const DECLINE_MEMORY_MS = 5 * 60 * 1000;

/** One side of "Bella or Isabella?" — the value to write and the names it answers to. */
type VoiceOption = { value: string; name: string; spoken: readonly string[] };

/**
 * The question "Bella or Isabella?" is waiting on (Phase 109 Decision 10).
 * Module state for the reason `declined` is: a one-exchange scrap, not
 * something to persist. The next line is checked against the two names before
 * it is parsed; anything else drops the question.
 */
let voiceChoice: {
  key: 'companionVoices.local' | 'companionVoices.system';
  options: readonly [VoiceOption, VoiceOption];
  at: number;
} | null = null;

/** How long "Bella or Isabella?" waits for an answer — the same minute a confirm does. */
export const VOICE_CHOICE_MEMORY_MS = 60 * 1000;

export function resetHandoffState(): void {
  declined = null;
  voiceChoice = null;
}

/**
 * One line of typed or spoken input, all the way through.
 *
 * Never throws. Every arm ends with the companion having said something,
 * because a companion that silently ignores a sentence is indistinguishable
 * from one that is broken.
 */
export async function submitInput(text: string, deps: HandoffDeps): Promise<void> {
  const trimmed = text.trim();
  if (trimmed === '') return;

  deps.store.addTurn({ role: 'user', text: trimmed, spoken: false });

  const chosen = takeVoiceChoice(trimmed);
  if (chosen) {
    await proposeSetting(chosen, deps);
    return;
  }

  await act(parseIntent(trimmed, deps.vocabulary()), deps, trimmed);
}

/**
 * Carry out one intent.
 *
 * Split from {@link submitInput} because the headless router answers *with an
 * intent*, and routing its answer back through the same switch is what keeps
 * "start a swarm" and a sentence the router recognised as one from taking two
 * different code paths. `depth` stops a router that answers `freeform` from
 * recursing forever.
 */
async function act(
  intent: CompanionIntent,
  deps: HandoffDeps,
  original: string,
  depth = 0,
): Promise<void> {
  switch (intent.kind) {
    case 'stop':
      // A pending confirm is left, not merely interrupted — "stop" while the
      // companion is asking "push? say yes…" has to mean "no", not "keep
      // asking after the next sentence".
      if (deps.pendingAction()) {
        replacePending(deps, null);
        deps.speaker.cancel();
        deps.store.send('interrupt');
        await say(deps, 'Left it.');
        return;
      }
      deps.speaker.cancel();
      deps.store.send('interrupt');
      return;

    case 'repeat':
      return repeatLast(deps);

    case 'dismiss':
      if (deps.pendingAction()) {
        replacePending(deps, null);
        await say(deps, 'Left it.');
        return;
      }
      declined = null;
      await say(deps, 'Right, staying put.');
      return;

    case 'music':
      deps.onMusic?.(intent.on);
      await say(
        deps,
        intent.on
          ? 'Music on.'
          : 'Music off.',
      );
      return;

    case 'switchRepo':
      return switchRepo(intent.name, deps);

    case 'anyway':
      return runDeclined(deps);

    case 'command':
      return startCommand(intent, deps);

    // Theme B: `deps.navigate` has already decided and executed everything —
    // this speaks whatever it reports back, exactly the shape every other arm
    // takes. The `run`/`confirm`/`help` arms below are Theme C's, and are no
    // longer stubs, so nothing falls through to "I can't do that yet." here.
    case 'navigate': {
      const outcome = await deps.navigate(intent);
      await say(deps, outcome.say);
      return;
    }

    case 'run':
      return runById(intent.id, deps);

    case 'confirm':
      return resolvePending(deps);

    case 'help':
      return speakHelp(deps);

    // Phase 109 Theme G — persona profiles, in `profile-handoff.ts`.
    case 'profile':
      return actOnProfile(intent, deps);

    // Phase 109 — the companion changes itself.
    case 'setting':
      return changeSetting(intent, deps);

    case 'undoSetting':
      await deps.companionSettings.undoAndAnnounce(speakLive(deps));
      return;

    case 'pageOnlySetting':
      return offerSettingsPage(deps);

    case 'freeform':
      return route(intent.text || original, deps, depth);
  }
}

/**
 * Re-speak the last thing the companion said.
 *
 * Exported because it has two entry points: the `repeat` intent, and Theme C's
 * assistant-popover "Repeat" row, which reaches it through the ports registry
 * without a `repeat` ever being typed.
 */
export async function repeatLast(deps: HandoffDeps): Promise<void> {
  const last = [...deps.store.transcript]
    .reverse()
    .find((turn) => turn.role === 'companion' && turn.text.trim() !== '');
  if (!last) {
    await say(deps, 'I have not said anything yet.');
    return;
  }
  // A fresh turn rather than re-speaking the old one in place: the transcript
  // is a record of the conversation, and "say that again" happened.
  await say(deps, last.text);
}

/**
 * Hand the request to a real agent session.
 *
 * **Decision 10, as recommended: one live hand-off at a time, with an
 * override.** The refusal is a spoken sentence rather than a queue, because a
 * queue is invisible — a second command silently waiting behind the first is
 * indistinguishable from a companion that ignored it. Parallel work is what
 * `execSwarm` is for, and "anyway" is there for the case where the user means
 * it.
 *
 * The override reaches the state machine as `exit` then `submit`, exactly as
 * `shared`'s own transition-table docblock predicted — so `handoff` keeps
 * refusing `submit` and the table needed no new row and no new event.
 */
async function startCommand(
  intent: Extract<CompanionIntent, { kind: 'command' }>,
  deps: HandoffDeps,
): Promise<void> {
  const live = deps.activeHandoff();
  if (live && intent.override !== true) {
    declined = { intent, at: Date.now() };
    await say(
      deps,
      `${live.command} is still running — say "anyway" to start another.`,
    );
    return;
  }

  if (live) {
    // The override: retire the old hand-off in the machine's eyes before
    // asking it to accept a new submit.
    deps.store.send('exit');
    deps.setActiveHandoff(null);
  }

  if (deps.store.send('submit') !== 'thinking') return;

  // Decision-adjacent (Phase 81 Theme D): `releasePrep`'s Return is never the
  // companion's to press, even when hands-free and a voice-input provider
  // would otherwise allow it — the one skill in the roster that writes a
  // release branch.
  const wouldAutoSend = deps.autoSendAllowed();
  const autoSend = wouldAutoSend && !COMPANION_NEVER_AUTOSEND.includes(intent.id);
  const session = deps.startSkill({
    skillId: intent.id,
    ...(intent.body === undefined ? {} : { body: intent.body }),
    autoSend,
  });

  if (!session) {
    deps.store.send('settle');
    await say(
      deps,
      'I could not start that one — check the agent and skill settings.',
    );
    return;
  }

  const command = commandLabel(intent);
  deps.setActiveHandoff({ sessionId: session.id, command });
  declined = null;

  /*
    The spoken confirmation comes BEFORE the machine enters `handoff`, and it
    says which of the two things happened. With hands-free off — the default —
    the command is sitting at a prompt with its Return withheld, and saying so
    is the only way the user knows a keystroke is owed.
  */
  await say(
    deps,
    autoSend
      ? `Running ${command} now.`
      : wouldAutoSend
        ? `I have typed ${command} — this one I always leave for you to send.`
        : `I have typed ${command} in a new session — press Return when you are ready.`,
  );

  deps.store.send('handoff');
}

/** "anyway", on its own, after a refusal. */
async function runDeclined(deps: HandoffDeps): Promise<void> {
  const pending = declined;
  // A five-minute memory, because "anyway" after twenty minutes means
  // something else, and starting an agent on a misremembered request is the
  // one outcome worth being conservative about.
  if (!pending || Date.now() - pending.at > DECLINE_MEMORY_MS) {
    await say(deps, 'Anyway what? I have nothing waiting.');
    return;
  }
  declined = null;
  if (pending.intent.kind !== 'command') return act(pending.intent, deps, '');
  return startCommand({ ...pending.intent, override: true }, deps);
}

/** "switch to bilo-mono", or a bare "switch". */
async function switchRepo(name: string | undefined, deps: HandoffDeps): Promise<void> {
  const repos = await deps.repos();
  if (repos.length <= 1) {
    await say(deps, 'There is only the one repository open.');
    return;
  }

  if (name === undefined) {
    await say(deps, `Which one? ${repos.map((repo) => repo.name).join(', ')}.`);
    return;
  }

  const matched = matchRepoByName(repos, name);
  if (!matched) {
    await say(deps, `I could not find a repository called ${name}.`);
    return;
  }

  deps.selectRepo(matched.id);
  await say(deps, `Switching to ${matched.name}.`);
  // The caller re-orients: `runtime.ts` re-runs the overview against the new
  // repo, which is the same path the sidebar's own selection takes.
}

// --- doing things there, by tier (Phase 81 Theme C) ------------------------

/** One row of `CompanionVocabulary.commands` — `direct`/`confirm` only, `never` never appears. */
type VocabCommand = CompanionVocabulary['commands'][number];

/** How long a `confirm`-tier command stays pending. A fifth of {@link DECLINE_MEMORY_MS} — this one *runs* something (Decision 8). */
export const PENDING_ACTION_MEMORY_MS = 60 * 1000;

/** What the companion says instead of running a `never`-tier command, or one the router invented that is not a real `CommandId` at all. */
const PALETTE_REFUSAL = 'That one needs the palette — Mod+K, then type it.';

/**
 * "Push." "Fetch." "New terminal." Look the id up in the vocabulary rather
 * than importing `COMMAND_ACCESS` directly: `vocabulary.commands` already
 * carries only `direct`/`confirm` rows (Theme A dropped every `never` before
 * building it), so an id that is not there — because it is `never`-tier, or
 * because the router invented one that does not exist — takes the identical
 * refusal either way, exactly as the phase doc calls for.
 */
async function runById(id: string, deps: HandoffDeps): Promise<void> {
  const cmd = deps.vocabulary().commands.find((row) => row.id === id);
  if (!cmd) {
    await say(deps, PALETTE_REFUSAL);
    return;
  }
  if (cmd.access === 'confirm') return askToConfirm(cmd, deps);
  return runAndReport(cmd, deps);
}

/**
 * Set, replace or clear the one pending action, returning what it replaced.
 * An agent's question (Theme D) watches the slot itself and reads a replaced
 * or cleared slot as a "no", so nothing more is owed to it here.
 */
function replacePending(deps: HandoffDeps, next: PendingAction | null): PendingAction | null {
  const previous = deps.pendingAction();
  deps.setPendingAction(next);
  return previous;
}

/**
 * How a replaced question is named in "Never mind …". A palette command keeps
 * its label ("Never mind Push"); a question that is a sentence ("Answer to
 * "Nova" from now on", an agent's "Let your agent set …") reads mid-sentence.
 */
function neverMind(previous: PendingAction): string {
  if (previous.kind === undefined && previous.onConfirm === undefined) return previous.label;
  if (previous.kind === 'command') return previous.label;
  return `${previous.label.charAt(0).toLowerCase()}${previous.label.slice(1)}`;
}

/** Set (or replace) the one pending `confirm`-tier command, and ask for a yes. */
async function askToConfirm(cmd: VocabCommand, deps: HandoffDeps): Promise<void> {
  const previous = replacePending(deps, { id: cmd.id as CommandId, label: cmd.label, at: Date.now() });
  await say(
    deps,
    previous
      ? `Never mind ${neverMind(previous)} — ${cmd.label}? Say yes, press Return, or tap Run.`
      : `${cmd.label}? Say yes, press Return, or tap Run.`,
  );
}

/**
 * "Yes." An empty Return. A tap on the Run chip — all three reach this
 * through the identical `{kind:'confirm'}` intent (Decision 6, one `submit`
 * path).
 */
async function resolvePending(deps: HandoffDeps): Promise<void> {
  const pending = deps.pendingAction();
  if (!pending || Date.now() - pending.at > PENDING_ACTION_MEMORY_MS) {
    if (pending) replacePending(deps, null);
    await say(deps, "Nothing's waiting.");
    return;
  }
  // Phase 109 Theme D: an agent's change waiting on this yes. Asked before the
  // slot clears, so the asker reads it as a yes rather than a dismissal.
  if (pending.onConfirm !== undefined) {
    const line = pending.onConfirm();
    deps.setPendingAction(null);
    if (line !== null) await say(deps, line);
    return;
  }
  deps.setPendingAction(null);

  if (pending.kind === 'setting') {
    return applySetting({ key: pending.key, value: pending.value, confirmed: true }, deps);
  }

  if (pending.kind === 'openSettings') {
    const outcome = await deps.navigate({ kind: 'navigate', view: 'settings', page: 'companion' });
    await say(deps, outcome.say);
    return;
  }

  // The vocabulary's own row if it is still there (labels/tiers can only
  // change on the next release, so this is almost always a hit); the pending
  // action's own id/label cover the same-turn edge case where it is not.
  const cmd = deps.vocabulary().commands.find((row) => row.id === pending.id) ?? {
    id: pending.id,
    label: pending.label,
  };
  return runAndReport(cmd, deps);
}

/**
 * Run a `direct`-tier command (or a just-confirmed one) and say what
 * happened — never bypassing the command's own dialogs.
 *
 * `overlayDepth()` before and after is how a command that raised its own
 * confirm (a non-fast-forward push's `GitOpResult` conflict, `terminal.close`
 * on a running session) is told apart from one that simply ran: the
 * companion never answers *for* that dialog, it just says to look at it.
 */
async function runAndReport(
  cmd: { id: string; label: string },
  deps: HandoffDeps,
): Promise<void> {
  const before = overlayDepth();
  const result = runCommand(cmd.id as CommandId);

  if (result.ok) {
    if (overlayDepth() > before) {
      await say(deps, 'Done — check the dialog.');
    } else {
      await say(deps, `${cmd.label}.`);
    }
    return;
  }

  if (result.reason === 'disabled') {
    await say(deps, `${cmd.label} is unavailable — ${result.message}`);
    return;
  }

  // `no-runtime` (this window has not registered one — a popout, or a turn
  // that landed before `app.tsx` mounted) and `unknown` (should not happen:
  // the id came from the vocabulary/`COMMAND_ACCESS`) both relay the
  // registry's own sentence, which is already written to be spoken.
  await say(deps, result.message);
}

/** "What can you do?" — a spoken summary, and the full list posted as markdown. */
async function speakHelp(deps: HandoffDeps): Promise<void> {
  const vocabulary = deps.vocabulary();
  const commandCount = vocabulary.commands.length;
  const examples = vocabulary.commands.slice(0, 3).map((cmd) => cmd.label.toLowerCase());
  const skillNames = vocabulary.skills.map((skill) => skill.label);

  const settings = vocabulary.settings ?? [];

  const summary =
    `I can take you to any view or settings page, run ${commandCount} palette command` +
    `${commandCount === 1 ? '' : 's'}` +
    (examples.length > 0 ? ` — ${examples.join(', ')}` : '') +
    ` — and start ${skillNames.length} skill${skillNames.length === 1 ? '' : 's'}` +
    (skillNames.length > 0 ? `: ${skillNames.join(', ')}` : '') +
    '.' +
    // Phase 109 Theme C: the settings the companion can change by voice.
    (settings.length > 0 ? ' You can tell me to change my voice, what I call you, or how loud I am.' : '') +
    ` Say "what can you do" any time.`;

  const markdown = [
    '**Views**',
    ...vocabulary.views.map((view) => `- ${view.label}`),
    '',
    '**Commands**',
    ...vocabulary.commands.map((cmd) => `- ${cmd.label}`),
    '',
    '**Skills**',
    ...vocabulary.skills.map((skill) => `- ${skill.label} — ${skill.hint}`),
    ...(settings.length > 0
      ? ['', '**Settings**', ...settings.map((row) => `- ${row.label} — "${row.example}"`)]
      : []),
  ].join('\n');

  await say(deps, markdown, 'companion', summary);
}

// --- changing its own settings (Phase 109 Themes C and E) -------------------

/** {@link say}, but with the speaker as it is *after* a write — see {@link CompanionSettingsPort.liveSpeaker}. */
function speakLive(deps: HandoffDeps): (text: string) => Promise<void> {
  return async (text) => {
    const speaker = deps.companionSettings.liveSpeaker?.() ?? deps.speaker;
    await say({ ...deps, speaker }, text);
  };
}

/** What a `setting` intent's `op` resolves to against the current value. */
type ResolvedSetting =
  | { kind: 'value'; value: unknown }
  | { kind: 'say'; text: string }
  | { kind: 'choose'; key: 'companionVoices.local' | 'companionVoices.system'; options: readonly [VoiceOption, VoiceOption] };

const sameWord = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Turn "louder", "call me boss" or "Bella" into the whole new value. The
 * grammar cannot know the current volume or list, and only the renderer has
 * the system voices, so this is where an `op` becomes a value.
 */
function resolveSettingValue(intent: CompanionSettingIntent, deps: HandoffDeps): ResolvedSetting {
  const op = intent.op ?? 'set';
  const current = deps.companionSettings.read(intent.key);

  switch (op) {
    case 'set':
      return { kind: 'value', value: intent.value };

    case 'step': {
      const spec = companionSettingSpec(intent.key);
      const step = Number(intent.value);
      const from = typeof current === 'number' ? current : 0;
      const min = spec.value.kind === 'number' ? spec.value.min : 0;
      const max = spec.value.kind === 'number' ? spec.value.max : 1;
      const next = Math.min(max, Math.max(min, Math.round((from + step) * 100) / 100));
      if (next === from) {
        return { kind: 'say', text: step > 0 ? "That's as loud as I go." : "That's as quiet as I go." };
      }
      return { kind: 'value', value: next };
    }

    case 'add':
    case 'remove': {
      const list = Array.isArray(current) ? (current as string[]) : [];
      const word = String(intent.value).trim();
      const names = intent.key === 'companionNames';
      const present = list.some((entry) => sameWord(entry, word));
      if (op === 'add') {
        if (present) return { kind: 'say', text: names ? `I already answer to ${word}.` : `I already call you ${word}.` };
        return { kind: 'value', value: [...list, word] };
      }
      if (!present) return { kind: 'say', text: names ? `I don't answer to ${word}.` : `I don't call you ${word}.` };
      return { kind: 'value', value: list.filter((entry) => !sameWord(entry, word)) };
    }

    case 'match': {
      const heard = String(intent.value);
      const local = intent.key === 'companionVoices.local';
      const options: VoiceOption[] = local
        ? COMPANION_LOCAL_VOICES.map((voice) => ({ value: voice.id, name: voice.name, spoken: voice.spoken }))
        : systemVoiceOptions(deps);
      const match = matchVoice(heard, options);
      if (match.kind === 'match') return { kind: 'value', value: match.match.value };
      if (match.kind === 'ambiguous') {
        return { kind: 'choose', key: local ? 'companionVoices.local' : 'companionVoices.system', options: match.ambiguous };
      }
      return { kind: 'say', text: `I don't know a voice called ${heard}.` };
    }
  }
}

/** System voices as options, a shared display name told apart by its locale ("Daniel (en-GB)"). */
function systemVoiceOptions(deps: HandoffDeps): VoiceOption[] {
  const voices = deps.companionSettings.systemVoices();
  return voices.map((voice) => {
    const twin = voices.some((other) => other !== voice && other.name === voice.name);
    return {
      value: voice.uri,
      name: twin && voice.lang ? `${voice.name} (${voice.lang})` : voice.name,
      spoken: [voice.name],
    };
  });
}

/** "use voice Bella", "louder", "call me boss" — resolve the value, then propose it. */
async function changeSetting(intent: CompanionSettingIntent, deps: HandoffDeps): Promise<void> {
  const resolved = resolveSettingValue(intent, deps);
  if (resolved.kind === 'say') {
    await say(deps, resolved.text);
    return;
  }
  if (resolved.kind === 'choose') {
    voiceChoice = { key: resolved.key, options: resolved.options, at: Date.now() };
    await say(deps, `${resolved.options[0].name} or ${resolved.options[1].name}?`);
    return;
  }
  return proposeSetting({ key: intent.key, value: resolved.value }, deps);
}

/**
 * The answer to "Bella or Isabella?", if this line is one — a name, or "the
 * first one" / "the second one". Anything else drops the question and the
 * line is parsed as usual.
 */
function takeVoiceChoice(text: string): CompanionSettingChange | null {
  const pending = voiceChoice;
  voiceChoice = null;
  if (!pending || Date.now() - pending.at > VOICE_CHOICE_MEMORY_MS) return null;
  const [first, second] = pending.options;
  if (/\b(?:first|former)\b/i.test(text)) return { key: pending.key, value: first.value };
  if (/\b(?:second|latter|last)\b/i.test(text)) return { key: pending.key, value: second.value };
  const picked = matchVoice(text, pending.options);
  return picked.kind === 'match' ? { key: pending.key, value: picked.match.value } : null;
}

/**
 * Run the setter's checks, then apply, ask, or refuse — by tier.
 *
 * The guards are checked *as if* already confirmed first, so a change that
 * would be refused anyway ("stop answering to Nova" when Nova is the only
 * name) is refused at once, rather than after the user has said yes to it.
 */
async function proposeSetting(change: CompanionSettingChange, deps: HandoffDeps): Promise<void> {
  const checked = deps.companionSettings.preview({ ...change, confirmed: true });
  if (!checked.ok) {
    if (checked.reason === 'never') return offerSettingsPage(deps);
    await say(deps, checked.message);
    return;
  }

  const tiered = deps.companionSettings.preview(change);
  if (!tiered.ok && tiered.reason === 'confirm') {
    const question = companionSettingQuestion(change.key, checked.previous, checked.next);
    const previous = replacePending(deps, {
      kind: 'setting',
      key: change.key,
      value: checked.next,
      label: question,
      at: Date.now(),
    });
    await say(
      deps,
      previous
        ? `Never mind ${neverMind(previous)} — ${question}? Say yes, press Return, or tap Run.`
        : `${question}? Say yes, press Return, or tap Run.`,
    );
    return;
  }

  return applySetting(change, deps);
}

/** Write it and read it back — `settings-announce.ts` owns the order of the two. */
async function applySetting(change: CompanionSettingChange, deps: HandoffDeps): Promise<void> {
  const result = await deps.companionSettings.applyAndAnnounce(change, speakLive(deps));
  if (!result.ok) {
    await say(deps, result.message);
    return;
  }
  if (JSON.stringify(result.previous) === JSON.stringify(result.next)) {
    await say(deps, `No change — it's already ${describeCompanionSettingValue(result.key, result.next)}.`);
    return;
  }
  // Switching the offer off also ends whatever is playing now: "turn elevator
  // music off" said over the music means both.
  if (result.key === 'companionMusicOffer' && result.next === false) deps.onMusic?.(false);
}

/**
 * A `never`-tier setting asked for out loud. Refused, with the page offered
 * as a pending action — "yes", Return or the Run chip opens it.
 */
async function offerSettingsPage(deps: HandoffDeps): Promise<void> {
  replacePending(deps, { kind: 'openSettings', label: 'Open Settings ▸ Companion', at: Date.now() });
  await say(deps, "That one's in Settings, Companion — want me to open it?");
}

/**
 * The sentence the grammar did not recognise.
 *
 * Two outcomes, and the fallback matters more than the success. When the
 * router answers with an intent, that intent goes back through {@link act} —
 * the same code path a recognised sentence takes, so there is exactly one
 * implementation of "start a swarm". When there is no CLI at all, the text is
 * typed verbatim into a fresh agent session: the companion cannot think, but
 * the user's own agent can, and handing it over beats an apology.
 */
async function route(text: string, deps: HandoffDeps, depth: number): Promise<void> {
  if (depth > 0) {
    // The router already had its turn and answered with another freeform.
    await say(deps, 'I am not sure what to do with that one.');
    return;
  }

  if (deps.store.send('submit') !== 'thinking') return;
  const result = await deps.ask({ kind: 'route', text });

  if (!result.ok) {
    deps.store.send('settle');
    const session = deps.startVerbatim(text);
    await say(
      deps,
      session
        ? 'I cannot think about that myself, so I have typed it into a new agent session for you.'
        : result.kind === 'error'
          ? result.message
          : 'I could not run that.',
    );
    return;
  }

  const reply = result.value;
  if (reply.raw !== undefined && reply.raw !== '') {
    // Unparseable output, posted rather than spoken — the only evidence of
    // what the CLI actually said.
    deps.store.addTurn({ role: 'agent', text: reply.raw, spoken: false });
  }

  deps.store.send('settle');
  await say(deps, reply.say);
  if (reply.intent) await act(reply.intent, deps, text, depth + 1);
}

// --- watching the hand-off -------------------------------------------------

/**
 * How long a hand-off may sit before the companion asks about the Return.
 *
 * Twenty seconds, from the phase doc. Long enough that a cold agent CLI
 * starting up does not trip it, short enough that a user who walked away from
 * a withheld Return finds out before they have forgotten what they asked for.
 */
export const HANDOFF_START_GRACE_MS = 20_000;

export type HandoffWatchEvent =
  | { kind: 'activity'; activity: SessionActivity | undefined }
  | { kind: 'exit'; exitCode: number };

/**
 * Track one hand-off's rungs and decide when the answer is ready.
 *
 * A small state machine of its own, and it is a machine rather than an `if`
 * because the interesting condition is a *sequence*: the loading state ends on
 * the first `waiting` or `idle` **after at least one `thinking`**. Without the
 * "after" clause it ends immediately — a session that has not started yet is
 * `idle`, which is indistinguishable from one that has finished, and the
 * companion would read back the empty scrollback of an agent it just launched.
 *
 * Returned as a plain object so the subscription in `runtime.ts` and its test
 * share the logic without either owning a store subscription.
 */
export function createHandoffTracker(): {
  observe: (event: HandoffWatchEvent) => 'idle' | 'thinking' | 'ready' | 'ended';
  everThought: () => boolean;
} {
  let thought = false;
  let settled = false;

  return {
    everThought: () => thought,
    observe: (event) => {
      if (settled) return 'ended';
      if (event.kind === 'exit') {
        settled = true;
        return 'ended';
      }
      if (event.activity === 'thinking') {
        thought = true;
        return 'thinking';
      }
      if (thought && (event.activity === 'waiting' || event.activity === 'idle')) {
        settled = true;
        return 'ready';
      }
      return 'idle';
    },
  };
}

/**
 * The nudge for a hand-off that never started.
 *
 * The phase doc detects the user's Return "via `mstudio:pty:input` echo".
 * There is no such echo: `pty:input` is a one-way renderer→main send with no
 * event channel behind it, and adding a push channel so the companion can
 * notice a keystroke it already knows it did not send is a lot of wire for a
 * sentence. So the grace period runs from the hand-off being created, and the
 * absence of any `thinking` rung within it is the signal — which is the same
 * fact, observed on the channel that already exists.
 */
export function startNudgeSentence(command: string): string {
  return `${command} has not started yet — did you press Return?`;
}

// --- reading it back -------------------------------------------------------

/**
 * The agent's answer: in the thread whole, spoken as a summary.
 *
 * The two halves are deliberate. `extractLastAgentTurn` cuts one turn out of
 * the scrollback and strips every escape a synthesiser would otherwise read
 * aloud; that cleaned text goes in the thread, where it can be scrolled and
 * copied. What gets *spoken* is a two-to-four sentence summary from the same
 * headless CLI, prefixed with a sign-off phrase — because an agent's answer is
 * markdown with file paths and code in it, and reading that out is unbearable.
 *
 * With no CLI to summarise with, the first 240 characters of the cleaned text
 * are spoken instead, followed by a pointer to the thread. Degraded, but
 * truthful, and the thread still has everything.
 */
export const READBACK_VERBATIM_CHARS = 240;

export async function readBack(
  deps: HandoffDeps,
  sessionId: string,
  outcome: { exitCode?: number } = {},
): Promise<void> {
  const raw = await deps.scrollback(sessionId);
  const cleaned =
    raw === null
      ? ''
      : extractLastAgentTurn(raw, deps.markers(sessionId), COMPANION_READBACK_TAIL_CHARS);

  if (cleaned !== '') deps.store.addTurn({ role: 'agent', text: cleaned, spoken: false });

  if (outcome.exitCode !== undefined && outcome.exitCode !== 0) {
    deps.store.addTurn({
      role: 'agent',
      text: `The session exited with code ${outcome.exitCode}.`,
      spoken: false,
    });
    deps.setActiveHandoff(null);
    deps.store.send('exit');
    await say(deps, 'That session ended with an error — the details are in the thread.');
    deps.store.send('settle');
    return;
  }

  deps.setActiveHandoff(null);
  deps.store.send('exit');

  if (cleaned === '') {
    await say(deps, 'That one finished, but it left nothing I could read back.');
    deps.store.send('settle');
    return;
  }

  const signoff = phrase(deps, 'signoffs');
  const summary = await deps.ask({ kind: 'summarise', text: cleaned });

  deps.store.send('speak');
  await say(deps, signoff);
  if (summary.ok) {
    await say(deps, summary.value.say);
  } else {
    await say(deps, cleaned.slice(0, READBACK_VERBATIM_CHARS));
    await say(deps, 'The rest is in the thread.');
  }
  deps.store.send('settle');
}

/** What the companion calls a command out loud — the skill string, not the id. */
function commandLabel(intent: Extract<CompanionIntent, { kind: 'command' }>): string {
  return COMMAND_SPOKEN_NAMES[intent.id];
}

/**
 * How each command is named in speech.
 *
 * Not the `AgentCommandId` (`execAdhoc` read aloud is nonsense) and not the
 * skill string either (`/midnite-create-adhoc` is worse). These are what a
 * person would call the thing they just asked for, which is what a
 * confirmation has to say back for the user to know they were understood.
 */
export const COMMAND_SPOKEN_NAMES: Record<CompanionCommandId, string> = {
  execAdhoc: 'an ad hoc task',
  execBacklog: 'the next backlog task',
  execSwarm: 'a swarm',
  brainstorm: 'an ideation',
  refine: 'a refinement',
  addressIssue: 'an issue fix',
  prReview: 'a PR review',
  prFeedback: 'a PR feedback pass',
  gitReport: 'a git report',
  gitCleanup: 'a git cleanup',
  triage: 'a triage',
  releasePrep: 'release prep',
};
