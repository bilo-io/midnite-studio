import { COMPANION_COMMAND_IDS } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { overlayDepth } from '../../components/dialog-host';
import type { CommandRuntime } from '../../services/keybindings/use-command-handlers';
import { setCommandRuntime } from './command-runtime';
import {
  COMMAND_SPOKEN_NAMES,
  PENDING_ACTION_MEMORY_MS,
  createHandoffTracker,
  readBack,
  resetHandoffState,
  startNudgeSentence,
  submitInput,
  READBACK_VERBATIM_CHARS,
} from './handoff';
import type { PendingAction } from '../../store/companion-store';
import { fakeHandoffDeps, fakeSpeaker, fakeStore, repoFixture, vocabularyFixture } from './test-doubles';
import { DEFAULT_AGENT_SKILLS } from '../../store/ui-store';

// `overlayDepth` is real module state (`dialog-host.tsx`) that only changes
// when a dialog actually opens — nothing in these fakes opens one, so it is
// mocked here rather than exercised, precisely for the one test that needs it
// to answer non-zero.
vi.mock('../../components/dialog-host', () => ({ overlayDepth: vi.fn(() => 0) }));

/**
 * The hand-off and the read-back, against fakes — Phase 79 Theme E.
 *
 * `resetHandoffState()` after every test because the "anyway" memory is module
 * state by design (a conversational scrap with a lifetime of one exchange, not
 * something to persist or render) — and module state between tests is the
 * classic way a suite passes in one order and fails in another.
 */
afterEach(() => resetHandoffState());
afterEach(() => setCommandRuntime(null));

/** A `CommandRuntime` built from just the entries a test cares about. */
function runtimeWith(entries: Partial<CommandRuntime>): CommandRuntime {
  return entries as CommandRuntime;
}

/** A stateful `pendingAction`/`setPendingAction` pair, for the tests that need one that remembers. */
function fakePendingActionSlot(): {
  pendingAction: () => PendingAction | null;
  setPendingAction: (action: PendingAction | null) => void;
} {
  let current: PendingAction | null = null;
  return {
    pendingAction: () => current,
    setPendingAction: (action) => {
      current = action;
    },
  };
}

describe('the companion command list', () => {
  it('names only ids that have a skill string behind them', () => {
    // The compile-time subset proof in `handoff.ts` catches a renamed id; this
    // catches an id that exists but has no skill, which would make
    // `skillHandoff` return null and the companion claim it started something.
    for (const id of COMPANION_COMMAND_IDS) {
      expect(DEFAULT_AGENT_SKILLS[id]).toBeTruthy();
    }
  });

  it('has a spoken name for every id', () => {
    for (const id of COMPANION_COMMAND_IDS) {
      expect(COMMAND_SPOKEN_NAMES[id]).toBeTruthy();
      // Never the raw id or the skill string — `execAdhoc` read aloud is
      // nonsense and `/midnite-exec-adhoc` is worse.
      expect(COMMAND_SPOKEN_NAMES[id]).not.toBe(id);
      expect(COMMAND_SPOKEN_NAMES[id]).not.toContain('/');
    }
  });

  // Phase 81 Theme D: releasePrep joined the roster (it "stops before
  // anything irreversible" — Decision 10); releaseComplete stays out because
  // it tags and pushes.
  it('excludes every loop and releaseComplete', () => {
    for (const id of COMPANION_COMMAND_IDS) {
      expect(id.startsWith('loop')).toBe(false);
      expect(id).not.toBe('releaseComplete');
    }
  });
});

describe('submitInput — a recognised command', () => {
  it('posts the user turn, starts the skill, and says the Return is owed', async () => {
    const store = fakeStore();
    const startSkill = vi.fn().mockReturnValue({ id: 'session-9' });
    const setActiveHandoff = vi.fn();

    await submitInput(
      'start an ad hoc task to fix the flaky spec',
      fakeHandoffDeps({ store, startSkill, setActiveHandoff }),
    );

    expect(store.lines()[0]).toBe('user: start an ad hoc task to fix the flaky spec');
    expect(startSkill).toHaveBeenCalledWith({
      skillId: 'execAdhoc',
      body: 'fix the flaky spec',
      autoSend: false,
    });
    expect(setActiveHandoff).toHaveBeenCalledWith({
      sessionId: 'session-9',
      command: 'an ad hoc task',
    });
    expect(store.lines()[1]).toBe(
      'companion: I have typed an ad hoc task in a new session — press Return when you are ready.',
    );
    expect(store.state).toBe('handoff');
  });

  it('says "running now" instead, and only when auto-send is actually allowed', async () => {
    const store = fakeStore();
    await submitInput(
      'start a swarm',
      fakeHandoffDeps({ store, autoSendAllowed: () => true }),
    );
    expect(store.lines()[1]).toBe('companion: Running a swarm now.');
  });

  it('never passes autoSend when the gate says no', async () => {
    const startSkill = vi.fn().mockReturnValue({ id: 's' });
    await submitInput('start a swarm', fakeHandoffDeps({ startSkill }));
    expect(startSkill.mock.calls[0]?.[0]).toMatchObject({ autoSend: false });
  });

  // Phase 81 Theme D, Decision-adjacent: releasePrep's Return is always the
  // user's, even with hands-free on and a voice-input provider ready.
  it('never auto-sends releasePrep, even when the gate says yes, and says so', async () => {
    const store = fakeStore();
    const startSkill = vi.fn().mockReturnValue({ id: 'session-rp' });
    await submitInput(
      'release prep',
      fakeHandoffDeps({ store, startSkill, autoSendAllowed: () => true }),
    );
    expect(startSkill).toHaveBeenCalledWith({ skillId: 'releasePrep', autoSend: false });
    expect(store.lines()[1]).toBe(
      'companion: I have typed release prep — this one I always leave for you to send.',
    );
  });

  it('owns up when the session could not be started, and does not claim a hand-off', async () => {
    const store = fakeStore();
    const setActiveHandoff = vi.fn();
    await submitInput(
      'start a swarm',
      fakeHandoffDeps({ store, startSkill: () => null, setActiveHandoff }),
    );

    expect(store.lines()[1]).toBe(
      'companion: I could not start that one — check the agent and skill settings.',
    );
    expect(setActiveHandoff).not.toHaveBeenCalled();
    expect(store.state).toBe('idle');
  });
});

describe('submitInput — Decision 10, one live hand-off at a time', () => {
  const live = { sessionId: 'session-1', command: 'a swarm' };

  it('declines a second command out loud rather than queueing it', async () => {
    const store = fakeStore();
    const startSkill = vi.fn();
    await submitInput(
      'start an ad hoc task',
      fakeHandoffDeps({ store, activeHandoff: () => live, startSkill }),
    );

    expect(startSkill).not.toHaveBeenCalled();
    expect(store.lines()[1]).toBe(
      'companion: a swarm is still running — say "anyway" to start another.',
    );
  });

  it('honours "anyway" on its own, and reaches the machine as exit + submit', async () => {
    const store = fakeStore();
    const startSkill = vi.fn().mockReturnValue({ id: 'session-2' });
    const deps = fakeHandoffDeps({ store, activeHandoff: () => live, startSkill });

    await submitInput('start an ad hoc task', deps);
    await submitInput('anyway', deps);

    expect(startSkill).toHaveBeenCalledWith({ skillId: 'execAdhoc', autoSend: false });
    // No new event and no new transition row: the override is `exit` then
    // `submit`, exactly as `shared`'s transition-table docblock predicted.
    expect(store.events).toContain('exit');
    expect(store.events).toContain('submit');
  });

  it('honours the override inline — "…anyway" on the command itself', async () => {
    const startSkill = vi.fn().mockReturnValue({ id: 'session-3' });
    await submitInput(
      'start an ad hoc task anyway',
      fakeHandoffDeps({ activeHandoff: () => live, startSkill }),
    );
    expect(startSkill).toHaveBeenCalled();
  });

  it('has nothing to run when "anyway" arrives out of the blue', async () => {
    const store = fakeStore();
    await submitInput('anyway', fakeHandoffDeps({ store }));
    expect(store.lines()[1]).toBe('companion: Anyway what? I have nothing waiting.');
  });

  it('forgets a declined command after the memory window', async () => {
    vi.useFakeTimers();
    try {
      const store = fakeStore();
      const deps = fakeHandoffDeps({ store, activeHandoff: () => live });
      await submitInput('start an ad hoc task', deps);
      vi.setSystemTime(Date.now() + 10 * 60 * 1000);
      await submitInput('anyway', deps);
      expect(store.lines().at(-1)).toBe('companion: Anyway what? I have nothing waiting.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a dismissal clears the declined command', async () => {
    const store = fakeStore();
    const startSkill = vi.fn();
    const deps = fakeHandoffDeps({ store, activeHandoff: () => live, startSkill });
    await submitInput('start an ad hoc task', deps);
    await submitInput('no thanks', deps);
    await submitInput('anyway', deps);
    expect(startSkill).not.toHaveBeenCalled();
  });
});

describe('submitInput — the control words', () => {
  it('"stop" cancels the speaker and interrupts the script', async () => {
    const store = fakeStore('speaking');
    const speaker = fakeSpeaker();
    await submitInput('stop', fakeHandoffDeps({ store, speaker }));
    expect(speaker.cancelled).toBe(1);
    expect(store.state).toBe('idle');
  });

  it('"say that again" re-speaks the last companion line as a new turn', async () => {
    const store = fakeStore();
    store.addTurn({ role: 'companion', text: 'Three PRs landed.', spoken: true });
    store.addTurn({ role: 'user', text: 'ok', spoken: false });

    await submitInput('say that again', fakeHandoffDeps({ store }));
    expect(store.lines().at(-1)).toBe('companion: Three PRs landed.');
  });

  it('admits it has said nothing when asked to repeat first thing', async () => {
    const store = fakeStore();
    await submitInput('repeat', fakeHandoffDeps({ store }));
    expect(store.lines().at(-1)).toBe('companion: I have not said anything yet.');
  });

  it('hands a music request to Theme G, when Theme G is there', async () => {
    const onMusic = vi.fn();
    await submitInput('put some music on', fakeHandoffDeps({ onMusic }));
    expect(onMusic).toHaveBeenCalledWith(true);

    onMusic.mockClear();
    await submitInput('no music', fakeHandoffDeps({ onMusic }));
    expect(onMusic).toHaveBeenCalledWith(false);
  });

  it('acknowledges music with no audio wired up at all', async () => {
    const store = fakeStore();
    await submitInput('music please', fakeHandoffDeps({ store }));
    expect(store.lines().at(-1)).toBe('companion: Music on.');
  });
});

describe('submitInput — switching repositories', () => {
  const repos = [repoFixture(), repoFixture({ id: 'r2', name: 'bilo-mono' })];

  it('selects a named repo and says so', async () => {
    const store = fakeStore();
    const selectRepo = vi.fn();
    await submitInput(
      'switch to bilo-mono',
      fakeHandoffDeps({ store, repos: async () => repos, selectRepo }),
    );
    expect(selectRepo).toHaveBeenCalledWith('r2');
    expect(store.lines().at(-1)).toBe('companion: Switching to bilo-mono.');
  });

  it('lists the options for a bare "switch"', async () => {
    const store = fakeStore();
    await submitInput('switch', fakeHandoffDeps({ store, repos: async () => repos }));
    expect(store.lines().at(-1)).toBe('companion: Which one? midnite-studio, bilo-mono.');
  });

  it('says so when the name matches nothing, and changes nothing', async () => {
    const selectRepo = vi.fn();
    const store = fakeStore();
    await submitInput(
      'switch to nonesuch',
      fakeHandoffDeps({ store, repos: async () => repos, selectRepo }),
    );
    expect(selectRepo).not.toHaveBeenCalled();
    expect(store.lines().at(-1)).toBe('companion: I could not find a repository called nonesuch.');
  });

  it('says there is nowhere to go with one repo open', async () => {
    const store = fakeStore();
    await submitInput('switch', fakeHandoffDeps({ store }));
    expect(store.lines().at(-1)).toBe('companion: There is only the one repository open.');
  });
});

describe('submitInput — the headless router', () => {
  it('acts on an intent the router returned, through the same code path', async () => {
    const startSkill = vi.fn().mockReturnValue({ id: 'session-4' });
    await submitInput(
      'could you have a look at whatever is next',
      fakeHandoffDeps({
        startSkill,
        ask: async () => ({
          ok: true,
          value: {
            say: 'Picking up the backlog.',
            intent: { kind: 'command', id: 'execBacklog' },
          },
        }),
      }),
    );
    expect(startSkill).toHaveBeenCalledWith({ skillId: 'execBacklog', autoSend: false });
  });

  it('just speaks a reply that carried no intent', async () => {
    const store = fakeStore();
    await submitInput(
      'what even is a rebase',
      fakeHandoffDeps({
        store,
        ask: async () => ({ ok: true, value: { say: 'It replays your commits.' } }),
      }),
    );
    expect(store.lines().at(-1)).toBe('companion: It replays your commits.');
    expect(store.state).toBe('idle');
  });

  it('posts unparseable CLI output as an agent turn rather than losing it', async () => {
    const store = fakeStore();
    await submitInput(
      'mumble',
      fakeHandoffDeps({
        store,
        ask: async () => ({
          ok: true,
          value: { say: "I didn't follow that.", raw: 'Traceback (most recent call last):' },
        }),
      }),
    );
    expect(store.lines()).toContain('agent: Traceback (most recent call last):');
    expect(store.lines().at(-1)).toBe("companion: I didn't follow that.");
  });

  it('types the sentence verbatim into a fresh session when there is no CLI', async () => {
    const store = fakeStore();
    const startVerbatim = vi.fn().mockReturnValue({ id: 'session-5' });
    await submitInput(
      'do something clever',
      fakeHandoffDeps({
        store,
        startVerbatim,
        ask: async () => ({ ok: false, kind: 'error', message: 'Nothing installed.' }),
      }),
    );

    expect(startVerbatim).toHaveBeenCalledWith('do something clever');
    expect(store.lines().at(-1)).toBe(
      'companion: I cannot think about that myself, so I have typed it into a new agent session for you.',
    );
  });

  it("relays the envelope's own message when it cannot even do that", async () => {
    const store = fakeStore();
    await submitInput(
      'do something clever',
      fakeHandoffDeps({
        store,
        startVerbatim: () => null,
        ask: async () => ({ ok: false, kind: 'error', message: 'Nothing installed.' }),
      }),
    );
    expect(store.lines().at(-1)).toBe('companion: Nothing installed.');
  });

  it('does not let the router recurse on its own freeform answer', async () => {
    const ask = vi.fn().mockResolvedValue({
      ok: true,
      value: { say: 'Hmm.', intent: { kind: 'freeform', text: 'still nothing' } },
    });
    const store = fakeStore();
    await submitInput('mumble', fakeHandoffDeps({ store, ask }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(store.lines().at(-1)).toBe('companion: I am not sure what to do with that one.');
  });

  it('ignores an empty line entirely', async () => {
    const store = fakeStore();
    const ask = vi.fn();
    await submitInput('   ', fakeHandoffDeps({ store, ask }));
    expect(store.transcript).toHaveLength(0);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('createHandoffTracker', () => {
  it('ends the loading state on the first waiting or idle AFTER a thinking', () => {
    const tracker = createHandoffTracker();
    // A session that has not started yet is `idle`, which is
    // indistinguishable from one that has finished — so idle alone must not
    // end it, or the companion reads back an empty scrollback.
    expect(tracker.observe({ kind: 'activity', activity: 'idle' })).toBe('idle');
    expect(tracker.observe({ kind: 'activity', activity: 'thinking' })).toBe('thinking');
    expect(tracker.observe({ kind: 'activity', activity: 'idle' })).toBe('ready');
  });

  it('ends it on a waiting too — an agent asking a question has an answer to read', () => {
    const tracker = createHandoffTracker();
    tracker.observe({ kind: 'activity', activity: 'thinking' });
    expect(tracker.observe({ kind: 'activity', activity: 'waiting' })).toBe('ready');
  });

  it('settles once and stays settled', () => {
    const tracker = createHandoffTracker();
    tracker.observe({ kind: 'activity', activity: 'thinking' });
    tracker.observe({ kind: 'activity', activity: 'idle' });
    expect(tracker.observe({ kind: 'activity', activity: 'thinking' })).toBe('ended');
  });

  it('ends on an exit whether or not it ever thought', () => {
    expect(createHandoffTracker().observe({ kind: 'exit', exitCode: 0 })).toBe('ended');
    expect(createHandoffTracker().everThought()).toBe(false);
  });

  it('tolerates the detector having nothing to say', () => {
    const tracker = createHandoffTracker();
    expect(tracker.observe({ kind: 'activity', activity: undefined })).toBe('idle');
  });
});

describe('startNudgeSentence', () => {
  it('names the command, because "it" is not enough twenty seconds later', () => {
    expect(startNudgeSentence('a swarm')).toBe(
      'a swarm has not started yet — did you press Return?',
    );
  });
});

describe('readBack', () => {
  const scrollbackFixture = 'All 412 tests passed.\n? for shortcuts\n';
  const markers = { frameEnd: '\\? for shortcuts' };

  it('posts the cleaned turn, then speaks a sign-off and the summary', async () => {
    const store = fakeStore('handoff');
    await readBack(
      fakeHandoffDeps({
        store,
        scrollback: async () => scrollbackFixture,
        markers: () => markers,
        ask: async () => ({ ok: true, value: { say: 'Everything passed.' } }),
      }),
      'session-1',
    );

    expect(store.lines()[0]).toBe('agent: All 412 tests passed.');
    expect(store.lines()[1]).toBe('companion: Okay, as per your request.');
    expect(store.lines()[2]).toBe('companion: Everything passed.');
    expect(store.state).toBe('idle');
  });

  it('clears the hand-off so a second command is allowed again', async () => {
    const setActiveHandoff = vi.fn();
    await readBack(
      fakeHandoffDeps({
        store: fakeStore('handoff'),
        scrollback: async () => scrollbackFixture,
        setActiveHandoff,
      }),
      'session-1',
    );
    expect(setActiveHandoff).toHaveBeenCalledWith(null);
  });

  it('falls back to the first 240 characters when nothing can summarise', async () => {
    const store = fakeStore('handoff');
    const long = 'x'.repeat(400);
    await readBack(
      fakeHandoffDeps({
        store,
        scrollback: async () => long,
        ask: async () => ({ ok: false, kind: 'error', message: 'no cli' }),
      }),
      'session-1',
    );

    const spoken = store.transcript.filter((turn) => turn.role === 'companion');
    expect(spoken[1]?.text).toHaveLength(READBACK_VERBATIM_CHARS);
    expect(spoken[2]?.text).toBe('The rest is in the thread.');
  });

  it('reports a non-zero exit and does not bother summarising', async () => {
    const store = fakeStore('handoff');
    const ask = vi.fn();
    await readBack(
      fakeHandoffDeps({ store, scrollback: async () => 'boom', ask }),
      'session-1',
      { exitCode: 130 },
    );

    expect(store.lines()).toContain('agent: The session exited with code 130.');
    expect(store.lines().at(-1)).toBe(
      'companion: That session ended with an error — the details are in the thread.',
    );
    expect(ask).not.toHaveBeenCalled();
    expect(store.state).toBe('idle');
  });

  it('says so plainly when there was nothing to read back', async () => {
    const store = fakeStore('handoff');
    await readBack(fakeHandoffDeps({ store, scrollback: async () => null }), 'session-1');
    expect(store.lines().at(-1)).toBe(
      'companion: That one finished, but it left nothing I could read back.',
    );
  });
});

/**
 * Doing things there, by tier — Phase 81 Theme C.
 *
 * `runCommand` is a real module-level registry (`command-runtime.ts`), not a
 * `deps` field, so these register a fake `CommandRuntime` through
 * `setCommandRuntime` exactly as `command-runtime.test.ts` does, rather than
 * mocking `handoff.ts`'s own import of it.
 */
describe('submitInput — Theme C, doing things there', () => {
  const vocabulary = vocabularyFixture({
    commands: [
      { id: 'terminal.toggle', label: 'Toggle Terminal', group: 'terminal', access: 'direct' },
      { id: 'sync.push', label: 'Push', group: 'sync', access: 'confirm' },
      { id: 'sync.pull', label: 'Pull', group: 'sync', access: 'confirm' },
    ],
  });

  describe('direct', () => {
    it('runs the command once and says its label', async () => {
      const store = fakeStore();
      const run = vi.fn();
      setCommandRuntime(runtimeWith({ 'terminal.toggle': { run, enabled: true } }));
      await submitInput('toggle the terminal', fakeHandoffDeps({ store, vocabulary: () => vocabulary }));
      expect(run).toHaveBeenCalledTimes(1);
      expect(store.lines().at(-1)).toBe('companion: Toggle Terminal.');
    });

    it('says the disabled reason verbatim, and never calls run', async () => {
      const store = fakeStore();
      const run = vi.fn();
      setCommandRuntime(
        runtimeWith({
          'terminal.toggle': { run, enabled: false, disabledReason: 'No terminal selected' },
        }),
      );
      await submitInput('toggle the terminal', fakeHandoffDeps({ store, vocabulary: () => vocabulary }));
      expect(run).not.toHaveBeenCalled();
      expect(store.lines().at(-1)).toBe(
        'companion: Toggle Terminal is unavailable — No terminal selected',
      );
    });

    it("relays the registry's own message when there is no runtime to run it in", async () => {
      const store = fakeStore();
      // Nothing registered — the popout case, or a turn that landed before
      // `app.tsx` mounted.
      await submitInput('toggle the terminal', fakeHandoffDeps({ store, vocabulary: () => vocabulary }));
      expect(store.lines().at(-1)).toBe('companion: There is no window to run that in yet.');
    });

    it("says to check the dialog when the command left one open, and never answers for it", async () => {
      const store = fakeStore();
      vi.mocked(overlayDepth).mockReturnValueOnce(0).mockReturnValueOnce(1);
      const run = vi.fn();
      setCommandRuntime(runtimeWith({ 'terminal.toggle': { run, enabled: true } }));
      await submitInput('toggle the terminal', fakeHandoffDeps({ store, vocabulary: () => vocabulary }));
      expect(store.lines().at(-1)).toBe('companion: Done — check the dialog.');
    });
  });

  describe('never / unknown', () => {
    it('names the palette instead of acting — a command outside the vocabulary', async () => {
      const store = fakeStore();
      const run = vi.fn();
      setCommandRuntime(runtimeWith({ 'browser.clearData': { run, enabled: true } }));
      await submitInput(
        'mumble',
        fakeHandoffDeps({
          store,
          vocabulary: () => vocabulary,
          ask: async () => ({
            ok: true,
            value: { say: 'Sure.', intent: { kind: 'run', id: 'browser.clearData' } },
          }),
        }),
      );
      expect(run).not.toHaveBeenCalled();
      expect(store.lines().at(-1)).toBe('companion: That one needs the palette — Mod+K, then type it.');
    });

    it('gives the identical refusal to a real CommandId that is simply not in this vocabulary', async () => {
      // `CompanionIntentSchema`'s `run.id` narrows to a real `CommandId` at
      // the type level (`parseAskReply`'s zod validation is what rejects an
      // actually-invented string at the IPC boundary, well before this code
      // runs) — so the case this test stands in for is any id `runById`
      // cannot find in `vocabulary.commands`, never-tier or merely absent,
      // which the function treats identically either way.
      const store = fakeStore();
      await submitInput(
        'mumble',
        fakeHandoffDeps({
          store,
          vocabulary: () => vocabulary,
          ask: async () => ({
            ok: true,
            value: { say: 'Sure.', intent: { kind: 'run', id: 'app.lock' } },
          }),
        }),
      );
      expect(store.lines().at(-1)).toBe('companion: That one needs the palette — Mod+K, then type it.');
    });
  });

  describe('confirm', () => {
    it('sets pendingAction and asks, without running', async () => {
      const store = fakeStore();
      const run = vi.fn();
      const slot = fakePendingActionSlot();
      setCommandRuntime(runtimeWith({ 'sync.push': { run, enabled: true } }));
      await submitInput('push', fakeHandoffDeps({ store, vocabulary: () => vocabulary, ...slot }));
      expect(run).not.toHaveBeenCalled();
      expect(slot.pendingAction()).toMatchObject({ id: 'sync.push', label: 'Push' });
      expect(store.lines().at(-1)).toBe('companion: Push? Say yes, press Return, or tap Run.');
    });

    it('does not consult hands-free at all — a confirm-tier command always waits', async () => {
      const store = fakeStore();
      const run = vi.fn();
      const slot = fakePendingActionSlot();
      const autoSendAllowed = vi.fn(() => true);
      setCommandRuntime(runtimeWith({ 'sync.push': { run, enabled: true } }));
      await submitInput(
        'push',
        fakeHandoffDeps({ store, vocabulary: () => vocabulary, autoSendAllowed, ...slot }),
      );
      expect(run).not.toHaveBeenCalled();
      expect(slot.pendingAction()).not.toBeNull();
      // The proof this is a hard property, not an oversight: `autoSendAllowed`
      // was never even read.
      expect(autoSendAllowed).not.toHaveBeenCalled();
    });

    it('a second confirm-tier request replaces the first one, and says so', async () => {
      const store = fakeStore();
      const slot = fakePendingActionSlot();
      const deps = fakeHandoffDeps({ store, vocabulary: () => vocabulary, ...slot });
      await submitInput('push', deps);
      await submitInput('pull', deps);
      expect(slot.pendingAction()).toMatchObject({ id: 'sync.pull', label: 'Pull' });
      expect(store.lines().at(-1)).toBe(
        'companion: Never mind Push — Pull? Say yes, press Return, or tap Run.',
      );
    });

    it('a spoken "yes" within 60 seconds runs it once and clears it', async () => {
      vi.useFakeTimers();
      try {
        const store = fakeStore();
        const run = vi.fn();
        const slot = fakePendingActionSlot();
        setCommandRuntime(runtimeWith({ 'sync.push': { run, enabled: true } }));
        const deps = fakeHandoffDeps({ store, vocabulary: () => vocabulary, ...slot });
        await submitInput('push', deps);
        vi.setSystemTime(Date.now() + (PENDING_ACTION_MEMORY_MS - 1000));
        await submitInput('yes', deps);
        expect(run).toHaveBeenCalledTimes(1);
        expect(slot.pendingAction()).toBeNull();
        expect(store.lines().at(-1)).toBe('companion: Push.');
      } finally {
        vi.useRealTimers();
      }
    });

    it('an empty Return reaches the identical path as a spoken "confirm"', async () => {
      // The input bar submits the literal word "confirm" for an empty
      // Return — asserted here as the grammar's own behaviour, since the
      // component itself is exercised in the e2e spec.
      const store = fakeStore();
      const run = vi.fn();
      const slot = fakePendingActionSlot();
      setCommandRuntime(runtimeWith({ 'sync.push': { run, enabled: true } }));
      const deps = fakeHandoffDeps({ store, vocabulary: () => vocabulary, ...slot });
      await submitInput('push', deps);
      await submitInput('confirm', deps);
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('a Run chip reaches the identical path too — same word, different source', async () => {
      const store = fakeStore();
      const run = vi.fn();
      const slot = fakePendingActionSlot();
      setCommandRuntime(runtimeWith({ 'sync.push': { run, enabled: true } }));
      const deps = fakeHandoffDeps({ store, vocabulary: () => vocabulary, ...slot });
      await submitInput('push', deps);
      // The Run chip's own handler calls `companionPorts().submit('confirm')`
      // — the same string, through the same `submitInput`.
      await submitInput('confirm', deps);
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('expires past 60 seconds and says nothing is waiting', async () => {
      vi.useFakeTimers();
      try {
        const store = fakeStore();
        const run = vi.fn();
        const slot = fakePendingActionSlot();
        setCommandRuntime(runtimeWith({ 'sync.push': { run, enabled: true } }));
        const deps = fakeHandoffDeps({ store, vocabulary: () => vocabulary, ...slot });
        await submitInput('push', deps);
        vi.setSystemTime(Date.now() + PENDING_ACTION_MEMORY_MS + 1000);
        await submitInput('yes', deps);
        expect(run).not.toHaveBeenCalled();
        expect(slot.pendingAction()).toBeNull();
        expect(store.lines().at(-1)).toBe("companion: Nothing's waiting.");
      } finally {
        vi.useRealTimers();
      }
    });

    it('a bare confirm with nothing pending says so', async () => {
      const store = fakeStore();
      await submitInput('yes', fakeHandoffDeps({ store }));
      expect(store.lines().at(-1)).toBe("companion: Nothing's waiting.");
    });

    it('"dismiss" clears a pending action and says so, instead of the repo-offer decline', async () => {
      const store = fakeStore();
      const slot = fakePendingActionSlot();
      const deps = fakeHandoffDeps({ store, vocabulary: () => vocabulary, ...slot });
      await submitInput('push', deps);
      await submitInput('never mind', deps);
      expect(slot.pendingAction()).toBeNull();
      expect(store.lines().at(-1)).toBe('companion: Left it.');
    });

    it('"stop" clears a pending action too, and says so', async () => {
      const store = fakeStore('speaking');
      const speaker = fakeSpeaker();
      const slot = fakePendingActionSlot();
      const deps = fakeHandoffDeps({ store, speaker, vocabulary: () => vocabulary, ...slot });
      await submitInput('push', deps);
      await submitInput('stop', deps);
      expect(slot.pendingAction()).toBeNull();
      expect(speaker.cancelled).toBe(1);
      expect(store.lines().at(-1)).toBe('companion: Left it.');
    });
  });

  describe('help', () => {
    it('speaks a summary and posts the full list as markdown', async () => {
      const store = fakeStore();
      const fullVocabulary = vocabularyFixture({
        views: [{ id: 'graph', label: 'Commit Graph', keywords: 'graph history' }],
        commands: [
          { id: 'sync.push', label: 'Push', group: 'sync', access: 'confirm' },
          { id: 'sync.fetch', label: 'Fetch', group: 'sync', access: 'direct' },
        ],
        skills: [{ id: 'execAdhoc', label: 'Ad Hoc Task', hint: 'A one-off task.' }],
      });
      await submitInput('what can you do', fakeHandoffDeps({ store, vocabulary: () => fullVocabulary }));

      const posted = store.transcript.at(-1);
      expect(posted?.text).toContain('**Views**');
      expect(posted?.text).toContain('- Commit Graph');
      expect(posted?.text).toContain('**Commands**');
      expect(posted?.text).toContain('- Push');
      expect(posted?.text).toContain('**Skills**');
      expect(posted?.text).toContain('- Ad Hoc Task — A one-off task.');
    });
  });
});
