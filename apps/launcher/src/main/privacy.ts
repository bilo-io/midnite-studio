import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import { EgressSettingsSchema, privacySwitchOn, type EgressSettings, type PrivacySwitchId } from '@midnite/studio-shared/egress';

/**
 * Phase 115 Theme A — the launcher's own privacy switches.
 *
 * The launcher is off the graph: it cannot reach Studio's settings mirror or the runtime's `guardedFetch`, so
 * it keeps the same two ids (`launcher-updates`, `launcher-catalog`) and the master switch in its own
 * `<userData>/privacy.json`, and reads them with the registry's own `privacySwitchOn` (taken from `shared` by
 * source path, like `studio-link`). Off means no automatic request at start; a manual "Check again" still runs.
 * A missing or unreadable file means every switch at its default (on), which is today's behaviour.
 */

export const LAUNCHER_SWITCHES = ['launcher-updates', 'launcher-catalog'] as const satisfies readonly PrivacySwitchId[];
export type LauncherSwitch = (typeof LAUNCHER_SWITCHES)[number];

/** What the renderer may set: the master and the launcher's own two switches, nothing else. */
export const LauncherPrivacySchema = z.object({
  allAutomaticOff: z.boolean(),
  switches: z.object({ 'launcher-updates': z.boolean(), 'launcher-catalog': z.boolean() }),
});
export type LauncherPrivacy = z.infer<typeof LauncherPrivacySchema>;

/** The message a skipped automatic check carries where the feed's error would be. */
export const FEED_OFF = 'Automatic update checks are off (Privacy). Use Check again.';

export const privacyFile = (userData: string): string => join(userData, 'privacy.json');

export async function readLauncherSettings(file: string): Promise<EgressSettings> {
  try {
    const parsed = EgressSettingsSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** The view the renderer shows: every field resolved, the master kept separate from the stored switch values. */
export function launcherPrivacyView(settings: EgressSettings): LauncherPrivacy {
  const stored = (id: LauncherSwitch) => privacySwitchOn({ switches: settings.switches }, id);
  return {
    allAutomaticOff: settings.allAutomaticOff === true,
    switches: { 'launcher-updates': stored('launcher-updates'), 'launcher-catalog': stored('launcher-catalog') },
  };
}

export async function writeLauncherSettings(file: string, next: LauncherPrivacy): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
}

/** Whether an *automatic* call for this switch may run now. Reads the file each time: it is two tiny reads at start. */
export async function automaticAllowed(file: string, id: LauncherSwitch): Promise<boolean> {
  return privacySwitchOn(await readLauncherSettings(file), id);
}
