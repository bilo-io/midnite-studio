import {
  COMMONLY_IMPERSONATED_HOSTS,
  CREDENTIAL_RULE_LEVEL,
  WEB_APP_DEFINITIONS,
  isLoopbackHost,
  type SiteCredentialRisk,
} from '@midnite/studio-shared';

import { browserMainDeps, defaultLogger } from './browser-main-deps';
import { registrableDomain } from './browser-request-filter';
import { siteVerdicts } from './browser-site-safety';
import { createHostFirstSeenStore, localDay, type HostFirstSeenStore } from './host-first-seen';
import { readLoginForm, type IsolatedWorldContents } from './login-form-read';
import { judgeCredentialRisk } from './phishing-rules';
import { listWebAppSignIns } from './web-app-sign-ins';

/**
 * Theme F's glue (Phase 117) between the tabs (`browser-service.ts`), the login-form read, the pure
 * rules and Theme C's verdict — the credential-phishing counterpart of `browser-site-safety.ts`.
 *
 * - **Commit** ({@link noteCredentialCommit}) records the host in the first-seen ledger and starts a
 *   new generation for the tab, so a read that lands after the tab moved on is dropped.
 * - **Read** ({@link judgeTabCredentials}) runs after `dom-ready`, `did-stop-loading` and an in-page
 *   navigation. A finding only ever *adds* to the commit's verdict — a password field that
 *   disappears (an SPA moving on) does not un-say what the page showed.
 * - **Sign-in hosts** start as the impersonation seed plus the web apps' own hosts and grow with
 *   the Vault's `listWebAppSignIns` domains (refreshed at most every {@link SIGN_IN_REFRESH_MS}),
 *   which also go to Theme C's `addKnownHosts` so its commit-time lookalike rule compares against them.
 */

export const SIGN_IN_REFRESH_MS = 10 * 60_000;

/** While someone types on a page, re-read it at most this often (a password step injected late). */
export const INPUT_READ_INTERVAL_MS = 2_000;

type TabCommit = { generation: number; url: string; firstSeenToday: boolean; lastInputRead: number };

const commits = new Map<string, TabCommit>();
let generation = 0;
let firstSeen: HostFirstSeenStore | null = null;
const signInHosts = new Set<string>();
let lastSignInRefresh = Number.NEGATIVE_INFINITY;
let signInRefresh: Promise<void> | null = null;

function seedSignInHosts(): void {
  if (signInHosts.size > 0) return;
  for (const host of COMMONLY_IMPERSONATED_HOSTS) signInHosts.add(host);
  for (const app of Object.values(WEB_APP_DEFINITIONS)) signInHosts.add(new URL(app.launchUrl).hostname.replace(/^www\./, ''));
}

export function hostsFirstSeen(): HostFirstSeenStore {
  const deps = browserMainDeps();
  firstSeen ??= createHostFirstSeenStore({ directory: deps.userDataPath, cipher: deps.ledgerCipher });
  return firstSeen;
}

export function credentialSignInHosts(): ReadonlySet<string> {
  seedSignInHosts();
  return signInHosts;
}

/** Pull the Vault's sign-in domains (never a cookie value — see `web-app-sign-ins.ts`). */
export function refreshVaultSignInHosts(force = false): Promise<void> {
  seedSignInHosts();
  if (signInRefresh) return signInRefresh;
  if (!force && Date.now() - lastSignInRefresh < SIGN_IN_REFRESH_MS) return Promise.resolve();
  lastSignInRefresh = Date.now();
  signInRefresh = listWebAppSignIns()
    .then((answer) => {
      if (!answer.available) return;
      // Only each app's own site: a partition also holds cookies for the trackers and CDNs its pages
      // load, and those must never become brands, first-seen exemptions or lookalike bases.
      const hosts = answer.apps.flatMap((app) => {
        const own = registrableDomain(new URL(WEB_APP_DEFINITIONS[app.id].launchUrl).hostname);
        return app.origins.map((host) => host.replace(/^\./, '')).filter((host) => !isLoopbackHost(host) && registrableDomain(host) === own);
      });
      for (const host of hosts) signInHosts.add(host.replace(/^www\./, ''));
      siteVerdicts().addKnownHosts(hosts);
    })
    .catch((error: unknown) => defaultLogger.warn(`[browser] sign-in hosts refresh failed: ${String(error)}`))
    .finally(() => {
      signInRefresh = null;
    });
  return signInRefresh;
}

/** A main-frame commit: note the host, and invalidate any read still in flight for this tab. */
export function noteCredentialCommit(tabId: string, url: string): void {
  let firstSeenToday = false;
  try {
    const parsed = new URL(url);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !isLoopbackHost(parsed.hostname)) {
      firstSeenToday = hostsFirstSeen().note(parsed.hostname) === localDay(Date.now());
    }
  } catch {
    // Not a URL — nothing to note.
  }
  generation += 1;
  commits.set(tabId, { generation, url, firstSeenToday, lastInputRead: Number.NEGATIVE_INFINITY });
}

export function forgetCredentialTab(tabId: string): void {
  commits.delete(tabId);
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** Union of two risks' reasons (one per rule, first detail kept), level recomputed. */
function mergeRisk(a: SiteCredentialRisk | null, b: SiteCredentialRisk | null): SiteCredentialRisk | null {
  if (!a) return b;
  if (!b) return a;
  const reasons = [...a.reasons];
  for (const reason of b.reasons) if (!reasons.some((r) => r.rule === reason.rule)) reasons.push(reason);
  return { level: reasons.some((r) => CREDENTIAL_RULE_LEVEL[r.rule] === 'danger') ? 'danger' : 'caution', reasons };
}

export type CredentialContents = IsolatedWorldContents & { getURL(): string; getTitle(): string; isDestroyed(): boolean };

/**
 * Read the tab's page and fold Theme F's findings into its verdict. Resolves once judged (or
 * dropped); never rejects — callers fire it with `void`.
 */
export async function judgeTabCredentials(tabId: string, contents: CredentialContents): Promise<void> {
  try {
    await judgeOnce(tabId, contents);
  } catch (error) {
    defaultLogger.warn(`[browser] credential check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * A keystroke reached the page (main's `before-input-event` — nothing runs in the page for it). The
 * reads at `dom-ready`/`did-stop-loading` miss a password step a kit injects after the email step
 * with no navigation at all, so typing re-reads: the first keystroke after each commit, then at most
 * every {@link INPUT_READ_INTERVAL_MS}.
 */
export function judgeTabCredentialsOnInput(tabId: string, contents: CredentialContents, now = Date.now()): void {
  const commit = commits.get(tabId);
  if (!commit || now - commit.lastInputRead < INPUT_READ_INTERVAL_MS) return;
  commit.lastInputRead = now;
  void judgeTabCredentials(tabId, contents);
}

async function judgeOnce(tabId: string, contents: CredentialContents): Promise<void> {
  const commit = commits.get(tabId);
  if (!commit || contents.isDestroyed()) return;
  const read = await readLoginForm(contents);
  if (!read?.hasPasswordField) return;
  await refreshVaultSignInHosts();
  // The tab moved on (another commit, a close) while the read or the refresh was in flight.
  if (commits.get(tabId)?.generation !== commit.generation || contents.isDestroyed()) return;
  const verdict = siteVerdicts().verdict(tabId);
  const url = contents.getURL();
  if (!verdict || !verdict.origin || originOf(url) !== verdict.origin) return;

  const judged = judgeCredentialRisk({
    url,
    read,
    title: contents.getTitle(),
    lookalike: verdict.lookalike,
    firstSeenToday: commit.firstSeenToday,
    signInHosts: credentialSignInHosts(),
  });
  const credentialRisk = mergeRisk(verdict.credentialRisk, judged.risk);
  const insecureForm = verdict.insecureForm || judged.insecureForm;
  if (JSON.stringify(credentialRisk) === JSON.stringify(verdict.credentialRisk) && insecureForm === verdict.insecureForm) return;
  if (judged.risk) {
    defaultLogger(`[browser] credential risk ${judged.risk.level} on ${verdict.origin}: ${judged.risk.reasons.map((r) => r.rule).join(', ')}`);
  }
  siteVerdicts().patch(tabId, { credentialRisk, insecureForm });
}

/** "Clear browsing data" forgets the first-seen ledger along with the partition's storage. */
export function clearHostsFirstSeen(): void {
  hostsFirstSeen().clear();
}

export function resetCredentialPhishingForTests(): void {
  commits.clear();
  generation = 0;
  firstSeen = null;
  signInHosts.clear();
  lastSignInRefresh = Number.NEGATIVE_INFINITY;
  signInRefresh = null;
}
