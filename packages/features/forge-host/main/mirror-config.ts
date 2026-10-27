import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { ensurePrivateDir, writePrivateFile } from '@midnite/studio-runtime';
import { z } from 'zod';

import { isSafeRemoteUrl, isSafeSegment } from './mirror-layout';

export const MIRROR_INTERVALS = ['hourly', 'daily', 'weekly', 'manual'] as const;
export type MirrorInterval = (typeof MIRROR_INTERVALS)[number];

export const INTERVAL_MS: Record<Exclude<MirrorInterval, 'manual'>, number> = {
  hourly: 3_600_000,
  daily: 86_400_000,
  weekly: 604_800_000,
};

const MirrorRepoSchema = z.object({
  host: z.string().min(1),
  owner: z.string().refine(isSafeSegment, 'unsafe owner'),
  repo: z.string().refine(isSafeSegment, 'unsafe repo'),
  url: z.string().refine(isSafeRemoteUrl, 'unsafe remote URL'),
});

const MirrorStateEntrySchema = z.object({
  at: z.string(),
  status: z.enum(['ok', 'degraded', 'failed']),
  reason: z.string().optional(),
});

/** `mirrors.json`: what to mirror, how often, where, and how the last run of each went. */
export const MirrorConfigSchema = z.object({
  version: z.literal(1).default(1),
  /** Absent: `defaultMirrorRoot()`. */
  root: z.string().optional(),
  interval: z.enum(MIRROR_INTERVALS).default('daily'),
  repos: z.array(MirrorRepoSchema).default([]),
  /** Set once the user has saved a selection, so an empty one is a choice and not "never configured". */
  picked: z.boolean().default(false),
  state: z.record(MirrorStateEntrySchema).default({}),
});
export type MirrorConfig = z.infer<typeof MirrorConfigSchema>;
export type MirrorConfigRepo = z.infer<typeof MirrorRepoSchema>;

/** Throws on an unreadable or invalid file (the caller reports it); only a missing file yields the defaults. */
export async function loadMirrorConfig(file: string): Promise<MirrorConfig> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    // Only a missing file means "nothing configured yet". Any other failure must not read as an empty
    // list, because the next save would overwrite the user's repos with it.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return MirrorConfigSchema.parse({});
    throw error;
  }
  return MirrorConfigSchema.parse(JSON.parse(text));
}

export async function saveMirrorConfig(file: string, config: MirrorConfig): Promise<void> {
  await ensurePrivateDir(dirname(file));
  await writePrivateFile(file, `${JSON.stringify(MirrorConfigSchema.parse(config), null, 2)}\n`);
}
