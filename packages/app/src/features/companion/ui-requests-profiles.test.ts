import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMPANION_MCP_CONFIRM_MS,
  COMPANION_PROFILES_MAX,
  CompanionSettingsSchema,
  type CompanionSettings,
} from '@midnite/studio-shared';

/**
 * Phase 109 Theme G — the renderer's answer to the `companion_profile_*` MCP
 * tools: `profileList`, `profileSave`, `profileSwitch` and `profileDelete` on
 * `resolveUiAction`. Real stores, real `profiles.ts`, real setter; only
 * `bridge()` is stubbed. A delete and an overwrite wait on the user like a
 * confirm-tier `companion_settings_set` — through the companion's pending
 * slot when it is on, the dialog when it is off.
 */

vi.mock('./settings-announce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./settings-announce')>();
  return { ...actual, announceCompanionProfileSwitch: vi.fn(async () => {}) };
});

vi.mock('../../services/bridge', () => ({
  hasBridge: () => false,
  bridge: () => ({ windowRole: 'main' }) as unknown,
}));

import { useCompanionStore } from '../../store/companion-store';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';
import { useMcpSettingConfirmStore } from './mcp-setting-confirm';
import { saveCompanionProfile } from './profiles';
import { announceCompanionProfileSwitch } from './settings-announce';
import { lastCompanionSettingChange, resetCompanionSettingUndoForTest } from './settings-apply';
import { resolveUiAction } from './ui-requests';

const COMPANION_KEYS = Object.keys(CompanionSettingsSchema.shape) as (keyof CompanionSettings)[];
const initial = useUiStore.getInitialState() as unknown as Record<string, unknown>;

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Two saved profiles, Pirate active. */
function seed(): void {
  useUiStore.setState({
    companionVoices: { local: 'bm_george', system: null },
    companionPersonality: 'Measured.',
    companionHonorifics: ['friend'],
  });
  saveCompanionProfile('Narrator');
  useUiStore.setState({
    companionVoices: { local: 'am_adam', system: null },
    companionPersonality: 'Arr.',
    companionHonorifics: ['matey'],
  });
  saveCompanionProfile('Pirate');
}

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
  vi.mocked(announceCompanionProfileSwitch).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('profileList', () => {
  it('lists every profile with active and modified, while locked too', async () => {
    seed();
    useUiStore.setState({ companionHonorifics: ['captain'], screensaverLocked: true });
    const result = await resolveUiAction({ kind: 'profileList' });
    if (!result.ok || result.value.did !== 'profileList') throw new Error('wrong arm');
    expect(result.value.locked).toBe(true);
    expect(result.value.max).toBe(COMPANION_PROFILES_MAX);
    expect(result.value.profiles.map((row) => [row.name, row.active, row.modified])).toEqual([
      ['Narrator', false, false],
      ['Pirate', true, true],
    ]);
  });
});

describe('profileSave', () => {
  it('saves a new name at once — applied — and posts a toast', async () => {
    useUiStore.setState({ companionVoices: { local: 'af_bella', system: null } });
    const result = await resolveUiAction({ kind: 'profileSave', name: 'Bella' });
    expect(result).toMatchObject({
      ok: true,
      value: { did: 'profileSave', status: 'applied', name: 'Bella', overwritten: false, profile: { active: true, modified: false } },
    });
    expect(useUiStore.getState().companionProfiles.map((row) => row.name)).toEqual(['Bella']);
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Your agent saved the companion profile Bella.');
  });

  it('asks before saving over a taken name, and saves over it on Allow — approved', async () => {
    seed();
    useUiStore.setState({ companionPersonality: 'Booming.' });
    const pending = resolveUiAction({ kind: 'profileSave', name: 'narrator' });
    await flush();

    const request = useMcpSettingConfirmStore.getState().request;
    expect(request?.title).toBe('Let your agent save over the Narrator profile?');
    expect(useUiStore.getState().companionProfiles[0]?.personality).toBe('Measured.');
    request?.onConfirm();

    expect(await pending).toMatchObject({
      ok: true,
      value: { did: 'profileSave', status: 'approved', name: 'Narrator', overwritten: true },
    });
    expect(useUiStore.getState().companionProfiles[0]?.personality).toBe('Booming.');
  });

  it('a declined overwrite changes nothing', async () => {
    seed();
    const before = useUiStore.getState().companionProfiles;
    const pending = resolveUiAction({ kind: 'profileSave', name: 'Narrator' });
    await flush();
    useMcpSettingConfirmStore.getState().request?.onCancel();
    expect(await pending).toEqual({ ok: true, value: { did: 'profileSave', status: 'declined', name: 'Narrator' } });
    expect(useUiStore.getState().companionProfiles).toBe(before);
  });

  it('refuses past the cap, and while locked, without asking', async () => {
    for (let index = 0; index < COMPANION_PROFILES_MAX; index += 1) saveCompanionProfile(`P${index}`);
    expect(await resolveUiAction({ kind: 'profileSave', name: 'One more' })).toMatchObject({
      ok: true,
      value: { did: 'profileSave', status: 'refused', reason: 'full' },
    });
    useUiStore.setState({ screensaverLocked: true });
    expect(await resolveUiAction({ kind: 'profileSave', name: 'P1' })).toMatchObject({
      ok: true,
      value: { status: 'refused', reason: 'locked' },
    });
    expect(useMcpSettingConfirmStore.getState().request).toBeNull();
  });
});

describe('profileSwitch', () => {
  it('switches as one mcp change, applied, and reads it back', async () => {
    seed();
    const result = await resolveUiAction({ kind: 'profileSwitch', name: 'NARRATOR' });
    expect(result).toMatchObject({
      ok: true,
      value: { did: 'profileSwitch', status: 'applied', name: 'Narrator', profile: { active: true, modified: false } },
    });
    expect(useUiStore.getState().companionVoices.local).toBe('bm_george');
    expect(lastCompanionSettingChange()).toMatchObject({ source: 'mcp' });
    // One undo step for every key that moved — the system voice was already unset.
    expect(lastCompanionSettingChange()?.keys.sort()).toEqual(
      ['companionActiveProfile', 'companionHonorifics', 'companionPersonality', 'companionVoices.local'].sort(),
    );
    expect(announceCompanionProfileSwitch).toHaveBeenCalledWith(expect.objectContaining({ changed: true }), 'mcp');
  });

  it('refuses a name there is no profile for', async () => {
    seed();
    expect(await resolveUiAction({ kind: 'profileSwitch', name: 'Butler' })).toEqual({
      ok: true,
      value: {
        did: 'profileSwitch',
        status: 'refused',
        name: 'Butler',
        reason: 'notFound',
        message: "I don't have a profile called Butler.",
      },
    });
  });
});

describe('profileDelete', () => {
  it('always asks — through the companion when it is on — and deletes on a yes', async () => {
    seed();
    useUiStore.setState({ companionEnabled: true });
    const pending = resolveUiAction({ kind: 'profileDelete', name: 'pirate' });
    await flush();

    const slot = useCompanionStore.getState().pendingAction;
    expect(slot?.label).toBe('Let your agent delete the Pirate profile');
    expect(useCompanionStore.getState().transcript.at(-1)?.text).toMatch(/^Your agent wants to delete the Pirate profile\./);
    expect(slot?.onConfirm?.()).toBeNull();
    useCompanionStore.getState().setPendingAction(null);

    expect(await pending).toMatchObject({
      ok: true,
      value: { did: 'profileDelete', status: 'approved', name: 'Pirate', profile: { name: 'Pirate' } },
    });
    expect(useUiStore.getState().companionProfiles.map((row) => row.name)).toEqual(['Narrator']);
    expect(useUiStore.getState().companionActiveProfile).toBeNull();
  });

  it('times out at 30 s with nothing deleted', async () => {
    seed();
    vi.useFakeTimers();
    const pending = resolveUiAction({ kind: 'profileDelete', name: 'Narrator' });
    await vi.advanceTimersByTimeAsync(COMPANION_MCP_CONFIRM_MS + 1);
    expect(await pending).toEqual({ ok: true, value: { did: 'profileDelete', status: 'timeout', name: 'Narrator' } });
    expect(useUiStore.getState().companionProfiles).toHaveLength(2);
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe(
      'Your agent stopped waiting — the Narrator profile is unchanged.',
    );
  });

  it('refuses a name there is no profile for without asking', async () => {
    expect(await resolveUiAction({ kind: 'profileDelete', name: 'Narrator' })).toMatchObject({
      ok: true,
      value: { status: 'refused', reason: 'notFound' },
    });
    expect(useMcpSettingConfirmStore.getState().request).toBeNull();
  });
});
