import {
  agentHeadlessArgs,
  emptyCompanionSnapshot,
  type AgentDefinition,
  type AgentProfile,
  type CompanionSnapshot,
  type CompanionVocabulary,
  type RepoDescriptor,
  type SessionActivity,
} from '@midnite/studio-shared';

import { greet, orient, say, type ConciergeDeps } from './concierge';
import {
  createHandoffTracker,
  readBack,
  repeatLast,
  startNudgeSentence,
  submitInput,
  HANDOFF_START_GRACE_MS,
  type HandoffDeps,
} from './handoff';
import { navigateCompanion } from './navigate';
import { resolveFollowUp, liveFollowUpDeps } from './reveal/follow-up';
import { EXACT_SCORE, findResources } from './reveal/resolve';
import { companionTtsSpeaker } from './speaker';
import { silentSpeaker, type Speaker } from './ports';
import {
  announceCompanionProfileSwitch,
  applyAndAnnounceCompanionSetting,
  defaultAnnounceDeps,
  liveCompanionSpeaker,
  undoAndAnnounceCompanionSetting,
} from './settings-announce';
import { previewCompanionSetting, readCompanionSetting } from './settings-apply';
import {
  deleteCompanionProfile,
  previewDeleteCompanionProfile,
  previewSaveCompanionProfile,
  readCompanionProfiles,
  saveCompanionProfile,
  switchCompanionProfile,
} from './profiles';
import { vocabularyFor, withCompanionProfiles } from './vocabulary';
import {
  askProfileField,
  customAgent,
  deletedAgentNotice,
  ensureCustomAgents,
  refreshCustomAgents,
  unreadAgentNotice,
  withCustomAgents,
} from './custom-agents';
import { showToast } from './ext';
import { skillHandoff } from './ext';
import { skillHandoffAsProfile, startAgent, startProfileAgent } from './ext';
import { useTerminalStore } from './ext';
import { bridge } from '@midnite/studio-frame';
import { useCompanionStore } from './companion-store';
import { useUiStore } from './ext';

/**
 * The live wiring — Phase 79 Themes D and E.
 *
 * Everything the panel, the FAB and the voice half call is a **plain
 * function** here, over `getState()` and `bridge()`. No hooks, no context, no
 * provider. Two reasons, and neither is style.
 *
 * A companion turn outlives the render that started it: the flow awaits a
 * snapshot, then a digest, then a spoken sentence, and any component that
 * could have called a hook has re-rendered several times by the time the
 * digest lands. `start-agent.ts` is written as a plain function over
 * `getState()` for the identical reason and says so.
 *
 * And the entry points are a **contract with two sibling themes**. Theme C's
 * input bar calls `submitCompanionInput` from its `onSubmit`; Theme F's
 * `speaker.ts` registers itself through `setCompanionSpeaker`. Neither can
 * import a hook, and neither should have to know what a `ConciergeDeps` is.
 */

// --- the speaker port ------------------------------------------------------

let speaker: Speaker = silentSpeaker;

/**
 * Register the real speaker (Theme F), or `null` to go back to silence.
 *
 * Until this is called the companion runs its whole flow with
 * {@link silentSpeaker}: every turn is posted, none is marked `spoken`, and
 * the thread reads exactly as it will once there is a voice. That is not a
 * stub — voice off is the default configuration of this feature, and it has to
 * be the ordinary path rather than a branch.
 */
export function setCompanionSpeaker(next: Speaker | null): void {
  speaker = next ?? silentSpeaker;
}

export function companionSpeaker(): Speaker {
  return speaker;
}

// --- the interrupt token ---------------------------------------------------

/**
 * The run in flight, and how to stop it.
 *
 * One controller at a time: starting a new script aborts the old one, because
 * two overlapping scripts speaking into one thread is the failure mode this
 * exists to prevent. Every `await` in `concierge.ts` and `handoff.ts` checks
 * `signal.aborted`, so an abort takes effect at the next boundary rather than
 * needing a cancellable promise everywhere.
 */
let controller: AbortController | null = null;

function begin(): AbortSignal {
  controller?.abort();
  controller = new AbortController();
  return controller.signal;
}

/**
 * Cancel whatever the companion is saying — Escape, a mic press, a second
 * click on the speaking FAB, or a spoken "stop".
 *
 * Both halves are needed: `speaker.cancel()` stops the audio that is already
 * playing, and the abort stops the *script* from queueing the next four
 * sentences behind it.
 */
export function cancelCompanionSpeech(): void {
  speaker.cancel();
  controller?.abort();
  useCompanionStore.getState().send('interrupt');
}

// --- deps, assembled from the live stores ----------------------------------

function conciergeDeps(signal: AbortSignal, repo: RepoSnapshot): ConciergeDeps {
  const api = bridge();
  return {
    store: useCompanionStore.getState(),
    speaker,
    // A missing bridge (jsdom, the e2e harness) answers the "no repo open"
    // snapshot rather than throwing — the same posture every other
    // bridge-reading helper in the renderer takes.
    snapshot: async (repoPath) =>
      (await api?.companion.snapshot({ repoPath })) ?? emptyCompanionSnapshot(),
    digest: async (req) =>
      (await api?.companion.digest(req)) ?? { landed: [], inProgress: [], since: Date.now() },
    settings: () => {
      const ui = useUiStore.getState();
      return {
        honorifics: ui.companionHonorifics,
        handsFree: ui.companionHandsFree,
        voiceInReady: voiceInReady(),
      };
    },
    repo: () => repo,
    signal,
  };
}

function handoffDeps(signal: AbortSignal, repo: RepoSnapshot): HandoffDeps {
  const api = bridge();
  const base = conciergeDeps(signal, repo);

  return {
    ...base,
    startSkill: async (opts) => {
      const ui = useUiStore.getState();
      const options = {
        skillId: opts.skillId,
        ...(repo.id === null ? {} : { repoId: repo.id }),
        ...(repo.path === null ? {} : { cwd: repo.path }),
        ...(opts.body === undefined ? {} : { body: opts.body }),
        autoSend: opts.autoSend,
      };
      const context = (primaryAgentId: string) => ({
        skills: ui.agentSkills as Record<string, string | undefined>,
        primaryAgentId,
        agents: rosterCache,
      });
      // Phase 154 follow-up: a custom agent runs the hand-off through `agentProfile:prepareLaunch`, so its
      // prompt, model and tool limits apply. A deleted one falls back to its base agent and says so.
      const lookup = await lookupCustomAgent(ui.primaryAgentProfileId);
      const profile = lookup.profile;
      if (ui.primaryAgentProfileId !== null && profile !== null) {
        const started = await skillHandoffAsProfile(options, context(ui.primaryAgent), profile);
        if (started !== 'missing') return started;
      }
      const notice = fallbackNotice(ui.primaryAgentProfileId, lookup);
      const session = skillHandoff(options, context(profile?.baseAgentId ?? ui.primaryAgent));
      return session && notice !== undefined ? { id: session.id, notice } : session;
    },
    startVerbatim: async (text) => {
      if (repo.id === null || repo.path === null) return null;
      const ui = useUiStore.getState();
      const lookup = await lookupCustomAgent(ui.primaryAgentProfileId);
      const profile = lookup.profile;
      const target = { repoId: repo.id, cwd: repo.path, title: 'Companion', prompt: text, autoSend: false };
      if (ui.primaryAgentProfileId !== null && profile !== null) {
        const started = await startProfileAgent({ ...target, profile });
        if (started !== 'missing') return started;
      }
      const notice = fallbackNotice(ui.primaryAgentProfileId, lookup);
      const baseId = profile?.baseAgentId ?? ui.primaryAgent;
      const agent = rosterCache.find((entry) => entry.id === baseId) ?? rosterCache[0];
      if (!agent) return null;
      const session = startAgent({ ...target, agentId: agent.id, command: agent.command });
      return session && notice !== undefined ? { id: session.id, notice } : session;
    },
    ask: async (req) => {
      const ui = useUiStore.getState();
      const result = await api?.companion.ask({
        kind: req.kind,
        text: req.text,
        repoPath: repo.path,
        agentId: ui.primaryAgent,
        // Phase 154 Theme H: the custom agent the companion thinks through, when one is chosen.
        ...askProfileField(ui.primaryAgentProfileId),
        snapshot: lastSnapshot,
        // Settings ▸ Companion ▸ Personality's two free-text fields (Ad
        // Hoc) — read fresh from the store on every ask, same as
        // `agentId` above, since main has no copy of a renderer
        // preference. `CompanionAskRequest`'s own schema trims and caps
        // both; an untouched `''` default is what keeps `buildAskPrompt`
        // reading exactly as it did before these fields existed.
        personality: ui.companionPersonality,
        aboutUser: ui.companionAboutUser,
        // Phase 81 Theme E — the router's `'route'` prompt learns the same
        // views/pages/commands/skills/repos the grammar already knows. The
        // flow's own cache, same as `snapshot` above: fetching it fresh per
        // `ask` would be an IPC round trip (`repos.list`) this request does
        // not otherwise need.
        vocabulary: vocabularyCache ? withCustomAgents(withCompanionProfiles(vocabularyCache)) : undefined,
      });
      if (result?.ok && result.value.agentProfileFallback === 'deleted') {
        return { ...result, value: { ...result.value, say: `${noteDeletedAgent()} ${result.value.say}` } };
      }
      return result ?? { ok: false, kind: 'error', message: 'The companion is not connected.' };
    },
    scrollback: async (sessionId) => {
      const ptyId = useTerminalStore.getState().ptyIds[sessionId];
      if (!ptyId || !api) return null;
      const answer = await api.pty.snapshot({ ptyId });
      return new TextDecoder().decode(answer.bytes);
    },
    markers: (sessionId) => {
      const terminal = useTerminalStore.getState();
      const agentId =
        terminal.liveAgentId[sessionId] ??
        terminal.sessions.find((session) => session.id === sessionId)?.agentId ??
        null;
      const activity = rosterCache.find((entry) => entry.id === agentId)?.activity;
      if (!activity) return undefined;
      return {
        ...(activity.awaitingInput === undefined ? {} : { awaitingInput: activity.awaitingInput }),
        frameEnd: activity.frameEnd,
      };
    },
    repos: async () => (await api?.repos.list()) ?? [],
    selectRepo: (repoId) => useUiStore.getState().selectRepo(repoId),
    autoSendAllowed: () => useUiStore.getState().companionHandsFree && voiceInReady(),
    activeHandoff: () => useCompanionStore.getState().activeHandoff,
    setActiveHandoff: (handoff) => useCompanionStore.getState().setActiveHandoff(handoff),
    pendingAction: () => useCompanionStore.getState().pendingAction,
    setPendingAction: (action) => useCompanionStore.getState().setPendingAction(action),
    vocabulary: () => withCustomAgents(withCompanionProfiles(vocabularyCache ?? vocabularyFor([]))),
    navigate: (intent) => navigateCompanion(intent),
    resource: {
      find: (query, limit) => findResources(query, { limit }),
      followUp: (request) => resolveFollowUp(request, liveFollowUpDeps()),
      exactScore: EXACT_SCORE,
    },
    // Phase 109 Themes C and E: the companion's voice as a third way into the
    // one settings setter, with the read-back and Undo toast around it.
    companionSettings: {
      read: (key) => readCompanionSetting(useUiStore.getState(), key),
      preview: (change) => previewCompanionSetting(change, 'voice'),
      applyAndAnnounce: (change, speak) =>
        applyAndAnnounceCompanionSetting(change, 'voice', { ...defaultAnnounceDeps(), speak }),
      undoAndAnnounce: (speak) => undoAndAnnounceCompanionSetting({ ...defaultAnnounceDeps(), speak }),
      systemVoices: () =>
        (typeof window === 'undefined' ? [] : (window.speechSynthesis?.getVoices() ?? [])).map((voice) => ({
          uri: voice.voiceURI,
          name: voice.name,
          lang: voice.lang,
        })),
      // Phase 109 Theme G — persona profiles over `profiles.ts`.
      profiles: {
        state: () => readCompanionProfiles(),
        previewSave: (name) => previewSaveCompanionProfile(name),
        save: (name, overwrite) => saveCompanionProfile(name, { overwrite }),
        switchAndAnnounce: async (name, speak) => {
          const result = switchCompanionProfile(name, 'voice');
          if (result.ok && result.op === 'switch') {
            await announceCompanionProfileSwitch(result, 'voice', { ...defaultAnnounceDeps(), speak });
          }
          return result;
        },
        previewDelete: (name) => previewDeleteCompanionProfile(name),
        delete: (name) => deleteCompanionProfile(name),
      },
      // The registered speaker while speech is on (a test's double included);
      // the store's answer the moment a change has just turned it on or off.
      liveSpeaker: () => (speaker.available === false ? liveCompanionSpeaker() : speaker),
      // Phase 109 Theme F — the audition plays voices nobody has chosen yet,
      // so it reaches the engine directly with a one-off voice, never through
      // the registered speaker's stored selection.
      audition: {
        localReady: async () => {
          try {
            const answer = await api?.companion.ttsModelOnDisk?.();
            // No answer (no bridge, or a preload older than the channel):
            // try the local engine anyway — a failed sample falls back.
            return answer === undefined ? api !== undefined : answer.ok && answer.value.onDisk;
          } catch {
            return false;
          }
        },
        playSample: (engine, voice, text, signal) =>
          companionTtsSpeaker.speakWithEngine(engine, text, { voice, signal }),
      },
    },
    // Phase 109 Theme H — "tune me" and tweaks. The same `ask` channel in its
    // `'persona'` mode; a reply that is not the `{text, summary}` pair is a
    // failure here, which an interview answers with its template.
    persona: async (request) => {
      const result = await api?.companion.ask({
        kind: 'persona',
        text: request.mode === 'tweak' ? request.instruction : `interview: ${request.target}`,
        repoPath: repo.path,
        agentId: useUiStore.getState().primaryAgent,
        ...askProfileField(useUiStore.getState().primaryAgentProfileId),
        persona: request,
      });
      if (!result) return { ok: false, kind: 'error', message: 'The companion is not connected.' };
      if (!result.ok) return result;
      if (result.value.agentProfileFallback === 'deleted') noteDeletedAgent();
      return result.value.persona
        ? { ok: true, value: result.value.persona }
        : { ok: false, kind: 'error', message: "The agent's answer wasn't something I could use." };
    },
    hasAgentCli: () => rosterCache.some((agent) => agentHeadlessArgs(agent.id) !== null),
  };
}

/**
 * Whether anything is actually listening.
 *
 * Theme F owns the answer and has not landed yet, so this reads `false` until
 * it does — which is the *correct* answer today and the safe one either way:
 * it is the third condition on `autoSend: true`, so until a provider exists,
 * nothing this companion starts can run without a human Return.
 *
 * Left as one named function rather than an inline `false` so Theme F's wiring
 * is a one-line change with an obvious home.
 */
function voiceInReady(): boolean {
  return false;
}

// --- the repo the flow is about --------------------------------------------

type RepoSnapshot = { path: string | null; name: string | null; id: string | null };

/**
 * The roster and the last snapshot, cached at the top of each flow.
 *
 * Both are read once per run and then used from several places inside it (the
 * hand-off needs the roster to resolve an agent, the read-back needs it for
 * the activity markers, `ask` needs the snapshot as grounding). Fetching them
 * per call would put an IPC round-trip inside a loop over spoken sentences.
 */
let rosterCache: readonly AgentDefinition[] = [];
let lastSnapshot: CompanionSnapshot | null = null;
/**
 * Views, settings pages, commands and skills the grammar and (Theme E) the
 * router's prompt may name — refreshed alongside {@link refreshRoster},
 * never on every keystroke. `null` only before the first flow has run;
 * `HandoffDeps.vocabulary` falls back to an empty-repos vocabulary rather
 * than throwing when read before then.
 */
let vocabularyCache: CompanionVocabulary | null = null;

async function currentRepo(): Promise<RepoSnapshot> {
  const api = bridge();
  const selected = useUiStore.getState().selectedRepoId;
  const repos: readonly RepoDescriptor[] = (await api?.repos.list()) ?? [];
  const repo = repos.find((entry) => entry.id === selected) ?? repos[0] ?? null;
  if (!repo) return { path: null, name: null, id: null };
  const main = repo.worktrees.find((worktree) => worktree.isMain);
  return { path: main?.path ?? repo.path, name: repo.name, id: repo.id };
}

/**
 * Phase 154 Theme H: the companion's custom agent is gone, so main answered with the built-in agent. Clear
 * the choice (the title-bar pill goes back to the built-in), show it, and return the sentence to say.
 */
function noteDeletedAgent(baseAgentId?: string): string {
  const ui = useUiStore.getState();
  ui.setPrimaryAgentProfile(null);
  const fallbackId = baseAgentId ?? ui.primaryAgent;
  const label = rosterCache.find((agent) => agent.id === fallbackId)?.label ?? fallbackId;
  const notice = deletedAgentNotice(label);
  showToast({ message: notice });
  return notice;
}

/**
 * The companion's custom agent for a launch. The list is read first when it never has been, so a hand-off
 * run before anything loaded it does not mistake a valid agent for a deleted one. `readable` is false when
 * that read failed: the agent is then unknown rather than gone.
 */
async function lookupCustomAgent(profileId: string | null): Promise<{ profile: AgentProfile | null; readable: boolean }> {
  if (profileId === null) return { profile: null, readable: true };
  const cached = customAgent(profileId);
  if (cached !== null) return { profile: cached, readable: true };
  const { loaded } = await ensureCustomAgents();
  return { profile: customAgent(profileId), readable: loaded };
}

/**
 * The notice for a launch that fell back to the built-in agent, or `undefined` when no custom agent was
 * chosen or it launched. A deleted agent clears the choice; one that could not be looked up is kept, so
 * the next launch tries again.
 */
function fallbackNotice(profileId: string | null, lookup: { profile: AgentProfile | null; readable: boolean }): string | undefined {
  if (profileId === null) return undefined;
  if (lookup.readable) return noteDeletedAgent(lookup.profile?.baseAgentId);
  const label = rosterCache.find((agent) => agent.id === useUiStore.getState().primaryAgent)?.label ?? useUiStore.getState().primaryAgent;
  const notice = unreadAgentNotice(label);
  showToast({ message: notice });
  return notice;
}

/** Refresh the roster cache. Cheap, and the answer changes only on an `agents.json` edit. */
async function refreshRoster(): Promise<void> {
  const answer = await bridge()?.agent.list();
  if (answer) rosterCache = answer.agents;
}

/** Refresh the vocabulary cache from the open repos' names. */
async function refreshVocabulary(): Promise<void> {
  const repos = (await bridge()?.repos.list()) ?? [];
  vocabularyCache = vocabularyFor(repos);
}

// --- the entry points siblings call ---------------------------------------

/**
 * Run one flow, and land the machine somewhere sane whatever it throws.
 *
 * **Every entry point below is called as `void f()`** — the panel's `onSubmit`,
 * the ports registry, an effect — so a rejection is an unhandled promise
 * rejection with nothing to catch it. The consequence is not a logged error, it
 * is a **wedged state machine**: `greet` moves the machine to `greeting`, and a
 * throw two awaits later leaves it there forever, with the header reading
 * "Saying hello…" and nothing able to move it but the master switch.
 *
 * That is not hypothetical. A bridge without the `companion` namespace — an
 * older preload, or the e2e harness before its mock grew one — makes
 * `api.companion.snapshot` a TypeError on the first await of the greeting, and
 * that is exactly how it failed.
 *
 * `settle` rather than `interrupt`: nothing was interrupted, the flow simply
 * could not finish. And the sentence is posted rather than swallowed, because a
 * companion that stops mid-greeting and says nothing is indistinguishable from
 * one that has crashed — which, at that point, it has.
 */
async function guarded(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    useCompanionStore.getState().addTurn({
      role: 'companion',
      text: `Something went wrong on my end: ${error instanceof Error ? error.message : String(error)}`,
      spoken: false,
    });
    speaker.cancel();
    useCompanionStore.getState().send('settle');
  }
}

/**
 * Greet, orient and offer — Theme C's panel calls this on open.
 *
 * Guarded on `companionEnabled` because the panel can be opened from a
 * command palette entry or a restored layout, and a disabled companion that
 * greets you anyway is the shape of bug that makes a default-off feature feel
 * like it is not.
 */
export async function greetCompanion(): Promise<void> {
  if (!useUiStore.getState().companionEnabled) return;
  const signal = begin();
  await refreshRoster();
  await refreshVocabulary();
  await refreshCustomAgents();
  const repo = await currentRepo();
  const deps = conciergeDeps(signal, repo);
  lastSnapshot = null;
  await guarded(() => greet(withSnapshotCapture(deps)));
}

/**
 * Re-orient without greeting — the active repository changed while the panel
 * was open.
 */
export async function reorientCompanion(): Promise<void> {
  if (!useUiStore.getState().companionEnabled) return;
  const signal = begin();
  const repo = await currentRepo();
  await guarded(() => orient(withSnapshotCapture(conciergeDeps(signal, repo))));
}

/**
 * One line of input — Theme C's input bar calls this from `onSubmit`, and
 * Theme F's recogniser will call it with a transcript.
 *
 * Deliberately `Promise<void>` and not a result: the answer is the transcript,
 * which the panel is already rendering, and there is nothing for a caller to
 * branch on.
 */
export async function submitCompanionInput(text: string): Promise<void> {
  if (!useUiStore.getState().companionEnabled) return;
  const signal = begin();
  if (rosterCache.length === 0) await refreshRoster();
  if (!vocabularyCache) await refreshVocabulary();
  // Every line: a save on the Agents page renames what "use Reviewer" can match.
  await refreshCustomAgents();
  const repo = await currentRepo();
  const deps = withSnapshotCapture(handoffDeps(signal, repo)) as HandoffDeps;
  const before = useCompanionStore.getState().activeHandoff?.sessionId ?? null;

  await guarded(async () => {
    await submitInput(text, deps);

    // A `switchRepo` that landed changes what the companion is looking at, so
    // it re-orients — the same thing that happens when the sidebar selection
    // changes, which is the whole point of `reorientCompanion` existing.
    const after = await currentRepo();
    if (after.id !== repo.id && !signal.aborted) {
      await orient(withSnapshotCapture(conciergeDeps(signal, after)));
      return;
    }

    const handoff = useCompanionStore.getState().activeHandoff;
    if (handoff && handoff.sessionId !== before) armNudge(handoff.sessionId, handoff.command);
  });
}

/**
 * Re-speak the companion's last line — Theme C's assistant-popover "Repeat"
 * row, and the `repeat` intent's own path.
 *
 * Not routed through `submitCompanionInput('repeat')`: that would post the
 * word "repeat" into the thread as a user turn, and pressing a Repeat button
 * is not something the user said.
 */
export async function repeatCompanionLast(): Promise<void> {
  if (!useUiStore.getState().companionEnabled) return;
  const signal = begin();
  const repo = await currentRepo();
  await guarded(() => repeatLast(handoffDeps(signal, repo)));
}

/**
 * Capture the snapshot on its way past, so `ask` has grounding.
 *
 * A wrapper rather than a field on the deps because the snapshot is fetched
 * *inside* the flow, and the router may be called several turns later — by
 * which time the flow that fetched it has returned.
 */
function withSnapshotCapture<T extends ConciergeDeps>(deps: T): T {
  return {
    ...deps,
    snapshot: async (repoPath: string | null) => {
      const answer = await deps.snapshot(repoPath);
      lastSnapshot = answer;
      return answer;
    },
  };
}

// --- watching the hand-off -------------------------------------------------

/**
 * The one subscription this feature needs mounted — `app.tsx` calls it once,
 * the same shape `useAgentActivity()` takes.
 *
 * It watches the **terminal store**, not `pty:activity` and `pty:exit`
 * directly, and that is a deliberate deviation from the phase doc's wording.
 * Those two channels name a `ptyId`; the hand-off names a `sessionId`; and the
 * mapping between them lives in `terminal-store.ts`'s `ptyIds`, maintained by
 * the two always-mounted subscriptions (`use-agent-activity.ts`,
 * `use-session-exits.ts`) that exist precisely because per-view listeners
 * missed events while the terminal panel was collapsed. Subscribing to the
 * same channels a third time would mean re-implementing that ptyId→sessionId
 * invert and re-learning the same bug; subscribing to the store it feeds is
 * the same facts, already keyed the way this feature needs them.
 */
export function watchCompanionHandoff(): () => void {
  const tracker = new Map<string, ReturnType<typeof createHandoffTracker>>();
  let lastActivity: SessionActivity | undefined;
  let lastExit: number | undefined;

  return useTerminalStore.subscribe((state, previous) => {
    const handoff = useCompanionStore.getState().activeHandoff;
    if (!handoff) {
      tracker.clear();
      return;
    }

    const id = handoff.sessionId;
    const activity = state.activity[id];
    const exitCode = state.exitCodes[id];
    const activityChanged = activity !== previous.activity[id] || activity !== lastActivity;
    const exited = exitCode !== undefined && exitCode !== lastExit;
    if (!activityChanged && !exited) return;

    lastActivity = activity;
    lastExit = exitCode;

    const watch = tracker.get(id) ?? createHandoffTracker();
    tracker.set(id, watch);

    const verdict = exited
      ? watch.observe({ kind: 'exit', exitCode: exitCode as number })
      : watch.observe({ kind: 'activity', activity });

    if (verdict !== 'ready' && verdict !== 'ended') return;

    tracker.delete(id);
    clearNudge();
    const signal = begin();
    void currentRepo().then((repo) =>
      guarded(() =>
        readBack(
          withSnapshotCapture(handoffDeps(signal, repo)) as HandoffDeps,
          id,
          exited ? { exitCode: exitCode as number } : {},
        ),
      ),
    );
  });
}

// --- the "did you press Return?" nudge -------------------------------------

let nudgeTimer: ReturnType<typeof setTimeout> | undefined;

function armNudge(sessionId: string, command: string): void {
  clearNudge();
  nudgeTimer = setTimeout(() => {
    nudgeTimer = undefined;
    const store = useCompanionStore.getState();
    const handoff = store.activeHandoff;
    // Still the same hand-off, and still nothing has been generated: the
    // Return is owed.
    if (!handoff || handoff.sessionId !== sessionId) return;
    if (useTerminalStore.getState().activity[sessionId] === 'thinking') return;
    const signal = begin();
    void currentRepo().then((repo) =>
      guarded(() => say(conciergeDeps(signal, repo), startNudgeSentence(command))),
    );
  }, HANDOFF_START_GRACE_MS);
}

function clearNudge(): void {
  if (nudgeTimer !== undefined) clearTimeout(nudgeTimer);
  nudgeTimer = undefined;
}

/** Test-only: the module's timers and caches are otherwise private. */
export function resetCompanionRuntimeForTests(): void {
  clearNudge();
  controller?.abort();
  controller = null;
  speaker = silentSpeaker;
  rosterCache = [];
  lastSnapshot = null;
  vocabularyCache = null;
}
