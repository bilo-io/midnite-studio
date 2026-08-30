import { z } from 'zod';

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
   * `target="_blank"` / `window.open` from an embedded page. Theme B refuses
   * to let the engine spawn its own `BrowserWindow`, so the request comes
   * back to the renderer as "open this as a new tab" — `tabId` is the
   * OPENER, so the new tab can inherit its group.
   */
  z.object({ kind: z.literal('open-tab'), tabId: BrowserTabIdSchema, url: z.string() }),
  /**
   * A download was cancelled. Downloads are out of scope this phase, and
   * cancelling loudly (a notice naming the file) beats dropping silently.
   */
  z.object({ kind: z.literal('download-blocked'), tabId: BrowserTabIdSchema, filename: z.string() }),
]);
export type BrowserEvent = z.infer<typeof BrowserEventSchema>;
