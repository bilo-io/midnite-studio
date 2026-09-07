import type { BrowserNavError } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';

/**
 * Theme B's blocked-scheme refusal arrives on the same `failed` event as a
 * real navigation failure (`browser-service.ts` emits `code: -30`), so it
 * gets the same surface for free — but a bare numeric code would leave a
 * user staring at "-30" with no idea what it means. This is the one code
 * that gets its own copy; every other one shows Chromium's own
 * `error.description` verbatim.
 */
const BLOCKED_SCHEME_CODE = -30;
const BLOCKED_SCHEME_COPY = 'Midnite Studio only opens http and https pages here';

/**
 * The DOM surface for a `failed` navigation (Theme G) — never Chromium's
 * own error page, which is unstyled, ignores the app's theme, and says
 * "Midnite Studio" nowhere. `browser-pane.tsx` renders this in place of the
 * native view and hides that view for the duration, exactly as the
 * `newtab`/`crashed` cases already do.
 */
export function BrowserErrorPage({ tabId, error }: { tabId: string; error: BrowserNavError }) {
  const description = error.code === BLOCKED_SCHEME_CODE ? BLOCKED_SCHEME_COPY : error.description;

  return (
    <div
      data-testid="browser-error-page"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background p-6 text-center"
    >
      <p className="text-sm font-medium text-foreground">This page couldn't load</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      <p className="max-w-sm truncate text-[11px] text-muted-foreground/70" title={error.validatedUrl}>
        {error.validatedUrl}
      </p>
      <p className="text-[11px] text-muted-foreground/50">Error {error.code}</p>
      <button
        type="button"
        onClick={() => bridge()?.browser.navigate({ tabId, url: error.validatedUrl })}
        className="mt-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
      >
        Retry
      </button>
    </div>
  );
}
