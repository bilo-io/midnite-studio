import { QueryClient } from '@tanstack/react-query';

/**
 * A QueryClient tuned for a desktop app talking to its own main process.
 *
 * No network is involved, so the usual web defaults are wrong: refetching on
 * window focus would re-run `git status` every time the user alts back into the
 * app, and retrying a failed call three times just delays an error the UI wants
 * to show. Freshness comes from the repo watcher invalidating precisely what
 * changed (Phase 10), not from polling.
 *
 * The main window's one client, in its own module so a plain function can
 * read what a page already fetched — Phase 112 Theme G's resolver lists the
 * cached pulls, issues, runs and board items through it without a fetch.
 * A detached window builds its own (`detached-root.tsx`).
 */
export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
});
