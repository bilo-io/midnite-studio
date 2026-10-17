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
export const WebAppIdSchema = z.enum(['spotify', 'google-calendar', 'youtube']);
export type WebAppId = z.infer<typeof WebAppIdSchema>;

/**
 * A static, hardcoded definition — never persisted, never user-edited.
 * `partition` is the literal `persist:app-<id>` string, computed once here
 * rather than re-derived (string-concatenated) at each call site, so
 * `web-apps-service.ts` and any future consumer read the same value instead of
 * trusting a naming convention to stay in sync.
 */
export const WebAppDefinitionSchema = z.object({
  id: WebAppIdSchema,
  label: z.string(),
  launchUrl: z.string().url(),
  partition: z.string(),
});
export type WebAppDefinition = z.infer<typeof WebAppDefinitionSchema>;

/**
 * The three in-scope apps, keyed by id — main (`web-apps-service.ts`) and the
 * renderer (the rail row, Theme C) both read this instead of each hardcoding
 * labels/URLs of their own.
 */
export const WEB_APP_DEFINITIONS: Readonly<Record<WebAppId, WebAppDefinition>> = {
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
export const WEB_APP_IDS = WebAppIdSchema.options;

/**
 * The literal `apps-<id>` `PanelWindowRole` for each app (Theme D) — computed
 * once here, the same reasoning `WebAppDefinition.partition` gives for not
 * string-concatenating it again at each call site (`window-manager.ts`,
 * `window-handlers.ts`, the rail row's `focusRole` call). Typed as a template
 * literal rather than importing `PanelWindowRole` from `domain/window.ts`: the
 * three values already match that union's three `apps-*` literals exactly, and
 * a plain string keeps this module free of a dependency on `window.ts`,
 * keeping the edge one-directional.
 */
export const WEB_APP_ROLE: Readonly<Record<WebAppId, `apps-${WebAppId}`>> = {
  spotify: 'apps-spotify',
  'google-calendar': 'apps-google-calendar',
  youtube: 'apps-youtube',
};

const ROLE_TO_APP_ID = new Map<string, WebAppId>(WEB_APP_IDS.map((id) => [WEB_APP_ROLE[id], id]));

/**
 * The reverse of {@link WEB_APP_ROLE} — the app id for one of the three `apps-*`
 * window roles, or `null` for any other role (`main`, a panel, a page).
 * Takes a plain `string` rather than `WindowRole` for the same
 * no-cross-import reason `WEB_APP_ROLE` does; every real call site already has a
 * `WindowRole` value, which is a `string` structurally.
 */
export function webAppIdForRole(role: string): WebAppId | null {
  return ROLE_TO_APP_ID.get(role) ?? null;
}

/**
 * Whether one web app's `persist:app-<id>` partition holds a sign-in (Phase 113 Theme J slice 3) — what
 * the Vault lists beside the secrets it stores. **Metadata only, by construction**: how many cookies
 * the partition holds and the sites they belong to (a cookie's domain with its leading dot dropped,
 * de-duplicated and sorted). Never a cookie's name, value or path, and never a byte of the
 * partition's storage — `web-app-sign-ins.ts` builds each row from these fields alone, and the
 * Vault's `manifest.test.ts` walks this schema for value-shaped fields.
 */
export const WebAppSignInSchema = z.object({
  id: WebAppIdSchema,
  label: z.string(),
  /** The partition the row describes — unchanged, `WEB_APP_DEFINITIONS[id].partition`. */
  partition: z.string(),
  cookieCount: z.number().int().nonnegative(),
  /** The sites those cookies belong to, e.g. `spotify.com`, `accounts.google.com`. */
  origins: z.array(z.string()),
});
export type WebAppSignIn = z.infer<typeof WebAppSignInSchema>;

/**
 * Turn a cookie domain list into the `origins` a {@link WebAppSignIn} shows: leading dots dropped,
 * blanks skipped, de-duplicated, sorted. Takes plain strings so a caller can only ever hand it a
 * domain — not the cookie it came from.
 */
export function signInOrigins(domains: readonly (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const domain of domains) {
    const host = (domain ?? '').trim().replace(/^\.+/, '').toLowerCase();
    if (host) out.add(host);
  }
  return [...out].sort();
}
