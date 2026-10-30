import { z } from 'zod';

/**
 * Every midnite suite app id, including the ones with no app directory yet (the six Phase 124 retired are gone).
 * Single-sourced here (Phase 123 Theme C) so the launcher's catalog, each app's shell and the
 * logo lookup in the frame cannot drift. Imports zod only — the launcher takes this file by
 * source path, never the package barrel.
 */
export const SUITE_APP_IDS = [
  'studio',
  'agents',
  'gamer',
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
] as const;

export type SuiteAppId = (typeof SUITE_APP_IDS)[number];

/**
 * Apps Phase 124 Theme H deleted, and the host each one's modules now live in. An app id persisted
 * before the merge (a terminal session's `appId`, a broker session's owner) still parses: it
 * resolves to its host rather than failing the whole record. `suite-apps.test.ts` holds this to
 * `RETIRED_APP_ALIASES`.
 */
export const RETIRED_SUITE_APP_HOSTS = {
  coder: 'agents',
  creator: 'agents',
  vault: 'vanguard',
  cleaner: 'vanguard',
  monitor: 'vanguard',
  capture: 'mind',
} as const satisfies Record<string, (typeof SUITE_APP_IDS)[number]>;

const SuiteAppIdEnum = z.enum(SUITE_APP_IDS);

export const SuiteAppIdSchema = z.preprocess(
  (value) => (typeof value === 'string' && Object.hasOwn(RETIRED_SUITE_APP_HOSTS, value) ? RETIRED_SUITE_APP_HOSTS[value as keyof typeof RETIRED_SUITE_APP_HOSTS] : value),
  SuiteAppIdEnum,
);
