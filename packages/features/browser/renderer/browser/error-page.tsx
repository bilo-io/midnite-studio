import { LuShieldAlert } from 'react-icons/lu';

import type { BrowserNavError } from '@midnite/studio-shared';

import { bridge } from '@midnite/studio-frame';

import { useBrowserStore } from '../browser-store';
import { useBrowserUi } from '../ui';

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
 *
 * Phase 117 Theme C adds the two interstitials: a `certificate` failure and a
 * `known-bad` refusal (a reputation feed lists the URL). Neither offers a way
 * past by default; "Proceed for this session" appears only once Settings ▸
 * Browser ▸ Site safety allows it, and main checks that switch again itself.
 */
export function BrowserErrorPage({ tabId, error }: { tabId: string; error: BrowserNavError }) {
  if (error.reason === 'certificate' || error.reason === 'known-bad') {
    return <SiteInterstitial tabId={tabId} error={error} />;
  }

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

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function SiteInterstitial({ tabId, error }: { tabId: string; error: BrowserNavError }) {
  const allowProceed = useBrowserUi((s) => s.browserAllowSiteProceed);
  const canGoBack = useBrowserStore((s) => s.tabs.find((tab) => tab.id === tabId)?.canGoBack ?? false);
  const host = hostOf(error.validatedUrl);
  const certificate = error.reason === 'certificate';
  const feed = error.knownBad?.feed === 'openphish' ? 'OpenPhish' : 'URLhaus';
  const what = error.knownBad?.category === 'phishing' ? 'a phishing site' : 'serving malware';

  return (
    <div
      data-testid="browser-interstitial"
      data-reason={error.reason}
      role="alert"
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center"
    >
      <LuShieldAlert aria-hidden className="h-8 w-8 text-[hsl(var(--destructive))]" />
      <p className="text-sm font-semibold text-foreground">
        {certificate ? 'This connection is not private' : 'This site is reported as dangerous'}
      </p>
      <p className="max-w-md text-xs text-muted-foreground">
        {certificate ? (
          <>
            <span className="font-medium text-foreground">{host}</span> presented a certificate that could not be
            verified. Someone may be trying to read what you send it — passwords, messages or card numbers.
          </>
        ) : (
          <>
            {feed} lists <span className="font-medium text-foreground">{host}</span> as {what}
            {error.knownBad?.match ? <> (matched on {error.knownBad.match})</> : null}. The page was not loaded.
          </>
        )}
      </p>
      <p className="max-w-md truncate text-[11px] text-muted-foreground/70" title={error.validatedUrl}>
        {error.validatedUrl}
      </p>
      {certificate ? <p className="text-[11px] text-muted-foreground/60">{error.description}</p> : null}
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          disabled={!canGoBack}
          onClick={() => bridge()?.browser.back({ tabId })}
          className="rounded-md bg-primary disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Go back
        </button>
        {allowProceed ? (
          <button
            type="button"
            data-testid="browser-interstitial-proceed"
            onClick={() => bridge()?.browser.proceedSite({ tabId, url: error.validatedUrl })}
            className="rounded-md border border-[hsl(var(--destructive)/0.5)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/0.1)]"
          >
            Proceed to {host} for this session
          </button>
        ) : null}
      </div>
      {allowProceed ? null : (
        <p className="max-w-md text-[11px] text-muted-foreground/60">
          There is no way past this warning. To allow one for a single session, turn on Settings ▸ Browser ▸ Site
          safety.
        </p>
      )}
    </div>
  );
}
