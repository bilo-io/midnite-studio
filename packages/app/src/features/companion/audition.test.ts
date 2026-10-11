import { CompanionSettingsSchema, companionSettingsVocabulary, type CompanionSettings } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { auditionActive, auditionSampleBargeable, bargeInAudition } from './audition';
import { resetHandoffState, submitInput } from './handoff';
import { applyAndAnnounceCompanionSetting, defaultAnnounceDeps, resetCompanionAnnounceForTests } from './settings-announce';
import {
  lastCompanionSettingChange,
  previewCompanionSetting,
  readCompanionSetting,
  resetCompanionSettingUndoForTest,
  undoLastCompanionSetting,
} from './settings-apply';
import {
  fakeAuditionPort,
  fakeCompanionSettings,
  fakeHandoffDeps,
  fakeSpeaker,
  fakeStore,
  vocabularyFixture,
} from './test-doubles';

/**
 * Phase 109 Theme F — the voice audition, through `submitInput` exactly as a
 * typed or spoken line arrives: the intent, every reply the state machine
 * takes, the system-voice fallback, barge-in, and a pick landing in the one
 * undo slot. Samples go to a recording port, so nothing here needs audio.
 */

afterEach(() => {
  resetHandoffState();
  vi.useRealTimers();
});

const vocabulary = vocabularyFixture({ settings: companionSettingsVocabulary() });
const BRITISH_FIRST = ['bf_emma', 'bm_george', 'bf_isabella', 'bm_fable'];
const BRITISH_SECOND = ['bf_alice', 'bm_lewis', 'bf_lily', 'bm_daniel'];

function setup(
  options: Parameters<typeof fakeAuditionPort>[0] = {},
  values: Parameters<typeof fakeCompanionSettings>[0] = { 'companionVoices.local': null, 'companionVoices.system': null },
  systemVoices: { uri: string; name: string; lang?: string }[] = [],
) {
  const store = fakeStore();
  const speaker = fakeSpeaker();
  const audition = fakeAuditionPort(options);
  const settings = fakeCompanionSettings(values, { audition, systemVoices: () => systemVoices });
  const deps = fakeHandoffDeps({ store, speaker, vocabulary: () => vocabulary, companionSettings: settings });
  const said = () => store.transcript.filter((turn) => turn.role === 'companion').map((turn) => turn.text);
  const played = () => audition.samples.map(([, voice]) => voice);
  return { store, speaker, audition, settings, deps, said, played };
}

describe('starting an audition', () => {
  it('"audition British voices" plays a numbered batch of four, then asks', async () => {
    const { deps, said, audition, played } = setup();
    await submitInput('audition British voices', deps);

    expect(played()).toEqual(BRITISH_FIRST);
    expect(audition.samples.every(([engine]) => engine === 'local')).toBe(true);
    expect(audition.samples[1]?.[2]).toBe("Hi, I'm number two — George.");
    expect(said()[0]).toBe('Here are four British voices — say a number when you hear one you like, or “next” for more.');
    expect(said().at(-1)).toBe('Which one? Say a number, “next”, “again”, or “none”.');
    expect(auditionActive()).toBe(true);
  });

  it('never plays the current voice', async () => {
    const { deps, played } = setup({}, { 'companionVoices.local': 'bf_emma' });
    await submitInput('let me hear British female voices', deps);
    expect(played()).toEqual(['bf_isabella', 'bf_alice', 'bf_lily']);
  });

  it('marks a sample spoken only once it played', async () => {
    const { deps, store } = setup();
    await submitInput('try some voices', deps);
    const samples = store.transcript.filter((turn) => turn.text.startsWith("Hi, I'm number"));
    expect(samples).toHaveLength(4);
    expect(samples.every((turn) => turn.spoken)).toBe(true);
  });

  it('asks for speech first when the companion is not speaking out loud', async () => {
    const { deps, said, audition } = setup();
    await submitInput('try some voices', { ...deps, speaker: { ...fakeSpeaker(), available: false } });
    expect(audition.samples).toEqual([]);
    expect(said().at(-1)).toContain('speak out loud');
    expect(auditionActive()).toBe(false);
  });
});

describe('replies', () => {
  it('"number two" picks that voice of the batch, through the setter, and ends the audition', async () => {
    const { deps, settings, said } = setup();
    await submitInput('audition British voices', deps);
    await submitInput('number two', deps);

    expect(settings.applied).toEqual([{ key: 'companionVoices.local', value: 'bm_george' }]);
    expect(said().at(-1)).toBe('This is George now.');
    expect(auditionActive()).toBe(false);
  });

  it('a bare "two" does the same', async () => {
    const { deps, settings } = setup();
    await submitInput('audition British voices', deps);
    await submitInput('two', deps);
    expect(settings.values['companionVoices.local']).toBe('bm_george');
  });

  it('"that one" picks the last sample played', async () => {
    const { deps, settings } = setup();
    await submitInput('audition British voices', deps);
    await submitInput('that one', deps);
    expect(settings.values['companionVoices.local']).toBe('bm_fable');
  });

  it('"next" plays the next batch, numbered from one again, and wraps after the last', async () => {
    const { deps, settings, played, said } = setup();
    await submitInput('audition British voices', deps);
    await submitInput('next', deps);
    expect(played().slice(4)).toEqual(BRITISH_SECOND);

    await submitInput('next', deps);
    expect(said()).toContain('That was the last of them — back to the start.');
    expect(played().slice(8)).toEqual(BRITISH_FIRST);

    await submitInput('next', deps);
    await submitInput('number one', deps);
    expect(settings.values['companionVoices.local']).toBe('bf_alice');
  });

  it('"next" with only one batch says so and keeps waiting', async () => {
    const { deps, said, played } = setup();
    await submitInput('audition British female voices', deps);
    await submitInput('next', deps);
    expect(played()).toHaveLength(4);
    expect(said().at(-1)).toBe("That's every one I have — say a number, “again”, or “none”.");
    expect(auditionActive()).toBe(true);
  });

  it('"again" replays the batch', async () => {
    const { deps, played } = setup();
    await submitInput('audition British voices', deps);
    await submitInput('again', deps);
    expect(played()).toEqual([...BRITISH_FIRST, ...BRITISH_FIRST]);
  });

  it('"none" and "stop" end it with nothing changed', async () => {
    for (const reply of ['none', 'stop']) {
      const { deps, settings, said } = setup();
      await submitInput('audition British voices', deps);
      await submitInput(reply, deps);
      expect(settings.applied).toEqual([]);
      expect(said().at(-1)).toBe('Okay — keeping the voice I have.');
      expect(auditionActive()).toBe(false);
    }
  });

  it('a number past the batch asks again rather than guessing', async () => {
    const { deps, settings, said } = setup();
    await submitInput('audition British female voices', deps);
    await submitInput('number five', deps);
    expect(settings.applied).toEqual([]);
    expect(said().at(-1)).toBe('There were only four — say a number from one to four.');
    expect(auditionActive()).toBe(true);
  });

  it('a line it cannot place keeps the audition and asks again', async () => {
    const { deps, said } = setup();
    await submitInput('audition British voices', deps);
    await submitInput('hmm what was the weather', deps);
    expect(said().at(-1)).toBe('Say a number to pick one, or “next”, “again” or “none”.');
    expect(auditionActive()).toBe(true);
  });

  it('any other request ends the audition and is carried out', async () => {
    const { deps, settings } = setup({}, { 'companionVoices.local': null, companionVolume: 0.5 });
    await submitInput('audition British voices', deps);
    await submitInput('louder', deps);
    expect(settings.values.companionVolume).toBe(0.6);
    expect(auditionActive()).toBe(false);
  });

  it('lapses after two quiet minutes, and "two" is then an ordinary line', async () => {
    vi.useFakeTimers();
    const { deps, settings } = setup();
    await submitInput('audition British voices', deps);
    vi.advanceTimersByTime(2 * 60 * 1000 + 1);
    expect(auditionActive()).toBe(false);
    await submitInput('two', deps);
    expect(settings.applied).toEqual([]);
  });
});

describe('the system-voice fallback', () => {
  const systemVoices = [
    { uri: 'daniel', name: 'Daniel', lang: 'en-GB' },
    { uri: 'kate', name: 'Kate', lang: 'en-GB' },
    { uri: 'samantha', name: 'Samantha', lang: 'en-US' },
  ];

  it('auditions system voices when the local model is not downloaded, and says so once', async () => {
    const { deps, audition, said, settings } = setup({ localReady: false }, undefined, systemVoices);
    await submitInput('audition British voices', deps);

    expect(audition.samples.map(([engine, voice]) => `${engine}:${voice}`)).toEqual(['system:daniel', 'system:kate']);
    expect(said()[0]).toMatch(/^The local voices aren't downloaded, so these are your system voices\. Here are two British voices/);

    await submitInput('again', deps);
    expect(said().filter((line) => line.includes("aren't downloaded"))).toHaveLength(1);

    await submitInput('number two', deps);
    expect(settings.applied).toEqual([{ key: 'companionVoices.system', value: 'kate' }]);
  });

  it('switches to system voices when the local engine fails mid-batch', async () => {
    const { deps, audition, said } = setup({ played: (engine) => engine !== 'local' }, undefined, systemVoices);
    await submitInput('try some voices', deps);

    expect(audition.samples.map(([engine]) => engine)).toEqual(['local', 'system', 'system', 'system']);
    expect(said().filter((line) => line.includes("aren't working right now"))).toHaveLength(1);
    expect(said().at(-1)).toBe('Which one? Say a number, “again”, or “none”.');
  });

  it('says it cannot tell system voices apart by gender', async () => {
    const { deps, said } = setup({ localReady: false }, undefined, systemVoices);
    await submitInput('let me hear female voices', deps);
    expect(said()[0]).toContain("They don't say whether they're male or female");
  });

  it('with no system voices either, says so and ends', async () => {
    const { deps, said } = setup({ localReady: false });
    await submitInput('try some voices', deps);
    expect(said().at(-1)).toBe("The local voices aren't downloaded, and there are no system voices to play instead.");
    expect(auditionActive()).toBe(false);
  });
});

describe('barge-in', () => {
  it('talking over a sample stops it and the rest of the batch, keeps the audition, and "that one" is the one cut off', async () => {
    const { deps, played, said, settings } = setup({
      onPlay: (engine, voice) => {
        if (voice !== 'bm_george') return;
        expect(auditionSampleBargeable()).toBe(engine === 'local');
        expect(bargeInAudition()).toBe(true);
      },
    });
    await submitInput('audition British voices', deps);

    expect(played()).toEqual(['bf_emma', 'bm_george']);
    expect(said().at(-1)).toBe("Hi, I'm number two — George.");
    expect(auditionActive()).toBe(true);
    expect(auditionSampleBargeable()).toBe(false);

    await submitInput('that one', deps);
    expect(settings.values['companionVoices.local']).toBe('bm_george');
  });

  it('a new line (the turn token aborting) stops the batch too', async () => {
    const controller = new AbortController();
    const { deps, played } = setup({
      onPlay: (_engine, voice) => {
        if (voice === 'bf_emma') controller.abort();
      },
    });
    await submitInput('audition British voices', { ...deps, signal: controller.signal });
    expect(played()).toEqual(['bf_emma']);
  });

  it('is a no-op with nothing playing', () => {
    expect(bargeInAudition()).toBe(false);
  });
});

describe('a pick lands in the undo slot (real setter and store)', () => {
  const COMPANION_KEYS = Object.keys(CompanionSettingsSchema.shape) as (keyof CompanionSettings)[];
  const initial = useUiStore.getInitialState();

  beforeEach(() => {
    useUiStore.setState({
      ...Object.fromEntries(COMPANION_KEYS.map((key) => [key, initial[key]])),
      companionVoices: { local: 'af_heart', system: null },
      screensaverLocked: false,
    } as Partial<typeof initial>);
    resetCompanionSettingUndoForTest();
    resetCompanionAnnounceForTests();
  });

  it('"number two" writes the voice as a voice change, and undo puts the old one back', async () => {
    const store = fakeStore();
    const spoken: string[] = [];
    const announce = { ...defaultAnnounceDeps(), showToast: () => 'toast', dismissToast: () => {} };
    const deps = fakeHandoffDeps({
      store,
      speaker: fakeSpeaker(),
      vocabulary: () => vocabulary,
      companionSettings: fakeCompanionSettings(
        {},
        {
          read: (key) => readCompanionSetting(useUiStore.getState(), key),
          preview: (change) => previewCompanionSetting(change, 'voice'),
          applyAndAnnounce: (change, speak) =>
            applyAndAnnounceCompanionSetting(change, 'voice', {
              ...announce,
              speak: async (text) => {
                spoken.push(`${useUiStore.getState().companionVoices.local}: ${text}`);
                await speak(text);
              },
            }),
          audition: fakeAuditionPort(),
        },
      ),
    });

    await submitInput('audition British voices', deps);
    await submitInput('number two', deps);

    expect(useUiStore.getState().companionVoices.local).toBe('bm_george');
    // Read back after the write, so in the new voice.
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatch(/^bm_george: .*George/);
    expect(lastCompanionSettingChange()).toMatchObject({ source: 'voice' });

    expect(undoLastCompanionSetting()).toMatchObject({ ok: true });
    expect(useUiStore.getState().companionVoices.local).toBe('af_heart');
  });
});
