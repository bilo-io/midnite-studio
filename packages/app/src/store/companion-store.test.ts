import { COMPANION_TRANSCRIPT_CAP } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { useCompanionStore } from './companion-store';

const reset = (): void => {
  useCompanionStore.setState({
    state: 'off',
    transcript: [],
    recentPhrases: {},
    activeHandoff: null,
  });
};

beforeEach(reset);

describe('useCompanionStore', () => {
  it('starts off, agreeing with the default-off setting', () => {
    expect(useCompanionStore.getState().state).toBe('off');
  });

  it('advances only through the shared transition table', () => {
    const { send } = useCompanionStore.getState();
    expect(send('greet')).toBe('off'); // still off — nothing enabled it
    expect(send('enable')).toBe('idle');
    expect(send('greet')).toBe('greeting');
    expect(send('settle')).toBe('idle');
  });

  it('returns the settled state without throwing on an illegal event', () => {
    const { send } = useCompanionStore.getState();
    send('enable');
    expect(send('handoff')).toBe('idle');
    expect(useCompanionStore.getState().state).toBe('idle');
  });

  it('appends turns newest-last and caps the transcript', () => {
    const { addTurn } = useCompanionStore.getState();
    for (let i = 0; i < COMPANION_TRANSCRIPT_CAP + 25; i += 1) {
      addTurn({ role: 'user', text: `turn ${i}`, spoken: false });
    }
    const { transcript } = useCompanionStore.getState();
    expect(transcript).toHaveLength(COMPANION_TRANSCRIPT_CAP);
    expect(transcript[0]?.text).toBe('turn 25');
    expect(transcript[transcript.length - 1]?.text).toBe(`turn ${COMPANION_TRANSCRIPT_CAP + 24}`);
  });

  it('stamps an id and a timestamp, and hands the stored turn back', () => {
    const stored = useCompanionStore
      .getState()
      .addTurn({ role: 'companion', text: 'hi', spoken: false });
    expect(stored.id).toBeTruthy();
    expect(stored.at).toBeGreaterThan(0);
    expect(useCompanionStore.getState().transcript[0]).toEqual(stored);
  });

  it('marks one turn spoken and leaves the rest alone', () => {
    const { addTurn, markSpoken } = useCompanionStore.getState();
    const first = addTurn({ role: 'companion', text: 'a', spoken: false });
    const second = addTurn({ role: 'companion', text: 'b', spoken: false });
    markSpoken(first.id);
    const { transcript } = useCompanionStore.getState();
    expect(transcript.find((turn) => turn.id === first.id)?.spoken).toBe(true);
    expect(transcript.find((turn) => turn.id === second.id)?.spoken).toBe(false);
  });

  it('ignores markSpoken for an id it does not hold', () => {
    const before = useCompanionStore.getState().transcript;
    useCompanionStore.getState().markSpoken('nope');
    expect(useCompanionStore.getState().transcript).toBe(before);
  });

  it('remembers recent picks per bank, newest first, capped', () => {
    const { notePhrase } = useCompanionStore.getState();
    for (const phrase of ['a', 'b', 'c', 'd', 'e']) notePhrase('greetings', phrase);
    notePhrase('signoffs', 'z');
    const { recentPhrases } = useCompanionStore.getState();
    expect(recentPhrases.greetings).toEqual(['e', 'd', 'c', 'b']);
    expect(recentPhrases.signoffs).toEqual(['z']);
  });

  it('tracks and clears the active hand-off', () => {
    const { setActiveHandoff } = useCompanionStore.getState();
    setActiveHandoff({ sessionId: 's1', command: '/midnite-exec-adhoc' });
    expect(useCompanionStore.getState().activeHandoff).toEqual({
      sessionId: 's1',
      command: '/midnite-exec-adhoc',
    });
    setActiveHandoff(null);
    expect(useCompanionStore.getState().activeHandoff).toBeNull();
  });

  it('persists the transcript and nothing else', () => {
    const partialize = useCompanionStore.persist.getOptions().partialize;
    if (!partialize) throw new Error('useCompanionStore has no partialize configured');
    useCompanionStore.getState().send('enable');
    useCompanionStore.getState().addTurn({ role: 'user', text: 'hello', spoken: false });
    useCompanionStore.getState().setActiveHandoff({ sessionId: 's', command: 'c' });
    expect(Object.keys(partialize(useCompanionStore.getState()))).toEqual(['transcript']);
  });

  it('persists under its own key at version 1 with no migrate', () => {
    const options = useCompanionStore.persist.getOptions();
    expect(options.name).toBe('midnite-studio.companion');
    expect(options.version).toBe(1);
    expect(options.migrate).toBeUndefined();
  });

  it('clears the transcript without touching the machine', () => {
    useCompanionStore.getState().send('enable');
    useCompanionStore.getState().addTurn({ role: 'user', text: 'x', spoken: false });
    useCompanionStore.getState().clearTranscript();
    expect(useCompanionStore.getState().transcript).toEqual([]);
    expect(useCompanionStore.getState().state).toBe('idle');
  });
});
