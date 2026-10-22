/**
 * The page deep-link rule (Phase 117 Theme G).
 *
 * A web page can ask the OS to open `midnite-studio://run?…` or `clone?…`. Each one is confirmed by the
 * app before anything happens, but a page that fires them in a loop turns that confirm into a dialog
 * the user clicks through to make it stop. So a link that acts (a run or a clone) from one origin is
 * let through at most once per {@link PAGE_LINK_RATE_WINDOW_MS}; the rest are dropped and logged.
 * The same limiter guards `midnite://open?run=…` on its way through the launcher.
 *
 * zod-free and dependency-free, so the launcher can import it by source path.
 */

export const PAGE_LINK_RATE_WINDOW_MS = 10_000;

/** The deep-link kinds that act on the machine: they start an agent or write a repository to disk. */
export const ACTING_PAGE_LINK_KINDS: readonly string[] = ['run', 'clone'];

export function isActingPageLinkKind(kind: string): boolean {
  return ACTING_PAGE_LINK_KINDS.includes(kind);
}

export type LinkRateLimiter = {
  /** True when `key` (an origin) may act now; records the attempt when it may. */
  allow(key: string): boolean;
};

/** At most one acting link per key per window. Remembers at most 256 keys, oldest dropped first. */
export function createLinkRateLimiter(windowMs: number = PAGE_LINK_RATE_WINDOW_MS, now: () => number = Date.now): LinkRateLimiter {
  const last = new Map<string, number>();
  return {
    allow(key) {
      const t = now();
      const previous = last.get(key);
      if (previous !== undefined && t - previous < windowMs) return false;
      last.delete(key);
      last.set(key, t);
      if (last.size > 256) last.delete(last.keys().next().value as string);
      return true;
    },
  };
}
