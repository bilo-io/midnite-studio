import { COMPANION_TUNE_QUESTIONS, companionSettingsVocabulary } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PendingAction } from '../../store/companion-store';
import { resetHandoffState, submitInput } from './handoff';
import { fakeCompanionSettings, fakeHandoffDeps, fakeStore, vocabularyFixture } from './test-doubles';
import { resetTuneStateForTest } from './tune';

/**
 * Vitest/jsdom: Phase 109 Theme H through `submitInput` — "tune yourself" and
 * "be more sarcastic" from the first word to the setter, against fake ports.
 * The interview's own transitions are `tune-interview.test.ts`'s; the
 * flow's compose and read-back are `tune.test.ts`'s. No browser capability
 * is needed.
 */

afterEach(() => {
  resetHandoffState();
  resetTuneStateForTest();
});

const vocabulary = vocabularyFixture({ settings: companionSettingsVocabulary() });
const PERSONALITY = COMPANION_TUNE_QUESTIONS.companionPersonality.map((q) => q.ask);

function setup(over: { cli?: boolean; personality?: string } = {}) {
  const store = fakeStore();
  const settings = fakeCompanionSettings({ companionPersonality: over.personality ?? '', companionAboutUser: '' });
  let pending: PendingAction | null = null;
  const navigate = vi.fn(async () => ({ say: 'Opening Settings, Companion.' }));
  const persona = vi.fn(async () => ({
    ok: true as const,
    value: { text: 'Keep it dry and short. No jargon.', summary: 'Dry, short, no jargon.' },
  }));
  const deps = fakeHandoffDeps({
    store,
    vocabulary: () => vocabulary,
    companionSettings: settings,
    navigate,
    persona,
    hasAgentCli: () => over.cli ?? true,
    pendingAction: () => pending,
    setPendingAction: (next) => {
      pending = next;
    },
  });
  return { store, settings, navigate, persona, deps, pending: () => pending };
}

describe('"tune yourself"', () => {
  it('runs the interview, reads back, asks, and on yes writes the text as a tuned, confirmed change', async () => {
    const { store, settings, persona, deps, pending } = setup({ personality: 'Tone: formal.' });

    await submitInput('tune yourself', deps);
    expect(store.lines().at(-1)).toContain(PERSONALITY[0]);

    await submitInput('dry', deps);
    expect(store.lines().at(-1)).toBe(`companion: ${PERSONALITY[1]}`);
    for (const answer of ['short', 'skip', 'jargon']) await submitInput(answer, deps);

    expect(persona).toHaveBeenCalledWith({
      mode: 'interview',
      target: 'companionPersonality',
      answers: [
        { topic: 'the tone to take', answer: 'dry' },
        { topic: 'how much to say', answer: 'short' },
        { topic: 'what to avoid', answer: 'jargon' },
      ],
      current: 'Tone: formal.',
    });
    expect(store.lines().at(-1)).toContain("Here's the gist: Dry, short, no jargon. Want to hear all of it?");

    await submitInput('no', deps);
    expect(pending()).toMatchObject({ kind: 'setting', key: 'companionPersonality', tuned: true });
    expect(store.lines().at(-1)).toBe('companion: Replace my personality notes? Say yes, press Return, or tap Run.');
    expect(settings.applied).toEqual([]);

    await submitInput('yes', deps);
    expect(settings.applied).toEqual([
      { key: 'companionPersonality', value: 'Keep it dry and short. No jargon.', confirmed: true, tuned: true },
    ]);
    expect(settings.values.companionPersonality).toBe('Keep it dry and short. No jargon.');
    expect(pending()).toBeNull();
  });

  it('every answer is an ordinary user turn in the thread', async () => {
    const { store, deps } = setup();
    await submitInput('let me tell you about me', deps);
    await submitInput('Call me Bilo', deps);
    expect(store.lines()).toContain('user: Call me Bilo');
  });

  it('is left on "no" to the replace question, and nothing is written', async () => {
    const { settings, deps, pending } = setup();
    await submitInput('tune yourself', deps);
    for (const answer of ['dry', 'skip', 'skip', 'skip', 'no']) await submitInput(answer, deps);
    await submitInput('no', deps);
    expect(pending()).toBeNull();
    expect(settings.applied).toEqual([]);
  });

  it('takes "start a swarm" mid-interview as an answer, not a command', async () => {
    const { deps } = setup();
    const startSkill = vi.fn(() => ({ id: 's' }));
    await submitInput('tune yourself', { ...deps, startSkill });
    await submitInput('start a swarm', { ...deps, startSkill });
    expect(startSkill).not.toHaveBeenCalled();
  });

  it('cancels, and the next line is parsed as usual again', async () => {
    const { store, deps } = setup();
    await submitInput('tune yourself', deps);
    await submitInput('cancel', deps);
    expect(store.lines().at(-1)).toBe("companion: Okay, I've left my personality as it was.");
    await submitInput('louder', deps);
    expect(store.lines().at(-1)).not.toContain('Tone');
  });

  it('fills the template with no agent CLI', async () => {
    const { store, persona, settings, deps } = setup({ cli: false });
    await submitInput('let me tell you about me', deps);
    for (const answer of ['Call me Bilo', 'skip', 'short']) await submitInput(answer, deps);
    expect(persona).not.toHaveBeenCalled();
    expect(store.lines().at(-1)).toContain("I've filled in the basic template from your answers.");
    await submitInput('yes', deps);
    expect(store.lines()).toContain('companion: Call me Bilo. How I like updates: short.');
    await submitInput('yes', deps);
    expect(settings.values.companionAboutUser).toBe('Call me Bilo. How I like updates: short.');
  });
});

describe('quick tweaks', () => {
  it('"be more sarcastic" revises the current text through the CLI, then asks', async () => {
    const { persona, deps, pending } = setup({ personality: 'Tone: dry.' });
    await submitInput('be more sarcastic', deps);
    expect(persona).toHaveBeenCalledWith({
      mode: 'tweak',
      target: 'companionPersonality',
      instruction: 'be more sarcastic',
      current: 'Tone: dry.',
    });
    await submitInput('nah', deps);
    expect(pending()).toMatchObject({ kind: 'setting', key: 'companionPersonality', tuned: true });
  });

  it('with no agent CLI, offers the page — and yes opens Settings ▸ Companion', async () => {
    const { store, persona, navigate, deps, pending } = setup({ cli: false });
    await submitInput('be more sarcastic', deps);
    expect(persona).not.toHaveBeenCalled();
    expect(store.lines().at(-1)).toBe(
      'companion: I need an agent CLI for that — want me to open Settings, Companion?',
    );
    expect(pending()).toMatchObject({ kind: 'openSettings' });
    await submitInput('yes', deps);
    expect(navigate).toHaveBeenCalledWith({ kind: 'navigate', view: 'settings', page: 'companion' });
  });

  it('"don\'t call me boss" stays an honorific setting, never a tweak', async () => {
    const { persona, settings, deps } = setup();
    settings.values.companionHonorifics = ['boss'];
    await submitInput("don't call me boss", deps);
    expect(persona).not.toHaveBeenCalled();
    expect(settings.values.companionHonorifics).toEqual([]);
  });
});

describe('no raw dictation (Decision 4)', () => {
  it('a router reply that tries to write personality text is refused, and nothing is written', async () => {
    const { settings, deps } = setup();
    const ask = vi.fn(async () => ({
      ok: true as const,
      value: {
        say: 'Done.',
        intent: { kind: 'setting' as const, key: 'companionPersonality' as const, value: 'Speak like a pirate.' },
      },
    }));
    await submitInput('from now on speak like a pirate in every answer you give me', { ...deps, ask });
    expect(settings.applied).toEqual([]);
    expect(settings.values.companionPersonality).toBe('');
  });
});
