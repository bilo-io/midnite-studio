import {
  COMPANION_LOCAL_VOICES,
  COMPANION_PROFILES_FULL_MESSAGE,
  COMPANION_PROFILES_MAX,
  companionProfileNameProblem,
  isCompanionProfileModified,
  type CompanionProfile,
} from '@midnite/studio-shared';
import { useState } from 'react';
import { LuCheck, LuPencil, LuRotateCcw, LuSave, LuTrash2 } from 'react-icons/lu';

import { useOptionalDialogs } from '../../../components/dialog-host';
import { IconButton } from '../../../components/icon-button';
import { useUiStore } from '../../../store/ui-store';
import {
  deleteCompanionProfile,
  previewSaveCompanionProfile,
  renameCompanionProfile,
  saveCompanionProfile,
  switchCompanionProfile,
  type CompanionProfileResult,
} from '../../companion/profiles';

/**
 * Settings ▸ Companion ▸ Profiles (Phase 109 Theme G) — the page's half of
 * `companionProfiles` and `companionActiveProfile`, the two preferences
 * Theme B's v32 migration seeded ahead of this section and parked in
 * `persisted-keys.ts`'s `KNOWN_ORPHANS` until it landed.
 *
 * A profile bundles the companion's voice, personality and what it calls you
 * — never its names, which are the wake words. The list shows which is active
 * and, with a dot, whether the companion has been edited since: editing marks
 * a profile modified and never rewrites it behind the user's back. Save
 * current as… (prefilled with the active profile's name, so updating it is
 * two clicks), Rename, Delete (through `confirm-dialog.tsx`) and Set active
 * — one undoable change, the same `profiles.ts` the companion's voice and the
 * `companion_profile_*` MCP tools use.
 */
export function CompanionProfilesSection() {
  const dialogs = useOptionalDialogs();
  const companionProfiles = useUiStore((s) => s.companionProfiles);
  const companionActiveProfile = useUiStore((s) => s.companionActiveProfile);
  const companionVoices = useUiStore((s) => s.companionVoices);
  const companionPersonality = useUiStore((s) => s.companionPersonality);
  const companionHonorifics = useUiStore((s) => s.companionHonorifics);
  const locked = useUiStore((s) => s.screensaverLocked);
  const [notice, setNotice] = useState<string | null>(null);

  const current = { companionVoices, companionPersonality, companionHonorifics };
  const active = companionProfiles.find((profile) => profile.id === companionActiveProfile) ?? null;
  const full = companionProfiles.length >= COMPANION_PROFILES_MAX;

  /** Say what went wrong, or clear the last notice. */
  const report = (result: CompanionProfileResult): void => setNotice(result.ok ? null : result.message);

  const saveAs = (name: string): void => {
    const preview = previewSaveCompanionProfile(name);
    if (!preview.ok) {
      setNotice(preview.message);
      return;
    }
    if (preview.existing === null) {
      report(saveCompanionProfile(name));
      return;
    }
    const existing = preview.existing;
    dialogs?.confirm({
      title: `Save over the ${existing.name} profile?`,
      body: `${existing.name}'s voice, personality and what it calls you are replaced with the companion's current ones.`,
      confirmLabel: 'Save over it',
      blastRadius: null,
      onConfirm: () => report(saveCompanionProfile(name, { overwrite: true })),
    });
  };

  const openSaveAs = (): void => {
    dialogs?.prompt({
      title: 'Save current as a profile',
      label: 'Profile name',
      initialValue: active?.name ?? '',
      placeholder: 'Narrator, Pirate, Night owl…',
      confirmLabel: 'Save',
      validate: (value) => {
        const taken = companionProfiles.some(
          (profile) => profile.name.trim().toLowerCase() === value.replace(/\s+/g, ' ').trim().toLowerCase(),
        );
        if (taken) return null; // an overwrite — asked about next
        if (full) return COMPANION_PROFILES_FULL_MESSAGE;
        return companionProfileNameProblem(value, companionProfiles);
      },
      onConfirm: saveAs,
    });
  };

  const openRename = (profile: CompanionProfile): void => {
    dialogs?.prompt({
      title: `Rename ${profile.name}`,
      label: 'Profile name',
      initialValue: profile.name,
      confirmLabel: 'Rename',
      validate: (value) => companionProfileNameProblem(value, companionProfiles, profile.id),
      onConfirm: (value) => report(renameCompanionProfile(profile.id, value)),
    });
  };

  const openDelete = (profile: CompanionProfile): void => {
    dialogs?.confirm({
      title: `Delete the ${profile.name} profile?`,
      body:
        profile.id === companionActiveProfile
          ? `Its voice, personality and what it calls you are deleted. The companion keeps sounding the way it does now, with no profile active.`
          : `Its voice, personality and what it calls you are deleted. The companion is unchanged.`,
      confirmLabel: 'Delete profile',
      danger: true,
      blastRadius: null,
      onConfirm: () => report(deleteCompanionProfile(profile.id)),
    });
  };

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="companion-profiles">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        A profile is a voice, a personality and what it calls you, saved under one name. Its names stay
        the same whichever profile is on, so switching never changes what wakes it.
      </p>

      {companionProfiles.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
          data-testid="companion-profiles-empty"
        >
          No profiles yet. Save how the companion sounds now to come back to it later.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border" data-testid="companion-profiles-list">
          {companionProfiles.map((profile) => {
            const isActive = profile.id === companionActiveProfile;
            const modified = isActive && isCompanionProfileModified(profile, current);
            return (
              <li
                key={profile.id}
                className={`flex items-center gap-2 px-3 py-2 ${isActive ? 'bg-accent/40' : ''}`}
                data-testid={`companion-profile-${profile.id}`}
                aria-current={isActive ? 'true' : undefined}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium">{profile.name}</span>
                    {isActive ? (
                      <span
                        className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
                        data-testid="companion-profile-active-badge"
                      >
                        Active
                      </span>
                    ) : null}
                    {modified ? (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400"
                        title="Edited since it was saved — save over it to keep the changes, or set it active again to go back."
                        data-testid="companion-profile-modified"
                      >
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Modified
                      </span>
                    ) : null}
                  </div>
                  <span className="truncate text-[11px] text-muted-foreground">{describeProfile(profile)}</span>
                </div>

                {isActive && !modified ? null : (
                  <button
                    type="button"
                    onClick={() => report(switchCompanionProfile(profile.id, 'page'))}
                    disabled={locked}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs transition-colors hover:bg-accent disabled:opacity-50"
                    data-testid={`companion-profile-activate-${profile.id}`}
                    title={isActive ? 'Go back to the profile as it was saved' : undefined}
                  >
                    {isActive ? <LuRotateCcw className="h-3 w-3" /> : <LuCheck className="h-3 w-3" />}
                    {isActive ? 'Revert' : 'Set active'}
                  </button>
                )}
                <IconButton
                  icon={LuPencil}
                  label={`Rename ${profile.name}`}
                  onClick={() => openRename(profile)}
                  disabled={locked}
                  size="sm"
                  data-testid={`companion-profile-rename-${profile.id}`}
                />
                <IconButton
                  icon={LuTrash2}
                  label={`Delete ${profile.name}`}
                  onClick={() => openDelete(profile)}
                  disabled={locked}
                  size="sm"
                  tone="danger"
                  data-testid={`companion-profile-delete-${profile.id}`}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openSaveAs}
          disabled={locked}
          className="inline-flex h-7 w-fit items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
          data-testid="companion-profile-save-as"
        >
          <LuSave className="h-3.5 w-3.5" />
          Save current as…
        </button>
        <span className="text-[11px] text-muted-foreground">
          {companionProfiles.length} of {COMPANION_PROFILES_MAX}
        </span>
      </div>

      <p className="-mt-1 text-[11px] italic leading-relaxed text-muted-foreground/80" data-testid="companion-try-profiles">
        Try: “save this as Narrator”, “switch to Narrator”, “what profiles do I have?”
      </p>

      {notice ? (
        <p role="status" className="text-[11px] text-destructive" data-testid="companion-profiles-notice">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

/** "Lewis (British) · calls you friend · Measured, warm…" — enough to tell two apart. */
function describeProfile(profile: CompanionProfile): string {
  const voice = COMPANION_LOCAL_VOICES.find((row) => row.id === profile.voices.local);
  const parts = [
    voice ? `${voice.name} (${voice.language === 'en-us' ? 'American' : 'British'})` : 'Heart (default voice)',
    profile.honorifics.length > 0 ? `calls you ${profile.honorifics.join(', ')}` : null,
    profile.personality.trim() !== ''
      ? profile.personality.trim().length > 48
        ? `${profile.personality.trim().slice(0, 47)}…`
        : profile.personality.trim()
      : null,
  ];
  return parts.filter((part): part is string => part !== null).join(' · ');
}
