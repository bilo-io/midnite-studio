import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMPANION_MCP_CONFIRM_MS,
  COMPANION_MCP_TOO_LATE,
  COMPANION_SETTING_KEYS,
  CompanionSettingsSchema,
  type CompanionSettings,
} from '@midnite/studio-shared';

/**
 * Phase 109 Theme D — the renderer's answer to the `companion_*` MCP tools:
 * `settingsState`, `voices` and `setting` on `resolveUiAction`. Real stores,
 * real setter (`settings-apply.ts`); only `bridge()` is stubbed. The confirm
 * flow is driven the way the companion drives it — through the
 * `pendingAction` slot — and the dialog fallback through its own store.
 */

// Theme E's announcer, watched rather than replaced: its own suite covers the
// read-back and the Undo toast; this one only needs to see an agent's change reach it.
vi.mock('./settings-announce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./settings-announce')>();
  return { ...actual, announceCompanionSettingChange: vi.fn(actual.announceCompanionSettingChange) };
});

vi.mock('../../services/bridge', () => ({
  hasBridge: () => false,
  bridge: () => ({ windowRole: 'main' }) as unknown,
}));

import { useCompanionStore } from '../../store/companion-store';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';
import { useMcpSettingConfirmStore } from './mcp-setting-confirm';
import { announceCompanionSettingChange } from './settings-announce';
import { lastCompanionSettingChange, resetCompanionSettingUndoForTest } from './settings-apply';
import { resolveUiAction } from './ui-requests';

const COMPANION_KEYS = Object.keys(CompanionSettingsSchema.shape) as (keyof CompanionSettings)[];
const initial = useUiStore.getInitialState() as unknown as Record<string, unknown>;

beforeEach(() => {
  useUiStore.setState({
    ...Object.fromEntries(COMPANION_KEYS.map((key) => [key, initial[key]])),
    screensaverLocked: false,
    companionEnabled: false,
    companionDetached: false,
    companionPanelOpen: false,
    companionNames: ['Companion'],
  } as Parameters<typeof useUiStore.setState>[0]);
  useCompanionStore.setState({ transcript: [], pendingAction: null });
  useToastStore.setState({ toasts: [] });
  useMcpSettingConfirmStore.setState({ request: null });
  resetCompanionSettingUndoForTest();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const set = (key: (typeof COMPANION_SETTING_KEYS)[number], value: unknown) =>
  resolveUiAction({ kind: 'setting', key, value });

/** Let the request reach its question before the test answers it. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('settingsState', () => {
  it('answers every spec’d key’s value, voice selection split per engine', async () => {
    useUiStore.setState({ companionVolume: 0.3, companionVoices: { local: 'af_bella', system: 'urn:sam' } });
    const result = await resolveUiAction({ kind: 'settingsState' });
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.did !== 'settingsState') throw new Error('wrong arm');
    expect(Object.keys(result.value.values).sort()).toEqual([...COMPANION_SETTING_KEYS].sort());
    expect(result.value.values.companionVolume).toBe(0.3);
    expect(result.value.values['companionVoices.local']).toBe('af_bella');
    expect(result.value.values['companionVoices.system']).toBe('urn:sam');
  });

  it('answers while the screen is locked, and says it is', async () => {
    useUiStore.setState({ screensaverLocked: true });
    const result = await resolveUiAction({ kind: 'settingsState' });
    expect(result).toMatchObject({ ok: true, value: { did: 'settingsState', locked: true } });
  });
});

describe('voices', () => {
  it('lists the system voices and the current selection', async () => {
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [{ voiceURI: 'com.apple.Samantha', name: 'Samantha', lang: 'en-US', default: true }],
    });
    useUiStore.setState({ companionVoices: { local: 'af_nova', system: null } });
    const result = await resolveUiAction({ kind: 'voices' });
    expect(result).toEqual({
      ok: true,
      value: {
        did: 'voices',
        system: [{ voiceURI: 'com.apple.Samantha', name: 'Samantha', lang: 'en-US', default: true }],
        selected: { local: 'af_nova', system: null },
      },
    });
  });
});

describe('setting — direct tier', () => {
  it('applies at once, announces it, and takes the undo slot as an mcp change', async () => {
    const result = await set('companionVolume', 0.8);

    expect(result).toEqual({
      ok: true,
      value: { did: 'setting', status: 'applied', key: 'companionVolume', previous: initial.companionVolume, next: 0.8 },
    });
    expect(useUiStore.getState().companionVolume).toBe(0.8);
    expect(announceCompanionSettingChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ ok: true, key: 'companionVolume', next: 0.8 }),
      'mcp',
    );
    expect(lastCompanionSettingChange()).toMatchObject({ keys: ['companionVolume'], source: 'mcp' });
    expect(useCompanionStore.getState().pendingAction).toBeNull();
  });

  it('refuses a locked write as a status, not a failure', async () => {
    useUiStore.setState({ screensaverLocked: true });
    const result = await set('companionVolume', 0.8);
    expect(result).toMatchObject({ ok: true, value: { status: 'refused', reason: 'locked' } });
    expect(useUiStore.getState().companionVolume).toBe(initial.companionVolume);
  });

  it('refuses a value the schema refuses', async () => {
    const result = await set('companionVolume', 'loud');
    expect(result).toMatchObject({ ok: true, value: { status: 'refused', reason: 'invalid' } });
  });
});

describe('setting — never tier and guards', () => {
  it('refuses a never-tier key without asking anyone', async () => {
    useUiStore.setState({ companionEnabled: true });
    const result = await set('companionEnabled', false);
    expect(result).toMatchObject({ ok: true, value: { status: 'refused', reason: 'never' } });
    expect(useUiStore.getState().companionEnabled).toBe(true);
    expect(useCompanionStore.getState().pendingAction).toBeNull();
  });

  it('refuses personality without asking — no yes would get it past tunedText', async () => {
    useUiStore.setState({ companionEnabled: true });
    const result = await set('companionPersonality', 'Be terse.');
    expect(result).toMatchObject({ ok: true, value: { status: 'refused', reason: 'guard' } });
    expect(useCompanionStore.getState().pendingAction).toBeNull();
    expect(useMcpSettingConfirmStore.getState().request).toBeNull();
  });

  it('refuses emptying the names list without asking', async () => {
    useUiStore.setState({ companionEnabled: true });
    const result = await set('companionNames', []);
    expect(result).toMatchObject({ ok: true, value: { status: 'refused', reason: 'guard' } });
    expect(useCompanionStore.getState().pendingAction).toBeNull();
  });
});

describe('setting — confirm tier through the companion', () => {
  beforeEach(() => {
    useUiStore.setState({ companionEnabled: true });
  });

  it('asks in the chip, opens the panel, and applies on a yes — approved', async () => {
    const pendingResult = set('companionNames', ['Nova']);
    await flush();

    const pending = useCompanionStore.getState().pendingAction;
    expect(pending?.label).toBe('Let your agent set what you call it to Nova');
    expect(useUiStore.getState().companionPanelOpen).toBe(true);
    expect(useCompanionStore.getState().transcript.at(-1)?.text).toMatch(/^Your agent wants to set my what you call it to Nova/);
    expect(useUiStore.getState().companionNames).toEqual(['Companion']);

    // What `resolvePending` does with a yes.
    expect(pending?.onConfirm?.()).toBeNull();
    useCompanionStore.getState().setPendingAction(null);

    expect(await pendingResult).toEqual({
      ok: true,
      value: { did: 'setting', status: 'approved', key: 'companionNames', previous: ['Companion'], next: ['Nova'] },
    });
    expect(useUiStore.getState().companionNames).toEqual(['Nova']);
    expect(lastCompanionSettingChange()).toMatchObject({ keys: ['companionNames'], source: 'mcp' });
    // Approved and written, so Theme E reads it back: "Your agent changed…".
    expect(announceCompanionSettingChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ ok: true, key: 'companionNames', next: ['Nova'] }),
      'mcp',
    );
  });

  it('a "no" — anything that clears the slot — is declined, and nothing changes', async () => {
    const pendingResult = set('companionMicMode', 'toggle');
    await flush();
    useCompanionStore.getState().setPendingAction(null);

    expect(await pendingResult).toEqual({ ok: true, value: { did: 'setting', status: 'declined', key: 'companionMicMode' } });
    expect(useUiStore.getState().companionMicMode).toBe(initial.companionMicMode);
  });

  it('times out at 30 s with nothing applied, and a late yes hears "too late"', async () => {
    vi.useFakeTimers();
    const pendingResult = set('companionNames', ['Nova']);
    await vi.advanceTimersByTimeAsync(0);
    const pending = useCompanionStore.getState().pendingAction;

    await vi.advanceTimersByTimeAsync(COMPANION_MCP_CONFIRM_MS + 1);
    expect(await pendingResult).toEqual({ ok: true, value: { did: 'setting', status: 'timeout', key: 'companionNames' } });

    // Still in the chip, answerable only as too late.
    expect(useCompanionStore.getState().pendingAction).toBe(pending);
    expect(pending?.onConfirm?.()).toBe(COMPANION_MCP_TOO_LATE);
    expect(useUiStore.getState().companionNames).toEqual(['Companion']);
  });

  it('a yes past the deadline is too late even when the timer has not fired', async () => {
    const now = vi.spyOn(Date, 'now');
    const start = Date.now();
    now.mockReturnValue(start);
    const pendingResult = set('companionNames', ['Nova']);
    await flush();
    const pending = useCompanionStore.getState().pendingAction;

    now.mockReturnValue(start + COMPANION_MCP_CONFIRM_MS + 1);
    expect(pending?.onConfirm?.()).toBe(COMPANION_MCP_TOO_LATE);
    expect(await pendingResult).toMatchObject({ value: { status: 'timeout' } });
    expect(useUiStore.getState().companionNames).toEqual(['Companion']);
  });

  it('forgets the question when the pending window ends', async () => {
    vi.useFakeTimers();
    void set('companionNames', ['Nova']);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(useCompanionStore.getState().pendingAction).toBeNull();
  });

  it('a second question replaces the first, which answers declined', async () => {
    const first = set('companionNames', ['Nova']);
    await flush();
    const second = set('companionMicMode', 'toggle');
    await flush();

    expect(await first).toMatchObject({ value: { status: 'declined', key: 'companionNames' } });
    expect(useCompanionStore.getState().pendingAction?.label).toMatch(/microphone button/);
    expect(useCompanionStore.getState().transcript.at(-1)?.text).toMatch(/^Never mind let your agent set what you call it/);

    useCompanionStore.getState().pendingAction?.onConfirm?.();
    useCompanionStore.getState().setPendingAction(null);
    expect(await second).toMatchObject({ value: { status: 'approved' } });
  });

  it('re-checks on approval: a screen locked while asking refuses the write', async () => {
    const pendingResult = set('companionNames', ['Nova']);
    await flush();
    useUiStore.setState({ screensaverLocked: true });
    useCompanionStore.getState().pendingAction?.onConfirm?.();

    expect(await pendingResult).toMatchObject({ value: { status: 'refused', reason: 'locked' } });
    expect(useUiStore.getState().companionNames).toEqual(['Companion']);
  });

  it('does not ask about a change to the value it already has', async () => {
    const result = await set('companionNames', ['Companion']);
    expect(result).toMatchObject({ value: { status: 'applied', previous: ['Companion'], next: ['Companion'] } });
    expect(useCompanionStore.getState().pendingAction).toBeNull();
  });

  it('turning speech back on is direct — no question', async () => {
    useUiStore.setState({ companionSpeakAloud: false });
    expect(await set('companionSpeakAloud', true)).toMatchObject({ value: { status: 'applied' } });
    expect(useCompanionStore.getState().pendingAction).toBeNull();
  });
});

describe('setting — confirm tier through the dialog', () => {
  it('asks with the dialog, not the companion, while the companion is off — and applies on Allow', async () => {
    const pendingResult = set('companionMicMode', 'toggle');
    await flush();

    const request = useMcpSettingConfirmStore.getState().request;
    expect(request?.title).toBe('Let your agent set microphone button to tap to toggle?');
    expect(useCompanionStore.getState().pendingAction).toBeNull();
    expect(useCompanionStore.getState().transcript).toEqual([]);

    request?.onConfirm();
    expect(await pendingResult).toMatchObject({ value: { status: 'approved', next: 'toggle' } });
    expect(useUiStore.getState().companionMicMode).toBe('toggle');
    expect(useMcpSettingConfirmStore.getState().request).toBeNull();
  });

  it('uses the dialog while the companion is popped out into its own window', async () => {
    useUiStore.setState({ companionEnabled: true, companionDetached: true });
    const pendingResult = set('companionMicMode', 'toggle');
    await flush();
    expect(useMcpSettingConfirmStore.getState().request).not.toBeNull();
    expect(useCompanionStore.getState().pendingAction).toBeNull();
    useMcpSettingConfirmStore.getState().request?.onCancel();
    expect(await pendingResult).toMatchObject({ value: { status: 'declined' } });
  });

  it('Cancel is declined', async () => {
    const pendingResult = set('voiceConversation', true);
    await flush();
    useMcpSettingConfirmStore.getState().request?.onCancel();
    expect(await pendingResult).toEqual({ ok: true, value: { did: 'setting', status: 'declined', key: 'voiceConversation' } });
    expect(useUiStore.getState().voiceConversation).toBe(false);
  });

  it('closes at the deadline with a toast, and nothing applies', async () => {
    vi.useFakeTimers();
    const pendingResult = set('voiceConversation', true);
    await vi.advanceTimersByTimeAsync(COMPANION_MCP_CONFIRM_MS + 1);

    expect(await pendingResult).toMatchObject({ value: { status: 'timeout' } });
    expect(useMcpSettingConfirmStore.getState().request).toBeNull();
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Your agent stopped waiting — conversation mode is unchanged.');
    expect(useUiStore.getState().voiceConversation).toBe(false);
  });
});
