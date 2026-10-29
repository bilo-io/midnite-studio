import { z } from 'zod';

/**
 * Every midnite suite app id, including the ones with no app directory yet.
 * Single-sourced here (Phase 123 Theme C) so the launcher's catalog, each app's shell and the
 * logo lookup in the frame cannot drift. Imports zod only — the launcher takes this file by
 * source path, never the package barrel.
 */
export const SUITE_APP_IDS = [
  'studio',
  'agents',
  'coder',
  'gamer',
  'creator',
  'media',
  'money',
  'mind',
  'browser',
  'science',
  'accountant',
  'vanguard',
  'startup',
  'simulator',
  'health',
  'cleaner',
  'vault',
  'capture',
  'monitor',
] as const;

export type SuiteAppId = (typeof SUITE_APP_IDS)[number];

export const SuiteAppIdSchema = z.enum(SUITE_APP_IDS);
