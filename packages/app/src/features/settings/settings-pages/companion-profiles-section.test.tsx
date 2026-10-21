import { CompanionSettingsSchema, type CompanionSettings } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { useUiStore } from '../../../store/ui-store';
import { saveCompanionProfile } from '../../companion/profiles';
import { lastCompanionSettingChange, resetCompanionSettingUndoForTest } from '../../companion/settings-apply';
import { CompanionProfilesSection } from './companion-profiles-section';

/**
 * Phase 109 Theme G — Settings ▸ Companion ▸ Profiles: the list with its
 * active badge and modified dot, Save current as… (and its overwrite
 * question), Rename, Delete through `confirm-dialog.tsx`, and Set active as
 * one undoable change. Real store, real `profiles.ts`.
 */

const COMPANION_KEYS = Object.keys(CompanionSettingsSchema.shape) as (keyof CompanionSettings)[];
const initial = useUiStore.getInitialState() as unknown as Record<string, unknown>;

beforeEach(() => {
  useUiStore.setState({
    ...Object.fromEntries(COMPANION_KEYS.map((key) => [key, initial[key]])),
    screensaverLocked: false,
  } as Parameters<typeof useUiStore.setState>[0]);
  resetCompanionSettingUndoForTest();
});

afterEach(() => cleanup());

function renderSection() {
  return render(
    <DialogHost>
      <CompanionProfilesSection />
    </DialogHost>,
  );
}

/** Narrator (George) then Pirate (Adam), Pirate active. Returns their ids. */
function seed(): { narrator: string; pirate: string } {
  useUiStore.setState({ companionVoices: { local: 'bm_george', system: null }, companionHonorifics: ['friend'] });
  const narrator = saveCompanionProfile('Narrator');
  useUiStore.setState({ companionVoices: { local: 'am_adam', system: null }, companionHonorifics: ['matey'] });
  const pirate = saveCompanionProfile('Pirate');
  if (!narrator.ok || !pirate.ok) throw new Error('not saved');
  return { narrator: narrator.profile.id, pirate: pirate.profile.id };
}

const names = () => useUiStore.getState().companionProfiles.map((profile) => profile.name);

describe('the list', () => {
  it('says there are none yet', () => {
    renderSection();
    expect(screen.getByTestId('companion-profiles-empty')).toBeTruthy();
    expect(screen.getByText(/0 of 20/)).toBeTruthy();
  });

  it('badges the active profile and describes each one', () => {
    const { narrator, pirate } = seed();
    renderSection();
    const active = screen.getByTestId(`companion-profile-${pirate}`);
    expect(within(active).getByTestId('companion-profile-active-badge').textContent).toBe('Active');
    expect(active.getAttribute('aria-current')).toBe('true');
    expect(within(active).getByText(/Adam \(American\) · calls you matey/)).toBeTruthy();
    expect(within(screen.getByTestId(`companion-profile-${narrator}`)).queryByTestId('companion-profile-active-badge')).toBeNull();
  });

  it('marks the active profile modified on an edit, without rewriting it — and Revert puts it back', () => {
    const { pirate } = seed();
    renderSection();
    expect(screen.queryByTestId('companion-profile-modified')).toBeNull();

    act(() => useUiStore.setState({ companionHonorifics: ['captain'] }));
    const row = screen.getByTestId(`companion-profile-${pirate}`);
    expect(within(row).getByTestId('companion-profile-modified')).toBeTruthy();
    expect(useUiStore.getState().companionProfiles[1]?.honorifics).toEqual(['matey']);

    fireEvent.click(within(row).getByTestId(`companion-profile-activate-${pirate}`));
    expect(useUiStore.getState().companionHonorifics).toEqual(['matey']);
    expect(screen.queryByTestId('companion-profile-modified')).toBeNull();
  });
});

describe('Set active', () => {
  it('switches as one change through the setter, from the page', () => {
    const { narrator } = seed();
    renderSection();
    fireEvent.click(screen.getByTestId(`companion-profile-activate-${narrator}`));

    expect(useUiStore.getState().companionActiveProfile).toBe(narrator);
    expect(useUiStore.getState().companionVoices.local).toBe('bm_george');
    expect(lastCompanionSettingChange()).toMatchObject({ source: 'page' });
    expect(lastCompanionSettingChange()?.keys).toContain('companionActiveProfile');
    expect(screen.getByTestId(`companion-profile-${narrator}`).getAttribute('aria-current')).toBe('true');
  });
});

describe('Save current as…', () => {
  it('saves a new name from the prompt, and makes it active', () => {
    useUiStore.setState({ companionVoices: { local: 'af_bella', system: null } });
    renderSection();
    fireEvent.click(screen.getByTestId('companion-profile-save-as'));
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Bella' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(names()).toEqual(['Bella']);
    expect(screen.getByTestId('companion-profile-active-badge')).toBeTruthy();
  });

  it('is prefilled with the active profile, and asks before saving over it', () => {
    seed();
    useUiStore.setState({ companionHonorifics: ['captain'] });
    renderSection();
    fireEvent.click(screen.getByTestId('companion-profile-save-as'));
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('Pirate');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Save over the Pirate profile?')).toBeTruthy();
    expect(useUiStore.getState().companionProfiles[1]?.honorifics).toEqual(['matey']);
    fireEvent.click(screen.getByRole('button', { name: 'Save over it' }));

    expect(names()).toEqual(['Narrator', 'Pirate']);
    expect(useUiStore.getState().companionProfiles[1]?.honorifics).toEqual(['captain']);
    expect(screen.queryByTestId('companion-profile-modified')).toBeNull();
  });
});

describe('Rename and Delete', () => {
  it('renames through the prompt', () => {
    const { narrator } = seed();
    renderSection();
    fireEvent.click(screen.getByTestId(`companion-profile-rename-${narrator}`));
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Storyteller' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(names()).toEqual(['Storyteller', 'Pirate']);
  });

  it('deletes only after the confirm dialog says so', () => {
    const { pirate } = seed();
    renderSection();
    fireEvent.click(screen.getByTestId(`companion-profile-delete-${pirate}`));
    expect(screen.getByText('Delete the Pirate profile?')).toBeTruthy();
    expect(names()).toEqual(['Narrator', 'Pirate']);

    fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));
    expect(names()).toEqual(['Narrator']);
    expect(useUiStore.getState().companionActiveProfile).toBeNull();
  });

  it('disables every write while the screen is locked', () => {
    const { narrator } = seed();
    useUiStore.setState({ screensaverLocked: true });
    renderSection();
    for (const id of [
      'companion-profile-save-as',
      `companion-profile-activate-${narrator}`,
      `companion-profile-rename-${narrator}`,
      `companion-profile-delete-${narrator}`,
    ]) {
      expect((screen.getByTestId(id) as HTMLButtonElement).disabled, id).toBe(true);
    }
  });
});
