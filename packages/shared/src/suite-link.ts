import { z } from 'zod';

import { MODULE_IDS } from './modules';

/**
 * Where a launcher link asks a suite host to land (the `suiteLinkTake` / `suiteLinkOpen` payload).
 * Both parts are optional and both are only a *request*: the shell checks them against its own nav and
 * falls back to the host's default view, so an unknown module or view is never an error.
 */
export const SuiteLinkLandingSchema = z.object({
  module: z.enum(MODULE_IDS).optional(),
  /** A view id of the host's nav: a short slug here, validated against the nav by the shell. */
  view: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).optional(),
});
export type SuiteLinkLanding = z.infer<typeof SuiteLinkLandingSchema>;
