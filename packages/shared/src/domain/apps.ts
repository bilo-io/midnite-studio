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

/**
 * The literal `apps-<id>` `PanelWindowRole` for each app (Theme D) — computed
 * once here, the same reasoning `AppDefinition.partition` gives for not
 * string-concatenating it again at each call site (`window-manager.ts`,
 * `window-handlers.ts`, the rail row's `focusRole` call). Typed as a template
 * literal rather than importing `PanelWindowRole` from `domain/window.ts`: the
 * three values already match that union's three `apps-*` literals exactly, and
 * a plain string keeps this module free of a dependency on `window.ts`,
 * keeping the edge one-directional.
 */
export const APP_ROLE: Readonly<Record<AppId, `apps-${AppId}`>> = {
  spotify: 'apps-spotify',
  'google-calendar': 'apps-google-calendar',
  youtube: 'apps-youtube',
};

const ROLE_TO_APP_ID = new Map<string, AppId>(APP_IDS.map((id) => [APP_ROLE[id], id]));

/**
 * The reverse of {@link APP_ROLE} — the app id for one of the three `apps-*`
 * window roles, or `null` for any other role (`main`, a panel, a page).
 * Takes a plain `string` rather than `WindowRole` for the same
 * no-cross-import reason `APP_ROLE` does; every real call site already has a
 * `WindowRole` value, which is a `string` structurally.
 */
export function appIdForRole(role: string): AppId | null {
  return ROLE_TO_APP_ID.get(role) ?? null;
}
