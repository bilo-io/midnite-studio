import { z } from 'zod';

import { BrowserAgentSessionStateSchema } from '../browser-agent';

/**
 * The embedded browser's tab/group/bounds/error contract (Phase 32).
 *
 * `zod` only, no branded ids — every id in this codebase is a plain string
 * (see `repoId`, `ptyId`, `sessionId`), and a tab id follows the same
 * convention rather than introducing the app's first branded type.
 */

export const BrowserTabIdSchema = z.string().min(1);
export type BrowserTabId = z.infer<typeof BrowserTabIdSchema>;

/**
 * Browser permissions promptable by web pages (Phase 117 Theme B).
 * Scope: camera, microphone, geolocation, notifications.
 * clipboard-read is never promptable and stays deny-all.
 */
export const BrowserPermissionKindSchema = z.enum([
  'camera',
  'microphone',
  'geolocation',
  'notifications',
]);
export type BrowserPermissionKind = z.infer<typeof BrowserPermissionKindSchema>;

export const BrowserPermissionValueSchema = z.enum(['allow', 'deny', 'ask']);
export type BrowserPermissionValue = z.infer<typeof BrowserPermissionValueSchema>;

export const BrowserPermissionRecordSchema = z.object({
  origin: z.string(),
  permission: z.string(),
  value: BrowserPermissionValueSchema,
  grantedAt: z.number(),
});
export type BrowserPermissionRecord = z.infer<typeof BrowserPermissionRecordSchema>;

/** What a downloaded file is, by extension — drives the confirm policy (Phase 117 Theme D). */
export const DownloadFileClassSchema = z.enum([
  'document',
  'media',
  'image',
  'archive',
  'disk-image',
  'installer',
  'script',
  'executable',
  'other',
]);
export type DownloadFileClass = z.infer<typeof DownloadFileClassSchema>;

/**
 * Default idle threshold before a hidden browser tab's `WebContentsView` is
 * discarded (Phase 84 Theme F) — `Settings ▸ Browser`'s own field, and the
 * default `browser-service.ts`'s discard sweep starts at before any renderer
 * has pushed a different one over `browserSetDiscardMs`. `0` means never.
 */
export const DEFAULT_BROWSER_DISCARD_MS = 10 * 60 * 1000;

/**
 * Live chrome state for one tab, pushed by main as the `WebContentsView`
 * navigates. `title`/`faviconUrl` default to the empty/absent case a brand
 * new tab starts in — the renderer falls back to the URL's host and a
 * generic globe respectively, per Theme C.
 */
export const BrowserTabStateSchema = z.object({
  id: BrowserTabIdSchema,
  url: z.string(),
  title: z.string(),
  faviconUrl: z.string().optional(),
  loading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  /**
   * Manual group id, `null` for an explicit "not in a group" (overrides a
   * derived group default), or absent for "no explicit choice — apply
   * `originRepoId`'s derived group if there is one". Three states, not two:
   * see `BrowserTabGroupSchema`'s own doc for why the derived default has to
   * be overridable.
   */
  groupId: z.string().nullable().optional(),
  /** The repo a tab was opened from, if any — drives its derived group. */
  originRepoId: z.string().optional(),
  /**
   * `'sleeping'` once main has discarded this tab's `WebContentsView` for
   * sitting hidden past the idle threshold (Phase 84 Theme F); absent means
   * live. Purely a display fact for the tab strip's glyph — the renderer's
   * own `BrowserTab` (`browser-store.ts`) is what the app actually reads and
   * writes this from; this schema field exists for the wire contract's own
   * completeness.
   */
  state: z.enum(['live', 'sleeping']).optional(),
  /** Opts a tab out of discard entirely — the tab strip's "Keep awake". */
  keepAwake: z.boolean().optional(),
});
export type BrowserTabState = z.infer<typeof BrowserTabStateSchema>;

/** A `WebContentsView`'s bounds within the pane, in CSS pixels. */
export const BrowserBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type BrowserBounds = z.infer<typeof BrowserBoundsSchema>;

/**
 * A blocked or failed navigation, rendered as a DOM error page rather than
 * the engine's own unstyled one (Theme G) — this phase only needs the shape
 * to carry a `did-fail-load` or a Theme B policy refusal across the wire.
 */
export const BrowserNavErrorSchema = z.object({
  code: z.number().int(),
  description: z.string(),
  validatedUrl: z.string(),
});
export type BrowserNavError = z.infer<typeof BrowserNavErrorSchema>;

/**
 * Manual (user-made, persisted) or repo-derived (implicit, computed from
 * `originRepoId`) — see the phase doc's "Resolved" note on why both exist.
 * A derived group is never represented as one of these: it has no `id` a
 * user chose, no `color` a user picked, and no persisted `collapsed` — it is
 * computed fresh from `BrowserTabState.originRepoId` whenever the store
 * needs one, and vanishes the moment its last tab does.
 */
export const BrowserTabGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  color: z.string(),
  collapsed: z.boolean(),
});
export type BrowserTabGroup = z.infer<typeof BrowserTabGroupSchema>;

/**
 * The six seeded tiles' own glyphs, and nothing else — `packages/shared`
 * carries zod only and may not import `react-icons`, so a tile cannot hold an
 * icon component the way it did as `new-tab-page.tsx`'s private, unpersisted
 * type. A key the renderer maps to a component instead, exactly as
 * `BrowserTabState.faviconUrl` already falls back to a generic globe when a
 * page has none: `addTile` never assigns one, so a user-added tile always
 * renders that same fallback rather than gaining a new enum member per
 * bookmark.
 */
export const BROWSER_SHORTCUT_ICON_KEYS = [
  'google',
  'youtube',
  'figma',
  'claude',
  'gemini',
  'notebook',
] as const;
export type BrowserShortcutIconKey = (typeof BROWSER_SHORTCUT_ICON_KEYS)[number];

/**
 * An editable new-tab shortcut (Theme F). Persisted, so — unlike the
 * `BrowserTabGroupSchema` comment just above — this one really does need a
 * schema now: it moved out of `new-tab-page.tsx`'s own module scope where it
 * was never validated at a boundary.
 */
export const BrowserShortcutTileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  url: z.string().min(1),
  brandColor: z.string(),
  bgColor: z.string(),
  iconKey: z.enum(BROWSER_SHORTCUT_ICON_KEYS).optional(),
});
export type BrowserShortcutTile = z.infer<typeof BrowserShortcutTileSchema>;

/**
 * Chrome events pushed main → renderer over the single `mstudio:browser:event`
 * channel, discriminated on `kind` — the same nesting trick
 * `GitOpFailureSchema` uses so every arm can share `tabId` without zod's
 * `discriminatedUnion` seeing two arms with the same literal.
 */
export const BrowserEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('navigated'),
    tabId: BrowserTabIdSchema,
    url: z.string(),
    canGoBack: z.boolean(),
    canGoForward: z.boolean(),
  }),
  z.object({ kind: z.literal('title'), tabId: BrowserTabIdSchema, title: z.string() }),
  z.object({
    kind: z.literal('favicon'),
    tabId: BrowserTabIdSchema,
    faviconUrl: z.string().optional(),
  }),
  z.object({ kind: z.literal('loading'), tabId: BrowserTabIdSchema, loading: z.boolean() }),
  z.object({ kind: z.literal('failed'), tabId: BrowserTabIdSchema, error: BrowserNavErrorSchema }),
  /**
   * The view's process crashed, was killed, or stopped answering — Theme A
   * surfaces both as tab state, not a swallowed error, so the pane can offer
   * a reload instead of leaving a blank rectangle. `unresponsive` is the
   * recoverable one: the view is still there, it is just not painting.
   */
  z.object({
    kind: z.literal('destroyed'),
    tabId: BrowserTabIdSchema,
    reason: z.enum(['crashed', 'unresponsive']),
  }),
  /**
   * `target="_blank"` / `window.open` from an embedded page — also how a
   * plain in-page link click arrives here once Mod+click or a middle click
   * gives it a `background-tab`/`foreground-tab` disposition. Theme B refuses
   * to let the engine spawn its own `BrowserWindow`, so the request comes
   * back to the renderer as "open this as a new tab" — `tabId` is the
   * OPENER, so the new tab can inherit its group. `foreground` carries
   * Electron's disposition through: `false` only for `background-tab`
   * (middle-click, Mod+click with no Shift) — every other disposition
   * (`foreground-tab`, `new-window`, `default`) activates the new tab like an
   * ordinary `openTab()` would.
   */
  z.object({
    kind: z.literal('open-tab'),
    tabId: BrowserTabIdSchema,
    url: z.string(),
    foreground: z.boolean(),
  }),
  /**
   * A download was cancelled. Downloads are out of scope this phase, and
   * cancelling loudly (a notice naming the file) beats dropping silently.
   */
  z.object({
    kind: z.literal('download-blocked'),
    tabId: BrowserTabIdSchema,
    filename: z.string(),
    /** Why (Phase 117 Theme D): absent when downloads are simply off. */
    reason: z.string().optional(),
  }),
  /**
   * A download the policy wants confirmed before any byte is written (Phase 117 Theme D) —
   * answered with `browser.respondDownload`.
   */
  z.object({
    kind: z.literal('download-request'),
    tabId: BrowserTabIdSchema,
    requestId: z.string(),
    filename: z.string(),
    size: z.number(),
    origin: z.string(),
    fileClass: DownloadFileClassSchema,
  }),
  /** A download finished and was quarantined and recorded (Phase 117 Theme D). */
  z.object({
    kind: z.literal('download-done'),
    tabId: BrowserTabIdSchema,
    filename: z.string(),
    path: z.string(),
    sha256: z.string(),
    quarantined: z.boolean(),
    gatekeeper: z.string().optional(),
    scan: z.string().optional(),
  }),
  /** Third-party requests blocked on this page so far (Phase 117 Theme E) — the badge counter. */
  z.object({
    kind: z.literal('trackers-blocked'),
    tabId: BrowserTabIdSchema,
    count: z.number(),
    hosts: z.array(z.string()),
  }),
  /**
   * DevTools were asked for on a page whose view was created with `devTools: false` (Phase 117
   * Theme A: a packaged build, without `MSTUDIO_DEVTOOLS=1`). `openDevTools()` is a silent no-op
   * there, and a toolbar button that does nothing reads as broken — so main says why.
   */
  z.object({ kind: z.literal('devtools-blocked'), tabId: BrowserTabIdSchema }),
  /**
   * A `findInPage` match count (Theme G) — a new arm on the existing
   * discriminated union rather than a new channel, since `bridge.ts`'s
   * comment on `onEvent` already says that union is exactly what a per-tab,
   * per-kind chrome push is for.
   */
  z.object({
    kind: z.literal('found'),
    tabId: BrowserTabIdSchema,
    matches: z.number().int(),
    activeMatchOrdinal: z.number().int(),
  }),
  /**
   * Main discarded this tab's `WebContentsView` on its own, past the idle
   * threshold (Phase 84 Theme F) — the renderer never asked for this the way
   * it does `browser.close`, so it needs telling, the same reason `destroyed`
   * exists for a crash. The tab record survives; only the process behind it
   * is gone until the tab is activated again, at which point `browser.create`
   * (already called unconditionally on every activation — see
   * `use-browser-tabs.ts`) recreates it from the renderer's own `tab.url`.
   */
  z.object({ kind: z.literal('discarded'), tabId: BrowserTabIdSchema }),
  /**
   * In-tab permission prompt requested by a web page (Phase 117 Theme B).
   * Scope: camera, microphone, geolocation, notifications.
   */
  z.object({
    kind: z.literal('permission-request'),
    tabId: BrowserTabIdSchema,
    requestId: z.string(),
    origin: z.string(),
    permission: BrowserPermissionKindSchema,
    displayName: z.string(),
  }),
  /**
   * The agent session on this tab changed (Phase 117 Theme G): started, paused for the user,
   * logged a step, or stopped. Main owns the session; the agent-session bar mirrors this.
   */
  z.object({ kind: z.literal('agent-session'), tabId: BrowserTabIdSchema, state: BrowserAgentSessionStateSchema }),
  /**
   * The ClickFix watch (Phase 117 Theme G): right after an interaction with this tab, a
   * shell-pipeline-shaped command landed on the system clipboard. `preview` is one short line.
   */
  z.object({
    kind: z.literal('clipboard-warning'),
    tabId: BrowserTabIdSchema,
    origin: z.string(),
    label: z.string().max(120),
    preview: z.string().max(96),
  }),
]);
export type BrowserEvent = z.infer<typeof BrowserEventSchema>;
