import { joinCompanionProfileNames, type CompanionIntent, type CompanionProfile } from '@midnite/studio-shared';

import type { PendingAction } from '../../store/companion-store';
import { say } from './concierge';
import type { HandoffDeps } from './handoff';
import type {
  CompanionProfileRefused,
  CompanionProfileResult,
  CompanionProfileSavePreview,
  CompanionProfilesState,
} from './profiles';

/**
 * The companion's voice for persona profiles (Phase 109 Theme G) — the
 * `profile` intent's arm of `act()`, kept beside `handoff.ts` rather than in
 * it so the file the other Phase 109 themes also edit grows by one `case`.
 *
 * - "Save this as Narrator" saves at once, or — when Narrator exists — asks
 *   first, since it overwrites.
 * - "Switch to Narrator" / "be Narrator" switches at once (the active profile
 *   is a `direct` key, Decision 2) and says so in Narrator's voice.
 * - "Delete the Narrator profile" always asks.
 * - "What profiles do I have?" lists them, and which one is on.
 *
 * A question goes through the one pending slot as an `onConfirm` action, so
 * "yes", an empty Return and the Run chip answer it exactly as they answer a
 * palette command, and "no", "stop" or a newer question drop it.
 */

/** What the `profile` arm needs — `profiles.ts` in `runtime.ts`, a fake in a test. */
export type CompanionProfilesPort = {
  state: () => CompanionProfilesState;
  previewSave: (name: string) => CompanionProfileSavePreview;
  save: (name: string, overwrite: boolean) => CompanionProfileResult;
  /** Switch as one undoable change, then say so — after the write, in the new voice — with an Undo toast. */
  switchAndAnnounce: (name: string, speak: (text: string) => Promise<void>) => Promise<CompanionProfileResult>;
  previewDelete: (name: string) => { ok: true; profile: CompanionProfile } | CompanionProfileRefused;
  delete: (name: string) => CompanionProfileResult;
};

type ProfileIntent = Extract<CompanionIntent, { kind: 'profile' }>;

export async function actOnProfile(intent: ProfileIntent, deps: HandoffDeps): Promise<void> {
  const profiles = deps.companionSettings.profiles;
  switch (intent.op) {
    case 'list':
      await say(deps, describeProfiles(profiles.state()));
      return;
    case 'save':
      if (intent.name === undefined) {
        await say(deps, 'Save it as what? Say “save this as” and a name.');
        return;
      }
      return saveProfile(intent.name, deps);
    case 'switch':
      if (intent.name === undefined) {
        await say(deps, `Which one? ${describeProfiles(profiles.state())}`);
        return;
      }
      return switchProfile(intent.name, deps);
    case 'delete':
      if (intent.name === undefined) {
        await say(deps, 'Which profile should I delete?');
        return;
      }
      return deleteProfile(intent.name, deps);
  }
}

/** "You have two profiles: Narrator and Pirate. Narrator is on, with changes since." */
export function describeProfiles(state: CompanionProfilesState): string {
  const names = state.profiles.map((profile) => profile.name);
  if (names.length === 0) return "You haven't saved any profiles yet — say “save this as” and a name.";
  const count = names.length === 1 ? 'one profile' : `${names.length} profiles`;
  const active =
    state.active === null
      ? ' None is on right now.'
      : ` ${state.active.name} is on${state.modified ? ', with changes since you saved it' : ''}.`;
  return `You have ${count}: ${joinCompanionProfileNames(names)}.${active}`;
}

async function saveProfile(name: string, deps: HandoffDeps): Promise<void> {
  const profiles = deps.companionSettings.profiles;
  const preview = profiles.previewSave(name);
  if (!preview.ok) {
    await say(deps, preview.message);
    return;
  }
  if (preview.existing !== null) {
    const existing = preview.existing.name;
    await askToConfirm(`Save over the ${existing} profile`, deps, () => {
      const saved = profiles.save(name, true);
      return saved.ok ? `Saved over ${existing}.` : saved.message;
    });
    return;
  }
  const saved = profiles.save(name, false);
  await say(deps, saved.ok ? `Saved as ${saved.profile.name}.` : saved.message);
}

async function switchProfile(name: string, deps: HandoffDeps): Promise<void> {
  const profiles = deps.companionSettings.profiles;
  const result = await profiles.switchAndAnnounce(name, speakLive(deps));
  if (result.ok) {
    if (result.op === 'switch' && !result.changed) await say(deps, `I'm already ${result.profile.name}.`);
    return;
  }
  if (result.reason === 'notFound') {
    const names = profiles.state().profiles.map((profile) => profile.name);
    await say(
      deps,
      names.length === 0
        ? `${result.message} You haven't saved any yet.`
        : `${result.message} I have ${joinCompanionProfileNames(names)}.`,
    );
    return;
  }
  await say(deps, result.message);
}

async function deleteProfile(name: string, deps: HandoffDeps): Promise<void> {
  const profiles = deps.companionSettings.profiles;
  const preview = profiles.previewDelete(name);
  if (!preview.ok) {
    await say(deps, preview.message);
    return;
  }
  const found = preview.profile.name;
  await askToConfirm(`Delete the ${found} profile`, deps, () => {
    const deleted = profiles.delete(preview.profile.id);
    return deleted.ok ? `Deleted ${found}.` : deleted.message;
  });
}

/** {@link say} with the speaker as it is after the write — the switch may have changed the voice. */
function speakLive(deps: HandoffDeps): (text: string) => Promise<void> {
  return async (text) => {
    const speaker = deps.companionSettings.liveSpeaker?.() ?? deps.speaker;
    await say({ ...deps, speaker }, text);
  };
}

/** Take the one pending slot with a yes/no question; `onYes` does it and returns what to say. */
async function askToConfirm(label: string, deps: HandoffDeps, onYes: () => string): Promise<void> {
  const previous = deps.pendingAction();
  deps.setPendingAction({ label, at: Date.now(), onConfirm: onYes });
  await say(
    deps,
    previous
      ? `Never mind ${pendingName(previous)} — ${label}? Say yes, press Return, or tap Run.`
      : `${label}? Say yes, press Return, or tap Run.`,
  );
}

/** How a replaced question is named — a command by its label, a question mid-sentence. */
function pendingName(previous: PendingAction): string {
  if (previous.kind === 'command' || (previous.kind === undefined && previous.onConfirm === undefined)) {
    return previous.label;
  }
  return `${previous.label.charAt(0).toLowerCase()}${previous.label.slice(1)}`;
}
