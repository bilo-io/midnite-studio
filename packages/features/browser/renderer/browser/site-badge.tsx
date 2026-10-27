import { useEffect, useRef, useState } from 'react';

import { LuShieldAlert, LuShieldCheck, LuTriangleAlert } from 'react-icons/lu';

import {
  isLoopbackHost,
  siteVerdictLevel,
  siteVerdictLines,
  type SiteVerdict,
  type SiteVerdictLevel,
} from '@midnite/studio-shared';

import { bridge } from '@midnite/studio-frame';

import { useDismiss } from '../ui';

/**
 * The address field's site badge (Phase 117 Theme C) — one control, three states, read straight off the
 * tab's `SiteVerdict`:
 *
 * - **ok** — a quiet shield with no label. Phase 32 Theme G's rule still holds: a padlock that is
 *   always there teaches nothing, so the secure case stays low-key; it is a button only so the popover
 *   (reputation state, trackers blocked) is one click away.
 * - **caution** — the amber chip. Plain `http:` keeps its old "Not secure" wording; any other caution
 *   finding names itself (lookalike, mixed content, vulnerable library, insecure form).
 * - **danger** — the red chip, for a certificate failure or a feed hit the user proceeded past, or a
 *   password field Theme F judged a likely phish ("Possible phishing").
 *
 * Theme E's tracker count rides on the same badge (`verdict.trackersBlocked`, fed by its request
 * filter in main), with its per-site exception in the popover; Theme F raises the badge through the
 * same verdict — there is never a second badge in the address row.
 */

const TONE: Record<SiteVerdictLevel, string> = {
  ok: 'text-muted-foreground hover:text-foreground',
  caution: 'bg-[hsl(var(--browser-insecure)/0.15)] text-[hsl(var(--browser-insecure))]',
  danger: 'bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]',
};

const LINE_TONE: Record<SiteVerdictLevel, string> = {
  ok: 'text-muted-foreground',
  caution: 'text-[hsl(var(--browser-insecure))]',
  danger: 'text-[hsl(var(--destructive))]',
};

/** The chip's one-or-two-word label; `null` for `ok`, which shows only the shield. */
export function siteBadgeLabel(verdict: SiteVerdict): string | null {
  const level = siteVerdictLevel(verdict);
  if (level === 'ok') return null;
  if (level === 'danger') {
    if (verdict.tls === 'error') return 'Certificate error';
    return verdict.knownBad ? 'Dangerous site' : 'Possible phishing';
  }
  if (verdict.credentialRisk) return 'Login risk';
  if (verdict.lookalike) return 'Lookalike';
  if (verdict.origin.startsWith('http:') && !isLoopbackHost(verdict.displayHost)) return 'Not secure';
  if (verdict.insecureForm) return 'Insecure form';
  if (verdict.mixedContent) return 'Mixed content';
  if (verdict.vulnerableLibs.length > 0) return 'Vulnerable library';
  return 'Caution';
}

function pageHost(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return '';
  }
}

export function SiteBadge({ tabId, verdict }: { tabId: string; verdict: SiteVerdict }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const level = siteVerdictLevel(verdict);
  const label = siteBadgeLabel(verdict);
  const Icon = level === 'ok' ? LuShieldCheck : level === 'danger' ? LuShieldAlert : LuTriangleAlert;

  // `occludes`: the popover is DOM, and a native tab view paints above the DOM — so the view hides
  // while it is open, the same as every other popover over the browser.
  useDismiss(open, () => setOpen(false), { layer: 'popover', blocking: false, occludes: true });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // A new page is a new verdict — never leave the previous page's popover hanging open over it.
  useEffect(() => setOpen(false), [verdict.origin]);

  const lines = siteVerdictLines(verdict);
  const summary = label ?? 'Site information';
  const host = pageHost(verdict.origin);

  // Theme E's per-site exception: the page's third-party traffic is let through (or blocked again)
  // and the tab reloads so the change applies to the page on screen.
  const setTrackerException = (allow: boolean) => {
    if (!host) return;
    bridge()?.browser.setTrackerException({ host, allow });
    bridge()?.browser.reload({ tabId });
    setOpen(false);
  };

  return (
    <span ref={wrapper} className="relative z-10 ml-1 flex shrink-0 items-center">
      <button
        type="button"
        data-testid="browser-site-badge"
        data-level={level}
        aria-label={`${summary} — site details`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium leading-none transition-colors ${TONE[level]}`}
      >
        <Icon aria-hidden className="h-3 w-3" />
        {label ? <span>{label}</span> : null}
        {verdict.trackersBlocked > 0 ? (
          <span
            data-testid="browser-site-badge-trackers"
            title={`${verdict.trackersBlocked} tracker requests blocked`}
            className="rounded-full bg-muted px-1 tabular-nums text-muted-foreground"
          >
            {verdict.trackersBlocked}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Site details"
          data-testid="browser-site-popover"
          className="absolute left-0 top-full z-50 mt-1.5 w-80 rounded-md border border-border bg-popover p-3 text-xs shadow-lg"
        >
          <p className="mb-2 truncate font-medium text-foreground" title={verdict.displayHost}>
            {verdict.displayHost || 'This page'}
          </p>
          <ul className="flex flex-col gap-1.5">
            {lines.map((line) => (
              <li key={line.text} data-level={line.level} className={`leading-snug ${LINE_TONE[line.level]}`}>
                {line.text}
              </li>
            ))}
          </ul>
          {verdict.trackerHosts.length > 0 ? (
            <details className="mt-2 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer">Blocked tracker hosts</summary>
              <ul className="mt-1 max-h-32 overflow-auto">
                {verdict.trackerHosts.map((host) => (
                  <li key={host} className="truncate">
                    {host}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {verdict.trackersBlocked > 0 && host ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-testid="browser-site-trackers-allow"
                onClick={() => setTrackerException(true)}
                className="rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent"
              >
                Allow trackers on {host}
              </button>
              <button
                type="button"
                data-testid="browser-site-trackers-block"
                onClick={() => setTrackerException(false)}
                className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
              >
                Block again
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
