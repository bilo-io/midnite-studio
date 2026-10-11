import { companionSettingsVocabulary, parseIntent } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PendingAction } from '../../store/companion-store';
import { resetHandoffState, submitInput } from './handoff';
import { fakeCompanionSettings, fakeHandoffDeps, fakeSpeaker, fakeStore, repoFixture, vocabularyFixture } from './test-doubles';
import { buildVocabulary } from './vocabulary';

/**
 * Phase 109 Themes C and E — `act()`'s `setting`, `undoSetting` and
 * `pageOnlySetting` arms, per tier, against a fake settings port. The real
 * setter's tiers and guards are `settings-apply.test.ts`'s; the real
 * read-back order and the Undo toast are `settings-announce.test.ts`'s.
 */

afterEach(() => resetHandoffState());

const vocabulary = vocabularyFixture({ settings: companionSettingsVocabulary() });

function slot(): { pendingAction: () => PendingAction | null; setPendingAction: (next: PendingAction | null) => void } {
  let current: PendingAction | null = null;
  return {
    pendingAction: () => current,
    setPendingAction: (next) => {
      current = next;
    },
  };
}

function setup(values: Parameters<typeof fakeCompanionSettings>[0] = {}, over: Parameters<typeof fakeCompanionSettings>[1] = {}) {
  const store = fakeStore();
  const settings = fakeCompanionSettings(values, over);
  const pending = slot();
  const navigate = vi.fn(async () => ({ say: 'Opening Settings, Companion.' }));
  const onMusic = vi.fn();
  const deps = fakeHandoffDeps({
    store,
    vocabulary: () => vocabulary,
    companionSettings: settings,
    navigate,
    onMusic,
    ...pending,
  });
  return { store, settings, pending, navigate, onMusic, deps };
}

describe('direct tier', () => {
  it('"use voice Bella" applies and reads back', async () => {
    const { store, settings, deps } = setup({ 'companionVoices.local': null });
    await submitInput('use voice Bella', deps);
    expect(settings.applied).toEqual([{ key: 'companionVoices.local', value: 'af_bella' }]);
    expect(store.lines().at(-1)).toBe('companion: This is Bella now.');
  });

  it('a whisper-style "use voice bela." still lands on Bella', async () => {
    const { settings, deps } = setup({ 'companionVoices.local': null });
    await submitInput('use voice bela.', deps);
    expect(settings.values['companionVoices.local']).toBe('af_bella');
  });

  it('"louder" steps the volume from where it is, and stops at the top', async () => {
    const { store, settings, deps } = setup({ companionVolume: 0.5 });
    await submitInput('louder', deps);
    expect(settings.values.companionVolume).toBe(0.6);

    settings.values.companionVolume = 1;
    await submitInput('louder', deps);
    expect(store.lines().at(-1)).toBe("companion: That's as loud as I go.");
  });

  it('"call me boss" adds to what it already calls you, and says so when it already does', async () => {
    const { store, settings, deps } = setup({ companionHonorifics: ['sir'] });
    await submitInput('call me boss', deps);
    expect(settings.values.companionHonorifics).toEqual(['sir', 'boss']);
    await submitInput('call me Sir', deps);
    expect(store.lines().at(-1)).toBe('companion: I already call you Sir.');
    await submitInput('stop calling me captain', deps);
    expect(store.lines().at(-1)).toBe("companion: I don't call you captain.");
  });

  it('says so when nothing would change', async () => {
    const { store, deps } = setup({ 'companionVoices.local': 'af_bella' });
    await submitInput('use voice Bella', deps);
    expect(store.lines().at(-1)).toBe("companion: No change — it's already Bella.");
  });

  it('switching the elevator music offer off also stops what is playing', async () => {
    const { settings, onMusic, deps } = setup({ companionMusicOffer: true });
    await submitInput('turn elevator music off', deps);
    expect(settings.values.companionMusicOffer).toBe(false);
    expect(onMusic).toHaveBeenCalledWith(false);
  });

  it('reads back with the live speaker — "speak out loud" turns speech on mid-turn', async () => {
    const live = fakeSpeaker();
    const { deps } = setup({ companionSpeakAloud: false }, { liveSpeaker: () => live });
    await submitInput('speak out loud', deps);
    expect(live.spoken).toEqual(["I'll speak out loud again."]);
  });

  it('a system voice by name resolves against the renderer\'s voice list', async () => {
    const { store, settings, deps } = setup(
      { 'companionVoices.system': null },
      { systemVoices: () => [{ uri: 'com.apple.voice.Samantha', name: 'Samantha', lang: 'en-US' }] },
    );
    await submitInput('use the system voice Samantha', deps);
    expect(settings.values['companionVoices.system']).toBe('com.apple.voice.Samantha');
    await submitInput('use the system voice Zork', deps);
    expect(store.lines().at(-1)).toBe("companion: I don't know a voice called Zork.");
  });
});

describe('an ambiguous voice (Decision 10)', () => {
  it('asks between the two, and the next line picks one', async () => {
    const { store, settings, deps } = setup({ 'companionVoices.local': null });
    await submitInput('switch to isa bella', deps);
    const question = store.lines().at(-1) ?? '';
    expect(question).toMatch(/^companion: (Bella or Isabella|Isabella or Bella)\?$/);
    expect(settings.applied).toEqual([]);

    await submitInput('Isabella', deps);
    expect(settings.values['companionVoices.local']).toBe('bf_isabella');
  });

  it('"the first one" picks the first name asked', async () => {
    const { store, settings, deps } = setup({ 'companionVoices.local': null });
    await submitInput('switch to isa bella', deps);
    const first = /companion: (\w+) or/.exec(store.lines().at(-1) ?? '')?.[1];
    await submitInput('the first one', deps);
    expect(settings.values['companionVoices.local']).toBe(first === 'Bella' ? 'af_bella' : 'bf_isabella');
  });

  it('anything else drops the question and is handled as usual', async () => {
    const { settings, deps } = setup({ 'companionVoices.local': null, companionVolume: 0.5 });
    await submitInput('switch to isa bella', deps);
    await submitInput('louder', deps);
    expect(settings.values.companionVolume).toBe(0.6);
    expect(settings.values['companionVoices.local']).toBeNull();
  });
});

describe('confirm tier', () => {
  it('"I\'ll call you Nova" asks first and applies nothing', async () => {
    const { store, settings, pending, deps } = setup({ companionNames: ['Companion'] });
    await submitInput("I'll call you Nova", deps);
    expect(settings.applied).toEqual([]);
    expect(pending.pendingAction()).toMatchObject({
      kind: 'setting',
      key: 'companionNames',
      value: ['Companion', 'Nova'],
      label: 'Answer to "Nova" from now on',
    });
    expect(store.lines().at(-1)).toBe(
      'companion: Answer to "Nova" from now on? Say yes, press Return, or tap Run.',
    );
  });

  it('"yes" applies it as confirmed and reads it back', async () => {
    const { store, settings, pending, deps } = setup({ companionNames: ['Companion'] });
    await submitInput("I'll call you Nova", deps);
    await submitInput('yes', deps);
    expect(settings.applied).toEqual([{ key: 'companionNames', value: ['Companion', 'Nova'], confirmed: true }]);
    expect(pending.pendingAction()).toBeNull();
    expect(store.lines().at(-1)).toBe("companion: I'll answer to Companion and Nova.");
  });

  it('"no" leaves it', async () => {
    const { store, settings, pending, deps } = setup({ companionSpeakAloud: true });
    await submitInput('stop talking out loud', deps);
    await submitInput('no', deps);
    expect(settings.applied).toEqual([]);
    expect(pending.pendingAction()).toBeNull();
    expect(store.lines().at(-1)).toBe('companion: Left it.');
  });

  it('a guard that would refuse anyway refuses now, not after the yes', async () => {
    const { store, pending, deps } = setup({ companionNames: ['Nova'] });
    await submitInput('stop answering to Nova', deps);
    expect(pending.pendingAction()).toBeNull();
    expect(store.lines().at(-1)).toBe('companion: I need at least one name to answer to.');
  });

  it("an agent's question (Theme D's onConfirm arm) is answered, not applied by the companion", async () => {
    const { store, settings, pending, deps } = setup({ companionNames: ['Companion'] });
    const onConfirm = vi.fn(() => 'Done — your agent can carry on.');
    pending.setPendingAction({ label: 'Let your agent set what you call it to Nova', at: Date.now(), onConfirm });
    await submitInput('yes', deps);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(settings.applied).toEqual([]);
    expect(pending.pendingAction()).toBeNull();
    expect(store.lines().at(-1)).toBe('companion: Done — your agent can carry on.');
  });

  it("a spoken setting replaces an agent's open question, and says so", async () => {
    const { store, pending, deps } = setup({ companionNames: ['Companion'] });
    pending.setPendingAction({ label: 'Let your agent set the mic button to tap to toggle', at: Date.now(), onConfirm: () => null });
    await submitInput("I'll call you Nova", deps);
    expect(pending.pendingAction()).toMatchObject({ kind: 'setting', key: 'companionNames' });
    expect(store.lines().at(-1)).toBe(
      'companion: Never mind let your agent set the mic button to tap to toggle — Answer to "Nova" from now on? Say yes, press Return, or tap Run.',
    );
  });
});

describe('never tier', () => {
  it('"turn yourself off" is refused with an offer, and "yes" opens Settings ▸ Companion', async () => {
    const { store, settings, pending, navigate, deps } = setup();
    await submitInput('turn yourself off', deps);
    expect(store.lines().at(-1)).toBe("companion: That one's in Settings, Companion — want me to open it?");
    expect(pending.pendingAction()).toMatchObject({ kind: 'openSettings' });

    await submitInput('yes', deps);
    expect(navigate).toHaveBeenCalledWith({ kind: 'navigate', view: 'settings', page: 'companion' });
    expect(store.lines().at(-1)).toBe('companion: Opening Settings, Companion.');
    expect(settings.applied).toEqual([]);
  });

  it('"switch to web speech" is the same refusal, not a trip to a view', async () => {
    const { store, navigate, deps } = setup();
    await submitInput('switch to web speech', deps);
    expect(navigate).not.toHaveBeenCalled();
    expect(store.lines().at(-1)).toBe("companion: That one's in Settings, Companion — want me to open it?");
  });
});

describe('undoSetting (Theme E)', () => {
  it('"undo that" goes to the port with this turn\'s voice', async () => {
    const undoAndAnnounce = vi.fn(async (speak: (text: string) => Promise<void>) => {
      await speak('Put it back. This is Heart now.');
      return { ok: true as const, keys: ['companionVoices.local' as const], restored: {}, source: 'voice' as const };
    });
    const { store, deps } = setup({}, { undoAndAnnounce });
    await submitInput('undo that', deps);
    expect(undoAndAnnounce).toHaveBeenCalledTimes(1);
    expect(store.lines().at(-1)).toBe('companion: Put it back. This is Heart now.');
  });
});

describe('the router can answer with a setting', () => {
  it('applies a routed setting through the same arm', async () => {
    const { settings, deps } = setup({ companionVolume: 0.5 });
    const ask = vi.fn(async () => ({
      ok: true as const,
      value: { say: 'Turning it down.', intent: { kind: 'setting' as const, key: 'companionVolume' as const, value: 0.3 } },
    }));
    await submitInput('could you be a touch less loud', { ...deps, ask });
    expect(settings.values.companionVolume).toBe(0.3);
  });
});

describe('help', () => {
  it('mentions settings, and lists them', async () => {
    const speaker = fakeSpeaker();
    const { store, deps } = setup();
    await submitInput('what can you do', { ...deps, speaker });
    const posted = store.transcript.at(-1)?.text ?? '';
    expect(posted).toContain('**Settings**');
    expect(posted).toContain('- Local voice — "use voice Bella"');
    expect(speaker.spoken.join(' ')).toContain(
      'You can tell me to change my voice, what I call you, or how loud I am — or say "tune yourself".',
    );
  });
});

/**
 * The collision test against the app's *real* vocabulary — every view, every
 * palette command by tier, the skills and some repos — rather than a fixture
 * someone chose to be convenient.
 */
describe('the settings grammar against the real vocabulary', () => {
  const real = buildVocabulary([
    repoFixture({ id: 'a', name: 'bilo-mono' }),
    repoFixture({ id: 'b', name: 'midnite-studio' }),
  ]);
  const kindOf = (text: string) => parseIntent(text, real).kind;

  it.each([
    'use voice Bella',
    'switch to Bella',
    'change your voice to Emma',
    'use the system voice Samantha',
    'volume 50',
    'louder',
    'quieter',
    'call me boss',
    'stop calling me boss',
    "I'll call you Nova",
    'answer to Nova',
    'stop answering to Nova',
    'stop talking out loud',
    'speak out loud',
    'turn elevator music off',
    'turn elevator music on',
    'push to talk',
    'toggle the mic',
    'conversation mode on',
    'conversation mode off',
  ])('%j is a setting', (text) => {
    expect(kindOf(text)).toBe('setting');
  });

  it("every row's example on the page is a setting", () => {
    for (const row of real.settings ?? []) expect(kindOf(row.example), row.example).toBe('setting');
  });

  it('no palette command label turns into a settings change', () => {
    for (const command of real.commands) {
      expect(['setting', 'pageOnlySetting', 'undoSetting'], command.label).not.toContain(kindOf(command.label));
    }
  });

  it('every view is still reachable by name', () => {
    for (const view of real.views) {
      expect(parseIntent(`take me to ${view.label}`, real), view.label).toMatchObject({ kind: 'navigate' });
    }
  });

  it('repo switching keeps its sentences', () => {
    expect(parseIntent('switch to bilo-mono', real)).toEqual({ kind: 'switchRepo', name: 'bilo-mono' });
    expect(parseIntent('switch to the other repo', real).kind).toBe('switchRepo');
  });
});
