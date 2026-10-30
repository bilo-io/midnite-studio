import type { ResourceKind, ResourceRefOf, ViewId } from '@midnite/studio-shared';

/**
 * Phase 112 Theme B — the shapes the reveal engine and its revealers share.
 * Kept in their own module so a family file (`revealers/*.ts`) can import
 * them without importing the engine.
 */

/** Who asked — the engine's own rules are identical for all three; it only changes the wording a caller adds. */
export type RevealCaller = 'companion' | 'mcp' | 'link';

export type RevealOptions = { caller: RevealCaller };

export type RevealFailure = 'locked' | 'not-found' | 'no-repo' | 'blocked-unsaved' | 'unavailable';

/**
 * What a reveal did. `did: 'relayed'` is a popout that handed the reveal to
 * the main window (Phase 81's relay) — main's own spoken sentence comes back
 * in `say`. On success `say` is otherwise optional: a revealer sets it only
 * when it has something to add ("the filter was hiding it — cleared"), and
 * {@link revealSay} falls back to "Here's {label}."
 */
export type RevealOutcome =
  | { ok: true; did: 'revealed' | 'focused-window' | 'relayed'; label: string; say?: string }
  | { ok: false; reason: RevealFailure; say: string };

/**
 * The context a revealer runs in. The engine has already switched repo and
 * view (or focused a detached page) by the time `reveal` runs, so a revealer
 * only *selects*: it never calls `setActiveView` or `selectRepo` itself.
 */
export type RevealContext = RevealOptions & {
  /** True when the target page is detached and was focused rather than shown in main. */
  focusedWindow: boolean;
};

/**
 * One kind's opener. `view` is where the thing lives — a fixed `ViewId`, a
 * function when it depends on the ref (a live session lives in the terminal
 * panel, a closed one on Sessions), or `null` for a panel that is not a view
 * (the browser). `reveal` selects, scrolls and highlights; it never acts.
 */
export type Revealer<K extends ResourceKind> = {
  view: ViewId | null | ((ref: ResourceRefOf<K>) => ViewId | null);
  reveal: (ref: ResourceRefOf<K>, ctx: RevealContext) => Promise<RevealOutcome>;
};

/** A family's slice of the table — `FamilyRevealers<'chat' | 'note'>`. */
export type FamilyRevealers<K extends ResourceKind> = { [P in K]: Revealer<P> };

/** The whole table: total over `ResourceKind`, so a kind with no revealer is a type error. */
export type RevealerTable = FamilyRevealers<ResourceKind>;
