import { z } from 'zod';

/**
 * The third-party apps rail's registry (Phase 83) — a small, hardcoded set of
 * embeddable apps, each shown as a toggleable rail icon and rendered in its
 * own isolated `WebContentsView` (Theme B). `zod` only, following
 * `domain/window.ts`'s shape: one enum for the id, one object schema for the
 * static definition, a sibling `z.infer` alias per schema.
 *
 * Three apps, not a generic "add your own by URL" registry — see the phase
 * doc's "Not in this phase". A literal enum keeps every downstream consumer
 * (the IPC schemas, `PANEL_WINDOW_ROLES`, the rail's icon map) a closed,
 * exhaustively-checkable union rather than an open string.
 */
export const AppIdSchema = z.enum(['spotify', 'google-calendar', 'youtube']);
export type AppId = z.infer<typeof AppIdSchema>;

/**
 * A static, hardcoded definition — never persisted, never user-edited.
 * `partition` is the literal `persist:app-<id>` string, computed once here
 * rather than re-derived (string-concatenated) at each call site, so
 * `apps-service.ts` and any future consumer read the same value instead of
 * trusting a naming convention to stay in sync.
 */
export const AppDefinitionSchema = z.object({
  id: AppIdSchema,
  label: z.string(),
  launchUrl: z.string().url(),
  partition: z.string(),
});
export type AppDefinition = z.infer<typeof AppDefinitionSchema>;

/**
 * The three in-scope apps, keyed by id — main (`apps-service.ts`) and the
 * renderer (the rail row, Theme C) both read this instead of each hardcoding
 * labels/URLs of their own.
 */
export const APP_DEFINITIONS: Readonly<Record<AppId, AppDefinition>> = {
  spotify: {
    id: 'spotify',
    label: 'Spotify',
    launchUrl: 'https://open.spotify.com',
    partition: 'persist:app-spotify',
  },
  'google-calendar': {
    id: 'google-calendar',
    label: 'Google Calendar',
    launchUrl: 'https://calendar.google.com',
    partition: 'persist:app-google-calendar',
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    launchUrl: 'https://www.youtube.com',
    partition: 'persist:app-youtube',
  },
} as const;

/** Every in-scope app id, in the rail's own display order. */
export const APP_IDS = AppIdSchema.options;
