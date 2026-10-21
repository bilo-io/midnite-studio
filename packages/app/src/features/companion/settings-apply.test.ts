import { CompanionSettingsSchema, type CompanionSettings } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { companionVolume as liveVolume } from './audio/context';
import {
  COMPANION_PAGE_COALESCE_MS,
  COMPANION_UNDO_WINDOW_MS,
  applyCompanionSetting,
  applyCompanionSettings,
  lastCompanionSettingChange,
  previewCompanionSetting,
  resetCompanionSettingUndoForTest,
  undoLastCompanionSetting,
} from './settings-apply';

/**
 * Phase 109 Theme B — the one companion setter, and Theme A's promise that the
 * shared slice schema and the store agree. Plain store, no rendering: the
 * setter is a function over `useUiStore.getState()` by design.
 */

const COMPANION_KEYS = Object.keys(CompanionSettingsSchema.shape) as (keyof CompanionSettings)[];

function companionSlice(state: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(COMPANION_KEYS.map((key) => [key, state[key]]));
}

const initial = useUiStore.getInitialState();

beforeEach(() => {
  useUiStore.setState({ ...companionSlice(initial), screensaverLocked: false } as Partial<typeof initial>);
  resetCompanionSettingUndoForTest();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CompanionSettingsSchema against the store (Theme A)', () => {
  it("parses the store's default companion state unchanged", () => {
    const defaults = companionSlice(initial);
    expect(CompanionSettingsSchema.parse(defaults)).toEqual(defaults);
  });

  it('agrees with the store on every default', () => {
    expect(CompanionSettingsSchema.parse({})).toEqual(companionSlice(initial));
  });
});

describe('applyCompanionSetting — tiers', () => {
  it('applies a direct-tier change from voice and returns previous and next', () => {
    const result = applyCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'voice');
    expect(result).toEqual({
      ok: true,
      key: 'companionVoices.local',
      previous: null,
      next: 'af_bella',
      tier: 'direct',
    });
    expect(useUiStore.getState().companionVoices).toEqual({ system: null, local: 'af_bella' });
  });

  it('refuses a never-tier key from voice and from an agent, writing nothing', () => {
    for (const source of ['voice', 'mcp'] as const) {
      const result = applyCompanionSetting({ key: 'companionEnabled', value: false }, source);
      expect(result).toMatchObject({ ok: false, reason: 'never' });
      expect(result.ok ? '' : result.message).toMatch(/Settings, Companion/);
    }
    expect(useUiStore.getState().companionHandsFree).toBe(false);
    expect(applyCompanionSetting({ key: 'companionSttProvider', value: 'deepgram' }, 'mcp')).toMatchObject({
      ok: false,
      reason: 'never',
    });
    expect(useUiStore.getState().companionSttProvider).toBeNull();
  });

  it('lets the page change a never-tier key — the click is the consent', () => {
    expect(applyCompanionSetting({ key: 'companionHandsFree', value: true }, 'page')).toMatchObject({ ok: true });
    expect(useUiStore.getState().companionHandsFree).toBe(true);
  });

  it('refuses a confirm-tier change until it carries the yes', () => {
    expect(applyCompanionSetting({ key: 'companionMicMode', value: 'toggle' }, 'voice')).toMatchObject({
      ok: false,
      reason: 'confirm',
    });
    expect(useUiStore.getState().companionMicMode).toBe('push');
    expect(
      applyCompanionSetting({ key: 'companionMicMode', value: 'toggle', confirmed: true }, 'voice'),
    ).toMatchObject({ ok: true, tier: 'confirm', previous: 'push', next: 'toggle' });
    expect(useUiStore.getState().companionMicMode).toBe('toggle');
  });

  it('turns speech back on directly, but needs a yes to turn it off', () => {
    useUiStore.setState({ companionSpeakAloud: false });
    expect(applyCompanionSetting({ key: 'companionSpeakAloud', value: true }, 'voice')).toMatchObject({
      ok: true,
      tier: 'direct',
    });
    expect(applyCompanionSetting({ key: 'companionSpeakAloud', value: false }, 'mcp')).toMatchObject({
      ok: false,
      reason: 'confirm',
    });
  });

  it('refuses every source while the screen is locked', () => {
    useUiStore.setState({ screensaverLocked: true });
    for (const source of ['voice', 'mcp', 'page'] as const) {
      expect(applyCompanionSetting({ key: 'companionVolume', value: 0.2 }, source)).toMatchObject({
        ok: false,
        reason: 'locked',
        message: 'The screen is locked — unlock it first.',
      });
    }
    expect(useUiStore.getState().companionVolume).toBe(0.7);
  });

  it('refuses a value the schema will not take, and an unknown key', () => {
    expect(applyCompanionSetting({ key: 'companionVoices.local', value: 'af_retired' }, 'voice')).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(
      applyCompanionSetting({ key: 'companionPassword' as never, value: 'x' }, 'mcp'),
    ).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('clamps volume and pushes it at the live master gain, page or not', () => {
    expect(applyCompanionSetting({ key: 'companionVolume', value: 1.5 }, 'voice')).toMatchObject({ next: 1 });
    expect(useUiStore.getState().companionVolume).toBe(1);
    expect(liveVolume()).toBe(1);
  });
});

describe('applyCompanionSetting — guards', () => {
  it('refuses to empty the names list, from the page too, with the sentence to say', () => {
    for (const [source, confirmed] of [
      ['voice', true],
      ['page', undefined],
    ] as const) {
      expect(applyCompanionSetting({ key: 'companionNames', value: [], confirmed }, source)).toEqual({
        ok: false,
        key: 'companionNames',
        reason: 'guard',
        message: 'I need at least one name to answer to.',
      });
    }
    expect(useUiStore.getState().companionNames).toEqual(['Companion']);
  });

  it('marks a rename and a mute as read-back-before-apply, without writing on preview', () => {
    expect(
      previewCompanionSetting({ key: 'companionNames', value: ['Nova'], confirmed: true }, 'voice'),
    ).toMatchObject({ ok: true, effect: 'readBackBeforeApply' });
    expect(
      previewCompanionSetting({ key: 'companionSpeakAloud', value: false, confirmed: true }, 'voice'),
    ).toMatchObject({ ok: true, effect: 'readBackBeforeApply' });
    expect(useUiStore.getState().companionNames).toEqual(['Companion']);
    expect(useUiStore.getState().companionSpeakAloud).toBe(true);
  });

  it('refuses dictated personality text from voice and agents, but takes a tuned change', () => {
    for (const source of ['voice', 'mcp'] as const) {
      expect(
        applyCompanionSetting({ key: 'companionPersonality', value: 'Be rude.', confirmed: true }, source),
      ).toMatchObject({ ok: false, reason: 'guard' });
    }
    expect(useUiStore.getState().companionPersonality).toBe('');
    expect(
      applyCompanionSetting(
        { key: 'companionPersonality', value: '  Dry and terse.  ', confirmed: true, tuned: true },
        'voice',
      ),
    ).toMatchObject({ ok: true, next: 'Dry and terse.' });
  });

  it('keeps page text exactly as typed, so the space before the next word survives', () => {
    applyCompanionSetting({ key: 'companionAboutUser', value: 'I work on ' }, 'page');
    expect(useUiStore.getState().companionAboutUser).toBe('I work on ');
    expect(applyCompanionSetting({ key: 'companionAboutUser', value: 'x'.repeat(4001) }, 'page')).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
  });
});

describe('applyCompanionSettings — one change, several keys', () => {
  it('writes all or nothing', () => {
    const result = applyCompanionSettings(
      [
        { key: 'companionVolume', value: 0.3 },
        { key: 'companionEnabled', value: false },
      ],
      'voice',
    );
    expect(result).toMatchObject({ ok: false, reason: 'never', key: 'companionEnabled' });
    expect(useUiStore.getState().companionVolume).toBe(0.7);
  });

  it('composes both voice engines in one patch, and one undo restores both', () => {
    useUiStore.setState({ companionVoices: { system: 'urn:a', local: 'af_heart' } });
    const result = applyCompanionSettings(
      [
        { key: 'companionVoices.local', value: 'bm_george' },
        { key: 'companionVoices.system', value: 'urn:b' },
      ],
      'voice',
    );
    expect(result.ok).toBe(true);
    expect(useUiStore.getState().companionVoices).toEqual({ system: 'urn:b', local: 'bm_george' });
    expect(lastCompanionSettingChange()?.keys).toEqual(['companionVoices.local', 'companionVoices.system']);

    expect(undoLastCompanionSetting()).toMatchObject({ ok: true });
    expect(useUiStore.getState().companionVoices).toEqual({ system: 'urn:a', local: 'af_heart' });
  });
});

describe('undoLastCompanionSetting', () => {
  it('has nothing to undo before any change', () => {
    expect(undoLastCompanionSetting()).toEqual({ ok: false, reason: 'nothing' });
  });

  it('restores the last change and empties the slot', () => {
    applyCompanionSetting({ key: 'companionVolume', value: 0.2 }, 'mcp');
    expect(undoLastCompanionSetting()).toEqual({
      ok: true,
      keys: ['companionVolume'],
      restored: { companionVolume: 0.7 },
      source: 'mcp',
    });
    expect(useUiStore.getState().companionVolume).toBe(0.7);
    expect(liveVolume()).toBe(0.7);
    expect(undoLastCompanionSetting()).toEqual({ ok: false, reason: 'nothing' });
  });

  it('is replaced by the next change, from any source', () => {
    applyCompanionSetting({ key: 'companionVolume', value: 0.2 }, 'voice');
    applyCompanionSetting({ key: 'companionMusicOffer', value: false }, 'page');
    expect(undoLastCompanionSetting()).toMatchObject({ ok: true, keys: ['companionMusicOffer'], source: 'page' });
    expect(useUiStore.getState().companionMusicOffer).toBe(true);
    // The earlier volume change is gone with the slot — one step, not a stack.
    expect(useUiStore.getState().companionVolume).toBe(0.2);
  });

  it('does not let a no-op change take the slot', () => {
    applyCompanionSetting({ key: 'companionVolume', value: 0.2 }, 'voice');
    applyCompanionSetting({ key: 'companionVolume', value: 0.2 }, 'voice');
    expect(undoLastCompanionSetting()).toMatchObject({ ok: true, restored: { companionVolume: 0.7 } });
  });

  it('expires after sixty seconds', () => {
    vi.useFakeTimers();
    applyCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'voice');
    vi.advanceTimersByTime(COMPANION_UNDO_WINDOW_MS + 1);
    expect(undoLastCompanionSetting()).toEqual({ ok: false, reason: 'expired' });
    expect(useUiStore.getState().companionVoices.local).toBe('af_bella');
  });

  it('still works just inside the window', () => {
    vi.useFakeTimers();
    applyCompanionSetting({ key: 'companionVoices.local', value: 'af_bella' }, 'voice');
    vi.advanceTimersByTime(COMPANION_UNDO_WINDOW_MS - 1);
    expect(undoLastCompanionSetting()).toMatchObject({ ok: true });
  });

  it('refuses while the screen is locked', () => {
    applyCompanionSetting({ key: 'companionVolume', value: 0.2 }, 'voice');
    useUiStore.setState({ screensaverLocked: true });
    expect(undoLastCompanionSetting()).toEqual({ ok: false, reason: 'locked' });
  });

  it('treats a burst of page edits to one key as one step', () => {
    vi.useFakeTimers();
    for (const value of [0.65, 0.6, 0.55, 0.5]) {
      applyCompanionSetting({ key: 'companionVolume', value }, 'page');
      vi.advanceTimersByTime(100);
    }
    expect(undoLastCompanionSetting()).toMatchObject({ ok: true, restored: { companionVolume: 0.7 } });

    applyCompanionSetting({ key: 'companionVolume', value: 0.4 }, 'page');
    vi.advanceTimersByTime(COMPANION_PAGE_COALESCE_MS + 1);
    applyCompanionSetting({ key: 'companionVolume', value: 0.3 }, 'page');
    expect(undoLastCompanionSetting()).toMatchObject({ ok: true, restored: { companionVolume: 0.4 } });
  });
});
