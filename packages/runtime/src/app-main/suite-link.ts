import { MIDNITE_LINK_ARG, parseMidniteLink, SuiteLinkLandingSchema, type SuiteLinkLanding } from '@midnite/studio-shared';

/**
 * The raw `--midnite-link=<url>` value on an argv (the last switch wins, so a newer link beats a stale one) (the launcher's `open -n <bundle> --args …`), or
 * `undefined`. Only the switch is read: no other argument is ever treated as a link, and the value is
 * only ever parsed, never executed or opened.
 */
export function midniteLinkFromArgv(argv: readonly string[]): string | undefined {
  const arg = [...argv].reverse().find((a) => a.startsWith(MIDNITE_LINK_ARG));
  return arg === undefined ? undefined : arg.slice(MIDNITE_LINK_ARG.length);
}

/**
 * The landing a link asks for: its module and/or view, parsed with the shared `midnite://` parser (a
 * malformed value, another scheme or an unknown module drops out; the view stays a slug for the shell to
 * check against its own nav). `null` when the link names neither, so there is nothing to land on.
 */
export function landingFromLink(raw: string | undefined): SuiteLinkLanding | null {
  const target = parseMidniteLink(raw);
  if (target === null) return null;
  const landing: SuiteLinkLanding = {};
  if (target.module !== undefined) landing.module = target.module;
  if (target.view !== undefined) landing.view = target.view;
  if (landing.module === undefined && landing.view === undefined) return null;
  // The wire shape, checked at the seam rather than trusted.
  const checked = SuiteLinkLandingSchema.safeParse(landing);
  return checked.success ? checked.data : null;
}

/** Both steps: the landing an argv asks for, or `null`. */
export function landingFromArgv(argv: readonly string[]): SuiteLinkLanding | null {
  return landingFromLink(midniteLinkFromArgv(argv));
}
